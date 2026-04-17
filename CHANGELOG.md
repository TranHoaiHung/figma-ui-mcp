# Changelog

## [2.5.7] — 2026-04-17

### Fixed

**BUG-07** — `modify({ content })` doesn't reflow TEXT node width:
- When `content` changes on a TEXT node that has `textAutoResize: "HEIGHT"` or `"WIDTH_AND_HEIGHT"`, Figma kept the old fixed width causing the longer text to wrap.
- Fix: plugin now sets `textAutoResize = "WIDTH_AND_HEIGHT"` automatically after changing `characters`, unless caller explicitly passes `width` or `textAutoResize`.

**BUG-08** — `create()` always appends to end, no way to insert at position:
- Added `insertIndex` param to `create`. Uses Figma's `parent.insertChild(index, node)` to place the new node at the given index in `parent.children`. Clamps to valid range; falls back to `appendChild` when `insertIndex` is omitted.
- Example: `figma.create({ type: "FRAME", parentId: sidebarId, insertIndex: 1, ... })` inserts after the first child.

**BUG-10** — `loadIcon()` stroke-width raw SVG value makes outline icons invisible at small sizes:
- Ionicons outline SVGs use `stroke-width="48"` in a 512×512 viewBox. After `createNodeFromSvg` the vector's `strokeWeight` is 48, overflowing a 14–24px icon frame.
- Fix: `loadIcon` now reads the SVG `viewBox` width, computes `scale = requestedSize / viewBoxW`, and rewrites all `stroke-width` attributes to `max(0.5, originalStroke × scale)`.

### Tests
- `scripts/test-v257.mjs` — 16 tests covering all three fixes
- **221/221 total tests pass**

## [2.5.6] — 2026-04-17

### Fixed — BUG-16: `loadIcon` x/y ignored, BUG-17: `layoutMode: "NONE"` silently ignored

**BUG-16** (`loadIcon` always places icon at 0,0):
- Root cause: `node.x = x` / `node.y = y` was set BEFORE `parent.appendChild(node)`. Figma resets a node's position when it is appended to a parent, discarding any coordinates set beforehand.
- Fix: moved `node.x = x; node.y = y` to after `appendChild` in `handlers-write.js`. Applies to all node types (FRAME, RECTANGLE, SVG, TEXT, IMAGE, VECTOR, ELLIPSE, LINE).

**BUG-17** (`modify({ layoutMode: "NONE" })` silently ignored):
- Root cause: `primaryAxisAlignItems` / `counterAxisAlignItems` were still being applied after setting `layoutMode = "NONE"`, causing Figma to throw internally and roll back the change.
- Fix: skip align/spacing props when `layoutMode` is being set to `"NONE"`. Also accept `null` and `""` as aliases for `"NONE"`.

### Tests
- Added `scripts/test-v256.mjs` — 8 tests covering BUG-16 (x/y after append) and BUG-17 (layout removal)

## [2.5.5] — 2026-04-17

### Added — Ionicons + Tabler icon libraries (free replacement for paid Icons8 ios-filled)

Icons8 requires a paid plan for SVG format. Added 3 free open-source libraries with filled-first priority so `figma.loadIcon()` now resolves the iOS/filled styles Icons8 users were asking for.

**New ICON_LIBRARIES priority order** (filled-first):

1. **Ionicons v7.4.0** — iOS-native filled (default), 1,300+ icons (replaces Icons8 ios-filled style)
2. Fluent UI — Win11 Filled
3. Bootstrap — Filled
4. Phosphor — Filled
5. **Tabler Filled v3.24.0** — 4,500+ filled icons (broadest coverage)
6. **Tabler Outline v3.24.0** — matching outline set
7. Lucide — outline fallback

**Ionicons SVG handling**: `<path>` tags have no `fill` attribute by default. Plugin now injects `fill="${requested}"` at the `<svg>` root so Figma imports with the requested color.

**Ionicons naming quirks documented**:
- Bell → `notifications`, Back arrow → `chevron-back`, Clock → `time`
- Fire → `flame`, Lightning → `flash`, Lock → `lock-closed`
- Outline/Sharp variants via suffix: `home-outline`, `home-sharp`

### Why not Icons8 directly
- SVG format requires paid plan (`{"error":"paid format requested"}` for free users)
- Free PNG has attribution watermark + fixed resolution, unusable for Figma
- API access needs paid key → violates zero-config philosophy

### Tests
- 11 new icon library tests (real unpkg.com fetches, verifies priority + fill injection)
- **205/205 total tests pass** (84 full + 34 fix + 49 v2.5.2 + 27 v2.5.4 + 11 v2.5.5)
- MCP stdio handshake verified clean

### Docs
- Naming table extended to 6 columns (Ionicons + Fluent + Bootstrap + Phosphor + Tabler Filled + Lucide)
- ICON COLORING RULE updated with `fill="none"` handling for Ionicons
- Both `server/api-docs.js` and `CLAUDE.md` in sync

---

## [2.5.4] — 2026-04-17

### Added — Typography Tokens pipeline (merge of planned v2.6.0 + v2.7.0)

Full first-class support for typography as Design Tokens. Previously text styles had to be created one-by-one and hardcoded fontSize/family. Now they are variable-bound and updatable globally.

**`applyVariable` new fields (STRING variables):**
- `fontFamily` / `fontName` — bind `TextNode.fontName.family`
- `fontStyle` / `fontWeight` — bind `TextNode.fontName.style` ("Regular", "Bold", etc.)
- `characters` / `text` — bind text content for localization

**`setupDesignTokens` new params:**
- `fontSizes: { "text-body": 14 }` → FLOAT variables
- `fonts: { "font-primary": "Inter" }` → STRING variables
- `textStyles: { "text/heading-xl": { fontFamily: "{font-primary}", fontSize: "{text-heading-xl}", lineHeight: 32 } }` — text styles with variable references (`{var-name}` syntax)
- `modes: ["light", "dark"]` — multi-mode support; any token value can be `{ mode1: v, mode2: v }`

**New handler: `applyTextStyle`**
- `figma.applyTextStyle({ nodeId, styleName: "text/heading-xl" })` — apply a local text style by name in 1 call; auto-loads font before applying
- Accepts `styleId` for faster lookup

**Multi-mode typography example:**
```js
await figma.setupDesignTokens({
  collectionName: "Typography",
  modes: ["compact", "comfortable", "large"],
  fontSizes: {
    "text-body":       { compact: 12, comfortable: 14, large: 16 },
    "text-heading-xl": { compact: 22, comfortable: 24, large: 28 }
  }
});
```
Then pin a frame to a mode: `figma.setFrameVariableMode({ nodeId, collectionId, modeName: "large" })` — every bound text resizes automatically.

### Documentation

- New non-negotiable rule: never hardcode `fontSize`/`fontFamily`/`fontWeight` inline on TEXT nodes.
- `applyVariable` field table extended with fontFamily/fontStyle/characters.
- New `applyTextStyle` section with examples.
- `setupDesignTokens` example expanded to show fontSizes + fonts + textStyles + multi-mode.

### Tests

- 27 new typography tests (total 194/194 passing: 84 full + 34 fix + 49 v2.5.2 + 27 v2.5.4).
- MCP stdio handshake verified clean (initialize + tools/list round-trip).

---

## [2.5.3] — 2026-04-17

### Fixed — CRITICAL: MCP server crash on startup (v2.5.2 regression)

- Raw backticks inside the markdown table in `server/api-docs.js` (applyVariable fields) were interpreted as template-literal expressions, causing `SyntaxError: Unexpected identifier 'fill'` the moment Node imported the module.
- Every MCP client loading v2.5.2 saw `MCP error -32000: Connection closed` because the server died before the stdio handshake completed.
- Backticks now properly escaped. Server start verified clean.

**Action for users on v2.5.2:** upgrade to 2.5.3 (`npx figma-ui-mcp@latest`) and restart your IDE.

---

## [2.5.2] — 2026-04-16

### Fixed — feedback.md BUG-02/03/04/05/08/10/11/13/15

- **BUG-02**: `fill`/`stroke` now accept 8-digit hex `#RRGGBBAA`, `rgba(r,g,b,a)`, and 4-digit `#RGBA` — alpha is auto-extracted and applied as paint opacity. Explicit `fillOpacity`/`strokeOpacity` still wins.
- **BUG-03**: VECTOR `d` paths now support SVG arc commands (`A`/`a`). Arcs are converted to cubic Bézier segments before Figma ingests them (Foley/van Dam algorithm, ≤90° chunks).
- **BUG-04**: VECTOR `d` paths accept commas as delimiters — `"M 0 0, L 100 100"` works (spec-compliant).
- **BUG-05**: `counterAxisAlignItems: "STRETCH"` now throws a descriptive error pointing to the correct fix: `counterAxisAlignItems: "MIN"` on parent + `layoutAlign: "STRETCH"` on each child.
- **BUG-08**: Failed VECTOR path parsing now rolls back the orphan node — no more garbage vectors at page root after errors.
- **BUG-10**: `effects: [...]` array supported on `create` and `modify` for any node type. Effect types: `DROP_SHADOW`, `INNER_SHADOW`, `LAYER_BLUR`, `BACKGROUND_BLUR` with `color`, `offset`, `radius`, `spread`, `visible`, `blendMode`. Hex alpha in shadow color auto-extracted.
- **BUG-11**: Gradient fills via `fill: { type: "LINEAR_GRADIENT" | "RADIAL_GRADIENT", angle, stops: [{pos, color}] }`. Works in both `create` and `modify`.
- **BUG-13**: Individual corner radii (`topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`) now accepted in `create` and `modify`. Uniform `cornerRadius` still works as alias for all 4.
- **BUG-15**: When both `width` and `textAlign: "CENTER"` (or RIGHT/JUSTIFIED) are passed to TEXT, plugin auto-infers `textAutoResize: "NONE"` so the text box keeps its full width — fixes silent label-alignment bugs where the box shrunk to content and collapsed centering.

### Documentation

- Added non-negotiable rules for `opacity: 0` wrapper trap, `counterAxisAlignItems: "STRETCH"` invalid value, centered TEXT width requirement, display numeric lineHeight.
- New sections: Effects, Gradient Fills, Individual Corner Radii, Hex Alpha Shorthand, SVG Path Commands with examples.

### Internal

- New source files: `src/plugin/svg-path-helpers.js`, `src/plugin/paint-and-effects.js`.
- 167 automated tests (84 full + 34 fix + 49 v2.5.2) passing.

---

## [2.5.1] — 2026-04-16

### Fixed — feedback.md BUG-01, BUG-03, BUG-05 + SUGGEST-01, SUGGEST-04 + applyVariable extended fields

- **BUG-01/BUG-03**: `create()` now throws a descriptive error when `parentId` is given but not found in the scene — no more silent orphan frames at page root. Error message includes a hint to re-query via `get_page_nodes()`.
- **BUG-05**: `screenshot` and `export_image` called `exportAsync()` on freshly-created nodes before Figma's renderer had painted them, producing blank/white PNG. Fix: `figma.viewport.scrollAndZoomIntoView([node])` is now called before every export to force the renderer to paint the node first.
- **SUGGEST-01**: `figma.batch()` already routed to `handlers["delete"]` — confirmed working; added explicit comment in source.
- **SUGGEST-04**: `figma.instantiate()` now accepts an `overrides` map `{ "Layer Name": { text, fill, stroke, opacity, visible, fontSize, cornerRadius } }` — applies property overrides to named child layers after instantiation.
- **applyVariable extended fields**: `applyVariable` now supports binding FLOAT/BOOLEAN variables to: `paddingTop/Bottom/Left/Right`, `itemSpacing`, `counterAxisSpacing`, `fontSize`, `letterSpacing`, `lineHeight`, `paragraphSpacing`, `paragraphIndent`, `strokeWeight`, `visible`, all four corner radius fields. Adds descriptive error when field is not valid for the node type.

---

## [2.5.0] — 2026-04-15

### Fixed — feedback.md bugs: get_page_nodes array, batch delete, auto-layout warning, sandbox error hint

- **Bug 1**: `figma.get_page_nodes()` now returns a plain Array instead of `{ page, nodes: [] }` — `nodes.length`, `for` loops, and array methods all work directly. `.page` is still accessible as a non-enumerable property.
- **Bug 2**: `figma.delete({ ids: ["1:1", "1:2", ...] })` batch delete added — deletes multiple nodes in one round-trip. Returns `{ deleted, count, results[] }`.
- **Bug 3**: Creating a node with explicit `x`/`y` inside an auto-layout parent now emits a warning to the plugin UI log explaining that Figma ignores absolute position inside auto-layout, and what to use instead (`layoutAlign`, `layoutGrow`).
- **Bug 5**: `ReferenceError` inside a `figma_write` sandbox now appends: *"Each figma_write call runs in an isolated sandbox — variables from previous calls are not available. Re-query node IDs with figma.get_page_nodes() or figma.query() at the start of each call."*

---

## [2.4.5] — 2026-04-15

### Fixed — Issue #7: Multiple artboards stacking on top of each other

- Top-level FRAME/GROUP creation now auto-offsets when user doesn't specify x/y
- Scans existing page children, places new frame 50px right of the rightmost element
- Only triggers when parentId is absent and x/y are both unset (explicit x:0 y:0 still works)
- Regression test: 55/55 operations pass

---

## [2.4.4] — 2026-04-14

### Fixed — normalizeHex now accepts rgba(), rgb(), 8-char hex

- `rgba(255,255,255,0.3)` → `#ffffff` (alpha discarded, use `fillOpacity` separately)
- `rgb(100,200,50)` → `#64c832`
- `#ff000080` (8-char hex with alpha) → `#ff0000`
- `#f008` (4-char shorthand with alpha) → `#ff0000`
- Prevents "Invalid color value" errors from AI-generated CSS colors

---

## [2.4.3] — 2026-04-14

### Fixed — CRITICAL: operations never delivered to plugin (long poll race condition)

**Root cause:** `sendOperation` pushed work to queue and flushed long-poll BEFORE setting the pending map entry. `#respondPoll` filters queue by `session.pending.has(r.id)` — since pending wasn't set yet, filter returned empty array → 0 ops delivered → every operation timed out after 60s.

**Fix:** Set `session.pending` BEFORE pushing to queue and flushing long-poll. This ensures `#respondPoll` filter always finds the matching pending entry.

**Verified:** Integration test covers create, get_page_nodes, screenshot, error handling — all 4 pass.

---

## [2.4.2] — 2026-04-14

### Fixed — Plugin reconnection too slow after server late start

- Poll uses short timeout (3s) when reconnecting, long poll (12s) only when stable
- Backoff capped at 3s (was 5s), exponential stops growing after 3 errors
- Recovery cycle: ~6s per attempt (was ~17s) — plugin reconnects 3x faster
- `everConnected` flag tracks if connection was established before

---

## [2.4.1] — 2026-04-14

### Fixed — Long poll timeout causing plugin disconnects

- `LONG_POLL_MS` reduced 25s → 8s — Figma plugin iframe may kill fetch requests >10s
- Plugin `LONG_POLL_TIMEOUT` reduced 30s → 12s (8s server + buffer)
- Replaced `AbortSignal.timeout()` with `AbortController` + `setTimeout` fallback (not all Figma iframe envs support `AbortSignal.timeout`)
- `#resolveSession` now prefers session with active long-poll waiter (ready to receive work immediately), then most recently polled session
- Fixes "Operation timed out after 60000ms" when plugin was connected but work routed to wrong/empty session

---

## [2.4.0] — 2026-04-14

### Added — Prototyping, Scroll Behavior & Variant Swapping

**Prototyping / Reactions:**
- `setReactions` — add prototype interactions (ON_CLICK, ON_HOVER, ON_PRESS, AFTER_TIMEOUT triggers)
- Supported actions: NAVIGATE, SWAP, OVERLAY, SCROLL_TO, BACK, CLOSE, URL
- Transition types: DISSOLVE, SMART_ANIMATE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT, INSTANT
- Easing: LINEAR, EASE_IN, EASE_OUT, EASE_IN_AND_OUT, EASE_IN_BACK, EASE_OUT_BACK, CUSTOM_BEZIER
- `getReactions` — read all prototype interactions from a node
- `removeReactions` — clear all interactions from a node

**Scroll Behavior:**
- `setScrollBehavior` — configure overflow scrolling on frames
- `overflowDirection`: NONE, HORIZONTAL, VERTICAL, BOTH
- Auto-pairs with `clipsContent` for proper scroll containers

**Variant / Component Property Swapping:**
- `setComponentProperties` — set instance properties (variant, boolean, text, instance swap)
- `swapComponent` — swap the main component of an instance
- `getComponentProperties` — read all properties + definitions from components/instances

**Misc:**
- All new ops registered in code-executor.js (WRITE_OPS + READ_OPS)
- figma_write tool description updated with new operations

---

## [2.3.0] — 2026-04-14

### Added — Multi-Instance Support (P4)

**Multiple Figma tabs/files can now connect simultaneously to one bridge server.**

- `Session` class tracks per-file state (queue, pending ops, long-poll waiter, stats)
- Plugin sends `sessionId` (root node ID) + `fileName` via `session-info` postMessage
- `/poll?sessionId=X&fileName=Y` routes work to correct session
- `/response` auto-routes result back to originating session via `#opToSession` map
- `/sessions` endpoint lists all connected sessions with status
- `/health` includes session list
- `figma_status` returns `sessions` array
- `figma_write` and `figma_read` accept optional `sessionId` param to target specific file
- `executeCode` wraps bridge with pinned sessionId for all ops in that execution
- Idle sessions auto-expire after 5 min (`SESSION_EXPIRE_MS`)
- Fully backward compatible: omit sessionId = auto-select any connected session

---

## [2.2.0] — 2026-04-14

### Added — Long Polling, Connection Resilience & MCP Registry

**Long Polling (P3):**
- Bridge `/poll` endpoint now holds request up to 25s until work arrives — near-realtime latency vs old 900ms short polling
- `#flushLongPoll()` wakes held request immediately when `sendOperation()` is called
- Plugin UI poll timeout raised to 30s to match; inter-cycle delay reduced 900ms → 300ms
- Fully backward compatible: old plugins fall back to short polling automatically

**Connection Resilience (P2):**
- Operation-specific timeouts: screenshot/scan_design/batch get 90s, others keep 60s default
- Latency tracking via exponential moving average in `#stats`
- `/health` endpoint now returns `longPollHeld`, `stats` (ops count, avg latency, offline queue length)
- `figma_status` MCP tool exposes `stats` for AI observability
- Long-poll waiter auto-cleanup on client disconnect

**MCP Registry (P1):**
- `glama.json` — full tool schemas for glama.ai registry
- `smithery.yaml` — smithery.ai registry definition

**Misc:**
- Version bump to 2.2.0 across package.json, index.js, bridge-server.js

---

## [2.1.1] — 2026-04-08

### Fixed — GitHub Issue #5: Filter invisible elements from read operations

- `get_design`, `get_selection`, `search_nodes`, `scan_design` — now skip nodes with `visible: false` by default
- New `includeHidden` param (boolean, default `false`) on all four operations — set `true` to include hidden layers
- `extractDesignTree` updated with `filterInvisible` flag, propagated through full recursion
- `search_nodes` criteria object now includes `includeHidden` for consistent behavior
- `figma_read` MCP tool schema updated with `includeHidden` property documentation

---

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
