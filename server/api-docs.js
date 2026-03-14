export const DOCS = `
# figma-ui-mcp — Write API Reference (figma_write)

---

## ⚑ MANDATORY DESIGN SYSTEM RULES (read before every design task)

### Rule 1 — Design Library Frame
Before drawing any new design, ALWAYS:
1. Call \`figma.get_page_nodes()\` to check if a frame named **"🎨 Design Library"** exists on the current page
2. If it does NOT exist → call \`figma.ensure_library()\` to create it
3. If it exists → call \`figma.get_library_tokens()\` to read existing colors, text styles, and components
4. ONLY use colors, font sizes, and component patterns already defined in the library
5. If you need a new color or text style not in the library → add it to "🎨 Design Library" FIRST, then use it

### Rule 2 — Library Frame Structure
The "🎨 Design Library" frame lives at x: -2000, y: 0 (off-canvas, never on-screen).
It contains labeled sections:
- **Colors** — rectangles named "color/{name}" with the hex fill
- **Text Styles** — text nodes named "text/{role}" (e.g. text/heading-xl, text/body-sm)
- **Buttons** — frames named "btn/{variant}" (e.g. btn/primary, btn/danger)
- **Badges** — frames named "badge/{variant}"
- **Inputs** — frames named "input/{state}"
- **Cards** — frames named "card/{variant}"

### Rule 3 — Read selection when user refers to a frame
When user says "this frame", "the selected one", "bạn thấy không", "cái đang chọn":
→ Immediately call figma_read with operation "get_selection" to read what the user has selected in Figma.
Never assume which frame the user means — always read it first.

### Rule 5 — Visual QA after every design (self-check loop)
After finishing any design section, perform a self-QA pass:
1. Call \`figma_read\` with \`operation: "screenshot"\` on the root frame (scale: 0.4)
2. The base64 PNG is returned — Claude views it directly as an image
3. Analyze visually: check for overlapping elements, misaligned nodes, text overflow, off-canvas items
4. Cross-check coordinates via \`get_page_nodes\` — compare x/y/width/height of each node
5. If overlap found → call \`figma.modify({ id, x, y, width, height })\` to fix
6. Re-screenshot to confirm — repeat until clean
This loop runs automatically after every major draw step.

### Rule 4 — Naming convention
- Frame names: PascalCase (e.g. "Trading Dashboard", "Signal Card")
- Component names: kebab-case with type prefix (e.g. "btn/primary-lg", "badge/success")
- Color names: descriptive (e.g. "color/bg-surface", "color/accent-purple", "color/positive-green")

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

---

## Modify

\`\`\`js
await figma.modify({ id: f.id, fill: "#0f172a" })
await figma.modify({ name: "Card", width: 300, cornerRadius: 16 })
await figma.modify({ id: "123:456", content: "New text", fontSize: 16 })
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

## Tips
- Build iteratively: one section at a time
- Use \`console.log(node.id)\` to inspect returned IDs
- Use \`figma.query()\` to find existing nodes before modifying
- Each \`figma.*\` call = one HTTP round-trip — keep code sequential
`;
