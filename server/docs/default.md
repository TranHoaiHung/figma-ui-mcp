
# figma-ui-mcp — Quick-Start & Critical Rules

---

## 🚨 CRITICAL QUICK-START CHECKLIST (follow EVERY time)

```js
// STEP 1 — Bootstrap design tokens (idempotent, safe to call every session)
var tokens = await figma.setupDesignTokens({
  collectionName: "Design Tokens",
  colors: {
    "accent": "#3B82F6", "accent-dim": "#1D4ED8",
    "bg-base": "#08090E", "bg-surface": "#0F1117", "bg-card": "#111318",
    "bg-elevated": "#0D0F14", "border": "#1E2030",
    "text-primary": "#F0F2F5", "text-secondary": "#8B8FA3", "text-muted": "#555872",
    "positive": "#00DC82", "negative": "#FF4757", "warning": "#FFB547",
  },
  numbers: { "radius-sm": 8, "radius-md": 12, "radius-lg": 16, "spacing-xs": 4, "spacing-sm": 8, "spacing-md": 16, "spacing-lg": 24 }
});

// STEP 2 — Build variable lookup map
var vars = await figma.get_variables();
var varMap = {};
for (var ci = 0; ci < vars.collections.length; ci++)
  for (var vi = 0; vi < vars.collections[ci].variables.length; vi++) {
    var v = vars.collections[ci].variables[vi];
    varMap[v.name] = v.id;
  }

// STEP 3 — Ensure Design Library frame
await figma.ensure_library();
```

**Non-negotiable rules:**
- ❌ NEVER hardcode hex in `fill`/`stroke` — always use `applyVariable` after create
- ❌ NEVER use emoji as icons — use `figma.loadIcon(name, {size, fill})` (BUG-12: emoji misaligns & color-shifts in Figma)
- ❌ NEVER set icon size >= container size — icon = container × 0.5
- ❌ NEVER draw background image AFTER other elements — background FIRST, content on top
- ❌ NEVER put overlapping rectangles inside auto-layout (progress bars) — use non-layout wrapper
- ❌ NEVER use `opacity: 0` on wrapper frame — hides ALL children. Use `fillOpacity: 0` instead.
- ❌ NEVER use `counterAxisAlignItems: "STRETCH"` — use `"MIN"` on parent + `layoutAlign: "STRETCH"` on each child (BUG-07)
- ❌ NEVER call `figma.getChildren()`, `figma.getNodeChildren()`, or `figma.read()` — not available in sandbox. Use `figma_read` tool instead (BUG-09/10)
- ❌ NEVER use H or V commands in SVG path `d` string — use `L` with explicit coords instead (BUG-11: `H 100` → `L 100 currentY`)
- ❌ NEVER mix `layoutGrow: 1` with `primaryAxisAlignItems: "CENTER"` — grow consumes all space before CENTER applies, children shift (BUG-14). Use `"SPACE_BETWEEN"` or manual padding instead.
- ❌ NEVER reuse variables/constants from a previous `figma_write` call — each call is an isolated sandbox (BUG-08). Redeclare all constants at the top of each call.
- ✅ ALWAYS use auto-layout with `counterAxisAlignItems: "CENTER"` for icon+text rows
- ✅ ALWAYS draw background first (bottom layer), then overlays, then content
- ✅ For centered TEXT: pass BOTH `width` AND `textAlign: "CENTER"` — plugin auto-sets `textAutoResize: "NONE"`
- ✅ For display numerics (fontSize ≥ 48): pass explicit `lineHeight` ≈ fontSize to prevent overflow
- ❌ NEVER hardcode `fontSize`/`fontFamily`/`fontWeight` inline — use `setupDesignTokens({ textStyles })` then `applyTextStyle`

**Reading hidden layers:**
Pass `includeHidden: true` to any read operation when user mentions "hidden layer", "invisible element", "ẩn", "layer bị ẩn":
```js
figma_read({ operation: "get_design", nodeId: "1:2", includeHidden: true })
figma_read({ operation: "search_nodes", type: "TEXT", includeHidden: true })
```

**Multi-tab (2+ Figma files open simultaneously):**
`figma_status` returns a `sessions` array — each entry has `id` (sessionId) + `fileName`.
When user is working across multiple files, confirm which file to target, then pin `sessionId` for EVERY subsequent call.
Without it, ops go to whichever tab polled most recently — **not deterministic**.
```js
// Step 1 — inspect sessions from figma_status:
// sessions: [
//   { id: "abc123", fileName: "Dashboard", connected: true },
//   { id: "def456", fileName: "Onboarding", connected: true }
// ]

// Step 2 — pin sessionId on every call:
figma_write({ code: "...", sessionId: "abc123" })
figma_read({ operation: "get_selection", sessionId: "abc123" })
figma_read({ operation: "screenshot", nodeId: "1:2", sessionId: "abc123" })
```

---

## ⚑ MANDATORY DESIGN SYSTEM RULES (Rules 0–9)

### Rule 0 — Token-First Workflow (HIGHEST PRIORITY)
**NEVER hardcode hex colors.** Always use Figma Variables (Design Tokens).

```js
// WRONG
await figma.create({ type: "FRAME", fill: "#3B82F6", ... });

// CORRECT — create with hex, then bind variable
var node = await figma.create({ type: "FRAME", fill: "#3B82F6", ... });
await figma.applyVariable({ nodeId: node.id, field: "fill", variableId: varMap["accent"] });

// Global rebrand — change 1 variable → ALL bound nodes update
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });
```

### Rule 0b — Component-First Workflow (MANDATORY for repeated elements)
**NEVER draw the same element twice.** Create a Component, then instantiate it.

```js
var components = await figma.listComponents();
var btnExists = components.some(function(c) { return c.name === "btn/primary"; });

if (!btnExists) {
  var btnFrame = await figma.create({
    type: "FRAME", name: "btn/primary", width: 120, height: 40, fill: "#3B82F6", cornerRadius: 10,
    layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
  });
  await figma.create({ type: "TEXT", parentId: btnFrame.id, content: "Button", fontSize: 14, fontWeight: "SemiBold", fill: "#FFFFFF" });
  var comp = await figma.createComponent({ nodeId: btnFrame.id, name: "btn/primary" });
}

await figma.instantiate({ componentName: "btn/primary", parentId: screen.id, x: 100, y: 200 });
```

### Rule 1 — Design Library Frame
Before drawing any new design:
1. Run `setupDesignTokens` (Rule 0)
2. Call `figma.get_page_nodes()` — check if "🎨 Design Library" exists
3. If not → `figma.ensure_library()`
4. Library is visual reference only — actual tokens live in Figma Variables

### Rule 2 — Library Frame Structure
"🎨 Design Library" lives at x: -2000, y: 0 (off-canvas).
Contains: Colors, Text Styles, Components sections (visual reference).

### Rule 3 — Read selection when user refers to a frame
When user says "this frame", "the selected one", "bạn thấy không", "cái đang chọn":
→ Immediately call `figma_read { operation: "get_selection" }`

### Rule 4 — Naming convention
- Frames: PascalCase ("Trading Dashboard", "Signal Card")
- Components: kebab-case with type prefix ("btn/primary-lg", "badge/success")
- Colors: "color/{name}" ("color/bg-surface", "color/accent-purple")

### Rule 5 — Visual QA after every design
1. Call `figma_read { operation: "screenshot" }` on root frame (scale: 0.4)
2. Analyze: check overlaps, misalignment, text overflow
3. Cross-check via `get_page_nodes` — compare x/y/width/height
4. Fix → re-screenshot → repeat until clean

### Rule 6 — Layer Order (CRITICAL)
Last child drawn renders ON TOP.
```
CORRECT:  background → overlay → back btn → title → content
WRONG:    back btn → title → content → background  ← background covers all!
```

### Rule 7 — TEXT vs BACKGROUND COLOR (CRITICAL)
NEVER same color for container fill and inner text — text will be invisible.

| Style | Container | Text |
|-------|-----------|------|
| Filled active | `fill: "#6C5CE7"` | `fill: "#FFFFFF"` |
| Outlined accent | `fill: "#FFFFFF", stroke: "#6C5CE7"` | `fill: "#6C5CE7"` |
| Ghost/subtle | `fill: "#F5F6FA"` | `fill: "#1E3150"` |

### Rule 8 — Container Height Must Fit Content
- Set height generously — too tall is better than clipped
- Formula: height = paddingTop + paddingBottom + (childCount × avgChildHeight) + ((childCount-1) × itemSpacing)
- Use `primaryAxisSizingMode: "AUTO"` when possible

### Rule 9 — NO EMOJI AS ICONS (NON-NEGOTIABLE)
NEVER use emoji (🔔 📋 👤) as icons. Always use `figma.loadIcon()` or `figma.loadIconIn()`.

```js
// WRONG
await figma.create({ type: "TEXT", content: "🔔", fontSize: 16 });

// CORRECT
await figma.loadIcon("notifications", { parentId: row.id, size: 18, fill: "#0e7c3a" });
await figma.loadIconIn("notifications", { parentId: row.id, containerSize: 36, fill: "#0e7c3a", bgOpacity: 0.1 });
```

---

## Design Library Tokens (defaults)

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| bg-base | #0F1117 | Page background |
| bg-surface | #191C24 | Cards, panels |
| bg-elevated | #1E2233 | Dividers, hover |
| accent-purple | #6366F1 | Primary CTA |
| positive-green | #00C896 | Success, profit |
| negative-red | #FF4560 | Error, loss |
| text-primary | #E8ECF4 | Headings |
| text-secondary | #6B7280 | Labels |
| border | #1E2233 | Separators |

### Text Styles
| Token | Size | Weight |
|-------|------|--------|
| heading-2xl | 32px | Bold |
| heading-xl | 24px | Bold |
| heading-lg | 20px | Bold |
| heading-md | 16px | SemiBold |
| body-md | 14px | Regular |
| body-sm | 12px | Regular |
| caption | 11px | Regular |
| label | 11px | Medium |

---

## Figma Plugin Sandbox Limitations
- No optional chaining `?.` → use `x ? x.y : null`
- No nullish coalescing `??` → use `x !== undefined ? x : default`
- No object spread `{...obj}` → use `Object.assign({}, obj)`
- No `require`, `fetch`, `setTimeout`, `process`, `fs`
- All `figma.*` calls return Promises — always use `await`

---

> Load more: `figma_docs { section: "layout" }` | `figma_docs { section: "api" }` | `figma_docs { section: "tokens" }` | `figma_docs { section: "icons" }`
