export const DOCS = `
# figma-ui-mcp — Complete API Reference & Design Rules

---

## ⚑ MANDATORY DESIGN SYSTEM RULES (read before every design task)

### Rule 0 — Token-First Workflow (HIGHEST PRIORITY — NON-NEGOTIABLE)
**NEVER hardcode hex colors in \`fill\` or \`stroke\`.** Always use Figma Variables (Design Tokens).

**Before ANY design work, run this bootstrap sequence:**
\`\`\`js
// 1. Bootstrap all tokens in one call (idempotent — safe to call every time)
var tokens = await figma.setupDesignTokens({
  collectionName: "Design Tokens",
  colors: {
    "accent":         "#3B82F6",
    "accent-dim":     "#1D4ED8",
    "bg-base":        "#08090E",
    "bg-surface":     "#0F1117",
    "bg-card":        "#111318",
    "bg-elevated":    "#0D0F14",
    "border":         "#1E2030",
    "text-primary":   "#F0F2F5",
    "text-secondary": "#8B8FA3",
    "text-muted":     "#555872",
    "positive":       "#00DC82",
    "negative":       "#FF4757",
    "warning":        "#FFB547",
  },
  numbers: {
    "radius-sm": 8, "radius-md": 12, "radius-lg": 16,
    "spacing-xs": 4, "spacing-sm": 8, "spacing-md": 16, "spacing-lg": 24,
  }
});
// Returns { collectionId, created: [...], updated: [...], totalVariables }

// 2. Read variable IDs for use in applyVariable
var vars = await figma.get_variables();
// Build a lookup map: name → variableId
var varMap = {};
for (var ci = 0; ci < vars.collections.length; ci++) {
  for (var vi = 0; vi < vars.collections[ci].variables.length; vi++) {
    var v = vars.collections[ci].variables[vi];
    varMap[v.name] = v.id;
  }
}
// Now varMap["accent"] = "VariableID:xx:yy"
\`\`\`

**Then for EVERY node you create:**
\`\`\`js
// WRONG — hardcoded hex
await figma.create({ type: "FRAME", fill: "#3B82F6", ... });

// CORRECT — create with hex, then bind variable
var node = await figma.create({ type: "FRAME", fill: "#3B82F6", ... });
await figma.applyVariable({ nodeId: node.id, field: "fill", variableId: varMap["accent"] });
\`\`\`

**To change a color globally (all bound nodes update instantly):**
\`\`\`js
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });
// → ALL nodes bound to "accent" update to #0EA5E9 automatically!
\`\`\`

### Rule 0b — Component-First Workflow (MANDATORY for repeated elements)
**NEVER draw the same element twice.** Create a Component, then instantiate it.

**Workflow:**
\`\`\`js
// 1. Check if component exists
var components = await figma.listComponents();
var btnExists = components.some(function(c) { return c.name === "btn/primary"; });

// 2. If not → create frame, convert to component
if (!btnExists) {
  var btnFrame = await figma.create({
    type: "FRAME", name: "btn/primary",
    width: 120, height: 40, fill: "#3B82F6", cornerRadius: 10,
    layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
  });
  await figma.create({ type: "TEXT", parentId: btnFrame.id, content: "Button", fontSize: 14, fontWeight: "SemiBold", fill: "#FFFFFF" });
  await figma.applyVariable({ nodeId: btnFrame.id, field: "fill", variableId: varMap["accent"] });
  var comp = await figma.createComponent({ nodeId: btnFrame.id, name: "btn/primary" });
  // comp.id is now a reusable component
}

// 3. Use instances everywhere (changes to component → all instances update)
await figma.instantiate({ componentName: "btn/primary", parentId: screen.id, x: 100, y: 200 });
await figma.instantiate({ componentName: "btn/primary", parentId: screen.id, x: 300, y: 200 });
\`\`\`

**Must create as Components:** buttons, badges (LONG/SHORT/status), nav items, stat cards, table headers, pagination.
**Must use Variables:** ALL colors, ALL spacing, ALL border radius.

### Rule 1 — Design Library Frame
Before drawing any new design, ALWAYS:
1. Run \`setupDesignTokens\` (Rule 0) to bootstrap variables
2. Call \`figma.get_page_nodes()\` to check if "🎨 Design Library" frame exists
3. If not → \`figma.ensure_library()\` to create visual reference
4. The Design Library frame is a **visual reference only** — actual tokens live in Figma Variables
5. When adding new colors → add to \`setupDesignTokens\` colors param AND to library frame

### Rule 2 — Library Frame Structure
The "🎨 Design Library" frame lives at x: -2000, y: 0 (off-canvas, never on-screen).
It contains labeled sections:
- **Colors** — rectangles named "color/{name}" with the hex fill (visual reference)
- **Text Styles** — text nodes named "text/{role}" (e.g. text/heading-xl, text/body-sm)
- **Components** — component instances showing all reusable elements
- **Variables** — the REAL tokens live in Figma Variables panel, NOT in this frame

### Rule 3 — Read selection when user refers to a frame
When user says "this frame", "the selected one", "bạn thấy không", "cái đang chọn":
→ Immediately call figma_read with operation "get_selection" to read what the user has selected in Figma.
Never assume which frame the user means — always read it first.

### Rule 4 — Naming convention
- Frame names: PascalCase (e.g. "Trading Dashboard", "Signal Card")
- Component names: kebab-case with type prefix (e.g. "btn/primary-lg", "badge/success")
- Color names: descriptive (e.g. "color/bg-surface", "color/accent-purple", "color/positive-green")

### Rule 5 — Visual QA after every design (self-check loop)
After finishing any design section, perform a self-QA pass:
1. Call \`figma_read\` with \`operation: "screenshot"\` on the root frame (scale: 0.4)
2. The base64 PNG is returned — Claude views it directly as an image
3. Analyze visually: check for overlapping elements, misaligned nodes, text overflow, off-canvas items
4. Cross-check coordinates via \`get_page_nodes\` — compare x/y/width/height of each node
5. If overlap found → call \`figma.modify({ id, x, y, width, height })\` to fix
6. Re-screenshot to confirm — repeat until clean
This loop runs automatically after every major draw step.

### Rule 6 — Layer Order (CRITICAL)
In Figma, the LAST child drawn renders ON TOP. When building screens:
1. **Draw background/hero image FIRST** (bottom layer)
2. Then overlays, content, buttons on top
3. **NEVER** add a full-size image after other elements — it covers everything

\`\`\`
CORRECT:  image → overlay → back btn → title → content
WRONG:    back btn → title → content → image (image covers all!)
\`\`\`

### Rule 7 — TEXT vs BACKGROUND COLOR (CRITICAL)
**NEVER** create a container where fill color equals text color inside it. Text will be invisible.

**Pattern to AVOID:**
\`\`\`
frame(fill: "#6C5CE7") → text(fill: "#6C5CE7")  ← INVISIBLE!
\`\`\`

**Correct patterns for tinted/accent containers:**

| Style | Container | Text | When to use |
|-------|-----------|------|-------------|
| Filled active | \`fill: "#6C5CE7"\` | \`fill: "#FFFFFF"\` | Active tabs, primary buttons |
| Outlined accent | \`fill: "#FFFFFF", stroke: "#6C5CE7"\` | \`fill: "#6C5CE7"\` | Filter pills, level badges |
| Ghost/subtle | \`fill: "#F5F6FA"\` | \`fill: "#1E3150"\` | Inactive tabs, secondary |
| Tinted (safe) | \`fill: "#FFFFFF", stroke: color\` | \`fill: color\` | Tags, badges with border |

**Rule: If container and text need the same accent color, use white bg + colored border + colored text.**

### Rule 8 — Container Height Must Fit Content
When creating auto-layout containers (cards, banners, panels):
- Set height **generously** to fit all children with padding + spacing
- If unsure, add 20-30px buffer — too tall is better than content being clipped
- After creating, verify with \`get_design\` or \`screenshot\` that no content overflows
- Formula: height = paddingTop + paddingBottom + (childCount * avgChildHeight) + ((childCount-1) * itemSpacing)

### Rule 9 — NO EMOJI AS ICONS (CRITICAL — NON-NEGOTIABLE)
**NEVER** use emoji characters (🔔 📋 👤 🌐 🔒 etc.) as icons in designs. Emoji look unprofessional and inconsistent across platforms.

**ALWAYS use SVG icons** from the icon library via \`figma.loadIcon()\` or \`figma.loadIconIn()\`:
\`\`\`js
// WRONG — unprofessional emoji
await figma.create({ type: "TEXT", content: "🔔", fontSize: 16 });

// CORRECT — proper SVG icon from library
await figma.loadIcon("bell", { parentId: iconBg.id, size: 18, fill: "#0e7c3a" });

// CORRECT — icon inside colored circle
await figma.loadIconIn("bell", { parentId: row.id, containerSize: 36, fill: "#0e7c3a", bgOpacity: 0.1 });
\`\`\`

**This rule applies to ALL icons:** navigation, menu items, buttons, badges, status indicators.
Use \`figma.loadIcon()\` for bare icons, \`figma.loadIconIn()\` for icons inside circle backgrounds.

### Rule 10 — Layout Quality Standards (MANDATORY for professional design)
Every design must meet these quality standards:

**Padding & Spacing:**
- Cards: minimum 16px padding on all sides, 20px recommended
- List items: minimum 12px vertical padding, 16-20px horizontal
- Buttons: minimum 12px vertical, 24px horizontal padding
- Between sections: minimum 16px gap, 20-24px recommended
- Never place elements flush against container edges

**Text Centering & Alignment:**
- Button text: ALWAYS centered both horizontally and vertically (use auto-layout CENTER/CENTER)
- Card titles: left-aligned with consistent left padding
- Badges/pills: text ALWAYS centered inside (use auto-layout)
- Numbers/stats: center-aligned within their containers

**Text Wrapping & Overflow (CRITICAL for mobile UI):**
- **Auto-detect**: plugin now defaults to \`textAutoResize: "HEIGHT"\` when width is set → text wraps automatically
- Long text / descriptions: ALWAYS set \`width\` on text node → text wraps within that width
- Single-line labels (no width set): defaults to \`"WIDTH_AND_HEIGHT"\` (auto-size, no wrap)
- Override with explicit \`textAutoResize\`: \`"HEIGHT"\` (fixed width, auto height), \`"NONE"\` (fixed both), \`"WIDTH_AND_HEIGHT"\` (hug)
- Truncation: if text may overflow, ensure container has \`clipsContent: true\`
- Multi-line text: use appropriate \`lineHeight\` (1.4-1.6x fontSize)
- **Mobile rule**: paragraphs, descriptions, chat messages MUST have \`width: parentWidth - paddingLeft - paddingRight\`

**Borders & Strokes:**
- Card borders: use subtle \`stroke\` color (e.g. "#E0E0E0" or "#EEEEEE"), \`strokeWeight: 1\`
- Dividers between list items: use LINE type, full width, \`strokeWeight: 1\`, color "#EEEEEE"
- Active/selected states: use colored border (e.g. \`stroke: "#0e7c3a", strokeWeight: 2\`)
- Input fields: \`stroke: "#B5B5B5", strokeWeight: 1\`, focused: \`stroke: "#0e7c3a", strokeWeight: 2\`

**Shadows & Elevation:**
- Cards: use subtle shadow via slightly darker background or offset technique
- For elevated cards, create a shadow rectangle behind the card:
\`\`\`js
// Shadow layer (draw BEFORE the card — layer order rule)
await figma.create({
  type: "RECTANGLE", name: "Card Shadow",
  parentId: root.id, x: cardX + 2, y: cardY + 4,
  width: cardWidth, height: cardHeight,
  fill: "#000000", cornerRadius: cardRadius,
  opacity: 0.08,
});
// Then draw the actual card on top
await figma.create({
  type: "FRAME", name: "Card",
  parentId: root.id, x: cardX, y: cardY,
  width: cardWidth, height: cardHeight,
  fill: "#FFFFFF", cornerRadius: cardRadius,
});
\`\`\`

**Corner Radius Consistency:**
- Cards: 16-20px (use one value consistently across all cards)
- Buttons: 12-16px
- Input fields: 12px
- Badges/pills: height/2 (fully rounded)
- Avatar circles: width/2 (perfect circle)
- Bottom nav: 0 (flush with screen edge)

### Rule 11 — Centered Profile Layouts (CRITICAL for detail/profile screens)
When creating a profile/detail screen with avatar + name + subtitle stacked vertically:

**Text MUST be center-aligned relative to the full frame width:**
\`\`\`js
// CORRECT: use textAlign "CENTER" with full-width text
await figma.create({
  type: "TEXT", parentId: rootId,
  x: 0, y: 202, width: frameWidth,  // FULL width of parent
  content: "Phạm Văn An",
  fontSize: 22, fontWeight: "Bold", fill: TEXT1,
  textAlign: "CENTER",              // CENTER aligned
});
\`\`\`
**WRONG:** Using \`x: 120\` with auto-width text — this won't center properly.

**For centered badge/status below name:** Calculate \`x = (frameWidth - badgeWidth) / 2\`

### Rule 12 — Key-Value Info Rows Must Have Spacing (CRITICAL)
When displaying label:value pairs (e.g. "Họ và tên: Phạm Văn An"):

**NEVER place label and value as a single text string.** Always use separate text nodes in a horizontal auto-layout:
\`\`\`js
// CORRECT: separate text nodes with auto-layout spacing
var row = await figma.create({
  type: "FRAME", parentId: parentId,
  width: 305, height: 36,  // height 36px minimum for readable rows
  fill: CARD, fillOpacity: 0,
  layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "CENTER",
  itemSpacing: 8,           // MINIMUM 8px gap between label and value
  layoutAlign: "STRETCH",
});
// Label (fixed width for alignment)
await figma.create({
  type: "TEXT", parentId: row.id,
  content: "Họ và tên:", fontSize: 13,
  fontWeight: "Regular", fill: TEXT3,
  width: 110,              // Fixed width so values align vertically
});
// Value (flexible)
await figma.create({
  type: "TEXT", parentId: row.id,
  content: "Phạm Văn An", fontSize: 13,
  fontWeight: "Medium", fill: TEXT1,
  layoutGrow: 1,
});
\`\`\`
**Row height rules:**
- Simple key-value: minimum 36px height (not 32px)
- With icon prefix: minimum 40px height
- Between rows: use divider (1px) OR minimum 4px itemSpacing in parent

### Rule 13 — Container Height Must Accommodate All Children (CRITICAL)
**Always calculate container height BEFORE creating:**
\`\`\`
containerHeight = paddingTop + paddingBottom
                + (numberOfChildren × childHeight)
                + ((numberOfChildren - 1) × itemSpacing)
                + dividerCount × 1  // if using dividers
\`\`\`
**Use \`primaryAxisSizingMode: "AUTO"\` when possible** to let the container grow:
\`\`\`js
var card = await figma.create({
  type: "FRAME",
  width: 353,
  height: 500,  // generous initial height
  primaryAxisSizingMode: "AUTO",  // auto-grow to fit content
  layoutMode: "VERTICAL",
  paddingTop: 24, paddingBottom: 24,
  itemSpacing: 12,
});
\`\`\`
**After drawing, ALWAYS verify** with screenshot that no content is clipped or overflowing.
If content is clipped → increase height or use \`primaryAxisSizingMode: "AUTO"\`.

### Rule 14 — Score/Match Result Cards Must Have Inner Padding (MANDATORY)
When displaying match results (Team A vs Team B with score):
\`\`\`js
// CORRECT: teams row with proper padding
var scoreRow = await figma.create({
  type: "FRAME",
  width: 317, height: 32,
  layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN",
  counterAxisAlignItems: "CENTER",
  paddingLeft: 8,   // inner padding so text doesn't touch edges
  paddingRight: 8,
  layoutAlign: "STRETCH",
});
\`\`\`
**WRONG:** No paddingLeft/Right on score rows — team names touch the card edges.

### Rule 15 — Button Variants System (MANDATORY)
Every button must use one of these variant patterns. Never create random button styles.

| Variant | Fill | Text | Border | When to use |
|---------|------|------|--------|-------------|
| **Solid** | brand color | white | none | Primary CTA |
| **Flat** | brand color 10% opacity | brand color | none | Secondary actions |
| **Bordered** | transparent | brand color | 1px brand | Tertiary, filters |
| **Ghost** | transparent | brand color | none | Minimal, inline |
| **Light** | #F5F6FA | #1E3150 | none | Neutral, cancel |
| **Shadow** | brand color | white | none + shadow | Elevated CTA |

**Size scale (apply to ALL interactive elements):**
| Size | Height | paddingX | fontSize | cornerRadius |
|------|--------|----------|----------|--------------|
| sm | 32px | 12px | 12px | 8px |
| md | 40px | 16px | 14px | 12px |
| lg | 48px | 24px | 16px | 14px |

### Rule 16 — Consistent Spacing Scale (MANDATORY)
Use ONLY these spacing values. Never use random pixel values.
\`\`\`
4px   — tight: icon-to-text gap, badge padding
8px   — compact: between related items, small card padding
12px  — default: standard item spacing, input padding
16px  — comfortable: section padding, card content padding
20px  — relaxed: between card sections
24px  — spacious: page padding, major section gaps
32px  — large: between major page sections
48px  — hero: top/bottom of hero sections, major breaks
\`\`\`

### Rule 17 — Border Radius Consistency (MANDATORY)
Match radius to element size. NEVER use random radius values.
| Element type | cornerRadius | Example |
|-------------|-------------|---------|
| Small chips/tags | 4-6px | Status badge, tag pill |
| Input fields | 8px | Text input, select |
| Buttons | 8-12px | All button variants |
| Cards | 12-16px | Content cards, modals |
| Large panels | 16-24px | Side panels, bottom sheets |
| Full round | 9999px | Avatar, circular icon bg, pills |

**Nested radius rule:** Inner element radius = outer radius - padding.
Example: Card radius 16px, padding 8px → inner element radius = 8px.

### Rule 18 — Shadow/Elevation System (MANDATORY)
Use consistent shadows for depth hierarchy. Never mix random shadow values.
| Level | Effect | Usage |
|-------|--------|-------|
| **flat** | No shadow | Inline elements, flat cards |
| **sm** | 0 1px 2px rgba(0,0,0,0.05) | Subtle lift: inputs, chips |
| **md** | 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06) | Cards, dropdowns |
| **lg** | 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05) | Modals, popovers, floating |

For dark themes: use border (1px #2A2B45) instead of shadows — shadows are invisible on dark bg.

### Rule 19 — Semantic Color Usage (MANDATORY)
Colors must carry meaning. Never pick colors randomly.
| Role | Light theme | Dark theme | When to use |
|------|------------|------------|-------------|
| **Primary** | #006FEE | #338EF7 | Main CTA, active states, links |
| **Success** | #17C964 | #45D483 | Confirmations, positive values, online |
| **Warning** | #F5A524 | #F7B750 | Caution, pending, attention |
| **Danger** | #F31260 | #F54180 | Errors, destructive actions, offline |
| **Default** | #71717A | #A1A1AA | Neutral, secondary text, disabled |

**Foreground contrast rule:** Every semantic color must pair with white text (#FFFFFF) for WCAG AA (4.5:1 minimum contrast ratio).

### Rule 20 — Component State Indicators (MANDATORY)
All interactive elements must visually indicate their state:
| State | Visual change | How to implement |
|-------|--------------|-----------------|
| **Default** | Base appearance | Normal fills/colors |
| **Hover** | Slight darken or lighten (opacity 0.8-0.9) | Fill opacity change |
| **Pressed** | Scale down slightly + darken | Smaller size in Figma |
| **Focused** | 2px ring around element | Stroke with focus color |
| **Disabled** | 50% opacity, no interaction | opacity: 0.5 |
| **Loading** | Spinner replaces content/icon | Spinner SVG inside |

When designing in Figma: create one frame per state for interactive components.

---

## Design Library Tokens (defaults)

### Colors
| Token               | Hex       | Usage                    |
|---------------------|-----------|--------------------------|
| bg-base             | #0F1117   | Page/canvas background   |
| bg-surface          | #191C24   | Cards, side panels       |
| bg-elevated         | #1E2233   | Dividers, hover states   |
| accent-purple       | #6366F1   | Primary CTA, active nav  |
| positive-green      | #00C896   | Profit, success, LONG    |
| negative-red        | #FF4560   | Loss, error, SHORT       |
| text-primary        | #E8ECF4   | Headings, values         |
| text-secondary      | #6B7280   | Labels, captions         |
| border              | #1E2233   | Separators               |

### Text Styles
| Token        | Size | Weight   |
|--------------|------|----------|
| heading-2xl  | 32px | Bold     |
| heading-xl   | 24px | Bold     |
| heading-lg   | 20px | Bold     |
| heading-md   | 16px | SemiBold |
| body-md      | 14px | Regular  |
| body-sm      | 12px | Regular  |
| caption      | 11px | Regular  |
| label        | 11px | Medium   |

---

## ensure_library — Bootstrap the Design Library frame

\`\`\`js
// Creates "🎨 Design Library" frame if it doesn't exist.
// Returns { id, existed } — use .id to add components to it.
const lib = await figma.ensure_library();
\`\`\`

## get_library_tokens — Read all tokens from the library

\`\`\`js
// Returns { colors: [{name, hex}], textStyles: [{name, fontSize, fontWeight, fill}] }
const tokens = await figma.get_library_tokens();
\`\`\`

## setupDesignTokens — Bootstrap complete token system (idempotent)

\`\`\`js
// Creates collection + variables. Skips existing, updates values if name matches.
const result = await figma.setupDesignTokens({
  collectionName: "Design Tokens",     // name of variable collection
  colors: {                            // COLOR variables
    "accent": "#3B82F6",
    "bg-base": "#08090E",
    "positive": "#00DC82",
  },
  numbers: {                           // FLOAT variables (spacing, radius)
    "spacing-md": 16,
    "radius-md": 12,
  }
});
// → { collectionId, collectionName, created: [{name, id, type}], updated: [...], totalVariables }
\`\`\`

## modifyVariable — Change variable value (propagates to all bound nodes)

\`\`\`js
// By name (searches all collections)
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });

// By ID (faster, no search)
await figma.modifyVariable({ variableId: "VariableID:57:671", value: "#FF6B35" });

// Works for all types: COLOR (hex), FLOAT (number), STRING, BOOLEAN
await figma.modifyVariable({ variableName: "spacing-md", value: 20 });
// → { id, name, resolvedType, newValue }
\`\`\`

## applyVariable — Bind a variable to a node property

\`\`\`js
// Bind accent color to a frame's fill
await figma.applyVariable({ nodeId: "49:115", field: "fill", variableId: "VariableID:57:671" });

// Bind by variable name (slower, searches all collections)
await figma.applyVariable({ nodeId: "49:115", field: "fill", variableName: "accent" });

// Supported fields: fill, stroke, opacity, cornerRadius, width, height
// → { nodeId, nodeName, field, variableId, variableName }
\`\`\`

## createComponent — Convert frame to reusable component

\`\`\`js
var comp = await figma.createComponent({ nodeId: "49:200", name: "btn/primary" });
// → { id, name, key, width, height }

// Then instantiate anywhere:
await figma.instantiate({ componentId: comp.id, parentId: screen.id, x: 100, y: 200 });
// Or by name:
await figma.instantiate({ componentName: "btn/primary", parentId: screen.id, x: 100, y: 200 });
\`\`\`

## export_image — Export node as base64 PNG/JPG (for saving to disk)

\`\`\`js
// Export avatar at 2x scale as PNG
figma_read({ operation: "export_image", nodeId: "89:209", scale: 2, format: "png" })
// → { base64: "iVBORw0KGgo...", format: "png", width: 128, height: 128, nodeId: "89:209", sizeBytes: 4521 }

// Save to file: echo "<base64>" | base64 -d > avatar.png

// Export as JPG
figma_read({ operation: "export_image", nodeId: "89:209", format: "jpg", scale: 1 })
\`\`\`

**screenshot vs export_image:**
| | screenshot | export_image |
|---|-----------|-------------|
| **Purpose** | Visual preview in chat | Save asset to disk |
| **Output** | Inline image in Claude Code | base64 text string |
| **Format** | PNG only | PNG or JPG |
| **Scale** | default 1x | default 2x |
| **Use case** | "Show me the frame" | "Extract this avatar/icon/thumbnail" |

## get_node_detail — CSS-like properties for a single node

Query one node by ID or name. Returns CSS-mapped properties without tree traversal.
Much faster than parsing full \`get_design\` output to find one node.

\`\`\`js
figma_read({ operation: "get_node_detail", nodeId: "89:393" })
// → {
//   id: "89:393", name: "Header", type: "FRAME",
//   x: 0, y: 0, width: 440, height: 56,
//   fills: [{ type: "SOLID", color: "#FFFFFF" }],
//   stroke: "#E7EAF0", strokeWeight: 1, strokeAlign: "INSIDE",
//   borderRadius: "0px",
//   opacity: 1,
//   boxShadow: "0px 1px 3px 0px rgba(0,0,0,0.1)",
//   css: {
//     display: "flex", flexDirection: "row",
//     gap: "8px", alignItems: "center", justifyContent: "space-between",
//     padding: "8px 16px 8px 16px"
//   },
//   childCount: 3,
//   boundVariables: { fills: "VariableID:57:671" }
// }
\`\`\`

**TEXT node returns additional properties:**
\`\`\`js
figma_read({ operation: "get_node_detail", nodeId: "89:348" })
// → {
//   content: "8 đ 83 token",
//   color: "#1E3150",
//   fontSize: "14px", fontFamily: "Inter", fontWeight: "Semi Bold",
//   lineHeight: "20px", letterSpacing: "-0.2px",
//   textAlign: "left"
// }
\`\`\`

## Mixed Text Segments

TEXT nodes with multiple styles return a \`segments\` array:
\`\`\`js
// Input: "8 đ 83 token" where "8 đ" is bold and "83 token" is regular
// Output in get_design / get_selection:
{
  "type": "TEXT",
  "content": "8 đ 83 token",
  "mixedStyles": true,
  "segments": [
    { "text": "8 đ", "fill": "#1E3150", "fontWeight": "Bold", "fontSize": 14 },
    { "text": "83 token", "fill": "#8E9AAD", "fontWeight": "Regular", "fontSize": 14 }
  ]
}
\`\`\`

---

## AUTO LAYOUT (PREFERRED for centering — NON-NEGOTIABLE for complex containers)

Use Auto Layout instead of manual x/y math whenever a container has children that need centering.

### Creating an Auto Layout Frame
\`\`\`js
// Horizontal row: icon + text side by side, vertically centered
await figma.create({
  type: "FRAME", name: "Button",
  parentId: root.id,
  x: 24, y: 100, width: 392, height: 52,
  fill: "#6C5CE7", cornerRadius: 12,
  layoutMode: "HORIZONTAL",           // "HORIZONTAL" | "VERTICAL"
  primaryAxisAlignItems: "CENTER",     // main axis: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN"
  counterAxisAlignItems: "CENTER",     // cross axis: "MIN"|"CENTER"|"MAX"
  padding: 16,                        // uniform, or use paddingTop/Bottom/Left/Right
  itemSpacing: 8,                     // gap between children
})
// → Children added to this frame will auto-center!
\`\`\`

### Common patterns:
\`\`\`
// Button with centered text:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"

// Card with icon left + text right, vertically centered:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "CENTER", paddingLeft: 16, itemSpacing: 12

// Vertical stack (title + subtitle + button):
layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "STRETCH", itemSpacing: 8

// Centered icon in a circle/square:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
\`\`\`

### Child properties:
\`\`\`js
// Make child fill parent width in vertical layout:
await figma.create({ ..., layoutAlign: "STRETCH" })

// Make child grow to fill available space:
await figma.create({ ..., layoutGrow: 1 })
\`\`\`

### Modify existing frame to auto-layout:
\`\`\`js
await figma.modify({ id: frameId, layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER" })
\`\`\`

### RULE: Always use Auto Layout for:
- Buttons (text must be centered)
- Cards with icon + text rows
- Tab bar items
- List items
- Any container where children must be centered
- Badge pills with text

### FALLBACK: Manual math (only when Auto Layout is inappropriate)
\`\`\`
icon_x = container_x + (container_w - icon_size) / 2
text_x = button_x + (button_w - text_w_estimate) / 2
\`\`\`

---

## DOT + TEXT / ICON + TEXT ROW ALIGNMENT RULE (MANDATORY)
When placing a small element (dot, icon, bullet) next to text in a horizontal row:

**ALWAYS use \`counterAxisAlignItems: "CENTER"\`** so items are vertically centered with each other.

\`\`\`
CORRECT:
layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER", itemSpacing: 12
→ dot (8px) and text (22px line-height) are vertically aligned

WRONG:
counterAxisAlignItems: "MIN"
→ dot sits at top, text at top — dot appears higher than text center
\`\`\`

| Pattern | Layout | Cross Axis | When to use |
|---------|--------|------------|-------------|
| Dot + single-line text | HORIZONTAL | CENTER | Bullet points, list items |
| Icon + single-line text | HORIZONTAL | CENTER | Menu items, labels |
| Icon + multi-line text | HORIZONTAL | MIN + paddingTop on icon | Descriptions, cards |
| Badge + text | HORIZONTAL | CENTER | Tags, status indicators |

**Multi-line exception:** If text wraps to 2+ lines and dot/icon should align with the FIRST line only:
\`\`\`
counterAxisAlignItems: "MIN"
icon paddingTop = (textLineHeight - iconSize) / 2
Example: text 22px line-height, dot 8px → paddingTop = (22 - 8) / 2 = 7
\`\`\`

---

## PROGRESS BAR RULE (MANDATORY — CRITICAL)
Progress bars require TWO rectangles overlapping: track (full width bg) + fill (partial width foreground).
**Auto-layout frames stack children sequentially**, so placing both rectangles inside auto-layout will show them SIDE BY SIDE, not overlapping.

**ALWAYS wrap progress bars in a non-auto-layout frame:**
\`\`\`js
// CORRECT: wrapper frame WITHOUT layoutMode → children overlap via absolute x,y
var pbWrap = await figma.create({
  type: "FRAME", name: "progress-bar", parentId: autoLayoutParent.id,
  width: 352, height: 6
  // NO layoutMode here!
});
await figma.create({ type: "RECTANGLE", name: "progress-track", parentId: pbWrap.id, x: 0, y: 0, width: 352, height: 6, fill: "#E7EAF0", cornerRadius: 3 });
await figma.create({ type: "RECTANGLE", name: "progress-fill", parentId: pbWrap.id, x: 0, y: 0, width: 211, height: 6, fill: "#6C5CE7", cornerRadius: 3 });

// WRONG: both rectangles directly in auto-layout → they sit next to each other
await figma.create({ type: "RECTANGLE", parentId: autoLayoutFrame.id, width: 352, height: 6, fill: "#E7EAF0" });
await figma.create({ type: "RECTANGLE", parentId: autoLayoutFrame.id, width: 211, height: 6, fill: "#6C5CE7" });
// ↑ These will NOT overlap — they'll be placed 352px + 211px = 563px total width!
\`\`\`

**This rule applies to ANY overlapping elements inside auto-layout:** score rings, slider tracks, overlay badges, etc.
Use a non-auto-layout wrapper frame whenever children must overlap.

---

## BADGE / PILL / TAG RULE (MANDATORY — TWO CONCERNS)
Badges have TWO separate concerns: (1) text centering INSIDE badge, (2) badge POSITION on parent.

**Concern 1 — Text inside badge: ALWAYS use auto-layout CENTER/CENTER**
\`\`\`js
// CORRECT: Auto-layout frame → text auto-centers inside badge
var badge = await figma.create({
  type: "FRAME", name: "badge", parentId: parent.id,
  x: 100, y: 10, width: 64, height: 20,
  fill: "#E8FBF5", cornerRadius: 10,
  layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER",   // centers text horizontally
  counterAxisAlignItems: "CENTER"    // centers text vertically
});
await figma.create({ type: "TEXT", parentId: badge.id, content: "Free", fontSize: 10, fontWeight: "SemiBold", fill: "#00B894" });

// WRONG: Separate rectangle + text → text never properly centered
\`\`\`

**Concern 2 — Badge position on card: use absolute x,y on PARENT (not inside card auto-layout)**
\`\`\`js
// Badge at top-right corner of a card:
// badgeX = cardX + cardWidth - badgeWidth - margin (e.g. 6px)
// badgeY = cardY + margin (e.g. 6px)
var badge = await figma.create({
  ..., parentId: rootFrame.id,    // parent is ROOT, not the card!
  x: cardX + cardWidth - 64 - 6, // top-right corner
  y: cardY + 6,
  ...
});
// Badge is a sibling of the card, overlapping its top-right corner via absolute positioning.
// Do NOT put badge inside the card's auto-layout — it will be stacked with other children!
\`\`\`

**This applies to:** badges, pills, tags, labels, small buttons, notification dots with numbers, level indicators.

---

## Images & Icons (Server-side helpers — NO bash/curl needed)

### figma.loadImage(url, opts) — Download image and place on canvas
\`\`\`js
// Thumbnail image
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

### figma.loadIcon(name, opts) — Fetch SVG icon (auto fallback: Fluent → Bootstrap → Phosphor → Lucide)
\`\`\`js
await figma.loadIcon("chevron-left", { parentId: header.id, x: 16, y: 16, size: 22, fill: "#FFFFFF" });
await figma.loadIcon("bookmark",     { parentId: header.id, x: 398, y: 16, size: 22, fill: "#1E3150" });
await figma.loadIcon("play",         { parentId: btn.id, size: 24, fill: "#FFFFFF" });
\`\`\`

### figma.loadIconIn(name, opts) — Icon inside centered circle background
\`\`\`js
// 40px circle with jade bg at 10% opacity, 20px icon inside centered
await figma.loadIconIn("check", {
  parentId: card.id, containerSize: 40, fill: "#00B894", bgOpacity: 0.1
});
\`\`\`

### Legacy (still works but prefer helpers above)
\`type: "IMAGE"\` with \`imageData\` (base64) — use only when you already have base64 data.
\`type: "SVG"\` with \`svg\` string — use only when you have custom SVG markup.

---

## SVG Icons

Use \`type: "SVG"\` with \`svg\` param containing SVG markup string.
Replace \`fill="currentColor"\` or \`stroke="currentColor"\` with desired color before sending.

### ICON LIBRARY PRIORITY (MANDATORY)
Always try libraries in this order. If icon not found in first, fallback to next:

| Priority | Library | Style | URL Pattern | Fill Type |
|----------|---------|-------|-------------|-----------|
| 1st | **Fluent UI** | Win11 Filled | \`https://unpkg.com/@fluentui/svg-icons/icons/{name}_24_filled.svg\` | \`fill\` |
| 2nd | **Bootstrap** | Filled | \`https://unpkg.com/bootstrap-icons@1.11.3/icons/{name}-fill.svg\` | \`fill\` |
| 3rd | **Phosphor** | Filled | \`https://unpkg.com/@phosphor-icons/core@latest/assets/fill/{name}-fill.svg\` | \`fill\` |
| 4th | **Lucide** | Outline | \`https://unpkg.com/lucide-static@0.577.0/icons/{name}.svg\` | \`stroke\` |

**Naming differences between libraries:**
| Concept | Fluent UI | Bootstrap | Phosphor | Lucide |
|---------|-----------|-----------|----------|--------|
| Home | \`home_24_filled\` | \`house-fill\` | \`house-fill\` | \`home\` |
| Bell | \`alert_24_filled\` | \`bell-fill\` | \`bell-fill\` | \`bell\` |
| User | \`person_24_filled\` | \`person-fill\` | \`user-fill\` | \`user\` |
| Star | \`star_24_filled\` | \`star-fill\` | \`star-fill\` | \`star\` |
| Book | \`book_24_filled\` | \`book-fill\` | \`book-open-fill\` | \`book-open\` |
| Search | \`search_24_filled\` | \`search\` | \`magnifying-glass-fill\` | \`search\` |
| Settings | \`settings_24_filled\` | \`gear-fill\` | \`gear-fill\` | \`settings\` |
| Check | \`checkmark_24_filled\` | \`check-circle-fill\` | \`check-circle-fill\` | \`check\` |
| Close | \`dismiss_24_filled\` | \`x-circle-fill\` | \`x-circle-fill\` | \`x\` |
| Arrow L | \`arrow_left_24_filled\` | \`arrow-left\` | \`arrow-left-fill\` | \`arrow-left\` |
| Arrow R | \`arrow_right_24_filled\` | \`arrow-right\` | \`arrow-right-fill\` | \`arrow-right\` |
| Fire | \`fire_24_filled\` | \`fire\` | \`fire-fill\` | \`flame\` |
| Trophy | \`trophy_24_filled\` | \`trophy-fill\` | \`trophy-fill\` | \`trophy\` |
| Clock | \`clock_24_filled\` | \`clock-fill\` | \`clock-fill\` | \`clock\` |
| Share | \`share_24_filled\` | \`share-fill\` | \`share-fill\` | \`share-2\` |
| Lock | \`lock_closed_24_filled\` | \`lock-fill\` | \`lock-fill\` | \`lock\` |
| Gift | \`gift_24_filled\` | \`gift-fill\` | \`gift-fill\` | \`gift\` |
| Heart | \`heart_24_filled\` | \`heart-fill\` | \`heart-fill\` | \`heart\` |
| Compass | \`compass_northwest_24_filled\` | \`compass-fill\` | \`compass-fill\` | \`compass\` |
| Grid | \`grid_24_filled\` | \`grid-fill\` | \`grid-four-fill\` | \`grid-2x2\` |
| Eye | \`eye_24_filled\` | \`eye-fill\` | \`eye-fill\` | \`eye\` |
| Bookmark | \`bookmark_24_filled\` | \`bookmark-fill\` | \`bookmark-simple-fill\` | \`bookmark\` |
| Play | \`play_24_filled\` | \`play-fill\` | \`play-fill\` | \`play\` |
| Chat | \`chat_24_filled\` | \`chat-fill\` | \`chat-circle-fill\` | \`message-circle\` |
| Lightning | \`flash_24_filled\` | \`lightning-fill\` | \`lightning-fill\` | \`zap\` |

### ICON COLORING RULE (MANDATORY)
Always pass \`fill\` param when creating SVG icons. Different libraries handle color differently:
- **Fluent UI**: No default fill attr → MUST pass \`fill\` param to color vectors
- **Bootstrap**: Uses \`fill="currentColor"\` → sed replacement + \`fill\` param
- **Phosphor**: Uses \`fill="currentColor"\` → sed replacement + \`fill\` param
- **Lucide**: Uses \`stroke="currentColor"\` → sed replacement + \`stroke\` via SVG markup

The plugin's SVG handler applies \`fill\` to ALL vector children, so always include it:
\`\`\`js
figma.create({ type: "SVG", svg: "...", fill: "#6C5CE7", ... })
\`\`\`

Icon color must match its context:
| Context | Icon Color | Example |
|---------|-----------|---------|
| On white/light bg | Brand color or \`#1E3150\` | Card icons, tab bar |
| On colored bg (button) | \`#FFFFFF\` | Button icons |
| On colored circle bg | Same as circle color | \`figma_icon_in\` |
| Inactive/disabled | \`#8E9AAD\` | Inactive tab, muted |
| Accent/CTA | \`#6C5CE7\` (purple) | Active state |
| Success | \`#00B894\` (jade) | Check marks |
| Warning/gold | \`#F0B429\` | Stars, rewards |
| Danger/alert | \`#FF6B6B\` (coral) | Notifications |

### ICON SIZING RULE (MANDATORY)
Icon must ALWAYS be smaller than its container. Use this ratio:
\`\`\`
icon_size = container_size * 0.5    (50% of container)
\`\`\`
| Container | Icon | Example |
|-----------|------|---------|
| 24px      | 12px | Small badge dot |
| 32px      | 16px | Letter circle in quiz |
| 36px      | 18px | Header action circle |
| 40px      | 20px | Card icon circle |
| 44px      | 22px | Standard icon bg |
| 48px      | 24px | Large icon bg |
| 56px      | 28px | Hero icon |
| 64px      | 32px | Featured icon |
| 80px      | 40px | Splash/celebration |

**NEVER** set icon_size >= container_size. If icon overflows container, it looks broken.
When using \`figma_center\` wrapper for icon, calculate: \`figma_center(..., container_size, ...)\` then \`figma_icon(..., container_size * 0.5, ...)\`.

---

All figma operations are async. Always use \`await\`.

---

## Pages

\`\`\`js
await figma.listPages()
// → [{ id, name }, ...]

await figma.setPage({ name: "Dashboard" })     // switch to existing page
await figma.createPage({ name: "Signals" })    // create new page (no-op if exists)
\`\`\`

---

## Query nodes

\`\`\`js
await figma.query({ type: "FRAME" })           // all frames on current page
await figma.query({ name: "Sidebar" })         // by name
await figma.query({ id: "123:456" })           // by id
// → [{ id, name, type, x, y, width, height, parentId }]
\`\`\`

---

## Create — returns { id, name, type, x, y, width, height }

### FRAME  (artboard / container)
\`\`\`js
const f = await figma.create({
  type: "FRAME", name: "Screen",
  x: 0, y: 0, width: 1440, height: 900,
  fill: "#ffffff",            // hex color (optional)
  cornerRadius: 0,            // (optional)
  stroke: "#e2e8f0",          // border color (optional)
  strokeWeight: 1,
})
\`\`\`

### RECTANGLE  (card, badge, divider)
\`\`\`js
await figma.create({
  type: "RECTANGLE", name: "Card",
  parentId: f.id,
  x: 24, y: 80, width: 280, height: 120,
  fill: "#1e293b", cornerRadius: 12,
  stroke: "#334155", strokeWeight: 1,
})
\`\`\`

### ELLIPSE  (avatar, dot, chart node)
\`\`\`js
await figma.create({
  type: "ELLIPSE", name: "Status Dot",
  parentId: f.id,
  x: 12, y: 12, width: 8, height: 8,
  fill: "#22c55e",
})
\`\`\`

### LINE  (horizontal/vertical divider)
\`\`\`js
await figma.create({
  type: "LINE", name: "Divider",
  parentId: f.id,
  x: 0, y: 64, width: 240, height: 0,
  stroke: "#1e293b", strokeWeight: 1,
})
\`\`\`

### TEXT
\`\`\`js
await figma.create({
  type: "TEXT", name: "Heading",
  parentId: f.id,
  x: 24, y: 24,
  content: "Total Balance",
  fontSize: 14,
  fontWeight: "SemiBold",     // Regular | Medium | SemiBold | Bold | Light
  fill: "#f8fafc",
  lineHeight: 20,             // pixels (optional)
})
\`\`\`

### VECTOR  (diagonal lines, curves, bezier paths, arcs, custom shapes)
Use SVG path data syntax (\`d\` attribute) to draw any shape: diagonal lines, curves, arcs, polygons, waves.
\`\`\`js
// Diagonal line from top-left to bottom-right
await figma.create({
  type: "VECTOR", name: "Diagonal",
  parentId: f.id,
  x: 0, y: 0, width: 200, height: 100,
  d: "M 0 0 L 200 100",       // SVG path data
  stroke: "#ff0000", strokeWeight: 2,
})

// Smooth bezier curve (cubic)
await figma.create({
  type: "VECTOR", name: "Smooth Curve",
  parentId: f.id,
  x: 0, y: 0, width: 300, height: 150,
  d: "M 0 150 C 75 0, 225 0, 300 150",
  stroke: "#0e7c3a", strokeWeight: 3,
  strokeCap: "ROUND",         // NONE | ROUND | SQUARE | ARROW_LINES | ARROW_EQUILATERAL
  strokeJoin: "ROUND",        // MITER | BEVEL | ROUND
})

// Quadratic bezier curve
await figma.create({
  type: "VECTOR", name: "Quad Curve",
  parentId: f.id,
  x: 0, y: 0, width: 200, height: 100,
  d: "M 0 100 Q 100 0 200 100",
  stroke: "#6366F1", strokeWeight: 2,
})

// Filled wave / decorative shape
await figma.create({
  type: "VECTOR", name: "Wave",
  parentId: f.id,
  x: 0, y: 0, width: 440, height: 80,
  d: "M 0 40 C 110 0, 220 80, 330 40 C 385 20, 420 30, 440 40 L 440 80 L 0 80 Z",
  fill: "#0e7c3a",
})

// Arc (partial ellipse)
await figma.create({
  type: "VECTOR", name: "Arc",
  parentId: f.id,
  x: 0, y: 0, width: 200, height: 100,
  d: "M 0 100 A 100 100 0 0 1 200 100",
  stroke: "#FF4560", strokeWeight: 3,
  strokeCap: "ROUND",
})

// Multiple paths in one vector
await figma.create({
  type: "VECTOR", name: "Multi Path",
  parentId: f.id,
  x: 0, y: 0, width: 100, height: 100,
  paths: [
    { d: "M 0 0 L 100 100", windingRule: "NONZERO" },
    { d: "M 100 0 L 0 100", windingRule: "NONZERO" },
  ],
  stroke: "#000000", strokeWeight: 2,
})
\`\`\`

**SVG Path Data cheatsheet:**
| Command | Meaning | Example |
|---------|---------|---------|
| \`M x y\` | Move to point | \`M 0 0\` — start at origin |
| \`L x y\` | Line to point | \`L 100 50\` — diagonal line |
| \`H x\` | Horizontal line | \`H 200\` — horizontal to x=200 |
| \`V y\` | Vertical line | \`V 100\` — vertical to y=100 |
| \`C x1 y1 x2 y2 x y\` | Cubic bezier | \`C 50 0, 150 100, 200 50\` — S-curve |
| \`Q x1 y1 x y\` | Quadratic bezier | \`Q 100 0 200 100\` — simple curve |
| \`A rx ry rot large-arc sweep x y\` | Arc | \`A 50 50 0 0 1 100 0\` — half circle |
| \`Z\` | Close path | Connect back to start point |

**Lowercase** = relative coordinates (e.g. \`l 100 50\` = line 100px right, 50px down from current point).

---

## Modify

\`\`\`js
await figma.modify({ id: f.id, fill: "#0f172a" })
await figma.modify({ name: "Card", width: 300, cornerRadius: 16 })
await figma.modify({ id: "123:456", content: "New text", fontSize: 16 })
await figma.modify({ id: "123:456", fontFamily: "SF Pro", fontWeight: "Bold" })
\`\`\`

---

## Delete

\`\`\`js
await figma.delete({ id: "123:456" })
await figma.delete({ name: "Old Frame" })
\`\`\`

---

## Components

\`\`\`js
await figma.listComponents()
// → [{ id, name, key }]

await figma.instantiate({ componentId: "c:123", parentId: f.id, x: 0, y: 0 })
\`\`\`

---

## Read operations (also available in figma_write for chaining)

\`\`\`js
// Get selected node design data
const { nodes } = await figma.get_selection();
console.log(JSON.stringify(nodes[0], null, 2));

// Screenshot a frame
const { dataUrl } = await figma.screenshot({ id: f.id, scale: 2 });

// Top-level frames on current page
const { nodes: frames } = await figma.get_page_nodes();

// Get all local styles (paint, text, effect, grid)
const styles = await figma.get_styles();
// → { paintStyles: [{id, name, hex}], textStyles: [{id, name, fontSize, fontFamily, fontWeight}], effectStyles, gridStyles }

// Get enhanced component listing with properties
const comps = await figma.get_local_components();
// → { components: [{id, name, key, description, width, height, properties}], componentSets, total }

// Get current viewport position and zoom
const vp = await figma.get_viewport();
// → { center: {x, y}, zoom, bounds: {x, y, width, height} }

// Read Figma local variables (Design Tokens)
const vars = await figma.get_variables();
// → { collections: [{id, name, modes, variables: [{id, name, resolvedType, values, description}]}] }
\`\`\`

---

## New write operations

### Clone — duplicate a node
\`\`\`js
const copy = await figma.clone({ id: "123:456", x: 500, y: 0, name: "Card Copy" });
// Optionally move to different parent:
await figma.clone({ id: "123:456", parentId: otherFrame.id });
\`\`\`

### Group / Ungroup
\`\`\`js
// Group multiple nodes
const group = await figma.group({ nodeIds: ["1:2", "1:3", "1:4"], name: "Header Group" });

// Ungroup — children moved to parent, group removed
const { ungrouped } = await figma.ungroup({ id: group.id });
\`\`\`

### Flatten — merge vectors
\`\`\`js
const flat = await figma.flatten({ id: "1:2" });
\`\`\`

### Resize
\`\`\`js
await figma.resize({ id: "1:2", width: 500, height: 300 });
\`\`\`

### Set Selection — programmatically select nodes
\`\`\`js
await figma.set_selection({ nodeIds: ["1:2", "1:3"] });
\`\`\`

### Set Viewport — navigate to specific area
\`\`\`js
// Zoom to fit a specific node
await figma.set_viewport({ nodeId: "1:2" });
await figma.set_viewport({ nodeName: "Dashboard" });

// Manual position + zoom
await figma.set_viewport({ center: { x: 500, y: 300 }, zoom: 0.5 });
\`\`\`

### Batch — execute multiple operations in one call
\`\`\`js
// Up to 50 operations per batch — much faster than individual calls
const result = await figma.batch({
  operations: [
    { operation: "create", params: { type: "RECTANGLE", parentId: f.id, x: 0, y: 0, width: 100, height: 100, fill: "#ff0000" } },
    { operation: "create", params: { type: "TEXT", parentId: f.id, x: 10, y: 10, content: "Hello", fontSize: 14, fill: "#ffffff" } },
    { operation: "modify", params: { id: "1:5", fill: "#00ff00" } },
  ]
});
// → { results: [{index, operation, success, data}], total: 3, succeeded: 3 }
\`\`\`

### Design Tokens — Variables, Styles, Components (v1.7.0)

#### createVariableCollection — create a named collection
\`\`\`js
// Create collections to organize variables
var colors = await figma.createVariableCollection({ name: "Colors" });
var spacing = await figma.createVariableCollection({ name: "Spacing" });
// → { id: "VariableCollectionId:123", name: "Colors", modes: [{ id: "...", name: "Mode 1" }] }
\`\`\`

#### createVariable — create a variable in a collection
\`\`\`js
// COLOR variable — pass hex string, auto-converts to RGBA
var bgBase = await figma.createVariable({
  name: "bg-base",
  collectionId: colors.id,    // or collection name: "Colors"
  resolvedType: "COLOR",      // COLOR | FLOAT | STRING | BOOLEAN
  value: "#08090E"
});

// FLOAT variable for spacing
var spaceMd = await figma.createVariable({
  name: "space-md",
  collectionId: spacing.id,
  resolvedType: "FLOAT",
  value: 16
});
// → { id: "VariableID:456", name: "bg-base", resolvedType: "COLOR", collectionId: "..." }
\`\`\`

#### applyVariable — bind variable to a node property
\`\`\`js
// Bind fill color to variable — change variable later → all bound nodes update
await figma.applyVariable({
  nodeId: card.id,
  field: "fill",           // fill | stroke | opacity | cornerRadius | width | height
  variableName: "bg-base"  // or variableId: bgBase.id
});

// Bind stroke to variable
await figma.applyVariable({
  nodeId: card.id,
  field: "stroke",
  variableName: "border-color"
});
\`\`\`

#### createPaintStyle — create reusable paint style
\`\`\`js
var primaryStyle = await figma.createPaintStyle({
  name: "color/primary",     // use slash naming for organization
  color: "#006FEE",
  description: "Primary brand color"
});
// → { id: "S:...", name: "color/primary", key: "...", color: "#006FEE" }
\`\`\`

#### createTextStyle — create reusable text style
\`\`\`js
var headingStyle = await figma.createTextStyle({
  name: "text/heading-xl",
  fontFamily: "Inter",
  fontWeight: "Bold",        // Regular | Medium | SemiBold | Bold | Heavy
  fontSize: 24,
  lineHeight: 32,            // px number, "auto", or "150%"
  letterSpacing: -0.5,       // px
  description: "Page headings"
});
// → { id: "S:...", name: "text/heading-xl", key: "...", fontSize: 24 }
\`\`\`

#### createComponent — convert frame to reusable component
\`\`\`js
// First create a frame with desired design
var btnFrame = await figma.create({
  type: "FRAME", name: "btn/primary",
  width: 120, height: 40, fill: "#006FEE", cornerRadius: 12,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
});
await figma.create({ type: "TEXT", parentId: btnFrame.id, content: "Button", fontSize: 14, fontWeight: "SemiBold", fill: "#FFFFFF" });

// Convert to component — now reusable via instantiate()
var btnComp = await figma.createComponent({ nodeId: btnFrame.id, name: "btn/primary" });
// → { id: "...", name: "btn/primary", key: "...", width: 120, height: 40 }

// Use it everywhere
var btn1 = await figma.instantiate({ componentId: btnComp.id, parentId: form.id, x: 0, y: 100 });
var btn2 = await figma.instantiate({ componentId: btnComp.id, parentId: card.id, x: 16, y: 200 });
// Edit original component → all instances update automatically
\`\`\`

#### Full Design Token Workflow
\`\`\`js
// 1. Create variable collections
var colors = await figma.createVariableCollection({ name: "Brand Colors" });
var spacing = await figma.createVariableCollection({ name: "Spacing" });

// 2. Define variables
await figma.createVariable({ name: "primary", collectionId: colors.id, resolvedType: "COLOR", value: "#006FEE" });
await figma.createVariable({ name: "bg-card", collectionId: colors.id, resolvedType: "COLOR", value: "#FFFFFF" });
await figma.createVariable({ name: "text-primary", collectionId: colors.id, resolvedType: "COLOR", value: "#1E3150" });
await figma.createVariable({ name: "md", collectionId: spacing.id, resolvedType: "FLOAT", value: 16 });

// 3. Create paint + text styles
await figma.createPaintStyle({ name: "color/primary", color: "#006FEE" });
await figma.createTextStyle({ name: "text/body", fontFamily: "Inter", fontWeight: "Regular", fontSize: 14, lineHeight: 22 });

// 4. Build UI and bind variables
var card = await figma.create({ type: "FRAME", width: 300, height: 200, fill: "#FFFFFF", cornerRadius: 12 });
await figma.applyVariable({ nodeId: card.id, field: "fill", variableName: "bg-card" });

// 5. Rebrand later? Just change the variable — everything updates!
\`\`\`

---

## Workflow example — Draw a full screen

\`\`\`js
// 1. Switch page
await figma.createPage({ name: "Dashboard" });
await figma.setPage({ name: "Dashboard" });

// 2. Root frame
const root = await figma.create({
  type: "FRAME", name: "Dashboard",
  x: 0, y: 0, width: 1440, height: 900, fill: "#0f172a",
});

// 3. Sidebar
const sidebar = await figma.create({
  type: "FRAME", name: "Sidebar",
  parentId: root.id,
  x: 0, y: 0, width: 240, height: 900,
  fill: "#1e293b", stroke: "#334155", strokeWeight: 1,
});

// 4. Nav item
const navItem = await figma.create({
  type: "RECTANGLE", name: "Nav Active",
  parentId: sidebar.id,
  x: 8, y: 88, width: 224, height: 40,
  fill: "#3b82f6", cornerRadius: 8, opacity: 0.15,
});

await figma.create({
  type: "TEXT", name: "Nav Label",
  parentId: sidebar.id,
  x: 48, y: 100,
  content: "Dashboard",
  fontSize: 13, fontWeight: "Medium", fill: "#f8fafc",
});

// 5. Continue building sections…
console.log("Root frame id:", root.id);
\`\`\`

---

## Figma Plugin Sandbox Limitations
The plugin JS sandbox does NOT support:
- Optional chaining \`?.\` → use \`x ? x.y : null\`
- Nullish coalescing \`??\` → use \`x !== undefined ? x : default\`
- Object spread \`{...obj}\` → use \`Object.assign({}, obj)\`
- \`require\`, \`fetch\`, \`setTimeout\`, \`process\`, \`fs\`

---

## Tips
- Build iteratively: one section at a time
- Use \`console.log(node.id)\` to inspect returned IDs
- Use \`figma.query()\` to find existing nodes before modifying
- Each \`figma.*\` call = one HTTP round-trip — keep code sequential
`;
