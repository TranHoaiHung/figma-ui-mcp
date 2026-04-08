# Changelog

## [2.1.0] — 2026-04-08

### Fixed — Comprehensive code review (2 critical, 5 high, 4 medium)

**Critical:**
- `setFrameVariableMode` — null dereference when modeId doesn't match collection modes
- `httpFetch` — unbounded redirect loop → now limited to 3 redirects

**High:**
- Base64 image decode — padding check on raw data instead of cleaned data → corrupt images
- `modifyVariable` / `setupDesignTokens` — inline hex parse bypassed `normalizeHex()` → NaN on CSS color names. Now uses `hexToRgb()`
- `httpProxy` missing `.port` property → fragile fallback
- `search_nodes` — removed unnecessary `loadAllPagesAsync()` that blocked UI on large files
- `countAssets` function declared inside loop → hoisted outside with section parameter

**Medium:**
- Version strings unified to 2.1.0 across `package.json`, `server/index.js`, `bridge-server.js`, plugin status handler
- `modify` handler now supports `paddingHorizontal` / `paddingVertical` shorthand (matches `create`)
- `ui.html` READ_OPS updated — added `get_node_detail`, `export_image`, `search_nodes`, `scan_design`; removed stale `to_code`
- `ungroup` — added `parent.removed` guard, falls back to currentPage

**Performance:**
- `get_selection` — eliminated double `extractDesignTree` call (reuses computed tree for tokens)
- `get_design` — SVG inline time budget 5s + max 10 icons (prevents timeout on heavy files)
- Bridge `OP_TIMEOUT_MS` raised 30s → 60s for heavy files

---

## [2.0.3] — 2026-04-08

### Fixed — `fills: NaN color` error (`src/plugin/utils.js`)

- **`hexToRgb`** — `parseInt` was returning `NaN` when AI passed invalid color values (CSS names, `"transparent"`, `"var(--color)"`, short hex without expansion)
- Added `normalizeHex()`: validates hex, expands 3-char shorthand, maps common CSS color names (`white`, `black`, `teal`, `red`, etc.) to hex, treats `transparent`/`none` as no-fill
- **`solidFill` / `solidStroke`** — both now return `[]` for transparent/none instead of crashing
- Throws clear error for truly invalid values: `Invalid color value: "var(--x)". Use 6-digit hex like #FF0000`

---

## [2.0.2] — 2026-04-07

### Fixed
- `handlers.create`: guard missing `type` early — dumps received param keys in error message so AI can self-diagnose instead of guessing API changed

---

## [2.0.1] — 2026-04-07

### Fixed / Docs
- `counterAxisAlignItems: "STRETCH"` is invalid — corrected to `"MIN"` in all docs + examples
- Added **BUTTON/INPUT CONSTRUCTION RULE**: never use RECTANGLE+TEXT siblings — always use FRAME with auto-layout
- Added **CARD/SCREEN LAYOUT RULE**: card container must use VERTICAL auto-layout, full-width children use `layoutAlign: "STRETCH"`
- `setPage` now accepts `pageName`, `page`, `pageId` params (not just `name`)
- `resolveNode` accepts `nodeId`, `targetId`, `nodeName` in addition to `id`/`name`
- `delete` is now idempotent — returns success if node already gone
- `modify` dumps received param keys in error to help diagnose AI param mismatches
- `lineHeight` accepts both number and pre-formed `{ value, unit }` object
- Split `plugin/code.js` → `src/plugin/` modules with concat build pipeline

---

## [2.0.0] — 2026-04-07

### Fixed — Stale node IDs and parameter naming inconsistencies (`src/plugin/`)

- **`resolveNode`** — now falls back to name lookup when ID not found (handles stale IDs after delete+recreate in same session)
- **`modify`** — clearer error message: tells AI the node was deleted and to use current IDs
- **`get_node_detail`** — now accepts `nodeId` and `nodeName` in addition to `id`/`name`; error message now instructs AI to call `get_page_nodes` to refresh IDs
- **`applyVariable`** — now accepts `nodeId`, `id`, `targetId`, or `node` object (any of the 4 common param names AI uses)
- **`ungroup`** — null guard for empty/missing `children`; handles already-deleted nodes
- **`create`** — guard for deleted parent node in batch operations (stale `parentId`)
- **`lineHeight`** — accepts both number (pixels) and pre-formed `{ value, unit }` object in both `create` and `modify`

### Other
- Split `plugin/code.js` → `src/plugin/` modules with concat build pipeline (`npm run build:plugin`)

---

## [1.9.9] — 2026-04-07

### Fixed — Read operations miss gradient angles, blur effects, multiple strokes, rotation (`plugin/code.js`)

Improvements to `extractDesignTree` (used by `get_design`, `get_selection`) and `get_node_detail`:

- **Gradient angle** — `gradientAngle` (degrees) now extracted from `gradientTransform` matrix for `GRADIENT_LINEAR` fills; available in both `extractDesignTree` and `get_node_detail`
- **Multiple strokes** — when a node has >1 stroke or non-SOLID strokes, all are returned as `strokes[]` array instead of only the first solid; applies to both read paths
- **Blur effects** — `get_node_detail` now outputs `filter: "blur(Xpx)"` for `LAYER_BLUR` and `backdropFilter: "blur(Xpx)"` for `BACKGROUND_BLUR` (previously silently dropped)
- **Rotation** — `rotation` (degrees) now included in both `extractDesignTree` and `get_node_detail` when non-zero

---

## [1.9.8] — 2026-04-07

### Fixed — UI quality degrades when installed via npm in a new project

Root cause: AI skips `figma_docs` when there is no local `CLAUDE.md`, resulting in hardcoded colors, wrong icon sizes, broken layer order, and missing Design Library setup.

Three-point enforcement fix:

- **`figma_write` description** (`server/tool-definitions.js`): added `⚠️ MANDATORY: Call figma_docs BEFORE writing any design code` with explicit consequence warning — AI reads tool descriptions before every call
- **`figma_status` hint** (`server/index.js`): changed from generic "Ready" to `CONNECTED. BEFORE drawing anything: call figma_docs` — AI reads the status response before proceeding
- **`figma_docs` quick-start checklist** (`server/api-docs.js`): added `🚨 CRITICAL QUICK-START CHECKLIST` at the very top (before all other rules) with the exact 3-step bootstrap sequence + 7 non-negotiable rules in compact bullet form — ensures critical rules are seen immediately, not buried in 1700 lines

---

## [1.9.7] — 2026-04-07

### Added — Frame variable mode override (`plugin/code.js`, `server/code-executor.js`)

2 new handlers replacing the need for Figma REST API `PATCH /v1/files/:key/nodes` `explicitVariableModes`:

- **`setFrameVariableMode`** — pin a frame/group/section to a specific variable mode via `node.setExplicitVariableModeForCollection(collection, modeId)`. Accepts `collectionId` (or name) + `modeId` or `modeName`. Returns `explicitVariableModes` map.
- **`clearFrameVariableMode`** — remove the explicit mode override from a frame via `node.clearExplicitVariableModeForCollection(collection)`, reverting to parent/document default.

Typical use case: set Light mode on one frame, Dark on another, then export both — all in one script without any REST calls.

---

## [1.9.6] — 2026-04-07

### Added — Figma Variables multi-mode support (`plugin/code.js`, `server/api-docs.js`)

4 new handlers for full Light/Dark/Brand mode workflows:

- **`addVariableMode`** — add a new mode to a collection (`collection.addMode(name)`) → returns `{ modeId, modeName, modes }`
- **`renameVariableMode`** — rename an existing mode (`collection.renameMode(modeId, newName)`) → returns updated modes list
- **`removeVariableMode`** — delete a mode (`collection.removeMode(modeId)`) → returns remaining modes
- **`setVariableValue`** — set a variable's value for any specific mode; accepts `modeId` or `modeName`, auto-converts hex for COLOR variables

`tool-definitions.js` description updated to list all new operations.
`api-docs.js` updated with individual examples + complete Light/Dark multi-mode workflow.

---

## [1.9.5] — 2026-04-05

### Fixed — `figma.getNodeById` removed from Figma Plugin API (`plugin/code.js`)
- Replaced deprecated sync `figma.getNodeById()` (removed by Figma) with `findNodeByIdAsync()` using `figma.getNodeByIdAsync()` as cross-page fallback
- Added `findNodeByIdAsync` as a new async helper alongside the existing sync `findNodeById` (current-page only)
- Updated all 21+ call sites across every handler: `modify`, `delete`, `create`, `clone`, `group`, `set_selection`, `get_selection`, `get_design`, `scan_design`, `search_nodes`, `export_svg`, `export_image`, `get_node_detail`, `set_viewport`, `apply_variable`, `createComponent`, `append`, `instantiate`, `query`, `flatten`, `resize`, `ungroup`
- `resolveNode` is now `async` and uses `findNodeByIdAsync` internally

### Fixed — `[dispatch:delete] not a function` (`plugin/code.js`)
- `handlers.delete` used dot notation on a JS reserved keyword — reassigned via `handlers["delete"]` (bracket notation) to prevent engine parse ambiguity in Figma plugin sandbox

### Fixed — `[dispatch:search_nodes] invalid 'in' operand` (`plugin/code.js`)
- Figma API can return `null`/`undefined` slots in `node.children` arrays — all tree-walking functions now guard with `!node || typeof node !== "object"` before any `in` operator usage
- Added `Array.isArray(node.children)` checks alongside all `"children" in node` expressions
- Functions fixed: `walkAndMatch`, `walkCount`, `countAssets`, `collectTextContent` (inner walk), `collectIconNames` (inner walk), `extractDesignTree`

---

## [1.9.4] — 2026-04-04

### Fixed — Multi-session stability (`server/index.js`, `server/bridge-server.js`)
- **Proxy-first startup**: sessions now check for an existing healthy bridge on port 38451 *before* starting `BridgeServer` — if one is found, the session attaches as HTTP proxy immediately and never creates a redundant local bridge
- **Redundant bridge cleanup**: if `BridgeServer.start()` falls back to a non-primary port, it is stopped and the session switches to HTTP proxy — prevents sibling sessions from accumulating bridges on 38452+
- **Safe stale-bridge detection**: `killStaleBridges` now only targets the primary port, and only kills processes that return invalid JSON (zombie/foreign). Bridges that return a valid health payload — even with `pluginConnected: false` — are live sibling sessions and are never killed. Fixes `Transport closed` errors in multi-session environments (Codex App, etc.)

### Fixed — Instance node missing source component reference (`plugin/code.js`)
- `get_selection`, `get_design`, and `get_node_detail` now all expose `componentId` and `componentName` for `INSTANCE` nodes — previously `get_node_detail` was missing these fields

### Fixed — Node data missing applied style references (`plugin/code.js`)
- All read operations now expose style IDs when a node has applied local styles: `textStyleId`, `fillStyleId`, `strokeStyleId`, `effectStyleId`, `gridStyleId`
- Cross-reference these with `get_styles()` results to map nodes to design system styles

### Fixed — Component instance missing property values (`plugin/code.js`)
- `INSTANCE` nodes now expose `componentPropertyValues`: a map of property key → `{type, value}` for the explicit property assignments on that instance
- `COMPONENT` and `COMPONENT_SET` nodes now expose `componentPropertyDefinitions`: a map of property key → `{type, defaultValue}`

---

## [1.9.3] — 2026-03-28

### Fixed — Plugin bugs
- **`fill: "NONE"` crash**: `solidFill()` now returns `[]` when hex is `"NONE"` or invalid — no more NaN color validation errors
- **`search_nodes` crash**: added `figma.loadAllPagesAsync()` before `findOne()` calls — fixes `documentAccess: dynamic-page` error
- **`batch` empty operations**: handler now accepts both `figma.batch([...])` array and `{ operations: [...] }` format
- **`modify` missing text properties**: added `textAlign`, `textAlignVertical`, `lineHeight` support with auto font loading

### Added — Design rules in API docs (`figma_docs`)
9 new mandatory rules for consistent, bug-free designs:
- **Mobile Bottom Anchoring** — calculate y from frameHeight, not hardcode
- **HUG vs STRETCH Conflict** — HORIZONTAL frames needing stretch must keep `primaryAxisSizingMode: "FIXED"`
- **Centered Content Must Use Auto-Layout** — no manual x/y math for centering
- **Illustration Centering + Layer Order** — draw background first, center icon last (top layer)
- **Text Align vs Layout Align** — `layoutAlign: "STRETCH"` ≠ `textAlign: "CENTER"`, both needed
- **Text Wrapping in Auto-Layout** — use `layoutAlign: "STRETCH"` on text that should wrap
- **Header Title Centering** — `layoutGrow: 1` + `textAlign: "CENTER"` for [action][title][action] pattern
- **Component Reuse** — create master components, use `clone` for instances across screens
- **MANDATORY workflow**: components frame → create frame → convert to component → clone instances

### Improved — README
- Added step-by-step usage guide: connect → prompt → iterate
- Added 6 prompt examples with expected results
- Added tips for better AI design results
- Added workflow conversation example

---

## [1.9.2] — 2026-03-23

### Fixed — Text wrapping in mobile UI
- **Auto-detect text wrap**: when `width` is set on TEXT node, plugin now defaults `textAutoResize: "HEIGHT"` — text wraps within frame instead of overflowing
- Previously text with fixed width still used `WIDTH_AND_HEIGHT` (Figma default) → multi-line text spilled outside containers
- No code change needed from AI side — plugin handles it automatically

### Fixed — Stale bridge port conflict
- **Auto-kill stale bridges**: on startup, scans ports 38451-38460 for disconnected figma-ui-mcp processes and kills them before binding
- Fixes issue where multiple Claude Code sessions leave zombie bridge servers, causing plugin to connect to wrong port
- Always reclaims port 38451 when possible

### Improved — SEO & discoverability
- README: added IDE-specific subtitle (Claude Code, Antigravity, Cursor, VS Code)
- README: added keywords section for Google indexing
- package.json: expanded keywords and description for npm search
- Clarified tested vs compatible IDEs

---

## [1.9.1] — 2026-03-19

### Fixed — Connection stability
- **OP_TIMEOUT**: 10s → 30s — prevents first-run timeout during font loading and large exports
- **HEALTH_TTL**: 30s → 60s — plugin won't be marked offline while processing heavy operations
- **Plugin UI messages**: clear feedback during first connection ("Waiting for MCP server", "first run may take 15s to download", "Cannot connect — run: npx figma-ui-mcp")

---

## [1.9.0] — 2026-03-19

### Added — `scan_design` operation (progressive reading for large files)
- Walks entire tree, returns structured summary without token overflow
- Extracts: all text (500 max), top 30 colors by usage frequency, fonts by usage, images (50), icons (50), component instances, sections with text summaries
- Recommended first step for complex designs before drilling into sections

### Added — `search_nodes` operation (property-based search)
- Find nodes by: fill color, type, namePattern (wildcard `*header*`), fontFamily, fontWeight, fontSize, hasImage, hasIcon, min/maxWidth, min/maxHeight
- Returns up to 50 matches with parent path context
- No tree traversal needed — direct property queries

### Added — Compact output mode for `get_design` / `get_selection`
- `detail: "minimal"` — ~5% tokens: id, name, type, position, size only
- `detail: "compact"` — ~30% tokens: + fill, stroke, layout, text content, icon/image flags
- `detail: "full"` — 100% tokens: + effects, boundVariables, inline SVG (default)
- Enables progressive reading: minimal overview → compact section → full node detail

### Added — Restart IDE warning in README
- Clear note after MCP setup: must quit and reopen IDE for MCP server to load

---

## [1.8.0] — 2026-03-18

### Fixed — BLOCKER: export_svg TextDecoder crash
- Replaced `new TextDecoder()` with manual UTF-8 decoder — Figma sandbox has no TextDecoder

### Added — `export_image` operation
- Export node as base64 PNG/JPG for saving to disk (scale, format params)
- Returns `{ base64, format, width, height, nodeId, sizeBytes }`

### Added — `get_node_detail` operation
- CSS-like properties for single node — no tree traversal needed
- Includes `css` object with mapped values (flexDirection, justifyContent, alignItems, gap, padding)
- blendMode, visible, opacity, boxShadow (CSS string), boundVariables

### Improved — Mixed text segments
- TEXT nodes with mixed styles now return `segments` array with per-run fill, fontWeight, fontSize
- First segment used as representative for top-level fontFamily/fontWeight/fill

### Improved — Design data extraction
- Inline SVG for icon nodes in `get_design` (auto-export up to 20 icons, <5KB each)
- Padding always detailed 4 values + counterAxisSpacing + itemSpacing rename
- fillOpacity included at all depths when !== 1.0
- strokes include strokeAlign on all node types

---

## [1.7.3] — 2026-03-18

### Added — `export_image` operation (figma_read)
- Export any node as base64 PNG/JPG string — for saving images to disk
- Supports `format` param ("png" default, "jpg") and `scale` param (default 2x)
- Returns `{ base64, format, width, height, nodeId, nodeName, sizeBytes }`
- Use case: extract avatars, thumbnails, icons from Figma designs as files
- Separate from `screenshot` (which displays inline in chat)

---

## [1.7.2] — 2026-03-18

### Fixed — BLOCKER: export_svg TextDecoder crash
- Replaced `new TextDecoder()` with manual UTF-8 decoder (`uint8ArrayToString`) — Figma plugin sandbox has no TextDecoder
- `export_svg` now returns width/height alongside SVG markup
- Created shared `exportNodeSvg()` helper used by both export_svg and inline icon extraction

### Added — `get_node_detail` operation (figma_read)
- Query a single node by ID/name → returns CSS-like properties
- Includes: fills (multi-fill, gradient), stroke, borderRadius, boxShadow (CSS string), opacity, padding, gap, flexDirection, fontSize, fontFamily, color, content, boundVariables
- No tree traversal needed — replaces parsing 432K chars to find 1 node

### Improved — Inline SVG for icon nodes
- `get_design` now auto-exports SVG markup for icon nodes (max 20, <5KB each)
- `svgMarkup` field replaces `iconHint` — no separate export_svg call needed

### Improved — Padding always detailed
- Layout padding now always shows 4 values (paddingTop/Right/Bottom/Left) — no more compact `padding` that loses detail
- Added `counterAxisSpacing` for wrapped layouts
- Renamed `spacing` → `itemSpacing` for clarity

---

## [1.7.1] — 2026-03-18

### Added — New Handlers (`plugin/code.js`)
- **`modifyVariable`** — change value of an existing variable by name or ID. Supports COLOR (hex), FLOAT, STRING, BOOLEAN. All bound nodes update instantly
- **`setupDesignTokens`** — bootstrap complete design token system in one call (idempotent). Creates collection + color/number variables, skips existing, updates values

### Improved — Design Data Extraction (`plugin/code.js`)
- **Bound Variables** — `extractDesignTree` now reads `node.boundVariables` and includes variable binding IDs in output (shows which tokens are applied to each node)

### Updated — API Docs (`server/api-docs.js`)
- **Rule 0 — Token-First Workflow** (HIGHEST PRIORITY): mandatory `setupDesignTokens` bootstrap before any design, never hardcode hex colors
- **Rule 0b — Component-First Workflow**: never draw same element twice, create Component → instantiate
- Full reference for `setupDesignTokens`, `modifyVariable`, `applyVariable`, `createComponent` with examples
- Updated Rule 1 to integrate with token-first workflow

### Updated — Code Executor (`server/code-executor.js`)
- Added `modifyVariable`, `setupDesignTokens` to WRITE_OPS

---

## [1.7.0] — 2026-03-18

### Added — Design Token Operations (6 new handlers)
- **`createVariableCollection`** — create named variable collections ("Colors", "Spacing")
- **`createVariable`** — create COLOR/FLOAT/STRING/BOOLEAN variables with initial values. Supports hex color auto-conversion
- **`applyVariable`** — bind variable to node fill/stroke/opacity/cornerRadius. Changes variable once → all bound nodes update
- **`createPaintStyle`** — create reusable local paint styles with name + hex color
- **`createTextStyle`** — create reusable text styles with font family, weight, size, line height, letter spacing
- **`createComponent`** — convert FRAME/GROUP into reusable Figma component

### Updated
- `server/code-executor.js` — registered all new + existing operations in WRITE_OPS and READ_OPS
- `server/tool-definitions.js` — figma_write description includes Design Token operations

### Workflow enabled
```
createVariableCollection("Colors")
→ createVariable("accent-blue", "#2563EB", collection)
→ createVariable("bg-base", "#08090E", collection)
→ create card frame
→ applyVariable(cardId, "fill", "bg-base")
→ change variable value once → all nodes auto-update
```

---

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
