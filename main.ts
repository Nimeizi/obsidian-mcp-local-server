import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  getAllTags,
  normalizePath
} from "obsidian";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type CapabilityGroup =
  | "vault.read"
  | "metadata.read"
  | "content.write"
  | "file.manage"
  | "workspace.control"
  | "automation.commands";

type RiskLevel = "safe" | "confirm" | "dangerous";
type WritePolicy = "preview_only" | "confirm_before_apply" | "direct_apply";

interface BridgeSettings {
  port: number;
  authToken: string;
  host: string;
  autoStart: boolean;
  allowedWriteRoots: string[];
  maxSearchResults: number;
  writePolicy: WritePolicy;
  allowDangerousOperations: boolean;
  enabledCapabilities: Record<CapabilityGroup, boolean>;
}

interface PendingChange {
  id: string;
  kind: string;
  path: string;
  content: string;
  existedBefore: boolean;
  expectedMtime: number | null;
  summary: string;
  createdAt: number;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
  capability: CapabilityGroup;
  risk: RiskLevel;
}

interface RegisteredTool extends ToolDefinition {
  handler: (args: any) => Promise<JsonValue>;
}

const CAPABILITY_LABELS: Record<CapabilityGroup, string> = {
  "vault.read": "Vault Read",
  "metadata.read": "Metadata Read",
  "content.write": "Content Write",
  "file.manage": "File Manage",
  "workspace.control": "Workspace Control",
  "automation.commands": "Automation Commands"
};

const CAPABILITY_RISKS: Record<CapabilityGroup, RiskLevel> = {
  "vault.read": "safe",
  "metadata.read": "safe",
  "content.write": "confirm",
  "file.manage": "dangerous",
  "workspace.control": "confirm",
  "automation.commands": "dangerous"
};

const UI_TEXT = {
  en: {
    title: "Obsidian MCP Bridge",
    host: "Host",
    hostDesc: "Bind address for the local MCP HTTP server.",
    port: "Port",
    portDesc: "Port exposed by the MCP HTTP server.",
    token: "Auth token",
    tokenDesc: "Bearer token required by external MCP clients.",
    generate: "Generate",
    roots: "Allowed write roots",
    rootsDesc: "Comma-separated vault-relative folders allowed for write operations. Leave empty for full-vault write access.",
    writePolicy: "Write policy",
    writePolicyDesc: "Choose whether AI can only preview changes or also apply them.",
    dangerous: "Allow dangerous operations",
    dangerousDesc: "Required for permanent delete and command execution.",
    capabilityGroups: "Capability Groups",
    presets: "Quick Presets",
    presetsDesc: "Start from a recommended profile, then fine-tune individual groups below.",
    presetReadOnly: "Read Only",
    presetSafeWriting: "Safe Writing",
    presetPower: "Power User",
    presetReadOnlyDesc: "AI can read notes and metadata, but cannot change content or files.",
    presetSafeWritingDesc: "AI can read and safely edit notes, but cannot manage files or execute commands.",
    presetPowerDesc: "Enable every group. Best for trusted personal automation.",
    autoStart: "Auto start",
    autoStartDesc: "Start the MCP server when Obsidian starts.",
    serverControl: "Server control",
    endpoint: "Current endpoint:",
    restart: "Restart",
    start: "Start",
    stop: "Stop",
    risk: {
      safe: "Low risk",
      confirm: "Medium risk",
      dangerous: "High risk"
    }
  },
  zh: {
    title: "Obsidian MCP Bridge",
    host: "监听地址",
    hostDesc: "本地 MCP HTTP 服务绑定的地址。",
    port: "端口",
    portDesc: "本地 MCP HTTP 服务暴露的端口。",
    token: "认证令牌",
    tokenDesc: "外部 MCP 客户端调用时需要携带的 Bearer token。",
    generate: "生成",
    roots: "允许写入的目录",
    rootsDesc: "可写入的 vault 相对目录，多个目录用逗号分隔。留空表示整个仓库都可写。",
    writePolicy: "写入策略",
    writePolicyDesc: "决定 AI 只能预览修改，还是也可以应用修改。",
    dangerous: "允许危险操作",
    dangerousDesc: "永久删除和执行命令需要打开这个开关。",
    capabilityGroups: "能力分组",
    presets: "快速预设",
    presetsDesc: "先选择一个推荐模式，再按需微调下面每个分组。",
    presetReadOnly: "只读模式",
    presetSafeWriting: "安全写作",
    presetPower: "高级模式",
    presetReadOnlyDesc: "AI 只能读笔记和元数据，不能改内容和文件。",
    presetSafeWritingDesc: "AI 可以安全地读写笔记，但不能整理文件结构或执行命令。",
    presetPowerDesc: "开放全部能力，适合你完全信任的个人自动化场景。",
    autoStart: "自动启动",
    autoStartDesc: "Obsidian 启动时自动启动 MCP 服务。",
    serverControl: "服务控制",
    endpoint: "当前端点：",
    restart: "重启",
    start: "启动",
    stop: "停止",
    risk: {
      safe: "低风险",
      confirm: "中风险",
      dangerous: "高风险"
    }
  }
} as const;

const CAPABILITY_DESCRIPTIONS = {
  en: {
    "vault.read": "Read notes, list files, inspect folders, search content, and view recent files.",
    "metadata.read": "Read tags, links, backlinks, and note metadata so AI can understand notebook structure.",
    "content.write": "Create notes, edit content, and update frontmatter.",
    "file.manage": "Create folders, rename or move paths, send items to trash, or permanently delete them.",
    "workspace.control": "Inspect the current workspace and open notes in Obsidian.",
    "automation.commands": "List commands and execute Obsidian or plugin commands."
  },
  zh: {
    "vault.read": "读取笔记、列出文件和文件夹、搜索内容、查看最近文件。",
    "metadata.read": "读取标签、链接、反链和笔记元数据，让 AI 理解你的知识库结构。",
    "content.write": "创建笔记、修改正文、更新 frontmatter 属性。",
    "file.manage": "创建文件夹、重命名或移动路径、删除到回收站、永久删除。",
    "workspace.control": "读取当前工作区状态，并在 Obsidian 中打开笔记。",
    "automation.commands": "列出命令并执行 Obsidian 或其他插件命令。"
  }
} as const;

const DEFAULT_SETTINGS: BridgeSettings = {
  port: 27124,
  authToken: "",
  host: "127.0.0.1",
  autoStart: true,
  allowedWriteRoots: [""],
  maxSearchResults: 8,
  writePolicy: "confirm_before_apply",
  allowDangerousOperations: false,
  enabledCapabilities: {
    "vault.read": true,
    "metadata.read": true,
    "content.write": true,
    "file.manage": false,
    "workspace.control": false,
    "automation.commands": false
  }
};

const SERVER_NAME = "obsidian-mcp-bridge";
const SERVER_VERSION = "0.2.0";
const PROTOCOL_VERSION = "2025-03-26";

export default class ObsidianMcpBridgePlugin extends Plugin {
  settings: BridgeSettings = DEFAULT_SETTINGS;
  server: Server | null = null;
  pendingChanges = new Map<string, PendingChange>();
  tools = new Map<string, RegisteredTool>();

  async onload(): Promise<void> {
    await this.loadPluginSettings();
    this.registerTools();

    this.addCommand({
      id: "copy-mcp-endpoint",
      name: "Copy MCP endpoint",
      callback: async () => {
        const url = this.getServerUrl();
        await navigator.clipboard.writeText(url);
        new Notice(`Copied MCP endpoint: ${url}`);
      }
    });

    this.addCommand({
      id: "rotate-mcp-token",
      name: "Rotate MCP auth token",
      callback: async () => {
        this.settings.authToken = generateToken();
        await this.savePluginSettings();
        if (this.server) {
          await this.restartServer();
        }
        new Notice("MCP auth token rotated.");
      }
    });

    this.addSettingTab(new ObsidianMcpBridgeSettingTab(this.app, this));

    if (this.settings.autoStart) {
      await this.startServer();
    }
  }

  async onunload(): Promise<void> {
    await this.stopServer();
  }

  async loadPluginSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      enabledCapabilities: {
        ...DEFAULT_SETTINGS.enabledCapabilities,
        ...(data?.enabledCapabilities ?? {})
      }
    };
    if (!this.settings.authToken) {
      this.settings.authToken = generateToken();
      await this.savePluginSettings();
    }
  }

  async savePluginSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  registerTools(): void {
    const tools: RegisteredTool[] = [
      {
        name: "vault.get_active_note",
        description: "Read the currently active markdown note.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => this.getCurrentNote()
      },
      {
        name: "vault.list_files",
        description: "List vault files, optionally filtered by folder and extension.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          properties: {
            folder: { type: "string" },
            extension: { type: "string" },
            limit: { type: "number" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.listVaultFiles(args.folder, args.extension, args.limit)
      },
      {
        name: "vault.list_folders",
        description: "List vault folders.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          properties: {
            folder: { type: "string" },
            includeRoot: { type: "boolean" },
            limit: { type: "number" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.listVaultFolders(args.folder, args.includeRoot, args.limit)
      },
      {
        name: "vault.read_file",
        description: "Read a file by vault-relative path.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.readVaultFile(String(args.path ?? ""))
      },
      {
        name: "vault.stat_path",
        description: "Get file or folder metadata for a vault path.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.statVaultPath(String(args.path ?? ""))
      },
      {
        name: "vault.search",
        description: "Keyword search note paths and note content.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.searchNotes(String(args.query ?? ""), args.limit)
      },
      {
        name: "vault.recent_files",
        description: "List recently modified vault files.",
        capability: "vault.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          properties: {
            extension: { type: "string" },
            limit: { type: "number" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.recentFiles(args.extension, args.limit)
      },
      {
        name: "metadata.get_file_cache",
        description: "Read Obsidian metadata cache for a markdown note.",
        capability: "metadata.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.getFileCacheForNote(String(args.path ?? ""))
      },
      {
        name: "metadata.get_tags",
        description: "List tags parsed from a markdown note.",
        capability: "metadata.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.getTagsForNote(String(args.path ?? ""))
      },
      {
        name: "metadata.get_links",
        description: "Get outgoing resolved and unresolved links for a note.",
        capability: "metadata.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.getLinksForNote(String(args.path ?? ""))
      },
      {
        name: "metadata.get_backlinks",
        description: "Get backlinks pointing at a note.",
        capability: "metadata.read",
        risk: "safe",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.getBacklinksForNote(String(args.path ?? ""))
      },
      {
        name: "content.prepare_change",
        description: "Prepare a content mutation and return a preview without writing to disk.",
        capability: "content.write",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["operation", "path"],
          properties: {
            operation: {
              type: "string",
              enum: ["create", "append", "replace", "insert_under_heading"]
            },
            path: { type: "string" },
            content: { type: "string" },
            heading: { type: "string" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.prepareNoteChange(args)
      },
      {
        name: "content.apply_change",
        description: "Apply a previously prepared content mutation.",
        capability: "content.write",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["changeId"],
          properties: { changeId: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.applyPendingChange(String(args.changeId ?? ""))
      },
      {
        name: "content.update_frontmatter",
        description: "Merge key/value pairs into note frontmatter.",
        capability: "content.write",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["path", "patch"],
          properties: {
            path: { type: "string" },
            patch: { type: "object" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.updateFrontmatter(String(args.path ?? ""), args.patch ?? {})
      },
      {
        name: "file.create_folder",
        description: "Create a folder if it does not exist.",
        capability: "file.manage",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.createFolderTool(String(args.path ?? ""))
      },
      {
        name: "file.rename_path",
        description: "Rename or move a file or folder using Obsidian APIs.",
        capability: "file.manage",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["path", "newPath"],
          properties: {
            path: { type: "string" },
            newPath: { type: "string" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.renamePathTool(String(args.path ?? ""), String(args.newPath ?? ""))
      },
      {
        name: "file.trash_path",
        description: "Move a file or folder to trash using Obsidian's official delete flow.",
        capability: "file.manage",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.trashPathTool(String(args.path ?? ""))
      },
      {
        name: "file.delete_path",
        description: "Permanently delete a file or folder.",
        capability: "file.manage",
        risk: "dangerous",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: { path: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.deletePathTool(String(args.path ?? ""))
      },
      {
        name: "workspace.get_state",
        description: "Inspect active note, last open files, and open markdown leaves.",
        capability: "workspace.control",
        risk: "safe",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => this.getWorkspaceState()
      },
      {
        name: "workspace.open_note",
        description: "Open a markdown note in Obsidian.",
        capability: "workspace.control",
        risk: "confirm",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: {
            path: { type: "string" },
            newLeaf: { type: "boolean" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.openNoteTool(String(args.path ?? ""), Boolean(args.newLeaf))
      },
      {
        name: "commands.list",
        description: "List registered Obsidian commands.",
        capability: "automation.commands",
        risk: "safe",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          additionalProperties: false
        },
        handler: async (args) => this.listCommandsTool(args.query, args.limit)
      },
      {
        name: "commands.execute",
        description: "Execute an Obsidian command by id.",
        capability: "automation.commands",
        risk: "dangerous",
        inputSchema: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
          additionalProperties: false
        },
        handler: async (args) => this.executeCommandTool(String(args.id ?? ""))
      }
    ];

    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  getServerUrl(): string {
    return `http://${this.settings.host}:${this.settings.port}/mcp`;
  }

  async startServer(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.settings.port, this.settings.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });

    new Notice(`Obsidian MCP Bridge listening on ${this.getServerUrl()}`);
  }

  async stopServer(): Promise<void> {
    const activeServer = this.server;
    if (!activeServer) {
      return;
    }

    this.server = null;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async restartServer(): Promise<void> {
    await this.stopServer();
    await this.startServer();
  }

  async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") {
        this.sendJson(res, 200, { ok: true });
        return;
      }

      if (req.url === "/health" && req.method === "GET") {
        this.sendJson(res, 200, {
          ok: true,
          server: SERVER_NAME,
          version: SERVER_VERSION,
          capabilities: this.settings.enabledCapabilities,
          writePolicy: this.settings.writePolicy
        });
        return;
      }

      if (req.url !== "/mcp" || req.method !== "POST") {
        this.sendJson(res, 404, { error: "Not found" });
        return;
      }

      if (!this.isAuthorized(req)) {
        this.sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      const rawBody = await readRequestBody(req);
      const payload = rawBody ? (JSON.parse(rawBody) as RpcRequest) : {};
      const response = await this.handleRpcRequest(payload);
      this.sendJson(res, 200, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      this.sendJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32000, message }
      });
    }
  }

  isAuthorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return false;
    }
    return header.slice("Bearer ".length).trim() === this.settings.authToken;
  }

  async handleRpcRequest(request: RpcRequest): Promise<Record<string, unknown>> {
    const id = request.id ?? null;
    if (request.jsonrpc !== "2.0") {
      return this.rpcError(id, -32600, "Invalid JSON-RPC version");
    }

    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {},
              resources: {}
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION
            }
          }
        };
      case "notifications/initialized":
        return {
          jsonrpc: "2.0",
          id,
          result: {}
        };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.getTools()
          }
        };
      case "tools/call":
        return await this.handleToolCall(id, request.params ?? {});
      case "resources/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: this.app.vault.getMarkdownFiles().map((file) => ({
              uri: toNoteUri(file.path),
              name: file.basename,
              mimeType: "text/markdown",
              description: file.path
            }))
          }
        };
      case "resources/read":
        return await this.handleResourceRead(id, request.params ?? {});
      default:
        return this.rpcError(id, -32601, `Method not found: ${request.method ?? "<missing>"}`);
    }
  }

  async handleResourceRead(id: string | number | null, params: any): Promise<Record<string, unknown>> {
    const uri = String(params?.uri ?? "");
    const path = fromNoteUri(uri);
    if (!path) {
      return this.rpcError(id, -32602, "Invalid resource URI");
    }

    const file = this.getMarkdownFile(path);
    if (!file) {
      return this.rpcError(id, -32004, `Note not found: ${path}`);
    }

    const content = await this.app.vault.cachedRead(file);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: content
          }
        ]
      }
    };
  }

  getTools(): ToolDefinition[] {
    return [...this.tools.values()]
      .filter((tool) => this.settings.enabledCapabilities[tool.capability])
      .map((tool) => ({
        name: tool.name,
        description: `${tool.description} [group=${tool.capability}; risk=${tool.risk}]`,
        inputSchema: tool.inputSchema,
        capability: tool.capability,
        risk: tool.risk
      }));
  }

  async handleToolCall(id: string | number | null, params: any): Promise<Record<string, unknown>> {
    const name = String(params?.name ?? "");
    const args = params?.arguments ?? {};
    const tool = this.tools.get(name);

    if (!tool) {
      return this.rpcError(id, -32601, `Unknown tool: ${name}`);
    }

    try {
      this.assertToolAllowed(tool, args);
      const result = await tool.handler(args);

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: result
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      return this.rpcError(id, -32010, message);
    }
  }

  async getCurrentNote(): Promise<JsonValue> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error("No active note.");
    }
    return this.readNote(activeFile.path);
  }

  assertToolAllowed(tool: RegisteredTool, args: any): void {
    if (!this.settings.enabledCapabilities[tool.capability]) {
      throw new Error(`Capability disabled: ${tool.capability}`);
    }
    if (tool.risk === "dangerous" && !this.settings.allowDangerousOperations) {
      throw new Error(`Dangerous operations are disabled for ${tool.name}`);
    }
    if (tool.name === "content.apply_change" && this.settings.writePolicy === "preview_only") {
      throw new Error("writePolicy=preview_only blocks applying content changes.");
    }
    if (tool.capability === "content.write" || tool.capability === "file.manage") {
      if (typeof args?.path === "string") {
        this.ensureWriteAllowed(args.path);
      }
      if (typeof args?.newPath === "string") {
        this.ensureWriteAllowed(args.newPath);
      }
    }
  }

  async listVaultFiles(folder?: unknown, extension?: unknown, limit?: unknown): Promise<JsonValue> {
    const safeFolder = typeof folder === "string" ? normalizeVaultPath(folder) : "";
    const wantedExtension = typeof extension === "string" ? extension.replace(/^\./, "").toLowerCase() : "";
    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const files = this.app.vault.getFiles()
      .filter((file) => !safeFolder || file.path.startsWith(safeFolder))
      .filter((file) => !wantedExtension || file.extension.toLowerCase() === wantedExtension)
      .slice(0, max)
      .map((file) => serializeFile(file));
    return { files };
  }

  async listVaultFolders(folder?: unknown, includeRoot?: unknown, limit?: unknown): Promise<JsonValue> {
    const safeFolder = typeof folder === "string" ? normalizeVaultPath(folder) : "";
    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const folders = this.app.vault.getAllFolders(Boolean(includeRoot))
      .filter((item) => !safeFolder || item.path.startsWith(safeFolder))
      .slice(0, max)
      .map((item) => ({
        path: item.path,
        name: item.name,
        isRoot: item.isRoot()
      }));
    return { folders };
  }

  async readVaultFile(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const abstractFile = this.getAbstractFile(safePath);
    if (!abstractFile) {
      throw new Error(`Path not found: ${safePath}`);
    }
    if (abstractFile instanceof TFolder) {
      return {
        path: abstractFile.path,
        type: "folder",
        children: abstractFile.children.map((child) => child.path)
      };
    }
    const content = await this.app.vault.cachedRead(abstractFile);
    return {
      ...serializeFile(abstractFile),
      type: "file",
      content
    };
  }

  async statVaultPath(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const abstractFile = this.getAbstractFile(safePath);
    if (!abstractFile) {
      throw new Error(`Path not found: ${safePath}`);
    }
    if (abstractFile instanceof TFolder) {
      return {
        path: abstractFile.path,
        name: abstractFile.name,
        type: "folder",
        childCount: abstractFile.children.length,
        isRoot: abstractFile.isRoot()
      };
    }
    return {
      ...serializeFile(abstractFile),
      type: "file"
    };
  }

  async listNotes(folder?: unknown, limit?: unknown): Promise<JsonValue> {
    const safeFolder = typeof folder === "string" ? normalizeVaultPath(folder) : "";
    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !safeFolder || file.path.startsWith(safeFolder))
      .slice(0, max)
      .map((file) => ({
        path: file.path,
        basename: file.basename,
        mtime: file.stat.mtime
      }));
    return { files };
  }

  async readNote(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const file = this.getMarkdownFile(safePath);
    if (!file) {
      throw new Error(`Note not found: ${safePath}`);
    }
    const content = await this.app.vault.cachedRead(file);
    return {
      path: file.path,
      basename: file.basename,
      mtime: file.stat.mtime,
      content
    };
  }

  async searchNotes(query: string, limit?: unknown): Promise<JsonValue> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      throw new Error("query is required");
    }

    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const scored: Array<{ path: string; score: number; excerpt: string }> = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const haystack = `${file.path}\n${content}`.toLowerCase();
      const score = scoreMatch(haystack, normalized, file.path.toLowerCase());
      if (score <= 0) {
        continue;
      }
      scored.push({
        path: file.path,
        score,
        excerpt: makeExcerpt(content, normalized)
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return { query, matches: scored.slice(0, max) };
  }

  async recentNotes(limit?: unknown): Promise<JsonValue> {
    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const files = [...this.app.vault.getMarkdownFiles()]
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, max)
      .map((file) => ({
        path: file.path,
        mtime: file.stat.mtime
      }));
    return { files };
  }

  async recentFiles(extension?: unknown, limit?: unknown): Promise<JsonValue> {
    const wantedExtension = typeof extension === "string" ? extension.replace(/^\./, "").toLowerCase() : "";
    const max = coerceLimit(limit, this.settings.maxSearchResults);
    const files = [...this.app.vault.getFiles()]
      .filter((file) => !wantedExtension || file.extension.toLowerCase() === wantedExtension)
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, max)
      .map((file) => serializeFile(file));
    return { files };
  }

  async getFileCacheForNote(path: string): Promise<JsonValue> {
    const file = this.requireMarkdownFile(path);
    return {
      path: file.path,
      cache: toJsonValue(this.app.metadataCache.getFileCache(file))
    };
  }

  async getTagsForNote(path: string): Promise<JsonValue> {
    const file = this.requireMarkdownFile(path);
    const cache = this.app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      tags: cache ? getAllTags(cache) ?? [] : []
    };
  }

  async getLinksForNote(path: string): Promise<JsonValue> {
    const file = this.requireMarkdownFile(path);
    const cache = this.app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      links: cache?.links ?? [],
      embeds: cache?.embeds ?? [],
      resolved: this.app.metadataCache.resolvedLinks[file.path] ?? {},
      unresolved: this.app.metadataCache.unresolvedLinks[file.path] ?? {}
    };
  }

  async getBacklinksForNote(path: string): Promise<JsonValue> {
    const file = this.requireMarkdownFile(path);
    const backlinks: Array<{ source: string; count: number }> = [];
    for (const [source, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      const count = targets[file.path];
      if (count) {
        backlinks.push({ source, count });
      }
    }
    backlinks.sort((a, b) => b.count - a.count);
    return {
      path: file.path,
      backlinks
    };
  }

  async prepareNoteChange(args: any): Promise<JsonValue> {
    const operation = String(args?.operation ?? "");
    const safePath = requirePath(String(args?.path ?? ""));
    this.ensureWriteAllowed(safePath);

    const originalFile = this.getMarkdownFile(safePath);
    const originalContent = originalFile ? await this.app.vault.read(originalFile) : "";
    const expectedMtime = originalFile?.stat.mtime ?? null;
    const content = typeof args?.content === "string" ? args.content : "";
    const heading = typeof args?.heading === "string" ? args.heading : "";

    let nextContent = "";
    let summary = "";

    switch (operation) {
      case "create":
        if (originalFile) {
          throw new Error(`Note already exists: ${safePath}`);
        }
        nextContent = content;
        summary = `Create ${safePath}`;
        break;
      case "append":
        if (!originalFile) {
          throw new Error(`Note not found: ${safePath}`);
        }
        nextContent = originalContent + content;
        summary = `Append ${content.length} characters to ${safePath}`;
        break;
      case "replace":
        if (!originalFile) {
          throw new Error(`Note not found: ${safePath}`);
        }
        nextContent = content;
        summary = `Replace contents of ${safePath}`;
        break;
      case "insert_under_heading":
        if (!originalFile) {
          throw new Error(`Note not found: ${safePath}`);
        }
        if (!heading) {
          throw new Error("heading is required for insert_under_heading");
        }
        nextContent = insertUnderHeading(originalContent, heading, content);
        summary = `Insert content under heading "${heading}" in ${safePath}`;
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    const changeId = randomUUID();
    const pending: PendingChange = {
      id: changeId,
      kind: operation,
      path: safePath,
      content: nextContent,
      existedBefore: Boolean(originalFile),
      expectedMtime,
      summary,
      createdAt: Date.now()
    };
    this.pendingChanges.set(changeId, pending);

    return {
      changeId,
      summary,
      path: safePath,
      writePolicy: this.settings.writePolicy,
      preview: buildPreview(originalContent, nextContent),
      expectedMtime
    };
  }

  async applyPendingChange(changeId: string): Promise<JsonValue> {
    const pending = this.pendingChanges.get(changeId);
    if (!pending) {
      throw new Error(`Pending change not found: ${changeId}`);
    }

    const existingFile = this.getMarkdownFile(pending.path);
    if (pending.existedBefore && !existingFile) {
      throw new Error(`Note was deleted before apply: ${pending.path}`);
    }
    if (!pending.existedBefore && existingFile) {
      throw new Error(`Note was created by another process before apply: ${pending.path}`);
    }
    if (existingFile && pending.expectedMtime !== null && existingFile.stat.mtime !== pending.expectedMtime) {
      throw new Error(`Note changed since preview: ${pending.path}`);
    }

    if (existingFile) {
      await this.app.vault.process(existingFile, () => pending.content);
    } else {
      const folder = parentFolderOf(pending.path);
      if (folder) {
        await this.ensureFolder(folder);
      }
      await this.app.vault.create(pending.path, pending.content);
    }

    this.pendingChanges.delete(changeId);
    return {
      ok: true,
      applied: pending.summary,
      path: pending.path
    };
  }

  async updateFrontmatter(path: string, patch: Record<string, unknown>): Promise<JsonValue> {
    const safePath = requirePath(path);
    this.ensureWriteAllowed(safePath);
    const file = this.getMarkdownFile(safePath);
    if (!file) {
      throw new Error(`Note not found: ${safePath}`);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [key, value] of Object.entries(patch)) {
        frontmatter[key] = value;
      }
    });

    return {
      ok: true,
      path: safePath,
      updatedKeys: Object.keys(patch)
    };
  }

  async createFolderTool(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    await this.ensureFolder(safePath);
    return {
      ok: true,
      path: safePath
    };
  }

  async renamePathTool(path: string, newPath: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const safeNewPath = requirePath(newPath);
    const abstractFile = this.getAbstractFile(safePath);
    if (!abstractFile) {
      throw new Error(`Path not found: ${safePath}`);
    }
    const parent = parentFolderOf(safeNewPath);
    if (parent) {
      await this.ensureFolder(parent);
    }
    await this.app.fileManager.renameFile(abstractFile, safeNewPath);
    return {
      ok: true,
      from: safePath,
      to: safeNewPath
    };
  }

  async trashPathTool(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const abstractFile = this.getAbstractFile(safePath);
    if (!abstractFile) {
      throw new Error(`Path not found: ${safePath}`);
    }
    await this.app.fileManager.trashFile(abstractFile);
    return {
      ok: true,
      path: safePath,
      mode: "trash"
    };
  }

  async deletePathTool(path: string): Promise<JsonValue> {
    const safePath = requirePath(path);
    const abstractFile = this.getAbstractFile(safePath);
    if (!abstractFile) {
      throw new Error(`Path not found: ${safePath}`);
    }
    await this.app.vault.delete(abstractFile, true);
    return {
      ok: true,
      path: safePath,
      mode: "permanent_delete"
    };
  }

  async getWorkspaceState(): Promise<JsonValue> {
    const activeFile = this.app.workspace.getActiveFile();
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    return {
      activeFile: activeFile?.path ?? null,
      lastOpenFiles: this.app.workspace.getLastOpenFiles(),
      markdownLeaves: markdownLeaves.map((leaf) => ({
        id: leaf.id,
        viewType: leaf.view.getViewType()
      }))
    };
  }

  async openNoteTool(path: string, newLeaf: boolean): Promise<JsonValue> {
    const file = this.requireMarkdownFile(path);
    const leaf = newLeaf ? this.app.workspace.getLeaf(true) : this.app.workspace.getMostRecentLeaf();
    if (!leaf) {
      throw new Error("No workspace leaf available.");
    }
    await leaf.openFile(file);
    return {
      ok: true,
      path: file.path,
      newLeaf
    };
  }

  async listCommandsTool(query?: unknown, limit?: unknown): Promise<JsonValue> {
    const commandRegistry = (this.app as any).commands?.commands ?? {};
    const normalized = typeof query === "string" ? query.trim().toLowerCase() : "";
    const max = coerceLimit(limit, 50);
    const commands = Object.entries(commandRegistry)
      .map(([id, command]: [string, any]) => ({
        id,
        name: command.name ?? id
      }))
      .filter((command) => {
        if (!normalized) {
          return true;
        }
        return command.id.toLowerCase().includes(normalized) || command.name.toLowerCase().includes(normalized);
      })
      .slice(0, max);
    return { commands };
  }

  async executeCommandTool(id: string): Promise<JsonValue> {
    const commandRegistry = (this.app as any).commands;
    if (!commandRegistry?.commands?.[id]) {
      throw new Error(`Command not found: ${id}`);
    }
    await commandRegistry.executeCommandById(id);
    return {
      ok: true,
      id
    };
  }

  getMarkdownFile(path: string): TFile | null {
    const abstractFile = this.app.vault.getAbstractFileByPath(path);
    return abstractFile instanceof TFile ? abstractFile : null;
  }

  getAbstractFile(path: string): TAbstractFile | null {
    return this.app.vault.getAbstractFileByPath(path);
  }

  requireMarkdownFile(path: string): TFile {
    const safePath = requirePath(path);
    const file = this.getMarkdownFile(safePath);
    if (!file) {
      throw new Error(`Note not found: ${safePath}`);
    }
    return file;
  }

  ensureWriteAllowed(path: string): void {
    const normalized = normalizeVaultPath(path);
    const allowed = this.settings.allowedWriteRoots.some((root) => {
      const safeRoot = normalizeVaultPath(root);
      if (!safeRoot) {
        return true;
      }
      return normalized === safeRoot || normalized.startsWith(`${safeRoot}/`);
    });

    if (!allowed) {
      throw new Error(`Writes are not allowed for path: ${path}`);
    }
  }

  async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizeVaultPath(folderPath);
    if (!normalized) {
      return;
    }

    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end(JSON.stringify(body));
  }

  rpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
  }
}

class ObsidianMcpBridgeSettingTab extends PluginSettingTab {
  plugin: ObsidianMcpBridgePlugin;

  constructor(app: App, plugin: ObsidianMcpBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const locale = getUiLocale();
    const text = UI_TEXT[locale];

    containerEl.createEl("h2", { text: text.title });

    new Setting(containerEl)
      .setName(text.host)
      .setDesc(text.hostDesc)
      .addText((text) =>
        text
          .setPlaceholder("127.0.0.1")
          .setValue(this.plugin.settings.host)
          .onChange(async (value) => {
            this.plugin.settings.host = value.trim() || "127.0.0.1";
            await this.plugin.savePluginSettings();
          })
      );

    new Setting(containerEl)
      .setName(text.port)
      .setDesc(text.portDesc)
      .addText((text) =>
        text
          .setPlaceholder("27124")
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = Number(value);
            if (!Number.isFinite(port) || port <= 0) {
              return;
            }
            this.plugin.settings.port = Math.floor(port);
            await this.plugin.savePluginSettings();
          })
      );

    new Setting(containerEl)
      .setName(text.token)
      .setDesc(text.tokenDesc)
      .addText((text) =>
        text
          .setPlaceholder("token")
          .setValue(this.plugin.settings.authToken)
          .onChange(async (value) => {
            this.plugin.settings.authToken = value.trim();
            await this.plugin.savePluginSettings();
          })
      )
      .addButton((button) =>
        button.setButtonText(text.generate).onClick(async () => {
          this.plugin.settings.authToken = generateToken();
          await this.plugin.savePluginSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName(text.roots)
      .setDesc(text.rootsDesc)
      .addTextArea((text) =>
        text
          .setPlaceholder("Inbox, Projects/AI")
          .setValue(this.plugin.settings.allowedWriteRoots.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.allowedWriteRoots = value
              .split(",")
              .map((item) => normalizeVaultPath(item))
              .filter((item, index, items) => items.indexOf(item) === index);
            if (this.plugin.settings.allowedWriteRoots.length === 0) {
              this.plugin.settings.allowedWriteRoots = [""];
            }
            await this.plugin.savePluginSettings();
          })
      );

    new Setting(containerEl)
      .setName(text.writePolicy)
      .setDesc(text.writePolicyDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("preview_only", locale === "zh" ? "仅预览" : "Preview only")
          .addOption("confirm_before_apply", locale === "zh" ? "预览后应用" : "Prepare + apply")
          .addOption("direct_apply", locale === "zh" ? "允许直接应用" : "Allow direct apply")
          .setValue(this.plugin.settings.writePolicy)
          .onChange(async (value: WritePolicy) => {
            this.plugin.settings.writePolicy = value;
            await this.plugin.savePluginSettings();
          })
      );

    new Setting(containerEl)
      .setName(text.dangerous)
      .setDesc(text.dangerousDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowDangerousOperations).onChange(async (value) => {
          this.plugin.settings.allowDangerousOperations = value;
          await this.plugin.savePluginSettings();
        })
      );

    containerEl.createEl("h3", { text: text.presets });
    containerEl.createEl("p", { text: text.presetsDesc });
    this.renderPresetSetting(containerEl, text.presetReadOnly, text.presetReadOnlyDesc, async () => {
      this.plugin.settings.enabledCapabilities = {
        "vault.read": true,
        "metadata.read": true,
        "content.write": false,
        "file.manage": false,
        "workspace.control": false,
        "automation.commands": false
      };
      this.plugin.settings.allowDangerousOperations = false;
      this.plugin.settings.writePolicy = "preview_only";
      await this.plugin.savePluginSettings();
      this.display();
    });
    this.renderPresetSetting(containerEl, text.presetSafeWriting, text.presetSafeWritingDesc, async () => {
      this.plugin.settings.enabledCapabilities = {
        "vault.read": true,
        "metadata.read": true,
        "content.write": true,
        "file.manage": false,
        "workspace.control": false,
        "automation.commands": false
      };
      this.plugin.settings.allowDangerousOperations = false;
      this.plugin.settings.writePolicy = "confirm_before_apply";
      await this.plugin.savePluginSettings();
      this.display();
    });
    this.renderPresetSetting(containerEl, text.presetPower, text.presetPowerDesc, async () => {
      this.plugin.settings.enabledCapabilities = {
        "vault.read": true,
        "metadata.read": true,
        "content.write": true,
        "file.manage": true,
        "workspace.control": true,
        "automation.commands": true
      };
      this.plugin.settings.allowDangerousOperations = true;
      this.plugin.settings.writePolicy = "confirm_before_apply";
      await this.plugin.savePluginSettings();
      this.display();
    });

    containerEl.createEl("h3", { text: text.capabilityGroups });
    for (const capability of Object.keys(CAPABILITY_LABELS) as CapabilityGroup[]) {
      new Setting(containerEl)
        .setName(CAPABILITY_LABELS[capability])
        .setDesc(`${CAPABILITY_DESCRIPTIONS[locale][capability]} (${text.risk[CAPABILITY_RISKS[capability]]})`)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.enabledCapabilities[capability]).onChange(async (value) => {
            this.plugin.settings.enabledCapabilities[capability] = value;
            await this.plugin.savePluginSettings();
          })
        );
    }

    new Setting(containerEl)
      .setName(text.autoStart)
      .setDesc(text.autoStartDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
          this.plugin.settings.autoStart = value;
          await this.plugin.savePluginSettings();
        })
      );

    new Setting(containerEl)
      .setName(text.serverControl)
      .setDesc(`${text.endpoint} ${this.plugin.getServerUrl()}`)
      .addButton((button) =>
        button.setButtonText(this.plugin.server ? text.restart : text.start).onClick(async () => {
          if (this.plugin.server) {
            await this.plugin.restartServer();
          } else {
            await this.plugin.startServer();
          }
          this.display();
        })
      )
      .addButton((button) =>
        button.setButtonText(text.stop).onClick(async () => {
          await this.plugin.stopServer();
          this.display();
        })
      );
  }

  renderPresetSetting(containerEl: HTMLElement, name: string, desc: string, onApply: () => Promise<void>): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addButton((button) =>
        button.setButtonText(getUiLocale() === "zh" ? "应用" : "Apply").onClick(async () => {
          await onApply();
        })
      );
  }
}

function normalizeVaultPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  return trimmed ? normalizePath(trimmed) : "";
}

function requirePath(path: string): string {
  const safePath = normalizeVaultPath(path);
  if (!safePath) {
    throw new Error("path is required");
  }
  return safePath;
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function coerceLimit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 100);
}

function scoreMatch(haystack: string, query: string, path: string): number {
  const occurrences = haystack.split(query).length - 1;
  const pathBoost = path.includes(query) ? 10 : 0;
  return occurrences + pathBoost;
}

function makeExcerpt(content: string, query: string): string {
  const lower = content.toLowerCase();
  const index = lower.indexOf(query);
  if (index === -1) {
    return content.slice(0, 160);
  }
  const start = Math.max(index - 60, 0);
  const end = Math.min(index + query.length + 100, content.length);
  return content.slice(start, end);
}

function buildPreview(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const preview: string[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < max; index += 1) {
    const oldLine = beforeLines[index];
    const newLine = afterLines[index];
    if (oldLine === newLine) {
      continue;
    }
    if (oldLine !== undefined) {
      preview.push(`- ${oldLine}`);
    }
    if (newLine !== undefined) {
      preview.push(`+ ${newLine}`);
    }
    if (preview.length >= 40) {
      preview.push("... truncated ...");
      break;
    }
  }

  return preview.join("\n") || "(no changes)";
}

function insertUnderHeading(content: string, heading: string, block: string): string {
  const escaped = escapeRegExp(heading.trim());
  const pattern = new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match || match.index === undefined) {
    throw new Error(`Heading not found: ${heading}`);
  }

  const headingLevel = match[1].length;
  const start = match.index + match[0].length;
  const remainder = content.slice(start);
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
  const nextHeadingMatch = nextHeadingPattern.exec(remainder);
  const insertionIndex = nextHeadingMatch?.index !== undefined ? start + nextHeadingMatch.index : content.length;

  const prefix = content.slice(0, insertionIndex).replace(/\s*$/, "");
  const suffix = content.slice(insertionIndex).replace(/^\s*/, "");
  const sanitizedBlock = block.trimEnd();

  return `${prefix}\n\n${sanitizedBlock}\n\n${suffix}`.trimEnd();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parentFolderOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function toNoteUri(path: string): string {
  return `obsidian-note://vault/${encodeURIComponent(path)}`;
}

function fromNoteUri(uri: string): string | null {
  const prefix = "obsidian-note://vault/";
  if (!uri.startsWith(prefix)) {
    return null;
  }
  return decodeURIComponent(uri.slice(prefix.length));
}

function getUiLocale(): "en" | "zh" {
  const language = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
  return language.startsWith("zh") ? "zh" : "en";
}

function serializeFile(file: TFile): Record<string, JsonValue> {
  return {
    path: file.path,
    name: file.name,
    basename: file.basename,
    extension: file.extension,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
    size: file.stat.size
  };
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}
