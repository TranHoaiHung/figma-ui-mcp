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

The MCP server starts a small HTTP server bound to `localhost:38451`. The Figma plugin (running inside Figma Desktop) uses **long polling** — the server holds requests up to 25s until work arrives, delivering near-realtime latency. All traffic stays on your machine — nothing is sent to any external server.

**Multi-instance support (v2.3.0+):** Multiple Figma files/tabs can connect simultaneously. Each plugin instance sends a `sessionId`, and the bridge routes operations to the correct session. Use the optional `sessionId` param in `figma_write`/`figma_read` to target a specific file.

---

## Features

| Direction | Tool | What it does |
|-----------|------|-------------|
| Write | `figma_write` | Draw frames, shapes, text, prototypes via JS code |
| Read  | `figma_read`  | Extract node trees, colors, typography, screenshots |
| Info  | `figma_status`| Check plugin connection + active sessions |
| Docs  | `figma_docs`  | Get full API reference + examples |

### What's new in v2.4.0

| Feature | Description |
|---------|-------------|
| **Prototyping** | `setReactions` — click/hover/press → navigate/overlay/swap with Smart Animate |
| **Scroll** | `setScrollBehavior` — HORIZONTAL / VERTICAL / BOTH overflow |
| **Variants** | `setComponentProperties` / `swapComponent` — variant + instance swap |
| **Multi-instance** | Multiple Figma tabs connect simultaneously via sessions |
| **Long polling** | Near-realtime latency (was 900ms polling) |
| **MCP Registry** | Listed on glama.ai + smithery.ai |

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

### Step 2 — Install the Figma plugin

**[⬇ Download plugin.zip](https://github.com/TranHoaiHung/figma-ui-mcp/raw/main/plugin.zip)** — no git clone needed

1. Download and **unzip** `plugin.zip` anywhere on your machine
2. Open **Figma Desktop** (required — web app cannot access localhost)
3. Go to **Plugins → Development → Import plugin from manifest...**
4. Select `manifest.json` from the unzipped folder
5. Run **Plugins → Development → Figma UI MCP Bridge**

The plugin UI shows a **green dot** when the MCP server is connected.

### Step 3 — Connect AI to Figma

Tell your AI assistant to connect:

```
"Connect to figma-ui-mcp"
```

The AI will call `figma_status` and confirm:

```
✅ Connected — File: "My Project", Page: "Page 1", Plugin v2.4.0
```

> If you see "Plugin not connected", make sure the Figma plugin is running (Step 2).

### Step 4 — Start designing with prompts

Once connected, just describe what you want in natural language:

```
"Use figma-ui-mcp to draw a login screen for mobile"
```

The AI will automatically:
1. Call `figma_docs` to load the API reference and design rules
2. Call `figma_read get_page_nodes` to understand the current canvas
3. Call `figma_write` to create the design on your Figma canvas
4. Call `figma_read screenshot` to verify the result

### Prompt examples

| Prompt | What happens |
|--------|-------------|
| `"Draw a mobile login screen with social login buttons"` | Creates a 390×844 frame with email/password inputs, Apple/Google buttons |
| `"Read the selected frame and describe the design"` | Extracts colors, typography, spacing from your selection |
| `"Take a screenshot of the current frame"` | Returns an inline image the AI can analyze |
| `"Create a dark theme dashboard with KPI cards"` | Draws a full dashboard layout with charts and stats |
| `"Design an e-commerce product card"` | Creates a product card with image, price, rating, CTA |
| `"Draw a settings page with toggle switches"` | Creates grouped settings with icons and toggles |

### Tips for better results

- **Be specific about style**: `"dark theme"`, `"glassmorphism"`, `"minimal white"` gives the AI clear direction
- **Mention platform**: `"mobile"` (390×844), `"tablet"` (768×1024), `"desktop"` (1440×900)
- **Iterate**: After the first draw, say `"fix the spacing"` or `"make the buttons bigger"` — the AI reads and modifies existing nodes
- **Use selection**: Select a frame in Figma and ask `"improve this design"` — the AI reads your selection first
- **Multi-screen flows**: `"Now draw the signup screen next to the login screen"` — the AI positions frames side by side

### Workflow summary

```
You: "Connect to figma-ui-mcp"
AI:  ✅ Connected to Figma

You: "Draw a mobile onboarding screen with 3 steps"
AI:  [calls figma_docs → figma_write → figma_read screenshot]
AI:  ✅ Done — here's what I created: [inline screenshot]

You: "The title text is not centered"
AI:  [calls figma_read get_selection → figma_write modify → screenshot]
AI:  ✅ Fixed — text is now centered

You: "Now draw the next onboarding screen beside it"
AI:  [reads page_nodes to find position → draws at x+440]
AI:  ✅ Done — 2 screens side by side
```

```
figma_status     — check connection (always call first)
figma_docs       — load API reference (call before drawing)
figma_write      — draw / modify UI on canvas
figma_read       — extract design data, screenshots, SVG
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
| Localhost only | Bridge binds `localhost:38451`, never exposed to network |
| Operation allowlist | 50+ predefined operations accepted (WRITE_OPS + READ_OPS) |
| Timeout | 30s VM execution + 60-90s per plugin operation (adaptive by op type) |
| Body size limit | 5 MB max per request |
| Session isolation | Multi-instance sessions scoped by Figma file ID |

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
| `figma.addVariableMode({ collectionId, modeName })` | Add mode (e.g. dark, vi, ja) to collection |
| `figma.renameVariableMode({ collectionId, modeId, newName })` | Rename existing mode |
| `figma.removeVariableMode({ collectionId, modeId })` | Remove mode from collection |
| `figma.setVariableValue({ variableId, modeId, value })` | Set per-mode value |
| `figma.setFrameVariableMode({ nodeId, collectionId, modeName })` | Switch variable mode on a frame (all children follow) |
| `figma.clearFrameVariableMode({ nodeId, collectionId })` | Reset frame to default mode |
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

### Prototyping & Interactions (v2.4.0)
| Operation | Description |
|-----------|-------------|
| `figma.setReactions({ id, reactions })` | Add prototype interactions (ON_CLICK/ON_HOVER/ON_PRESS → NAVIGATE/OVERLAY/SWAP) |
| `figma.getReactions({ id })` | Read all prototype interactions from a node |
| `figma.removeReactions({ id })` | Clear all interactions from a node |

Supported transitions: `SMART_ANIMATE`, `DISSOLVE`, `MOVE_IN`, `MOVE_OUT`, `PUSH`, `SLIDE_IN`, `SLIDE_OUT`, `INSTANT`
Supported easings: `LINEAR`, `EASE_IN`, `EASE_OUT`, `EASE_IN_AND_OUT`, `CUSTOM_BEZIER`

### Scroll Behavior (v2.4.0)
| Operation | Description |
|-----------|-------------|
| `figma.setScrollBehavior({ id, overflowDirection })` | Set overflow scrolling: `NONE` / `HORIZONTAL` / `VERTICAL` / `BOTH` |

### Variant & Component Swapping (v2.4.0)
| Operation | Description |
|-----------|-------------|
| `figma.setComponentProperties({ id, properties })` | Set variant, boolean, text, or instance swap properties on an INSTANCE |
| `figma.swapComponent({ id, componentId })` | Swap the main component of an instance |
| `figma.getComponentProperties({ id })` | Read all properties + definitions from component/instance |

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
| `search_nodes` | Find nodes by type, name, fill color, font, size — supports `includeHidden` |
| `scan_design` | Progressive scan for large files — all text, colors, fonts, images, icons |

**`includeHidden` param** (boolean, default `false`) — available on `get_selection`, `get_design`, `search_nodes`, `scan_design`. When `false` (default), nodes with `visible: false` are skipped. Pass `true` to include hidden layers.

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
