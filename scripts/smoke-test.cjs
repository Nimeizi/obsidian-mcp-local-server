const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");

class MockPlugin {
  constructor(app) {
    this.app = app;
    this.manifest = { id: "obsidian-mcp-bridge" };
  }

  async loadData() {
    return { port: 27125 };
  }

  async saveData() {}

  addCommand() {}

  addSettingTab() {}
}

class MockPluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty() {},
      createEl() {}
    };
  }
}

class MockSetting {
  constructor() {}
  setName() { return this; }
  setDesc() { return this; }
  addText(cb) {
    cb(makeTextControl());
    return this;
  }
  addTextArea(cb) {
    cb(makeTextControl());
    return this;
  }
  addToggle(cb) {
    cb({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addDropdown(cb) {
    cb({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addButton(cb) {
    cb({ setButtonText() { return this; }, onClick() { return this; } });
    return this;
  }
}

function makeTextControl() {
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
  constructor(filePath, content, mtime = Date.now()) {
    this.path = filePath;
    this.basename = path.basename(filePath, path.extname(filePath));
    this.extension = path.extname(filePath).replace(".", "");
    this.stat = { mtime };
    this._content = content;
  }
}

class MockTFolder {
  constructor(folderPath, children = []) {
    this.path = folderPath;
    this.name = path.basename(folderPath);
    this.children = children;
  }

  isRoot() {
    return this.path === "";
  }
}

const obsidianMock = {
  App: class {},
  Plugin: MockPlugin,
  PluginSettingTab: MockPluginSettingTab,
  Setting: MockSetting,
  Notice: MockNotice,
  TAbstractFile: class {},
  TFile: MockTFile,
  TFolder: MockTFolder,
  getAllTags() {
    return [];
  },
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

function createMockApp() {
  const file = new MockTFile("Inbox/example.md", "# Hello\n\nThis is a note about MCP.\n");
  const files = new Map([[file.path, file]]);

  const vault = {
    getFiles() {
      return Array.from(files.values());
    },
    getMarkdownFiles() {
      return Array.from(files.values());
    },
    getAllFolders(includeRoot = false) {
      const root = new MockTFolder("", Array.from(files.values()));
      return includeRoot ? [root] : [];
    },
    getAbstractFileByPath(filePath) {
      return files.get(filePath) ?? null;
    },
    async cachedRead(target) {
      return target._content;
    },
    async read(target) {
      return target._content;
    },
    async process(target, updater) {
      target._content = updater(target._content);
      target.stat.mtime = Date.now();
    },
    async create(filePath, content) {
      const created = new MockTFile(filePath, content);
      files.set(filePath, created);
      return created;
    },
    async createFolder() {}
  };

  return {
    vault,
    workspace: {
      getActiveFile() {
        return file;
      },
      getLastOpenFiles() {
        return [file.path];
      },
      getLeavesOfType() {
        return [{ id: "leaf-1", view: { getViewType() { return "markdown"; } } }];
      },
      getLeaf() {
        return { async openFile() {} };
      },
      getMostRecentLeaf() {
        return { async openFile() {} };
      }
    },
    fileManager: {
      async processFrontMatter(target, cb) {
        const frontmatter = {};
        cb(frontmatter);
        target.frontmatter = frontmatter;
      },
      async renameFile(target, newPath) {
        files.delete(target.path);
        target.path = newPath;
        files.set(newPath, target);
      },
      async trashFile(target) {
        files.delete(target.path);
      }
    },
    metadataCache: {
      getFileCache() {
        return { tags: [] };
      },
      resolvedLinks: {},
      unresolvedLinks: {}
    }
  };
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
          resolve({
            status: res.statusCode,
            json: text ? JSON.parse(text) : null
          });
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
  const app = createMockApp();
  const plugin = new PluginClass(app);

  await plugin.onload();

  const port = plugin.settings.port;
  const token = plugin.settings.authToken;

  const results = {
    health: await requestJson({ pathName: "/health", port }),
    initialize: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }
    }),
    tools: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
    }),
    readNote: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "vault.read_file",
          arguments: { path: "Inbox/example.md" }
        }
      }
    }),
    prepareChange: await requestJson({
      method: "POST",
      pathName: "/mcp",
      port,
      token,
      body: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "content.prepare_change",
          arguments: {
            operation: "append",
            path: "Inbox/example.md",
            content: "\n\n## Added by test\nThis line was appended."
          }
        }
      }
    })
  };

  results.applyChange = await requestJson({
    method: "POST",
    pathName: "/mcp",
    port,
    token,
    body: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "content.apply_change",
        arguments: {
          changeId: results.prepareChange.json.result.structuredContent.changeId
        }
      }
    }
  });

  results.readAfterApply = await requestJson({
    method: "POST",
    pathName: "/mcp",
    port,
    token,
    body: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "vault.read_file",
        arguments: { path: "Inbox/example.md" }
      }
    }
  });

  await plugin.onunload();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
