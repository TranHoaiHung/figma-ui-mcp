# figma-ui-mcp

<p align="center">
  <img src="assets/logo-v6.png" alt="figma-ui-mcp — Claude Code to Figma, AI to Figma, MCP Figma Bridge" width="480" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/figma-ui-mcp"><img src="https://img.shields.io/npm/v/figma-ui-mcp?color=blue" alt="npm version" /></a>
  <a href="https://registry.modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Registry-purple" alt="MCP Registry" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/TranHoaiHung/figma-ui-mcp/stargazers"><img src="https://img.shields.io/github/stars/TranHoaiHung/figma-ui-mcp?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <strong>Claude Code to Figma</strong> · <strong>Antigravity to Figma</strong> · <strong>Cursor to Figma</strong> · <strong>Any MCP IDE to Figma</strong>
</p>

<p align="center">
  <sub>✅ Tested: Claude Code, Antigravity &nbsp;|&nbsp; 🔧 Compatible: Cursor, VS Code, Windsurf, Zed (any MCP stdio client)</sub>
</p>

**Bidirectional Figma MCP bridge** — let AI assistants (Claude Code, Cursor, Windsurf, Antigravity, VS Code Copilot, or any MCP-compatible IDE) **draw UI directly on Figma canvas** and **read existing designs back** as structured data, screenshots, or code-ready tokens. No Figma API key needed — works entirely over localhost.

> **Requires Figma Desktop** — the plugin communicates with the MCP server over `localhost` HTTP polling. Figma's web app does not allow localhost network access, so **Figma Desktop is required**.

```
Claude ──figma_write──▶ MCP Server ──HTTP (localhost:38451)──▶ Figma Plugin ──▶ Figma Document
Claude ◀─figma_read──── MCP Server ◀──HTTP (localhost:38451)── Figma Plugin ◀── Figma Document
```

### How the localhost bridge works

The MCP server starts a small HTTP server bound to `localhost:38451`. The Figma plugin (running inside Figma Desktop) polls this server every 500 ms to pick up queued operations and post results back. All traffic stays on your machine — nothing is sent to any external server.

This approach is necessary because Figma plugins run in a sandboxed iframe and cannot use stdio or WebSocket to talk to a local process directly. HTTP polling over localhost is the only supported method for a Figma plugin to communicate with a local tool.

---

## Features

| Direction | Tool | What it does |
|-----------|------|-------------|
| Write | `figma_write` | Draw frames, shapes, text on any page via JS code |
| Read  | `figma_read`  | Extract node trees, colors, typography, screenshots |
| Info  | `figma_status`| Check plugin connection status |
| Docs  | `figma_docs`  | Get full API reference + examples |

---

## Quick Start

### Step 1 — Add the MCP server to your AI client

Choose your platform:

<details>
<summary><strong>Claude Code (CLI)</strong></summary>

```bash
# Project scope (default)
claude mcp add figma-ui-mcp -- npx figma-ui-mcp

# Global scope (all projects)
claude mcp add --scope user figma-ui-mcp -- npx figma-ui-mcp
```
</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-ui-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Edit `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-ui-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

Edit `.vscode/mcp.json` (project) or add to `settings.json` (global):

```json
{
  "mcp": {
    "servers": {
      "figma": {
        "command": "npx",
        "args": ["-y", "figma-ui-mcp"]
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-ui-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Antigravity (Google)</strong></summary>

1. Open **"..." dropdown** at the top of the agent panel
2. Click **"Manage MCP Servers"** → **"View raw config"**
3. Add to `mcp_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-ui-mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>From source (any client)</strong></summary>

```bash
git clone https://github.com/TranHoaiHung/figma-ui-mcp
cd figma-ui-mcp
npm install
# Then point your MCP client to: node /path/to/figma-ui-mcp/server/index.js
```
</details>

> **⚠️ IMPORTANT: After adding the MCP server, you MUST restart your IDE / AI client (quit and reopen).** The MCP server only loads on startup — simply saving the config file is not enough. This applies to Claude Code, Cursor, VS Code, Windsurf, and Antigravity.

### Step 2 — Run the Figma plugin

1. Open **Figma Desktop** (required — web app cannot access localhost)
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `plugin/manifest.json` from this repo
4. Run **Plugins → Development → Figma UI MCP Bridge**

The plugin UI shows a **green dot** when the MCP server is connected.

### Step 3 — Start designing with AI

The MCP tools are automatically available in your AI client:

```
figma_status     — check connection
figma_write      — draw / modify UI
figma_read       — extract design data
figma_docs       — API reference
```

---

## Usage Examples

### Draw a screen

Ask Claude: *"Draw a dark dashboard with a sidebar, header, and 4 KPI cards"*

Claude calls `figma_write` with code like:

```js
await figma.createPage({ name: "Dashboard" });
await figma.setPage({ name: "Dashboard" });

const root = await figma.create({
  type: "FRAME", name: "Dashboard",
  x: 0, y: 0, width: 1440, height: 900,
  fill: "#0f172a",
});

const sidebar = await figma.create({
  type: "FRAME", name: "Sidebar",
  parentId: root.id,
  x: 0, y: 0, width: 240, height: 900,
  fill: "#1e293b", stroke: "#334155", strokeWeight: 1,
});

await figma.create({
  type: "TEXT", name: "App Name",
  parentId: sidebar.id,
  x: 20, y: 24, content: "My App",
  fontSize: 16, fontWeight: "SemiBold", fill: "#f8fafc",
});
// ... continue
```

### Read a design

Ask Claude: *"Read my selected frame and convert it to Tailwind CSS"*

Claude calls `figma_read` with `operation: "get_selection"`, receives the full node tree,
then generates corresponding code.

### Screenshot a frame

```
figma_read  →  operation: "screenshot"  →  nodeId: "123:456"
```

Returns a base64 PNG Claude can analyze and describe.

---

## Architecture

```
figma-ui-mcp/
├── server/
│   ├── index.js            MCP server (stdio transport)
│   ├── bridge-server.js    HTTP bridge on localhost:38451
│   ├── code-executor.js    VM sandbox — safe JS execution
│   ├── tool-definitions.js MCP tool schemas
│   └── api-docs.js         API reference text
└── plugin/
    ├── manifest.json       Figma plugin manifest
    ├── code.js             Plugin main — operation handlers
    └── ui.html             Plugin UI — HTTP polling + status
```

### Security

| Layer | Protection |
|-------|-----------|
| VM sandbox | `vm.runInContext()` — blocks `require`, `process`, `fs`, `fetch` |
| Localhost only | Bridge binds `127.0.0.1:38451`, never exposed to network |
| Operation allowlist | Only 20 predefined operations accepted |
| Timeout | 10s VM execution + 10s per plugin operation |
| Body size limit | 500 KB max per request |

---

## Available Write Operations (`figma_write`)

### Core CRUD
| Operation | Description |
|-----------|-------------|
| `figma.create({ type, ... })` | Create FRAME / RECTANGLE / ELLIPSE / LINE / TEXT / SVG / IMAGE |
| `figma.modify({ id, ... })` | Update node properties (fill, size, text, layout, etc.) |
| `figma.delete({ id })` | Remove a node |
| `figma.query({ type?, name?, id? })` | Find nodes by type, name, or ID |
| `figma.append({ parentId, childId })` | Move node into parent |

### Page Management
| Operation | Description |
|-----------|-------------|
| `figma.status()` | Current Figma context info |
| `figma.listPages()` | List all pages |
| `figma.setPage({ name })` | Switch active page |
| `figma.createPage({ name })` | Add a new page |

### Node Operations
| Operation | Description |
|-----------|-------------|
| `figma.clone({ id, x?, y?, parentId? })` | Duplicate a node with optional repositioning |
| `figma.group({ nodeIds, name? })` | Group multiple nodes |
| `figma.ungroup({ id })` | Ungroup a GROUP/FRAME |
| `figma.flatten({ id })` | Flatten/merge vectors into single path |
| `figma.resize({ id, width, height })` | Resize any node |
| `figma.set_selection({ ids })` | Programmatically select nodes |
| `figma.set_viewport({ nodeId?, x?, y?, zoom? })` | Navigate viewport |
| `figma.batch({ operations })` | Execute up to 50 ops in one call (10-25x faster) |

### Components
| Operation | Description |
|-----------|-------------|
| `figma.listComponents()` | List all components in document |
| `figma.instantiate({ componentId })` | Create component instance |
| `figma.createComponent({ nodeId, name? })` | Convert FRAME/GROUP → reusable Component |

### Design Tokens & Styles
| Operation | Description |
|-----------|-------------|
| `figma.createVariableCollection({ name })` | Create variable collection ("Colors", "Spacing") |
| `figma.createVariable({ name, collectionId, value })` | Create COLOR/FLOAT/STRING/BOOLEAN variable |
| `figma.applyVariable({ nodeId, field, variableName })` | Bind variable to node fill/stroke/opacity |
| `figma.createPaintStyle({ name, color })` | Create reusable paint style |
| `figma.createTextStyle({ name, fontFamily, fontSize, ... })` | Create reusable text style |
| `figma.modifyVariable({ variableName, value })` | Change variable value — all bound nodes update instantly |
| `figma.setupDesignTokens({ colors, numbers })` | Bootstrap complete token system in one call (idempotent) |
| `figma.ensure_library()` | Create/get Design Library frame |
| `figma.get_library_tokens()` | Read library color + text tokens |

### Image & Icon Helpers (server-side)
| Operation | Description |
|-----------|-------------|
| `figma.loadImage(url, opts)` | Download image → place on canvas |
| `figma.loadIcon(name, opts)` | Fetch SVG icon (auto fallback: Fluent → Bootstrap → Phosphor → Lucide) |
| `figma.loadIconIn(name, opts)` | Icon inside centered circle background |

## Available Read Operations (`figma_read`)

| Operation | Description |
|-----------|-------------|
| `get_selection` | Full design tree of selected node(s) + design tokens |
| `get_design` | Full node tree for a frame/page (depth param: default 10, or "full") |
| `get_page_nodes` | Top-level frames on the current page |
| `screenshot` | Export node as PNG — displays **inline** in Claude Code |
| `export_svg` | Export node as SVG markup |
| `export_image` | Export node as base64 PNG/JPG — for saving to disk (`format`, `scale` params) |
| `get_node_detail` | CSS-like properties for single node (no tree traversal) |
| `get_styles` | All local paint, text, effect, grid styles |
| `get_local_components` | Component listing with descriptions + variant properties |
| `get_viewport` | Current viewport position, zoom, bounds |
| `get_variables` | Local variables (Design Tokens) — collections, modes, values |

---

## Star History

If **figma-ui-mcp** helps you, please give it a star — it helps others discover the project!

[![GitHub stars](https://img.shields.io/github/stars/TranHoaiHung/figma-ui-mcp?style=social)](https://github.com/TranHoaiHung/figma-ui-mcp/stargazers)

[![Star History Chart](https://api.star-history.com/svg?repos=TranHoaiHung/figma-ui-mcp&type=Date)](https://star-history.com/#TranHoaiHung/figma-ui-mcp&Date)

---

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MIT © [TranHoaiHung](https://github.com/TranHoaiHung) — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.

---

## Keywords

figma mcp, claude code to figma, cursor to figma, ai to figma, figma ai plugin, figma mcp bridge, figma mcp server, figma design to code, code to figma design, ai ui design, figma automation, figma plugin ai, model context protocol figma, claude figma, windsurf figma, vs code figma, antigravity figma, ai design tool, figma api alternative, figma localhost plugin, draw ui with ai, ai generate figma design, figma design system ai, mcp server figma, figma read design, figma write design, bidirectional figma, figma desktop plugin, npx figma-ui-mcp
