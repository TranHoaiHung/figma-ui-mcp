// ─── DESIGN TOKEN OPERATIONS (v1.7.0) ───────────────────────────────────────

// ── Shared helpers ────────────────────────────────────────────────────────────

// T-1: Find variable collection by id OR name — replaces 6 duplicated loops
async function findCollectionAsync(collectionId) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      return collections[i];
    }
  }
  return null;
}

// T-2: Find variable by id OR name (with optional collectionId scope)
// Uses getLocalVariablesAsync() — 1 call instead of N getVariableByIdAsync calls
async function findVariableAsync(variableId, variableName, collectionId) {
  if (variableId) {
    var v = await figma.variables.getVariableByIdAsync(variableId);
    if (v) return v;
  }
  if (variableName) {
    var allVars = await figma.variables.getLocalVariablesAsync();
    for (var i = 0; i < allVars.length; i++) {
      var lv = allVars[i];
      if (!lv || lv.name !== variableName) continue;
      if (collectionId && lv.variableCollectionId !== collectionId) {
        // Also allow match by collection name
        var col = await figma.variables.getVariableCollectionByIdAsync(lv.variableCollectionId);
        if (!col || col.name !== collectionId) continue;
      }
      return lv;
    }
  }
  return null;
}

// T-5: hexToRgbA — preserves alpha from 8-char hex (#RRGGBBAA)
function hexToRgbA(hex) {
  var rgb = hexToRgb(hex); // existing util: returns {r,g,b} normalized 0-1
  var a = 1;
  if (hex && hex.length === 9) { // #RRGGBBAA
    a = parseInt(hex.slice(7, 9), 16) / 255;
  }
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: a };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// createVariableCollection — create a new variable collection
