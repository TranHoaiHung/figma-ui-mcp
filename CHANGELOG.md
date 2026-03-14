# Changelog

## [1.1.0] — 2026-03-14

### Added
- **Design Library system** — `ensure_library` and `get_library_tokens` operations in `plugin/code.js`
  - Creates a `🎨 Design Library` frame off-canvas (x: -2000) with sections for Colors, Text Styles, Buttons, Badges, Inputs, Cards
  - Enforces design consistency: AI always reads library tokens before drawing
- `server/code-executor.js` — `ensure_library`, `get_library_tokens` added to WRITE_OPS allowlist
- `server/api-docs.js` — mandatory Design System Rules injected at top of docs (AI reads these on every task)
- `assets/logo-v6.png` — horizontal brand banner (icon + logotype)
- `assets/logo-icon.png` — square icon (870×870, cropped from banner)
- `plugin/icon16.png` and `plugin/icon32.png` — Figma plugin icons
- `LICENSE` — MIT license as standalone file

### Fixed
- `server/bridge-server.js` — `HOST` changed from `127.0.0.1` to `null` (Node.js dual-stack `::`) — fixes plugin connection failures on systems where Figma connects via `::1` (IPv6 loopback) instead of `127.0.0.1`

### Changed
- `plugin/manifest.json` — removed `documentAccess: "dynamic-page"` and `devAllowedDomains` (cleanup)
- `plugin/ui.html` — minor UI cleanup
- `package.json` — added `author`, `homepage`, `bugs` fields; expanded `keywords` for npm discoverability
- `README.md` — logo banner in header, license badge, Star History chart

### Removed
- `server/package.json` and `server/package-lock.json` — redundant; root `package.json` is the npm entry point

---

## [1.0.0] — 2026-03-14

### Added
- Initial release — bidirectional Figma MCP server
- **MCP Server** (`server/`) — 4 tools: `figma_status`, `figma_write`, `figma_read`, `figma_docs`
- **HTTP Bridge** (`server/bridge-server.js`) — polling-based, localhost:38451 only, 500KB body limit, 50-request queue cap
- **VM Sandbox** (`server/code-executor.js`) — `vm.runInContext()` blocks `require`, `process`, `fs`, `fetch`; 10s timeout
- **Figma Plugin** (`plugin/`) — handles both write ops (create/modify/delete/query) and read ops (get_selection, get_design, get_page_nodes, screenshot, export_svg)
- Plugin manifest with `editorType: ["figma", "dev"]` and `networkAccess.reasoning` field
- Write operations: `create` (FRAME/RECTANGLE/ELLIPSE/LINE/TEXT), `modify`, `delete`, `append`, `query`, `listPages`, `setPage`, `createPage`, `listComponents`, `instantiate`
- Read operations: `get_selection` (design tree + tokens), `get_design` (full node tree), `get_page_nodes`, `screenshot` (PNG base64), `export_svg`
- Design token extraction: colors, fonts, sizes from node tree
- Plugin UI with activity log, write/read/error counters, reconnect button

### Architecture decisions
- Single-file `plugin/code.js` and `plugin/ui.html` — Figma plugin sandbox does not support ES modules without a bundler
- MCP server modularized into 5 files for maintainability
- No external dependencies beyond `@modelcontextprotocol/sdk`
- Derived from and improves upon figma-pilot architecture (youware-labs/figma-pilot): added read direction, VM sandbox, cleaner tool API
