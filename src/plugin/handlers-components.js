// ─── HANDLERS COMPONENTS ───
// Component listing and instantiation.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.listComponents = async () => {
  await figma.loadAllPagesAsync();
  const comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  return comps.map(c => ({ id: c.id, name: c.name, key: c.key || null }));
};

// Expose Figma's loadAllPagesAsync so user code can opt-in before queries that
// span pages. Required when the plugin runs under documentAccess: dynamic-page
// (see plugin/manifest.json) — figma.root.findOne / findAll only sees pages
// that have been loaded. Internal handlers call this themselves where needed
// (listComponents, instantiate); this op lets user code do the same from
// figma_write blocks.
handlers.loadAllPagesAsync = async function() {
  await figma.loadAllPagesAsync();
  return { loaded: true, pageCount: figma.root.children.length };
};

handlers.instantiate = async function(params) {
  var componentId   = params.componentId   || null;
  var componentName = params.componentName || null;
  var parentId      = params.parentId      || null;
  var parentName    = params.parentName    || null;
  var x = params.x !== undefined ? params.x : 0;
  var y = params.y !== undefined ? params.y : 0;
  var overrides = params.overrides || null;

  // Under documentAccess: dynamic-page, figma.root.findOne only sees already-
  // loaded pages. Without this, lookup silently fails for any component that
  // lives on an unvisited page — even when called by id. listComponents does
  // the same dance for the same reason.
  await figma.loadAllPagesAsync();

  var comp = null;
  if (componentId) {
    comp = figma.root.findOne(function(n) { return n.id === componentId && n.type === "COMPONENT"; });
  } else if (componentName) {
    comp = figma.root.findOne(function(n) { return n.name === componentName && n.type === "COMPONENT"; });
  }
  if (!comp) throw new Error("Component " + (componentId || componentName) + " not found");

  var inst = comp.createInstance();
  inst.x = x;
  inst.y = y;

  var parent = parentId ? (await findNodeByIdAsync(parentId)) : (parentName ? findNodeByName(parentName) : null);
  if (parent) parent.appendChild(inst);

  if (overrides && typeof overrides === "object") {
    var overrideKeys = Object.keys(overrides);
    for (var oi = 0; oi < overrideKeys.length; oi++) {
      var layerName = overrideKeys[oi];
      var ov = overrides[layerName];
      // Use IIFE to capture layerName for synchronous findOne callback
      var target = (function(lName) {
        return inst.findOne(function(n) { return n.name === lName; });
      })(layerName);
      if (!target) continue;

      if (ov.text !== undefined && target.type === "TEXT") {
        await figma.loadFontAsync(target.fontName);
        target.characters = String(ov.text);
      }
      if (ov.fill !== undefined) {
        var fillNorm = normalizeHex(ov.fill);
        if (fillNorm) target.fills = solidFill(fillNorm);
      }
      if (ov.stroke !== undefined) {
        var strokeNorm = normalizeHex(ov.stroke);
        if (strokeNorm) target.strokes = solidStroke(strokeNorm);
      }
      if (ov.opacity    !== undefined) target.opacity    = ov.opacity;
      if (ov.visible    !== undefined) target.visible    = Boolean(ov.visible);
      if (ov.fontSize   !== undefined && target.type === "TEXT") {
        await figma.loadFontAsync(target.fontName);
        target.fontSize = ov.fontSize;
      }
      if (ov.cornerRadius !== undefined && "cornerRadius" in target) {
        target.cornerRadius = ov.cornerRadius;
      }
    }
  }

  return nodeToInfo(inst);
};
