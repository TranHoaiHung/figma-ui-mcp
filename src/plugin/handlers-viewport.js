// ─── HANDLERS VIEWPORT ───
// Viewport get/set and variable readout.
// Split out of handlers-read-detail.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.get_viewport = async function() {
  var vp = figma.viewport;
  return {
    center: { x: Math.round(vp.center.x), y: Math.round(vp.center.y) },
    zoom: vp.zoom,
    bounds: vp.bounds ? {
      x: Math.round(vp.bounds.x), y: Math.round(vp.bounds.y),
      width: Math.round(vp.bounds.width), height: Math.round(vp.bounds.height),
    } : null,
  };
};

// set_viewport — navigate to specific area
handlers.set_viewport = async function(params) {
  if (params.nodeId || params.nodeName) {
    // Zoom to fit a specific node
    var node = params.nodeId ? (await findNodeByIdAsync(params.nodeId)) : findNodeByName(params.nodeName);
    if (!node) throw new Error("Node not found for viewport navigation");
    figma.viewport.scrollAndZoomIntoView([node]);
    return { scrolledTo: node.id, name: node.name };
  }
  if (params.center) {
    figma.viewport.center = { x: params.center.x, y: params.center.y };
  }
  if (params.zoom !== undefined) {
    figma.viewport.zoom = params.zoom;
  }
  return {
    center: { x: Math.round(figma.viewport.center.x), y: Math.round(figma.viewport.center.y) },
    zoom: figma.viewport.zoom,
  };
};

// get_variables — read Figma local variables (Design Tokens)
handlers.get_variables = async function() {
  var collections = [];
  try {
    var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    // One bulk read instead of an awaited getVariableByIdAsync per variable:
    // a file with 500 variables used to cost 500 round trips.
    var allVars = await figma.variables.getLocalVariablesAsync();
    var varsById = {};
    for (var avi = 0; avi < allVars.length; avi++) varsById[allVars[avi].id] = allVars[avi];
    for (var ci = 0; ci < localCollections.length; ci++) {
      var col = localCollections[ci];
      var variables = [];
      for (var vi = 0; vi < col.variableIds.length; vi++) {
        var v = varsById[col.variableIds[vi]];
        if (!v) continue;
        var values = {};
        for (var modeId in v.valuesByMode) {
          if (Object.prototype.hasOwnProperty.call(v.valuesByMode, modeId)) {
            var val = v.valuesByMode[modeId];
            // Convert color values to hex
            if (val && typeof val === "object" && "r" in val && "g" in val && "b" in val) {
              values[modeId] = rgbToHex(val);
            } else {
              values[modeId] = val;
            }
          }
        }
        variables.push({
          id: v.id, name: v.name,
          resolvedType: v.resolvedType,
          values: values,
          description: v.description || "",
        });
      }
      collections.push({
        id: col.id, name: col.name,
        modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
        variables: variables,
      });
    }
  } catch(e) {
    return { error: "Variables API not available: " + e.message, collections: [] };
  }
  return { collections: collections };
};
