# Changelog

## [1.3.0] — 2026-03-15

### Added
- **HTTP proxy mode** — MCP server auto-detects if bridge port is in use; connects to existing bridge via HTTP instead of crashing (supports multiple MCP clients sharing one bridge)
- **Name-based lookups** — `append`, `instantiate`, `get_selection`, `screenshot` now accept `name`/`parentName`/`componentName` params alongside IDs
- **fillOpacity on modify** — can update opacity on existing fills without changing color
- **Version reporting** — `figma_status` now returns plugin version and bridge mode (direct/http-proxy)

### Changed
- `plugin/manifest.json` — official Figma plugin ID `1614927480683426278`, added `documentAccess: "dynamic-page"`
- `plugin/code.js` — refactored `append`, `instantiate`, `get_selection`, `screenshot` to use `var`/`function` syntax (Figma sandbox safe, no arrow functions)
- `server/index.js` — bridge connection strategy: try own server first, fallback to HTTP proxy if port taken
- Plugin cover image and 128px icon added to `assets/`

---

## [1.2.0] — 2026-03-15

### Added
- **SVG node type** — `type: "SVG"` with `svg` param; auto-detects fill vs stroke icons (Lucide, Phosphor, etc.) and applies color correctly
- **IMAGE node type** — `type: "IMAGE"` with base64 `imageData` param; supports `scaleMode` (FILL/FIT/CROP/TILE) and `cornerRadius`
- **Auto Layout** — full support on `create` and `modify`:
  - `layoutMode` (HORIZONTAL/VERTICAL), `primaryAxisAlignItems`, `counterAxisAlignItems`
  - Uniform/axis/individual padding, `itemSpacing`
  - `primaryAxisSizingMode`, `counterAxisSizingMode`, `clipsContent`
  - Child properties: `layoutAlign`, `layoutGrow`
- **Fill opacity** — `fillOpacity` param on FRAME, RECTANGLE, ELLIPSE
- **Text alignment** — `textAlignHorizontal`, `textAlignVertical`, `textAutoResize` params

### Changed
- `bridge-server.js` — `MAX_BODY_BYTES` increased from 500 KB to 5 MB to support image payloads

---

## [1.1.4] — 2026-03-14

### Fixed
- CI: use `NPM_TOKEN` secret for npm authentication with `--provenance` attestation

---

## [1.1.3] — 2026-03-14

### Fixed
- CI: remove `registry-url` from `setup-node` — was auto-injecting `GITHUB_TOKEN` as `NODE_AUTH_TOKEN`, blocking npm OIDC Trusted Publishing flow
- CI: manually configure npm registry with empty token so npm CLI uses OIDC exchange

---

## [1.1.2] — 2026-03-14

### Fixed
- `package.json` `files` field now lists explicit files instead of whole `server/` directory — prevents `server/node_modules/` from being bundled into the npm package (was 2.9 MB / 3499 files, now 22 kB / 13 files)
- Add `.npmignore` to exclude `assets/`, `.github/`, `CHANGELOG.md` from npm tarball

---

## [1.1.1] — 2026-03-14

### Changed
- README: clarify Figma Desktop requirement and localhost bridge mechanism
- README: reorder sections — Star History moved before License

### CI
- Switch to npm Trusted Publishing (OIDC) — remove `NPM_TOKEN` dependency
- Add `--provenance` flag for signed npm attestation

---

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
