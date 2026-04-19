// figma_docs — sectioned API reference
// Default (no section): quick-start + critical rules + token defaults
// Sections: "rules" | "layout" | "api" | "tokens" | "icons"

// ─── Section content ──────────────────────────────────────────────────────────

const SECTION_INDEX = `
# figma-ui-mcp — API Reference

Call \`figma_docs\` with a \`section\` param to load a specific part:

| section | What's inside |
|---------|---------------|
| _(none)_ | **Quick-start checklist + Critical rules 0–9 + Design Library defaults** — load this first |
| \`"rules"\` | Design rules 10–20 (spacing, radius, shadow, semantic colors, states) + component reuse |
| \`"layout"\` | Auto-layout, button/card/badge/progress bar/mobile anchoring/header centering rules |
| \`"api"\` | Create / Modify / Delete / Clone / Batch / Read operations + full workflow example |
| \`"tokens"\` | setupDesignTokens, applyTextStyle, modifyVariable, applyVariable, multi-mode workflow |
| \`"icons"\` | loadImage, loadIcon, loadIconIn, icon library priority table, coloring & sizing rules |

**Recommended call order for a new design session:**
1. \`figma_docs\` (no section) → rules + quick-start
2. \`figma_docs { section: "layout" }\` → layout patterns
3. \`figma_docs { section: "api" }\` → create/modify API
4. \`figma_docs { section: "tokens" }\` → if using variables/multi-mode
5. \`figma_docs { section: "icons" }\` → if placing icons or images
`;

const SECTION_DEFAULT = `
# figma-ui-mcp — Quick-Start & Critical Rules

---

## 🚨 CRITICAL QUICK-START CHECKLIST (follow EVERY time)

\`\`\`js
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
\`\`\`

**Non-negotiable rules:**
- ❌ NEVER hardcode hex in \`fill\`/\`stroke\` — always use \`applyVariable\` after create
- ❌ NEVER use emoji as icons — use \`figma.loadIcon(name, {size, fill})\` (BUG-12: emoji misaligns & color-shifts in Figma)
- ❌ NEVER set icon size >= container size — icon = container × 0.5
- ❌ NEVER draw background image AFTER other elements — background FIRST, content on top
- ❌ NEVER put overlapping rectangles inside auto-layout (progress bars) — use non-layout wrapper
- ❌ NEVER use \`opacity: 0\` on wrapper frame — hides ALL children. Use \`fillOpacity: 0\` instead.
- ❌ NEVER use \`counterAxisAlignItems: "STRETCH"\` — use \`"MIN"\` on parent + \`layoutAlign: "STRETCH"\` on each child (BUG-07)
- ❌ NEVER call \`figma.getChildren()\`, \`figma.getNodeChildren()\`, or \`figma.read()\` — not available in sandbox. Use \`figma_read\` tool instead (BUG-09/10)
- ❌ NEVER use H or V commands in SVG path \`d\` string — use \`L\` with explicit coords instead (BUG-11: \`H 100\` → \`L 100 currentY\`)
- ❌ NEVER mix \`layoutGrow: 1\` with \`primaryAxisAlignItems: "CENTER"\` — grow consumes all space before CENTER applies, children shift (BUG-14). Use \`"SPACE_BETWEEN"\` or manual padding instead.
- ❌ NEVER reuse variables/constants from a previous \`figma_write\` call — each call is an isolated sandbox (BUG-08). Redeclare all constants at the top of each call.
- ✅ ALWAYS use auto-layout with \`counterAxisAlignItems: "CENTER"\` for icon+text rows
- ✅ ALWAYS draw background first (bottom layer), then overlays, then content
- ✅ For centered TEXT: pass BOTH \`width\` AND \`textAlign: "CENTER"\` — plugin auto-sets \`textAutoResize: "NONE"\`
- ✅ For display numerics (fontSize ≥ 48): pass explicit \`lineHeight\` ≈ fontSize to prevent overflow
- ❌ NEVER hardcode \`fontSize\`/\`fontFamily\`/\`fontWeight\` inline — use \`setupDesignTokens({ textStyles })\` then \`applyTextStyle\`

**Reading hidden layers:**
Pass \`includeHidden: true\` to any read operation when user mentions "hidden layer", "invisible element", "ẩn", "layer bị ẩn":
\`\`\`js
figma_read({ operation: "get_design", nodeId: "1:2", includeHidden: true })
figma_read({ operation: "search_nodes", type: "TEXT", includeHidden: true })
\`\`\`

**Multi-tab (2+ Figma files open simultaneously):**
\`figma_status\` returns a \`sessions\` array — each entry has \`id\` (sessionId) + \`fileName\`.
When user is working across multiple files, confirm which file to target, then pin \`sessionId\` for EVERY subsequent call.
Without it, ops go to whichever tab polled most recently — **not deterministic**.
\`\`\`js
// Step 1 — inspect sessions from figma_status:
// sessions: [
//   { id: "abc123", fileName: "Dashboard", connected: true },
//   { id: "def456", fileName: "Onboarding", connected: true }
// ]

// Step 2 — pin sessionId on every call:
figma_write({ code: "...", sessionId: "abc123" })
figma_read({ operation: "get_selection", sessionId: "abc123" })
figma_read({ operation: "screenshot", nodeId: "1:2", sessionId: "abc123" })
\`\`\`

---

## ⚑ MANDATORY DESIGN SYSTEM RULES (Rules 0–9)

### Rule 0 — Token-First Workflow (HIGHEST PRIORITY)
**NEVER hardcode hex colors.** Always use Figma Variables (Design Tokens).

\`\`\`js
// WRONG
await figma.create({ type: "FRAME", fill: "#3B82F6", ... });

// CORRECT — create with hex, then bind variable
var node = await figma.create({ type: "FRAME", fill: "#3B82F6", ... });
await figma.applyVariable({ nodeId: node.id, field: "fill", variableId: varMap["accent"] });

// Global rebrand — change 1 variable → ALL bound nodes update
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });
\`\`\`

### Rule 0b — Component-First Workflow (MANDATORY for repeated elements)
**NEVER draw the same element twice.** Create a Component, then instantiate it.

\`\`\`js
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
\`\`\`

### Rule 1 — Design Library Frame
Before drawing any new design:
1. Run \`setupDesignTokens\` (Rule 0)
2. Call \`figma.get_page_nodes()\` — check if "🎨 Design Library" exists
3. If not → \`figma.ensure_library()\`
4. Library is visual reference only — actual tokens live in Figma Variables

### Rule 2 — Library Frame Structure
"🎨 Design Library" lives at x: -2000, y: 0 (off-canvas).
Contains: Colors, Text Styles, Components sections (visual reference).

### Rule 3 — Read selection when user refers to a frame
When user says "this frame", "the selected one", "bạn thấy không", "cái đang chọn":
→ Immediately call \`figma_read { operation: "get_selection" }\`

### Rule 4 — Naming convention
- Frames: PascalCase ("Trading Dashboard", "Signal Card")
- Components: kebab-case with type prefix ("btn/primary-lg", "badge/success")
- Colors: "color/{name}" ("color/bg-surface", "color/accent-purple")

### Rule 5 — Visual QA after every design
1. Call \`figma_read { operation: "screenshot" }\` on root frame (scale: 0.4)
2. Analyze: check overlaps, misalignment, text overflow
3. Cross-check via \`get_page_nodes\` — compare x/y/width/height
4. Fix → re-screenshot → repeat until clean

### Rule 6 — Layer Order (CRITICAL)
Last child drawn renders ON TOP.
\`\`\`
CORRECT:  background → overlay → back btn → title → content
WRONG:    back btn → title → content → background  ← background covers all!
\`\`\`

### Rule 7 — TEXT vs BACKGROUND COLOR (CRITICAL)
NEVER same color for container fill and inner text — text will be invisible.

| Style | Container | Text |
|-------|-----------|------|
| Filled active | \`fill: "#6C5CE7"\` | \`fill: "#FFFFFF"\` |
| Outlined accent | \`fill: "#FFFFFF", stroke: "#6C5CE7"\` | \`fill: "#6C5CE7"\` |
| Ghost/subtle | \`fill: "#F5F6FA"\` | \`fill: "#1E3150"\` |

### Rule 8 — Container Height Must Fit Content
- Set height generously — too tall is better than clipped
- Formula: height = paddingTop + paddingBottom + (childCount × avgChildHeight) + ((childCount-1) × itemSpacing)
- Use \`primaryAxisSizingMode: "AUTO"\` when possible

### Rule 9 — NO EMOJI AS ICONS (NON-NEGOTIABLE)
NEVER use emoji (🔔 📋 👤) as icons. Always use \`figma.loadIcon()\` or \`figma.loadIconIn()\`.

\`\`\`js
// WRONG
await figma.create({ type: "TEXT", content: "🔔", fontSize: 16 });

// CORRECT
await figma.loadIcon("notifications", { parentId: row.id, size: 18, fill: "#0e7c3a" });
await figma.loadIconIn("notifications", { parentId: row.id, containerSize: 36, fill: "#0e7c3a", bgOpacity: 0.1 });
\`\`\`

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
- No optional chaining \`?.\` → use \`x ? x.y : null\`
- No nullish coalescing \`??\` → use \`x !== undefined ? x : default\`
- No object spread \`{...obj}\` → use \`Object.assign({}, obj)\`
- No \`require\`, \`fetch\`, \`setTimeout\`, \`process\`, \`fs\`
- All \`figma.*\` calls return Promises — always use \`await\`

---

> Load more: \`figma_docs { section: "layout" }\` | \`figma_docs { section: "api" }\` | \`figma_docs { section: "tokens" }\` | \`figma_docs { section: "icons" }\`
`;

const SECTION_RULES = `
# figma-ui-mcp — Design Rules 10–20 + Component Reuse

---

### Rule 10 — Layout Quality Standards

**Padding & Spacing:**
- Cards: min 16px all sides (20px recommended)
- List items: min 12px vertical, 16-20px horizontal
- Buttons: min 12px vertical, 24px horizontal
- Never flush against container edges

**Text:**
- Button text: ALWAYS centered (auto-layout CENTER/CENTER)
- Long text: ALWAYS set \`width\` → wraps automatically (\`textAutoResize: "HEIGHT"\`)
- Multi-line: \`lineHeight\` = 1.4–1.6× fontSize

**Borders:** Card borders: \`stroke: "#E0E0E0", strokeWeight: 1\`

**Shadow for elevated cards:**
\`\`\`js
// Draw shadow BEFORE card (layer order rule)
await figma.create({ type: "RECTANGLE", parentId: root.id,
  x: cardX + 2, y: cardY + 4, width: cardWidth, height: cardHeight,
  fill: "#000000", cornerRadius: cardRadius, opacity: 0.08 });
// Then draw card on top
\`\`\`

---

### Rule 11 — Centered Profile Layouts
\`\`\`js
// CORRECT: full-width text with CENTER align
await figma.create({ type: "TEXT", parentId: rootId,
  x: 0, y: 202, width: frameWidth,   // FULL width of parent
  content: "Profile Name", fontSize: 22, fontWeight: "Bold",
  textAlign: "CENTER" });
// For centered badge: x = (frameWidth - badgeWidth) / 2
\`\`\`

---

### Rule 12 — Key-Value Info Rows
NEVER place label+value as one text string. Use separate nodes in horizontal auto-layout:
\`\`\`js
var row = await figma.create({
  type: "FRAME", parentId: parentId, height: 36,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "CENTER", itemSpacing: 8, layoutAlign: "STRETCH"
});
await figma.create({ type: "TEXT", parentId: row.id, content: "Name:", fontSize: 13,
  fontWeight: "Regular", fill: "#8B8FA3", width: 110 });
await figma.create({ type: "TEXT", parentId: row.id, content: "John Doe", fontSize: 13,
  fontWeight: "Medium", fill: "#F0F2F5", layoutGrow: 1 });
\`\`\`
Row height: simple key-value min 36px, with icon min 40px.

---

### Rule 13 — Container Height Calculation
\`\`\`
height = paddingTop + paddingBottom + (n × childH) + ((n-1) × spacing)
\`\`\`
Use \`primaryAxisSizingMode: "AUTO"\` to auto-grow. Always verify with screenshot.

---

### Rule 14 — Score/Match Result Cards
\`\`\`js
var scoreRow = await figma.create({
  type: "FRAME", height: 32, layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER",
  paddingLeft: 8, paddingRight: 8, layoutAlign: "STRETCH"
});
\`\`\`

---

### Rule 15 — Button Variants System

| Variant | Fill | Text | Border |
|---------|------|------|--------|
| Solid | brand color | white | none |
| Flat | brand 10% opacity | brand | none |
| Bordered | transparent | brand | 1px brand |
| Ghost | transparent | brand | none |
| Light | #F5F6FA | #1E3150 | none |

**Size scale:**
| Size | Height | paddingX | fontSize | cornerRadius |
|------|--------|----------|----------|--------------|
| sm | 32px | 12px | 12px | 8px |
| md | 40px | 16px | 14px | 12px |
| lg | 48px | 24px | 16px | 14px |

---

### Rule 16 — Consistent Spacing Scale
Use ONLY: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48px. Never random values.

---

### Rule 17 — Border Radius Consistency
| Element | cornerRadius |
|---------|-------------|
| Small chips/tags | 4–6px |
| Input fields | 8px |
| Buttons | 8–12px |
| Cards | 12–16px |
| Large panels | 16–24px |
| Full round | 9999px |

**Nested radius rule:** inner = outer - padding. (Card 16px, padding 8px → inner 8px)

---

### Rule 18 — Shadow/Elevation System
| Level | Effect |
|-------|--------|
| flat | No shadow |
| sm | 0 1px 2px rgba(0,0,0,0.05) |
| md | 0 4px 6px rgba(0,0,0,0.07) |
| lg | 0 10px 15px rgba(0,0,0,0.1) |

Dark themes: use border (1px #2A2B45) instead of shadows.

---

### Rule 19 — Semantic Color Usage
| Role | Light | Dark |
|------|-------|------|
| Primary | #006FEE | #338EF7 |
| Success | #17C964 | #45D483 |
| Warning | #F5A524 | #F7B750 |
| Danger | #F31260 | #F54180 |
| Default | #71717A | #A1A1AA |

All semantic colors must pair with white text (#FFFFFF) for WCAG AA (4.5:1).

---

### Rule 20 — Component State Indicators
| State | Visual change |
|-------|--------------|
| Default | Base |
| Hover | opacity 0.8–0.9 |
| Focused | 2px ring/stroke |
| Disabled | opacity: 0.5 |
| Loading | Spinner SVG |

---

## COMPONENT REUSE RULE (CRITICAL)

**Before drawing ANY screen:**
1. Check \`get_page_nodes\` for existing "⚙️ Components" frame
2. If not → create it first (x: -600, outside visible screens)
3. Create master components inside via \`figma.createComponent()\`
4. Use \`figma.clone({ id: componentId })\` for instances

**Must be components:** bottom nav, app header, status bar, CTA buttons, cards, badges, icon containers.

\`\`\`js
// 1. Create Components frame once
var compFrame = await figma.create({
  type: "FRAME", name: "⚙️ Components", x: -600, y: 0,
  width: 500, height: 800, fill: "#1A1A2E",
  layoutMode: "VERTICAL", itemSpacing: 40,
  paddingTop: 40, paddingLeft: 24, paddingRight: 24, paddingBottom: 40,
  primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "FIXED"
});

// 2. Build frame, then convert to component
var navFrame = await figma.create({ type: "FRAME", name: "nav/bottom-bar",
  parentId: compFrame.id, width: 350, height: 64, fill: "#0A0F24",
  cornerRadius: 22, layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER",
  paddingLeft: 28, paddingRight: 28 });
var navComp = await figma.createComponent({ nodeId: navFrame.id, name: "nav/bottom-bar" });

// 3. Clone on every screen
var navInst = await figma.clone({ id: navComp.id, parentId: screenFrame.id, x: 20, y: 746 });
\`\`\`

**Rules:**
- Name components with slash notation: \`nav/bottom-bar\`, \`btn/primary\`, \`card/idea\`
- ALWAYS check \`get_local_components\` before creating new ones
- Clone first then \`figma.modify()\` text children for variant content
`;

const SECTION_LAYOUT = `
# figma-ui-mcp — Layout Rules

---

## AUTO LAYOUT (PREFERRED — NON-NEGOTIABLE for complex containers)

\`\`\`js
await figma.create({
  type: "FRAME", name: "Button", parentId: root.id,
  x: 24, y: 100, width: 392, height: 52,
  fill: "#6C5CE7", cornerRadius: 12,
  layoutMode: "HORIZONTAL",           // "HORIZONTAL" | "VERTICAL"
  primaryAxisAlignItems: "CENTER",    // main axis: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN"
  counterAxisAlignItems: "CENTER",    // cross axis: "MIN"|"CENTER"|"MAX"
  padding: 16,
  itemSpacing: 8,
})
\`\`\`

**Common patterns:**
\`\`\`
// Button with centered text:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"

// Card with icon + text row:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "CENTER", paddingLeft: 16, itemSpacing: 12

// Vertical stack:
layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN", itemSpacing: 8
// children: layoutAlign: "STRETCH"

// Centered icon in circle:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
\`\`\`

**Child properties:**
\`\`\`js
await figma.create({ ..., layoutAlign: "STRETCH" })  // fill parent width in vertical layout
await figma.create({ ..., layoutGrow: 1 })           // grow to fill available space
\`\`\`

**Modify frame to auto-layout:**
\`\`\`js
await figma.modify({ id: frameId, layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER" })
\`\`\`

**Always use Auto Layout for:** buttons, cards with icon+text rows, tab bar items, list items, badge pills.

---

## BUTTON / INPUT CONSTRUCTION RULE

NEVER use RECTANGLE + TEXT as siblings. Always use FRAME with layoutMode:

\`\`\`js
// WRONG
await figma.create({ type: "RECTANGLE", parentId: frame.id, x: 56, y: 808, width: 488, height: 58, fill: "#00C896", cornerRadius: 30 });
await figma.create({ type: "TEXT", parentId: frame.id, x: 180, y: 827, content: "Submit" }); // not truly centered

// CORRECT
var btn = await figma.create({
  type: "FRAME", parentId: frame.id, x: 56, y: 808, width: 488, height: 58,
  fill: "#00C896", cornerRadius: 30,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
});
await figma.create({ type: "TEXT", parentId: btn.id, content: "Submit", fill: "#fff", fontSize: 16, fontWeight: "Bold" });
\`\`\`

Applies to: buttons, inputs, tabs, chips, badges, nav items — ALL elements with background + content.

---

## CARD / SCREEN LAYOUT RULE

NEVER use absolute x/y for children inside a card. Use VERTICAL auto-layout:

\`\`\`js
// CORRECT — VERTICAL auto-layout card
var card = await figma.create({
  type: "FRAME", name: "Card", width: 480, height: 610,
  layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "MIN",        // NOT "STRETCH" — invalid. Use "MIN" + layoutAlign: "STRETCH" on children
  paddingTop: 48, paddingBottom: 48, paddingLeft: 48, paddingRight: 48,
  itemSpacing: 16,
});

// Full-width children: layoutAlign STRETCH (no width needed)
await figma.create({ type: "FRAME", name: "Input", parentId: card.id,
  height: 52, layoutAlign: "STRETCH",
  layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER",
  paddingLeft: 20, paddingRight: 20 });

// "or" divider row
var dividerRow = await figma.create({ type: "FRAME", parentId: card.id,
  height: 20, layoutAlign: "STRETCH",
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER" });
await figma.create({ type: "RECTANGLE", parentId: dividerRow.id, height: 1, layoutGrow: 1, fill: "#E0E0E0" });
await figma.create({ type: "TEXT", parentId: dividerRow.id, content: "or", fontSize: 12, fill: "#888" });
await figma.create({ type: "RECTANGLE", parentId: dividerRow.id, height: 1, layoutGrow: 1, fill: "#E0E0E0" });
\`\`\`

**Card build order:** create frame → add children without x/y → full-width: \`layoutAlign: "STRETCH"\` → growing spacers: \`layoutGrow: 1\`

---

## DOT + TEXT / ICON + TEXT ROW ALIGNMENT RULE

ALWAYS use \`counterAxisAlignItems: "CENTER"\` for icon/dot next to text:
\`\`\`
CORRECT: layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER", itemSpacing: 12
WRONG:   counterAxisAlignItems: "MIN" → dot sits at top, misaligned
\`\`\`

**Multi-line exception:** if dot/icon aligns with FIRST line only:
\`\`\`
counterAxisAlignItems: "MIN"
icon paddingTop = (textLineHeight - iconSize) / 2
// e.g. text 22px, dot 8px → paddingTop = (22 - 8) / 2 = 7
\`\`\`

---

## PROGRESS BAR RULE (CRITICAL)

Progress bars = TWO overlapping rectangles. Auto-layout stacks them side-by-side, NOT overlapping.
**ALWAYS wrap in a non-auto-layout frame:**

\`\`\`js
// CORRECT — no layoutMode on wrapper → children overlap via absolute x,y
var pbWrap = await figma.create({
  type: "FRAME", name: "progress-bar", parentId: autoLayoutParent.id,
  width: 352, height: 6   // NO layoutMode
});
await figma.create({ type: "RECTANGLE", parentId: pbWrap.id, x: 0, y: 0, width: 352, height: 6, fill: "#E7EAF0", cornerRadius: 3 });
await figma.create({ type: "RECTANGLE", parentId: pbWrap.id, x: 0, y: 0, width: 211, height: 6, fill: "#6C5CE7", cornerRadius: 3 });

// WRONG — inside auto-layout: 352 + 211 = 563px total, not overlapping!
\`\`\`

Applies to: progress bars, score rings, slider tracks, overlay badges.

---

## BADGE / PILL / TAG RULE

**Concern 1 — Text inside badge: use auto-layout CENTER/CENTER**
\`\`\`js
var badge = await figma.create({
  type: "FRAME", name: "badge", parentId: parent.id,
  x: 100, y: 10, width: 64, height: 20, fill: "#E8FBF5", cornerRadius: 10,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
});
await figma.create({ type: "TEXT", parentId: badge.id, content: "Free", fontSize: 10, fontWeight: "SemiBold", fill: "#00B894" });
\`\`\`

**Concern 2 — Badge position on card corner: parent is ROOT, not the card**
\`\`\`js
// badgeX = cardX + cardWidth - badgeWidth - 6
// badgeY = cardY + 6
var badge = await figma.create({ ..., parentId: rootFrame.id,
  x: cardX + cardWidth - 64 - 6, y: cardY + 6, ... });
// Badge is sibling of card, overlapping top-right corner via absolute positioning
\`\`\`

---

## MOBILE BOTTOM ANCHORING RULE

Bottom elements (tab bar, FAB) MUST be calculated from frame bottom:
\`\`\`
nav_bar_y = frameHeight - safeArea - navHeight  // e.g. 844 - 34 - 64 = 746
cta_y     = nav_bar_y - gap - ctaHeight         // e.g. 746 - 12 - 56 = 678
\`\`\`

Standard iOS: safeArea = 34px, home indicator at y = frameH - 18.
NEVER hardcode y for bottom elements without calculating from frameHeight.

---

## HUG vs STRETCH CONFLICT RULE

HORIZONTAL child in VERTICAL parent that should fill width must use \`primaryAxisSizingMode: "FIXED"\`:
\`\`\`js
// CORRECT — child stretches in parent
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisSizingMode: "FIXED",   // accept parent width
  layoutAlign: "STRETCH" });        // fill parent cross-axis

// WRONG — AUTO overrides STRETCH
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisSizingMode: "AUTO",    // hugs content → ignores STRETCH
  layoutAlign: "STRETCH" });
\`\`\`

---

## CENTERED CONTENT MUST USE AUTO-LAYOUT

NEVER use manual \`x = (containerW - childW) / 2\` — it breaks when content changes.

\`\`\`js
// CORRECT
var card = await figma.create({ type: "FRAME", width: 108, height: 108, fill: "#0D1229", cornerRadius: 18,
  layoutMode: "VERTICAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
  paddingTop: 16, paddingBottom: 14, itemSpacing: 8 });
// Children added without x/y — auto-centered

// WRONG
var card = await figma.create({ type: "FRAME", width: 108, height: 108 }); // no layoutMode
await figma.create({ type: "FRAME", parentId: card.id, x: 34, y: 16, ... }); // manual math = fragile
\`\`\`

---

## ILLUSTRATION CENTERING + LAYER ORDER RULE

**Draw order: background → rings → center icon (last = on top)**
\`\`\`js
var centerX = 140, centerY = 130;

// 1. Rings FIRST (bottom layers)
await figma.create({ type: "ELLIPSE", parentId: area.id,
  x: centerX - 110, y: centerY - 110, width: 220, height: 220 });
await figma.create({ type: "ELLIPSE", parentId: area.id,
  x: centerX - 80,  y: centerY - 80,  width: 160, height: 160 });

// 2. Center icon LAST (top layer)
await figma.create({ type: "FRAME", parentId: area.id,
  x: centerX - 50, y: centerY - 50, width: 100, height: 100 });
\`\`\`

**Centering formula:**
\`\`\`
element_x = centerX - (element_width / 2)
element_y = centerY - (element_height / 2)
\`\`\`

---

## TEXT ALIGN vs LAYOUT ALIGN RULE

\`layoutAlign: "STRETCH"\` controls box size. \`textAlign: "CENTER"\` controls content. Both must be set:

\`\`\`js
// CORRECT — box fills width AND content is centered
await figma.create({ type: "TEXT", parentId: card.id,
  content: "Centered heading", fontSize: 18, fill: "#FFFFFF",
  textAlign: "CENTER",    // content alignment
  layoutAlign: "STRETCH", // box fills parent width
  lineHeight: 26 });

// WRONG — box stretches but content stays LEFT (default)
await figma.create({ type: "TEXT", parentId: card.id,
  content: "Should center but won't", layoutAlign: "STRETCH" });
\`\`\`

---

## TEXT WRAPPING IN AUTO-LAYOUT RULE

Text inside auto-layout overflows unless constrained. Always use \`layoutAlign: "STRETCH"\` on text that should wrap:

\`\`\`js
// CORRECT
await figma.create({ type: "TEXT", parentId: textFrame.id,
  content: "Long text...", fontSize: 13, fill: "#E0E6F0", lineHeight: 18,
  layoutAlign: "STRETCH"  // constrains width → enables wrapping
});

// WRONG — text renders at natural width, overflows parent
await figma.create({ type: "TEXT", parentId: textFrame.id,
  content: "Long text...", fontSize: 13 });  // no layoutAlign
\`\`\`

Use \`layoutAlign: "STRETCH"\` on: multi-line descriptions, paragraphs, text inside \`layoutGrow: 1\` parents.

---

## HEADER TITLE CENTERING RULE

Pattern [Left action] [Title] [Right action] — title must use \`layoutGrow: 1\` + \`textAlign: "CENTER"\`:

\`\`\`js
var header = await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER" });
await figma.create({ type: "FRAME", parentId: header.id, width: 32, height: 32 }); // Left action
await figma.create({ type: "TEXT", parentId: header.id, content: "Title",
  fontSize: 17, fontWeight: "Bold", fill: "#FFFFFF",
  textAlign: "CENTER", layoutGrow: 1 });     // BOTH needed
await figma.create({ type: "FRAME", parentId: header.id, width: 77 });              // Right action
\`\`\`

Applies to: modal headers, nav bars, any [action][title][action] pattern.
`;

const SECTION_API = `
# figma-ui-mcp — API Reference (Create / Modify / Read / Ops)

---

## Pages
\`\`\`js
await figma.listPages()                              // [{ id, name }, ...]
await figma.setPage({ name: "Dashboard" })           // switch page
await figma.createPage({ name: "Signals" })          // create (no-op if exists)
\`\`\`

---

## Query nodes
\`\`\`js
await figma.query({ type: "FRAME" })                 // all frames on current page
await figma.query({ name: "Sidebar" })               // by name
await figma.query({ id: "123:456" })                 // by id
// → [{ id, name, type, x, y, width, height, parentId }]
\`\`\`

---

## Create — returns { id, name, type, x, y, width, height }

### FRAME
\`\`\`js
var f = await figma.create({
  type: "FRAME", name: "Screen",
  x: 0, y: 0, width: 1440, height: 900,
  fill: "#ffffff", cornerRadius: 0,
  stroke: "#e2e8f0", strokeWeight: 1,
  // Auto-layout (optional):
  layoutMode: "VERTICAL",
  primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN",
  padding: 16, itemSpacing: 12,
  primaryAxisSizingMode: "FIXED",   // "FIXED" | "AUTO"
  counterAxisSizingMode: "FIXED",
  // Effects (optional):
  effects: [{ type: "DROP_SHADOW", color: "#00000026", offset: {x:0,y:8}, radius: 24 }],
  // Gradient fill (optional):
  // fill: { type: "LINEAR_GRADIENT", angle: 135, stops: [{pos:0,color:"#7C3AED"},{pos:1,color:"#EC4899"}] }
  // Individual corners (optional):
  // topLeftRadius: 20, topRightRadius: 20, bottomLeftRadius: 0, bottomRightRadius: 0,
  opacity: 1, visible: true,
  insertIndex: 0,   // insert at specific position in parent (v2.5.7+)
})
\`\`\`

### RECTANGLE
\`\`\`js
await figma.create({ type: "RECTANGLE", name: "Card",
  parentId: f.id, x: 24, y: 80, width: 280, height: 120,
  fill: "#1e293b", cornerRadius: 12, stroke: "#334155", strokeWeight: 1 })
\`\`\`

### ELLIPSE
\`\`\`js
await figma.create({ type: "ELLIPSE", name: "Dot",
  parentId: f.id, x: 12, y: 12, width: 8, height: 8, fill: "#22c55e" })
\`\`\`

### LINE
\`\`\`js
await figma.create({ type: "LINE", name: "Divider",
  parentId: f.id, x: 0, y: 64, width: 240, height: 0,
  stroke: "#1e293b", strokeWeight: 1 })
\`\`\`

### TEXT
\`\`\`js
await figma.create({ type: "TEXT", name: "Heading",
  parentId: f.id, x: 24, y: 24,
  content: "Total Balance",    // also accepts: characters: "..."
  fontSize: 14,
  fontWeight: "SemiBold",      // Regular | Medium | SemiBold | Bold | Light | Heavy | Black | ExtraBold
  fill: "#f8fafc",             // also accepts: fontColor, fills array
  lineHeight: 20,              // px
  textAlign: "CENTER",         // LEFT | CENTER | RIGHT (auto-sets textAutoResize: "NONE" with width)
  width: 200, height: 40,      // both specified → fixed box (textAutoResize: "NONE"), size respected
  layoutAlign: "STRETCH",      // for wrapping text in auto-layout
  layoutGrow: 1,               // for growing text in auto-layout
})
\`\`\`

**TEXT sizing rules:**
- \`width\` + \`height\` both set → fixed box, dimensions respected (textAutoResize: "NONE")
- \`width\` only → auto-height wrapping (textAutoResize: "HEIGHT")
- Neither → hug content (textAutoResize: "WIDTH_AND_HEIGHT", default)

**Font baseline offset (Inter quirk):** Auto-layout CENTER may appear ~3-4px shifted upward due to Inter ascender whitespace.
Workaround: add \`paddingBottom: 3\` to the wrapper frame to visually re-center text.

### VECTOR (SVG paths, arcs, curves)

> ⚠️ **Known limitation:** Figma recalculates VECTOR bounding box from actual path geometry, ignoring specified \`width\`/\`height\`. For circular arcs that must align with an ELLIPSE, use \`ELLIPSE\` with \`arcData\` instead — it respects dimensions exactly.

\`\`\`js
// Diagonal line
await figma.create({ type: "VECTOR", parentId: f.id,
  x: 0, y: 0, width: 200, height: 100, d: "M 0 0 L 200 100",
  stroke: "#ff0000", strokeWeight: 2, strokeCap: "ROUND" })

// Arc (A command auto-converted to cubic Bézier)
await figma.create({ type: "VECTOR", parentId: f.id,
  x: 0, y: 0, width: 300, height: 300,
  d: "M 150 7 A 143 143 0 1 1 29.26 226.62",
  stroke: "#6C5CE7", strokeWeight: 12, strokeCap: "ROUND" })

// Filled wave
await figma.create({ type: "VECTOR", parentId: f.id,
  x: 0, y: 0, width: 440, height: 80,
  d: "M 0 40 C 110 0, 220 80, 330 40 C 385 20, 420 30, 440 40 L 440 80 L 0 80 Z",
  fill: "#0e7c3a" })

// ✅ PREFERRED for circular progress rings — use ELLIPSE + arcData (respects exact width/height)
// arcData keys: startingAngle / endingAngle / innerRadius
// Both startAngle/endAngle AND startingAngle/endingAngle are accepted (auto-normalized)
await figma.create({ type: "ELLIPSE", parentId: f.id,
  x: 20, y: 20, width: 130, height: 130,
  fill: "#00000000", stroke: "#428DE7", strokeWeight: 14,
  arcData: { startingAngle: -1.5708, endingAngle: -1.5708 + 0.72 * 2 * Math.PI, innerRadius: 0 }})
\`\`\`

**SVG path cheatsheet:** M=move, L=line, H=horizontal, V=vertical, C=cubic, Q=quadratic, A=arc, Z=close

---

## Modify
\`\`\`js
await figma.modify({ id: f.id, fill: "#0f172a" })
await figma.modify({ name: "Card", width: 300, cornerRadius: 16 })
await figma.modify({ id: "123:456", content: "New text", fontSize: 16 })
await figma.modify({ id: "123:456", fontFamily: "SF Pro", fontWeight: "Bold" })
await figma.modify({ id: "123:456", fontColor: "#428DE7" })  // alias for fill on text
await figma.modify({ id: "123:456", layoutMode: "NONE" })    // remove auto-layout
\`\`\`

---

## Delete
\`\`\`js
await figma.delete({ id: "123:456" })
await figma.delete({ name: "Old Frame" })
await figma.delete({ ids: ["1:1", "1:2", "1:3"] })  // batch delete
\`\`\`

---

## Components
\`\`\`js
await figma.listComponents()
// → [{ id, name, key }]

await figma.createComponent({ nodeId: "49:200", name: "btn/primary" })
// → { id, name, key, width, height }

await figma.instantiate({ componentId: comp.id, parentId: f.id, x: 0, y: 0 })
await figma.instantiate({ componentName: "btn/primary", parentId: screen.id, x: 100, y: 200,
  overrides: {
    "Label":      { text: "Sign Up", fill: "#FFFFFF", fontSize: 16 },
    "Background": { fill: "#6C5CE7", cornerRadius: 8 },
    "Icon":       { visible: false }
  }
})
\`\`\`

---

## Node Operations
\`\`\`js
await figma.clone({ id: "123:456", x: 500, y: 0, name: "Card Copy" })
await figma.clone({ id: "123:456", parentId: otherFrame.id })

const group = await figma.group({ nodeIds: ["1:2", "1:3"], name: "Header Group" })
const { ungrouped } = await figma.ungroup({ id: group.id })

await figma.flatten({ id: "1:2" })
await figma.resize({ id: "1:2", width: 500, height: 300 })
await figma.set_selection({ nodeIds: ["1:2", "1:3"] })

await figma.set_viewport({ nodeId: "1:2" })           // zoom to node
await figma.set_viewport({ nodeName: "Dashboard" })
await figma.set_viewport({ center: { x: 500, y: 300 }, zoom: 0.5 })

// Sandbox helpers (v2.5.10+)
await figma.getNodeById("89:393")                     // read node detail by ID
await figma.zoom_to_fit({ nodeIds: ["1:2"] })         // alias for set_viewport
await figma.getCurrentPage()                          // returns current page info
\`\`\`

---

## Batch — up to 50 mixed operations in one round-trip
\`\`\`js
const result = await figma.batch([
  { operation: "create", params: { type: "RECTANGLE", parentId: f.id, width: 100, height: 100, fill: "#FF0000" } },
  { operation: "create", params: { type: "TEXT", parentId: f.id, content: "Hello", fontSize: 14, fill: "#FFFFFF" } },
  { operation: "modify", params: { id: "1:5", fill: "#00FF00" } },
  { operation: "delete", params: { id: "1:99" } },
  { operation: "delete", params: { ids: ["2:1", "2:2"] } },
]);
// → { results: [{index, operation, success, data}], total: 5, succeeded: 5 }
\`\`\`

---

## Read Operations (also available in figma_write for chaining)
\`\`\`js
var { nodes } = await figma.get_selection();
var { dataUrl } = await figma.screenshot({ id: f.id, scale: 2 });
var frames = await figma.get_page_nodes();  // returns ARRAY directly — do NOT destructure

var styles = await figma.get_styles();
// → { paintStyles: [{id, name, hex}], textStyles: [{id, name, fontSize, fontFamily}] }

var comps = await figma.get_local_components();
// → { components: [{id, name, description, variantProperties}], componentSets: [...] }

var vp = await figma.get_viewport();
// → { center: {x,y}, zoom, bounds: {x,y,width,height} }

var vars = await figma.get_variables();
// → { collections: [{id, name, modes: [{id,name}], variables: [{id,name,resolvedType,values}]}] }

// includeHidden support (default false)
var { nodes: all } = await figma.get_selection({ includeHidden: true });
var { tree } = await figma.get_design({ id: "1:2", includeHidden: true });
var { results } = await figma.search_nodes({ type: "TEXT", includeHidden: true });
\`\`\`

**export_image:**
\`\`\`js
figma_read({ operation: "export_image", nodeId: "89:209", scale: 2, format: "png" })
// → { base64: "...", format, width, height, sizeBytes }
\`\`\`

**get_node_detail:**
\`\`\`js
figma_read({ operation: "get_node_detail", nodeId: "89:393" })
// → { id, name, type, x, y, width, height, fills, stroke, borderRadius, css: {display,flexDirection,...}, boundVariables }
\`\`\`

**get_css:**
\`\`\`js
figma_read({ operation: "get_css", nodeId: "89:393" })
// → ready-to-paste CSS string: background, flex, border, radius, shadow, typography
\`\`\`

**Design-to-code operations:**
\`\`\`js
figma_read({ operation: "get_design_context", nodeId: "89:393" })
// → AI-optimized payload: flex layout, var(--token) fills, typography, component instances

figma_read({ operation: "get_component_map", nodeId: "89:393" })
// → all instances with componentSetName, variantLabel, suggestedImport path

figma_read({ operation: "get_unmapped_components", nodeId: "89:393" })
// → components without description (no code mapping) → prompt user for import paths
\`\`\`

---

## Prototyping & Scroll
\`\`\`js
// Click → navigate with Smart Animate
await figma.setReactions({ id: btnId, reactions: [{
  trigger: { type: "ON_CLICK" },
  actions: [{ type: "NAVIGATE", destinationId: targetFrameId,
    transition: { type: "SMART_ANIMATE", duration: 0.3, easing: { type: "EASE_IN_AND_OUT" } }
  }]
}] });
await figma.getReactions({ id: nodeId })
await figma.removeReactions({ id: nodeId })

// Scroll behavior
await figma.setScrollBehavior({ id: frameId, overflowDirection: "VERTICAL", clipsContent: true });
// overflowDirection: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH"

// Component variants & swap
await figma.setComponentProperties({ id: instanceId, properties: { "Size": "Large", "State": "Active" } });
await figma.swapComponent({ id: instanceId, componentId: targetComponentId });
await figma.getComponentProperties({ id: instanceId });
\`\`\`

---

## Workflow — Apply Existing Project Styles (read first, then apply)
\`\`\`js
// Read all tokens at session start
var vars = await figma.get_variables();
var varMap = {};
for (var ci = 0; ci < vars.collections.length; ci++)
  for (var vi = 0; vi < vars.collections[ci].variables.length; vi++) {
    var v = vars.collections[ci].variables[vi];
    varMap[v.name] = v.id;
  }

var styles = await figma.get_styles();
var colorMap = {}, textMap = {};
styles.paintStyles.forEach(function(s) { colorMap[s.name] = s.hex; });
styles.textStyles.forEach(function(s) { textMap[s.name] = s; });

var comps = await figma.get_local_components();
var compMap = {};
comps.components.forEach(function(c) { compMap[c.name] = c.id; });

var pages = await figma.get_page_nodes();
var frameMap = {};
pages.forEach(function(f) { frameMap[f.name] = f.id; });

// Create using discovered values + bind variables
var card = await figma.create({
  type: "FRAME", name: "Card",
  fill: colorMap["color/bg-surface"] || "#FFFFFF",
  width: 360, height: 200, cornerRadius: 12,
  layoutMode: "VERTICAL", padding: 16, itemSpacing: 12
});
if (varMap["bg-surface"])
  await figma.applyVariable({ nodeId: card.id, field: "fill", variableId: varMap["bg-surface"] });

// Light/Dark preview side by side
var collection = vars.collections.find(function(c) { return c.name === "Design Tokens"; });
var light = await figma.clone({ id: frameMap["Home"], x: 0,    name: "Preview/Light" });
var dark  = await figma.clone({ id: frameMap["Home"], x: 1500, name: "Preview/Dark"  });
await figma.setFrameVariableMode({ nodeId: light.id, collectionId: collection.id, modeName: "light" });
await figma.setFrameVariableMode({ nodeId: dark.id,  collectionId: collection.id, modeName: "dark" });
\`\`\`

---

## Workflow example — Draw a full screen
\`\`\`js
await figma.createPage({ name: "Dashboard" });
await figma.setPage({ name: "Dashboard" });

const root = await figma.create({
  type: "FRAME", name: "Dashboard",
  x: 0, y: 0, width: 1440, height: 900, fill: "#0f172a",
});

const sidebar = await figma.create({
  type: "FRAME", name: "Sidebar",
  parentId: root.id, x: 0, y: 0, width: 240, height: 900,
  fill: "#1e293b", stroke: "#334155", strokeWeight: 1,
});

await figma.create({ type: "TEXT", name: "Nav Label",
  parentId: sidebar.id, x: 48, y: 100,
  content: "Dashboard", fontSize: 13, fontWeight: "Medium", fill: "#f8fafc" });

console.log("Root frame id:", root.id);
\`\`\`
`;

const SECTION_TOKENS = `
# figma-ui-mcp — Design Tokens & Variables

---

## setupDesignTokens — Bootstrap complete token system (idempotent)

One call creates all variables. Existing variables get updated; new ones are created.

\`\`\`js
const result = await figma.setupDesignTokens({
  collectionName: "Design Tokens",

  // COLOR variables
  colors: {
    "accent":       "#3B82F6",
    "bg-base":      "#08090E",
    "text-primary": "#F0F2F5",
    "positive":     "#00DC82",
  },

  // FLOAT variables (spacing, radius, etc.)
  numbers: {
    "spacing-xs": 4, "spacing-sm": 8, "spacing-md": 16, "spacing-lg": 24,
    "radius-sm": 8,  "radius-md": 12, "radius-lg": 16,
  },

  // FLOAT variables for typography (v2.5.4+)
  fontSizes: {
    "text-xs": 11, "text-sm": 12, "text-body": 14,
    "text-heading-md": 16, "text-heading-lg": 20, "text-heading-xl": 24,
  },

  // STRING variables for fonts (v2.5.4+)
  fonts: {
    "font-primary": "Inter",
    "font-display": "Playfair Display",
  },

  // Text styles that reference variables above — {curly-braces} binds to variable
  textStyles: {
    "text/heading-xl": { fontFamily: "{font-primary}", fontWeight: "Bold",
                         fontSize: "{text-heading-xl}", lineHeight: 32, letterSpacing: -0.4 },
    "text/body":       { fontFamily: "{font-primary}", fontWeight: "Regular",
                         fontSize: "{text-body}", lineHeight: 20 },
    "text/caption":    { fontFamily: "{font-primary}", fontWeight: "Regular",
                         fontSize: "{text-xs}", lineHeight: 16 },
  }
});
// → { collectionId, created: [...], updated: [...], textStyles: [...], totalVariables: N }

// Multi-mode: Light + Dark
await figma.setupDesignTokens({
  collectionName: "Design Tokens",
  modes: ["light", "dark"],
  colors: {
    "bg-base":      { light: "#FFFFFF",  dark: "#0F1117" },
    "text-primary": { light: "#111827",  dark: "#F9FAFB" },
    "accent":       { light: "#3B82F6",  dark: "#60A5FA" },
  }
});

// Multi-mode typography: Compact / Comfortable / Large
await figma.setupDesignTokens({
  collectionName: "Typography",
  modes: ["compact", "comfortable", "large"],
  fontSizes: {
    "text-body":       { compact: 12, comfortable: 14, large: 16 },
    "text-heading-xl": { compact: 22, comfortable: 24, large: 28 },
  }
});
// Switch frame mode:
await figma.setFrameVariableMode({ nodeId, collectionId, modeName: "large" });
\`\`\`

---

## applyTextStyle — Apply a text style by name (v2.5.4+)

\`\`\`js
var title = await figma.create({ type: "TEXT", content: "Dashboard", parentId: card.id });
await figma.applyTextStyle({ nodeId: title.id, styleName: "text/heading-xl" });
// → { nodeId, styleName, styleId }
\`\`\`

Why use instead of inline props: font changes propagate, mode switches work, consistent across screens.

---

## modifyVariable — Change variable value (all bound nodes update)

\`\`\`js
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });
await figma.modifyVariable({ variableId: "VariableID:57:671", value: "#FF6B35" });
await figma.modifyVariable({ variableName: "spacing-md", value: 20 });
await figma.modifyVariable({ variableName: "font-primary", value: "SF Pro" }); // font swap
\`\`\`

---

## applyVariable — Bind a variable to a node property

\`\`\`js
await figma.applyVariable({ nodeId: card.id, field: "fill",         variableId: varMap["accent"] });
await figma.applyVariable({ nodeId: card.id, field: "fill",         variableName: "accent" }); // by name
\`\`\`

**Supported fields:**

| Field | Variable type | Notes |
|-------|--------------|-------|
| \`fill\` / \`stroke\` | COLOR | Binds to first solid paint |
| \`opacity\` | FLOAT | 0.0–1.0 |
| \`width\` / \`height\` | FLOAT | |
| \`cornerRadius\` | FLOAT | Alias → topLeftRadius |
| \`topLeftRadius\` / \`topRightRadius\` / \`bottomLeftRadius\` / \`bottomRightRadius\` | FLOAT | Individual corners |
| \`strokeWeight\` | FLOAT | |
| \`itemSpacing\` | FLOAT | Auto-layout gap |
| \`paddingTop\` / \`paddingBottom\` / \`paddingLeft\` / \`paddingRight\` | FLOAT | |
| \`fontSize\` / \`letterSpacing\` / \`lineHeight\` | FLOAT | TEXT only |
| \`fontFamily\` / \`fontStyle\` | STRING | v2.5.4+ font swap |
| \`characters\` | STRING | v2.5.4+ bind text content |
| \`visible\` | BOOLEAN | Show/hide |

\`\`\`js
// Complete card binding
var bindings = [
  { nodeId: card.id, field: "fill",        varName: "bg-surface" },
  { nodeId: card.id, field: "cornerRadius", varName: "radius-md" },
  { nodeId: card.id, field: "paddingTop",   varName: "spacing-md" },
  { nodeId: card.id, field: "itemSpacing",  varName: "spacing-sm" },
  { nodeId: title.id, field: "fill",        varName: "text-primary" },
];
for (var bi = 0; bi < bindings.length; bi++) {
  var b = bindings[bi];
  if (varMap[b.varName])
    await figma.applyVariable({ nodeId: b.nodeId, field: b.field, variableId: varMap[b.varName] });
}
\`\`\`

---

## Low-level Variable API

\`\`\`js
// Create collection + variables + modes manually (prefer setupDesignTokens)
var colors = await figma.createVariableCollection({ name: "Colors" });
await figma.renameVariableMode({ collectionId: colors.id, modeId: colors.modes[0].id, newName: "Light" });
var dark = await figma.addVariableMode({ collectionId: colors.id, modeName: "Dark" });

var bgBase = await figma.createVariable({ name: "bg-base", collectionId: colors.id, resolvedType: "COLOR", value: "#FFFFFF" });
await figma.setVariableValue({ variableId: bgBase.id, modeId: dark.modeId, value: "#0F1117" });

await figma.applyVariable({ nodeId: card.id, field: "fill", variableId: bgBase.id });

await figma.setFrameVariableMode({ nodeId: frame.id, collectionId: colors.id, modeName: "Dark" });
await figma.clearFrameVariableMode({ nodeId: frame.id, collectionId: colors.id });

await figma.removeVariableMode({ collectionId: colors.id, modeId: dark.modeId });
\`\`\`

---

## Paint & Text Styles

\`\`\`js
await figma.createPaintStyle({ name: "color/primary", color: "#006FEE", description: "Primary brand" });
// → { id, name, key, color }

await figma.createTextStyle({ name: "text/heading-xl",
  fontFamily: "Inter", fontWeight: "Bold", fontSize: 24, lineHeight: 32, letterSpacing: -0.5 });
// → { id, name, key, fontSize }
\`\`\`

---

## ensure_library & get_library_tokens

\`\`\`js
const lib = await figma.ensure_library();
// → { id, existed } — creates "🎨 Design Library" frame if not present

const tokens = await figma.get_library_tokens();
// → { colors: [{name, hex}], textStyles: [{name, fontSize, fontWeight, fill}] }
\`\`\`

---

## Effects, Gradients, Corner Radii, Hex Alpha

\`\`\`js
// Effects
effects: [
  { type: "DROP_SHADOW", color: "#00000026", offset: {x:0,y:8}, radius: 24, spread: 0 },
  { type: "INNER_SHADOW", color: "#00000030", offset: {x:0,y:2}, radius: 4 },
  { type: "LAYER_BLUR", radius: 12 },
  { type: "BACKGROUND_BLUR", radius: 20 },  // needs fill with alpha < 1 (glass effect)
]
await figma.modify({ id: node, effects: [] });  // clear all

// Gradient fill
fill: { type: "LINEAR_GRADIENT", angle: 135,
  stops: [{ pos: 0, color: "#7C3AED" }, { pos: 1, color: "#EC4899" }] }
fill: { type: "RADIAL_GRADIENT",
  stops: [{ pos: 0, color: "#FFFFFF" }, { pos: 1, color: "#00000000" }] }

// Individual corner radii
topLeftRadius: 20, topRightRadius: 20, bottomLeftRadius: 0, bottomRightRadius: 0

// Hex alpha — 8-digit hex, alpha auto-applied
fill: "#FFFFFF80"    // 50% white
fill: "#6C5CE733"    // 20% accent
// Also: rgba(255,255,255,0.5)
\`\`\`

---

## Mixed Text Segments

\`\`\`js
// get_design / get_selection returns segments for mixed-style text:
{
  "type": "TEXT", "content": "8 đ 83 token", "mixedStyles": true,
  "segments": [
    { "text": "8 đ",      "fill": "#1E3150", "fontWeight": "Bold",    "fontSize": 14 },
    { "text": "83 token", "fill": "#8E9AAD", "fontWeight": "Regular", "fontSize": 14 }
  ]
}
\`\`\`
`;

const SECTION_ICONS = `
# figma-ui-mcp — Images & Icons

---

## figma.loadImage(url, opts)

Download image from URL, place on canvas:

\`\`\`js
// Hero image
await figma.loadImage("https://images.unsplash.com/photo-xxx?w=440&h=248&fit=crop", {
  parentId: frame.id, x: 0, y: 0, width: 440, height: 248,
  name: "hero-image", scaleMode: "FILL"
});

// Circular avatar
await figma.loadImage("https://images.unsplash.com/photo-xxx?w=48&h=48&fit=crop", {
  parentId: row.id, width: 32, height: 32,
  name: "avatar", cornerRadius: 16, scaleMode: "FILL"
});
\`\`\`

---

## figma.loadIcon(name, opts)

Fetch SVG icon with 7-library auto-fallback (filled-first, iOS style preferred):

\`\`\`js
await figma.loadIcon("notifications", { parentId: header.id, x: 16, y: 16, size: 22, fill: "#FFFFFF" });
await figma.loadIcon("bookmark",      { parentId: header.id, x: 398, y: 16, size: 22, fill: "#1E3150" });
await figma.loadIcon("play",          { parentId: btn.id, size: 24, fill: "#FFFFFF" });
\`\`\`

---

## figma.loadIconIn(name, opts)

Icon inside centered circle background:

\`\`\`js
// Standard: creates 40px circle wrapper + 20px icon centered inside
await figma.loadIconIn("checkmark", {
  parentId: card.id, containerSize: 40, fill: "#00B894", bgOpacity: 0.1
});

// noContainer: true — load icon directly into an existing styled frame (avoids double-wrap)
// Use when you already created the wrapper frame yourself (BUG-15 prevention)
await figma.loadIconIn("arrow-right", {
  parentId: myWrapperFrameId,  // frame you already created at desired size
  containerSize: 28,           // icon size = containerSize/2 = 14px
  fill: "#FFFFFF",
  noContainer: true            // places icon directly — no extra wrapper created
});

// Transparent background (no tint circle)
await figma.loadIconIn("arrow-left", {
  parentId: btnId, containerSize: 32, fill: "#FFFFFF", bgOpacity: 0
});
\`\`\`

**⚠️ BUG-15 warning:** If you pass a pre-styled wrapper frame as \`parentId\` WITHOUT \`noContainer:true\`,
\`loadIconIn\` will create an additional inner wrap inside it → icon shrinks to 25% of container size.
Use \`noContainer: true\` when the parent is already the intended icon container.

---

## ICON LIBRARY PRIORITY (MANDATORY)

\`figma.loadIcon()\` tries libraries in this order, returns first match:

| Priority | Library | Style | Fill Type |
|----------|---------|-------|-----------|
| 1st | **Ionicons** v7.4.0 | iOS filled | injected at \`<svg>\` root |
| 2nd | **Fluent UI** | Win11 Filled | \`fill\` attr |
| 3rd | **Bootstrap** | Filled | \`fill\` attr |
| 4th | **Phosphor** | Filled | \`fill\` attr |
| 5th | **Tabler Filled** v3.24 | Filled (4,500+) | \`currentColor\` → replaced |
| 6th | **Tabler Outline** | Outline | \`currentColor\` → replaced |
| 7th | **Lucide** | Outline fallback | \`stroke\` → replaced |

**Ionicons-specific naming** (iOS naming conventions):

| Concept | Ionicons name |
|---------|--------------|
| Bell | \`notifications\` |
| Back arrow | \`chevron-back\` |
| Forward | \`chevron-forward\` |
| Clock | \`time\` |
| Plus | \`add\` |
| Close | \`close\` |
| Checkmark | \`checkmark\` |
| Fire | \`flame\` |
| Lightning | \`flash\` |
| Lock | \`lock-closed\` |
| Chat | \`chatbubble\` |

Outline variants: append \`-outline\` (\`home-outline\`). Sharp: append \`-sharp\`.

**Common names across libraries:**

| Concept | Ionicons | Fluent | Bootstrap | Lucide |
|---------|----------|--------|-----------|--------|
| Home | \`home\` | \`home_24_filled\` | \`house-fill\` | \`home\` |
| User | \`person\` | \`person_24_filled\` | \`person-fill\` | \`user\` |
| Star | \`star\` | \`star_24_filled\` | \`star-fill\` | \`star\` |
| Search | \`search\` | \`search_24_filled\` | \`search\` | \`search\` |
| Settings | \`settings\` | \`settings_24_filled\` | \`gear-fill\` | \`settings\` |
| Heart | \`heart\` | \`heart_24_filled\` | \`heart-fill\` | \`heart\` |
| Bookmark | \`bookmark\` | \`bookmark_24_filled\` | \`bookmark-fill\` | \`bookmark\` |
| Play | \`play\` | \`play_24_filled\` | \`play-fill\` | \`play\` |
| Menu | \`menu\` | \`navigation_24_filled\` | \`list\` | \`menu\` |
| Cart | \`cart\` | \`cart_24_filled\` | \`cart-fill\` | \`shopping-cart\` |

---

## ICON COLORING RULE (MANDATORY)

Always pass \`fill\` param. Different libraries handle color differently — the plugin normalizes all:

| Context | Icon Color |
|---------|-----------|
| On white/light bg | Brand color or \`#1E3150\` |
| On colored bg (button) | \`#FFFFFF\` |
| On colored circle bg | Same as circle color |
| Inactive/disabled | \`#8E9AAD\` |
| Accent/CTA | \`#6C5CE7\` |
| Success | \`#00B894\` |
| Warning | \`#F0B429\` |
| Danger | \`#FF6B6B\` |

\`\`\`js
figma.create({ type: "SVG", svg: "...", fill: "#6C5CE7", ... })
\`\`\`

---

## ICON SIZING RULE (MANDATORY)

Icon MUST be smaller than container. Rule: \`icon_size = container_size × 0.5\`

| Container | Icon |
|-----------|------|
| 24px | 12px |
| 32px | 16px |
| 40px | 20px |
| 44px | 22px |
| 48px | 24px |
| 56px | 28px |
| 64px | 32px |
| 80px | 40px |

NEVER set icon_size >= container_size.

---

## SVG Icons (manual)

Use \`type: "SVG"\` with raw SVG markup when you have custom SVG:
\`\`\`js
// Replace fill/stroke "currentColor" before sending
var svg = '<svg viewBox="0 0 24 24"><path d="M..." fill="#6C5CE7"/></svg>';
await figma.create({ type: "SVG", svg, parentId: f.id, x: 0, y: 0, width: 24, height: 24, fill: "#6C5CE7" });
\`\`\`

---

## Known Figma Limitations (read before building)

These are **Figma platform behaviors** — not plugin bugs. Understanding them prevents wasted iterations.

---

### BUG-03 — Inter baseline offset (visual centering off by ~3–4px)

Auto-layout \`CENTER\` is mathematically correct but Inter font has extra ascender whitespace — text appears shifted upward visually.

**Workaround:** Add \`paddingBottom: 3\` or \`paddingBottom: 4\` to the wrapper frame:
\`\`\`js
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
  paddingBottom: 3,   // ← compensate Inter baseline
  width: 120, height: 40, fill: "#6C5CE7" });
\`\`\`
Applies to: buttons, tab bar items, icon+label rows — any container where Inter text must appear perfectly centered.

---

### BUG-04 — VECTOR bounding box ignores width/height

Figma recalculates VECTOR dimensions from actual path geometry. Explicit \`width\`/\`height\` are ignored — the node gets the path's bounding box instead.

**Do NOT use VECTOR for circular arcs.** Use ELLIPSE + arcData:
\`\`\`js
// ❌ VECTOR arc — width/height ignored, misaligns with sibling ELLIPSE
await figma.create({ type: "VECTOR", x:20, y:20, width:130, height:130,
  d: "M 65 7 A 58 58 0 1 1 12.4 107.4", stroke: "#428DE7", strokeWeight: 14 });
// → actual node: width=95, height=114 (path bounding box, not 130×130)

// ✅ ELLIPSE + arcData — always respects width/height
await figma.create({ type: "ELLIPSE", x:20, y:20, width:130, height:130,
  fill: "#00000000", stroke: "#428DE7", strokeWeight: 14,
  arcData: { startingAngle: -1.5708, endingAngle: -1.5708 + 0.72*2*Math.PI, innerRadius: 0 }});
\`\`\`

---

### BUG-07 — counterAxisAlignItems "STRETCH" is not a valid value

Figma plugin API does not support \`counterAxisAlignItems: "STRETCH"\`. It throws immediately.

**Correct pattern:**
\`\`\`js
// ❌ Throws error
await figma.create({ type: "FRAME", layoutMode: "VERTICAL",
  counterAxisAlignItems: "STRETCH" });

// ✅ Use "MIN" on container + layoutAlign: "STRETCH" on each child
var col = await figma.create({ type: "FRAME", layoutMode: "VERTICAL",
  counterAxisAlignItems: "MIN", width: 300, height: 200 });
await figma.create({ type: "FRAME", parentId: col.id, height: 52,
  layoutAlign: "STRETCH" });   // ← child fills parent width
\`\`\`

---

### BUG-08 — figma_write sandbox is isolated per call

Every \`figma_write\` execution runs in a **fresh JavaScript sandbox**. Variables, constants, and helper functions defined in one call are gone in the next.

**Rule:** Redeclare all constants at the top of every \`figma_write\` call:
\`\`\`js
// Must repeat this in EVERY figma_write call that needs these values
var COLORS = { accent: "#6C5CE7", bg: "#0F1117", text: "#E8ECF4" };
var frameId = "123:456";   // re-query if you don't have the ID from this call
\`\`\`

---

### BUG-09/10 — figma.getChildren / figma.read not available in sandbox

\`figma.getChildren(nodeId)\`, \`figma.getNodeChildren()\`, and \`figma.read(...)\` are not exposed in the write sandbox. Calling them throws \`figma.getChildren is not a function\`.

**Correct pattern:** Use separate \`figma_read\` tool calls:
\`\`\`js
// ❌ Inside figma_write — crashes
var children = await figma.getChildren("123:456");

// ✅ Use figma_read tool BEFORE the figma_write call
// figma_read({ operation: "get_design", nodeId: "123:456", depth: 2 })
// → inspect children, collect IDs, then use IDs in figma_write
\`\`\`

---

### BUG-11 — SVG path H and V commands not supported

Figma's path parser does not support horizontal (\`H\`) or vertical (\`V\`) line commands. Using them throws \`Invalid command at H\`.

**Replace before using:**
| SVG command | Replace with |
|-------------|-------------|
| \`H 100\` | \`L 100 {currentY}\` |
| \`V 50\` | \`L {currentX} 50\` |
| \`h 20\` | \`l 20 0\` |
| \`v -10\` | \`l 0 -10\` |

\`\`\`js
// ❌ Throws: Invalid command at H
await figma.create({ type: "VECTOR", d: "M 0 8 H 14 M 2 8 L 7 3" });

// ✅ Replace H with L
await figma.create({ type: "VECTOR", d: "M 0 8 L 14 8 M 2 8 L 7 3" });
\`\`\`

---

### BUG-12 — Emoji in TEXT nodes misalign in auto-layout

Emoji characters (🔔 📋 ⌂ ✉ ☰) render as colored OS glyphs in Figma, not plain text. Problems:
1. Different ascender/descender metrics → shifted vertically in auto-layout
2. Glyph size ≠ fontSize (unreliable sizing)
3. Platform-variant rendering (macOS vs Windows vs web)

**Always use SVG icons instead:**
\`\`\`js
// ❌ Never — emoji misaligns and renders inconsistently
await figma.create({ type: "TEXT", content: "⌂", fontSize: 20 });

// ✅ Always — SVG icon is pixel-perfect and colorable
await figma.loadIcon("home", { parentId: tabId, size: 20, fill: "#428DE7" });
\`\`\`

---

### BUG-14 — layoutGrow:1 conflicts with primaryAxisAlignItems:"CENTER"

\`"CENTER"\` distributes remaining space equally around children. \`layoutGrow: 1\` on a child consumes **all** remaining space before CENTER applies — children shift to one side instead of centering.

**Rule:** Never combine \`layoutGrow\` with \`primaryAxisAlignItems: "CENTER"\`.

\`\`\`js
// ❌ Spacer + CENTER — dots shift, centering broken
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER" });
await figma.create({ type: "FRAME", parentId: rowId, layoutGrow: 1 }); // breaks centering

// ✅ Option A: SPACE_BETWEEN (distributes equally, no spacer needed)
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN" });

// ✅ Option B: "MIN" + paddingLeft for manual centering
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "MIN", paddingLeft: 60 });

// ✅ Option C: absolute x positions — skip auto-layout entirely for dot rows
\`\`\`

---

## export_image vs screenshot

| | screenshot | export_image |
|--|-----------|-------------|
| Output | Inline image in Claude Code | base64 text string |
| Format | PNG only | PNG or JPG |
| Use case | "Show me the frame" | "Save this asset" |

\`\`\`js
figma_read({ operation: "screenshot", nodeId: "123:456", scale: 1 })   // inline preview
figma_read({ operation: "export_image", nodeId: "123:456", scale: 2, format: "png" })  // save to disk
\`\`\`
`;

// ─── Section router ────────────────────────────────────────────────────────────

export function getDocs(section) {
  if (!section) return SECTION_INDEX + "\n\n" + SECTION_DEFAULT;
  switch (section.toLowerCase()) {
    case "rules":   return SECTION_RULES;
    case "layout":  return SECTION_LAYOUT;
    case "api":     return SECTION_API;
    case "tokens":  return SECTION_TOKENS;
    case "icons":   return SECTION_ICONS;
    default:
      return `Unknown section: "${section}". Valid sections: rules | layout | api | tokens | icons\n\n` + SECTION_INDEX;
  }
}

// Legacy export — returns default section (for backwards compatibility)
export const DOCS = getDocs(null);
