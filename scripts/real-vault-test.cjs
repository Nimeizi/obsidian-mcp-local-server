const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");

const vaultRoot = "Z:\\obsidian\\Mind Palace";

class MockPlugin {
  constructor(app) {
    this.app = app;
    this.manifest = { id: "obsidian-mcp-bridge" };
  }
  async loadData() { return {}; }
  async saveData() {}
  addCommand() {}
  addSettingTab() {}
}

class MockPluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = { empty() {}, createEl() {} };
  }
}

class MockSetting {
  setName() { return this; }
  setDesc() { return this; }
  addText(cb) { cb(control()); return this; }
  addTextArea(cb) { cb(control()); return this; }
  addToggle(cb) { cb({ setValue() { return this; }, onChange() { return this; } }); return this; }
  addButton(cb) { cb({ setButtonText() { return this; }, onClick() { return this; } }); return this; }
}

function control() {
  return {
    setPlaceholder() { return this; },
    setValue() { return this; },
    onChange() { return this; }
  };
}

class MockNotice {
  constructor(message) {
    this.message = message;
  }
}

class MockTFile {
  constructor(filePath, stat) {
    this.path = filePath;
    this.basename = path.basename(filePath, path.extname(filePath));
    this.extension = path.extname(filePath).replace(".", "");
    this.stat = { mtime: stat.mtimeMs };
  }
}

const obsidianMock = {
  App: class {},
  Plugin: MockPlugin,
  PluginSettingTab: MockPluginSettingTab,
  Setting: MockSetting,
  Notice: MockNotice,
  TFile: MockTFile,
  normalizePath(input) {
    return input.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoader(request, parent, isMain) {
  if (request === "obsidian") {
    return obsidianMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function findMarkdownFiles(dir, results = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".obsidian") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findMarkdownFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function toTFile(fullPath) {
  const stat = await fsp.stat(fullPath);
  return new MockTFile(relativeVaultPath(fullPath), stat);
}

function relativeVaultPath(fullPath) {
  return path.relative(vaultRoot, fullPath).replace(/\\/g, "/");
}

function absoluteVaultPath(relativePath) {
  return path.join(vaultRoot, relativePath);
}

async function createMockApp() {
  const markdownFiles = await findMarkdownFiles(vaultRoot);
  const activeFullPath = markdownFiles[0];
  if (!activeFullPath) {
    throw new Error("No markdown files found in vault.");
  }

  const vault = {
    getMarkdownFiles() {
      return walkMarkdownFilesSync(vaultRoot).map((item) => {
        const stat = fs.statSync(item);
        return new MockTFile(relativeVaultPath(item), stat);
      });
    },
    getAbstractFileByPath(filePath) {
      const fullPath = absoluteVaultPath(filePath);
      if (!fs.existsSync(fullPath) || !fullPath.endsWith(".md")) {
        return null;
      }
      const stat = fs.statSync(fullPath);
      return new MockTFile(filePath, stat);
    },
    async cachedRead(target) {
      return fsp.readFile(absoluteVaultPath(target.path), "utf8");
    },
    async read(target) {
      return fsp.readFile(absoluteVaultPath(target.path), "utf8");
    },
    async process(target, updater) {
      const fullPath = absoluteVaultPath(target.path);
      const current = await fsp.readFile(fullPath, "utf8");
      const next = updater(current);
      await fsp.writeFile(fullPath, next, "utf8");
    },
    async create(filePath, content) {
      const fullPath = absoluteVaultPath(filePath);
      await fsp.mkdir(path.dirname(fullPath), { recursive: true });
      await fsp.writeFile(fullPath, content, "utf8");
      const stat = await fsp.stat(fullPath);
      return new MockTFile(filePath, stat);
    },
    async createFolder(folderPath) {
      await fsp.mkdir(absoluteVaultPath(folderPath), { recursive: true });
    }
  };

  return {
    vault,
    workspace: {
      async getActiveFile() {
        return toTFile(activeFullPath);
      }
    },
    fileManager: {
      async processFrontMatter() {
        throw new Error("Frontmatter test not implemented in real-vault-test.");
      }
    }
  };
}

function walkMarkdownFilesSync(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".obsidian") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFilesSync(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function requestJson({ method = "GET", pathName, body, token, port }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathName,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const PluginClass = require("../main.js").default;
  const app = await createMockApp();
  const plugin = new PluginClass(app);
  await plugin.onload();

  const port = plugin.settings.port;
  const token = plugin.settings.authToken;
  const testPath = "__codex_mcp_bridge_test/real-test-note.md";
  const testFullPath = absoluteVaultPath(testPath);

  if (fs.existsSync(testFullPath)) {
    await fsp.rm(path.dirname(testFullPath), { recursive: true, force: true });
  }

  const notes = await app.vault.getMarkdownFiles();
  const existingPath = notes[0].path;

  const results = {
    existingRead: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_note", arguments: { path: existingPath } }
      }
    }),
    createPreview: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "prepare_note_change",
          arguments: {
            operation: "create",
            path: testPath,
            content: "# Real Vault Test\n\nCreated against the actual vault."
          }
        }
      }
    })
  };

  results.createApply = await requestJson({
    method: "POST",
    pathName: "/mcp",
    port,
    token,
    body: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "apply_pending_change",
        arguments: {
          changeId: results.createPreview.json.result.structuredContent.changeId
        }
      }
    }
  });

  results.createdRead = await requestJson({
    method: "POST",
    pathName: "/mcp",
    port,
    token,
    body: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_note", arguments: { path: testPath } }
    }
  });

  await plugin.onunload();

  await fsp.rm(path.dirname(testFullPath), { recursive: true, force: true });
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
