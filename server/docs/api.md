
# figma-ui-mcp — API Reference (Create / Modify / Read / Ops)

---

## Pages
```js
await figma.listPages()                              // [{ id, name }, ...]
await figma.setPage({ name: "Dashboard" })           // switch page
await figma.createPage({ name: "Signals" })          // create (no-op if exists)
```

---

## Query nodes
```js
await figma.query({ type: "FRAME" })                 // all frames on current page
await figma.query({ name: "Sidebar" })               // by name
await figma.query({ id: "123:456" })                 // by id
// → [{ id, name, type, x, y, width, height, parentId }]
```

---

## Create — returns { id, name, type, x, y, width, height }

### FRAME
```js
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
```

### RECTANGLE
```js
await figma.create({ type: "RECTANGLE", name: "Card",
  parentId: f.id, x: 24, y: 80, width: 280, height: 120,
  fill: "#1e293b", cornerRadius: 12, stroke: "#334155", strokeWeight: 1 })
```

### ELLIPSE
```js
await figma.create({ type: "ELLIPSE", name: "Dot",
  parentId: f.id, x: 12, y: 12, width: 8, height: 8, fill: "#22c55e" })
```

### LINE
```js
await figma.create({ type: "LINE", name: "Divider",
  parentId: f.id, x: 0, y: 64, width: 240, height: 0,
  stroke: "#1e293b", strokeWeight: 1 })
```

### TEXT
```js
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
```

**TEXT sizing rules:**
- `width` + `height` both set → fixed box, dimensions respected (textAutoResize: "NONE")
- `width` only → auto-height wrapping (textAutoResize: "HEIGHT")
- Neither → hug content (textAutoResize: "WIDTH_AND_HEIGHT", default)

**Font baseline offset (Inter quirk):** Auto-layout CENTER may appear ~3-4px shifted upward due to Inter ascender whitespace.
Workaround: add `paddingBottom: 3` to the wrapper frame to visually re-center text.

### VECTOR (SVG paths, arcs, curves)

> ⚠️ **Known limitation:** Figma recalculates VECTOR bounding box from actual path geometry, ignoring specified `width`/`height`. For circular arcs that must align with an ELLIPSE, use `ELLIPSE` with `arcData` instead — it respects dimensions exactly.

```js
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
```

**SVG path cheatsheet:** M=move, L=line, H=horizontal, V=vertical, C=cubic, Q=quadratic, A=arc, Z=close

---

## Modify
```js
await figma.modify({ id: f.id, fill: "#0f172a" })
await figma.modify({ name: "Card", width: 300, cornerRadius: 16 })
await figma.modify({ id: "123:456", content: "New text", fontSize: 16 })
await figma.modify({ id: "123:456", fontFamily: "SF Pro", fontWeight: "Bold" })
await figma.modify({ id: "123:456", fontColor: "#428DE7" })  // alias for fill on text
await figma.modify({ id: "123:456", layoutMode: "NONE" })    // remove auto-layout
```

---

## Delete
```js
await figma.delete({ id: "123:456" })
await figma.delete({ name: "Old Frame" })
await figma.delete({ ids: ["1:1", "1:2", "1:3"] })  // batch delete
```

---

## Components
```js
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

// Cross-page document access (documentAccess: dynamic-page)
// listComponents and instantiate auto-call loadAllPagesAsync internally.
// If you run figma.query() / figma.modify() / your own findOne against a
// component that lives on an unvisited page, call this first or it will miss.
await figma.loadAllPagesAsync();   // → { loaded: true, pageCount: N }
```

---

## Node Operations
```js
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
```

---

## Batch — up to 50 mixed operations in one round-trip
```js
const result = await figma.batch([
  { operation: "create", params: { type: "RECTANGLE", parentId: f.id, width: 100, height: 100, fill: "#FF0000" } },
  { operation: "create", params: { type: "TEXT", parentId: f.id, content: "Hello", fontSize: 14, fill: "#FFFFFF" } },
  { operation: "modify", params: { id: "1:5", fill: "#00FF00" } },
  { operation: "delete", params: { id: "1:99" } },
  { operation: "delete", params: { ids: ["2:1", "2:2"] } },
]);
// → { results: [{index, operation, success, data}], total: 5, succeeded: 5 }
```

---

## Read Operations (also available in figma_write for chaining)
```js
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
```

**export_image:**
```js
figma_read({ operation: "export_image", nodeId: "89:209", scale: 2, format: "png" })
// → { base64: "...", format, width, height, sizeBytes }
```

**get_node_detail:**
```js
figma_read({ operation: "get_node_detail", nodeId: "89:393" })
// → { id, name, type, x, y, width, height, fills, stroke, borderRadius, css: {display,flexDirection,...}, boundVariables }
```

**get_css:**
```js
figma_read({ operation: "get_css", nodeId: "89:393" })
// → ready-to-paste CSS string: background, flex, border, radius, shadow, typography
```

**Design-to-code operations:**
```js
figma_read({ operation: "get_design_context", nodeId: "89:393" })
// → AI-optimized payload: flex layout, var(--token) fills, typography, component instances

figma_read({ operation: "get_component_map", nodeId: "89:393" })
// → all instances with componentSetName, variantLabel, suggestedImport path

figma_read({ operation: "get_unmapped_components", nodeId: "89:393" })
// → components without description (no code mapping) → prompt user for import paths
```

---

## Prototyping & Scroll
```js
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

// Component property definitions (master-side) — required so instance text
// overrides actually trigger auto-layout recalculation. Without binding a TEXT
// property to the child text layer, setting characters on the instance only
// changes content data; the layout won't re-measure for flexible width.
//
// Step 1: create the property on the master component
var prop = await figma.addComponentProperty({
  componentId: btnComponentId,
  name: "label",
  type: "TEXT",                       // "TEXT" | "BOOLEAN" | "INSTANCE_SWAP"
  defaultValue: "Click me",
});
// → { propertyName: "label#5:0", requestedName: "label", type: "TEXT", ... }

// Step 2: bind the property to the child TEXT node — this is the step that
// makes auto-layout actually re-measure on instance override.
await figma.bindComponentPropertyToText({
  textNodeId: btnLabelTextId,
  propertyName: "label",              // bare name OK — resolved to "label#5:0"
});

// Step 3: instantiate + drive the property — auto-layout will reflow here
var inst = await figma.instantiate({ componentName: "btn/primary", x: 100, y: 200 });
await figma.setComponentProperties({
  id: inst.id,
  properties: { "label": "A much longer button label" }   // bare name resolved
});
// → button width grows to fit the longer text (v2.5.24+ auto-promotes TEXT to HUG sizing)

// Read current property values on an instance
var props = await figma.getComponentProperties({ id: inst.id });
// → { id, name, properties: { "label#5:0": { type: "TEXT", value: "..." } } }

// Cleanup
await figma.removeComponentProperty({ componentId: btnComponentId, propertyName: "label" });

// ── Generic bindComponentProperty (BOOLEAN + INSTANCE_SWAP) — v2.5.22+ ─────
// bindComponentPropertyToText is TEXT-only. For BOOLEAN visibility or
// INSTANCE_SWAP icon slots, use the generic bindComponentProperty:
//
//   field          | required property type | accepted node type
//   ---------------+------------------------+---------------------
//   "characters"   | TEXT                   | TEXT
//   "visible"      | BOOLEAN                | any node
//   "mainComponent"| INSTANCE_SWAP          | INSTANCE

// BOOLEAN — toggle icon visibility from instance
await figma.addComponentProperty({
  componentId: cardComponentId, name: "showIcon", type: "BOOLEAN", defaultValue: true
});
await figma.bindComponentProperty({
  nodeId: iconNodeId, field: "visible", propertyName: "showIcon"
});

// INSTANCE_SWAP — swap nested icon component from instance
// defaultValue MUST be the local node ID of a COMPONENT (e.g. "123:456"),
// NOT a published component key. Get it from createComponent(...).id or listComponents().
var iconMaster = await figma.createComponent({ nodeId: iconFrameId, name: "icon/star" });
await figma.addComponentProperty({
  componentId: cardComponentId, name: "icon", type: "INSTANCE_SWAP",
  defaultValue: iconMaster.id    // ← node ID, not published key
});
await figma.bindComponentProperty({
  nodeId: iconInstanceId, field: "mainComponent", propertyName: "icon"
});

// Unbind a single field — preserves other refs on the same node
await figma.unbindComponentProperty({ nodeId: iconNodeId, field: "visible" });

// ── Cross-page component lookup (dynamic-page document access) — v2.5.24 ──
// Under documentAccess: dynamic-page, figma.root.findOne only sees pages the
// user has visited this session. listComponents and instantiate handle this
// automatically. For your own cross-page queries, call loadAllPagesAsync first:
await figma.loadAllPagesAsync();
var nodes = await figma.query({ namePattern: "btn/*" });
```

---

## Workflow — Apply Existing Project Styles (read first, then apply)
```js
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
```

---

## Workflow example — Draw a full screen
```js
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
```
