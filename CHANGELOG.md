# Changelog

## [1.6.5] — 2026-03-17

### Added — New Design Rules (inspired by HeroUI design system)
- **Rule 15 — Button Variants System**: 6 variants (solid, flat, bordered, ghost, light, shadow) with size scale (sm/md/lg) — height, padding, fontSize, cornerRadius
- **Rule 16 — Consistent Spacing Scale**: 8 fixed values (4-48px) — eliminates random pixel values
- **Rule 17 — Border Radius Consistency**: element-size-based radius table + nested radius rule
- **Rule 18 — Shadow/Elevation System**: 4-level hierarchy (flat/sm/md/lg) with dark theme border fallback
- **Rule 19 — Semantic Color Usage**: role-based colors (primary/success/warning/danger/default) with light/dark theme pairs and WCAG contrast rule
- **Rule 20 — Component State Indicators**: 6 states (default/hover/pressed/focused/disabled/loading) with visual implementation guide

---

## [1.6.4] — 2026-03-17

### Added — CI/CD MCP Registry Auto-Publish
- GitHub Actions workflow now auto-publishes to MCP Registry on version bump
- `server.json` version auto-synced from `package.json` in CI
- Uses `mcp-publisher` CLI with GitHub OIDC authentication (no token needed)

### Updated
- `server.json` version synced to 1.6.4

---

## [1.6.3] — 2026-03-17

### Fixed — Deep Design Extraction (critical)
- **Depth limit**: default 4 → 10 levels deep (was losing ~40% content). Support `depth: "full"` for unlimited
- **Truncated node summaries**: when depth limit hit, nodes now include `textContent` (all text within) and `iconNames` (all icon names within) instead of empty `children: []`
- **`get_selection`** also supports `depth` parameter with default 15
- **`depth` param** exposed in MCP tool schema — AI can request deeper extraction when needed
- **`collectTextContent()`** — walks subtree, extracts up to 15 text strings
- **`collectIconNames()`** — walks subtree, extracts up to 10 icon names

---

## [1.6.2] — 2026-03-17

### Improved — Plugin UI Redesign (`plugin/ui.html`)
- Modern dark theme (purple-navy palette) with gradient accents
- Custom SVG logo matching project branding (S-curve flows, donut nodes, code symbols)
- Window resized to 320×420 — no body scroll, log area flex-grows to fill
- Stats counters colored per type (purple writes, blue reads, red errors)
- Custom thin scrollbar for activity log
- Button press animation and gradient primary button

### Improved — Connection Stability
- **Exponential backoff** on disconnect: 900ms → 1.8s → 3.6s → 5s cap (was fixed 900ms flood)
- **Graceful reconnect states**: yellow "Reconnecting (1/3)" → red "Offline" after 3 fails
- **Health TTL** increased 15s → 30s — tolerates Figma Desktop lag/tab switching
- **Port conflict recovery** (`bridge-server.js`): auto-kill old process on `EADDRINUSE` + retry
- **Graceful shutdown** method `bridge.stop()` clears pending ops and queue
- **Reconnect button** resets backoff counter for immediate retry
- **Read ops list** updated with all new operations for correct stats counting

---

## [1.6.1] — 2026-03-17

### Fixed — Async API Compatibility (`plugin/code.js`)
- **`get_styles`** — migrated to async Figma API (`getLocalPaintStylesAsync`, etc.) for `documentAccess: "dynamic-page"` compatibility
- **`get_local_components`** — added `figma.loadAllPagesAsync()` before `findAllWithCriteria`
- **`get_variables`** — migrated to `getLocalVariableCollectionsAsync` and `getVariableByIdAsync`
- **`listComponents`** — added `figma.loadAllPagesAsync()` for cross-page component discovery

### Improved — Screenshot Inline Display (`server/index.js`)
- Screenshots now return as MCP `image` content type (base64 PNG) instead of JSON text
- Claude Code displays screenshots **inline** in chat — no bash permission needed
- Metadata (nodeId, width, height) returned as separate text content alongside image

### Improved — Design Data Extraction (`plugin/code.js` — `extractDesignTree`)
- **Fill**: multiple fills, gradient stops (linear/radial/angular), image fills with scaleMode, fill opacity
- **Text**: color (`fill`), letter spacing, line height (auto/percent/px), text decoration, truncation, auto-resize mode, vertical align
- **Layout**: sizing modes (`primarySizing`, `counterSizing`), layout wrap, compact uniform padding, `layoutGrow`, `layoutAlign`, absolute positioning
- **Effects**: drop shadow, inner shadow, blur — with color, offset, radius, spread
- **Corner radius**: per-corner support (tl/tr/br/bl)
- **Visual**: blend mode, clip content, opacity (rounded)
- **Constraints**: horizontal/vertical constraint detection
- **Components**: instance override count, component description
- **Icon detection**: `isIcon: true` flag on small VECTOR/GROUP/INSTANCE nodes with SVG export hint
- **Image detection**: `hasImage: true` flag on nodes with IMAGE fills with screenshot export hint
- **VECTOR nodes**: path count for vector/boolean operations

### Updated — Plugin Manifest (`plugin/manifest.json`)
- Added `"documentAccess": "dynamic-page"` for Figma Community publish compatibility

---

## [1.6.0] — 2026-03-17

### Added — New Read Operations (`plugin/code.js`)
- **`get_styles`** — read all local paint, text, effect, grid styles from the document
- **`get_local_components`** — enhanced component listing with descriptions, dimensions, variant properties, and component sets
- **`get_viewport`** — read current viewport position, zoom level, and visible bounds
- **`get_variables`** — read Figma local variables (Design Tokens) with collections, modes, and resolved values
- **`set_viewport`** — navigate viewport to a node or specific position/zoom

### Added — New Write Operations
- **`clone`** — duplicate any node with optional repositioning and reparenting
- **`group`** — group multiple nodes by IDs into a named group
- **`ungroup`** — ungroup a GROUP/FRAME, moving children to parent
- **`flatten`** — flatten/merge vectors into a single path
- **`resize`** — resize any node with width/height params
- **`set_selection`** — programmatically select nodes by IDs
- **`batch`** — execute up to 50 operations in a single call for 10-25x performance

### Updated — Tool Definitions (`server/tool-definitions.js`)
- `figma_read` enum expanded: `get_styles`, `get_local_components`, `get_viewport`, `get_variables`
- `figma_write` description updated with new operations list

### Updated — API Docs (`server/api-docs.js`)
- Full reference for all new read operations with examples
- Full reference for clone, group, ungroup, flatten, resize, set_selection, set_viewport, batch
- Batch operation examples showing multi-op patterns

---

## [1.5.0] — 2026-03-16

### Added — Plugin (`plugin/code.js`)
- **VECTOR node type** — create diagonal lines, bezier curves, arcs, polygons from SVG path data (`d` param or `paths` array), with `strokeCap` and `strokeJoin` support
- **Component-aware design tree** — `COMPONENT`, `COMPONENT_SET` show description; `INSTANCE` shows `componentName` + `componentId`
- **Mixed text style handling** — `extractDesignTree` now reads `getRangeFontName()/getRangeFontSize()` for multi-style text nodes instead of crashing
- **Deep search for screenshot/export** — `screenshot` and `export_svg` now use `findOne()` fallback when node not found at top level
- **Expanded exportable types** — screenshot supports `COMPONENT`, `COMPONENT_SET`, `SECTION`, `INSTANCE`, `GROUP` (not just FRAME)
- **Extended font style map** — added Thin, Heavy, Condensed Heavy, Thin Italic, Light Italic, Extra Bold
- **`sanitizeForPostMessage()`** — strips `figma.mixed` Symbol values before postMessage to prevent structured clone errors

### Fixed — Plugin
- **COMPONENT_SET crash** — try/catch around fills/strokes/cornerRadius/opacity/layoutMode reads that threw "Cannot unwrap symbol"
- **get_design error reporting** — wraps tree extraction with nodeType + id in error message for easier debugging

### Added — API Docs (`server/api-docs.js`)
- **6 new design rules** (Rule 6–10): layer order, text vs bg color, container height, no emoji as icons, layout quality standards
- **Design Library tokens** — full color table (9 tokens) + text style table (8 tokens) in API docs
- **Auto Layout reference** — complete guide with creation, common patterns, child properties, modification
- **Icon system docs** — library priority table, coloring rule, sizing rule with container ratios
- **VECTOR type documentation** — path data examples (diagonal, bezier, quadratic, wave, arc, multi-path)
- **Image & icon helper docs** — `loadImage`, `loadIcon`, `loadIconIn` with usage examples

---

## [1.4.1] — 2026-03-15

### Added
- **CLAUDE.md** — 3 new mandatory design rules:
  - **Progress Bar Rule** — overlapping elements must use non-auto-layout wrapper frame
  - **Badge/Pill Rule** — separate concerns for text centering (auto-layout) vs position on parent (absolute x,y)
  - **Container Height Rule** — height formula to prevent content overflow/clipping

---

## [1.4.0] — 2026-03-15

### Added
- **`figma.loadImage(url, opts)`** — download image from URL server-side, convert to base64, create IMAGE node on canvas (supports `scaleMode`, `cornerRadius`, up to 5MB)
- **`figma.loadIcon(name, opts)`** — fetch SVG icon with auto fallback chain: Fluent UI → Bootstrap → Phosphor → Lucide; auto-detects fill vs stroke and applies color
- **`figma.loadIconIn(name, opts)`** — icon inside a centered circle background with configurable `containerSize`, `fill`, `bgOpacity`
- **`httpFetch()` helper** — server-side HTTP/HTTPS fetcher with redirect following (up to 3), size limits, and timeout (15s)
- Icon library config supporting 4 icon sources with fill-type detection

### Changed
- `code-executor.js` — sandbox timeout increased from 10s to 30s (needed for image/icon downloads)
- `CLAUDE.md` — updated API reference with `loadImage`, `loadIcon`, `loadIconIn` docs and examples

---

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
