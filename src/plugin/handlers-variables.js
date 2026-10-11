// ─── HANDLERS VARIABLES ───
// Variable collection and variable creation.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.createVariableCollection = async function(params) {
  var name = params.name;
  if (!name) throw new Error("Collection name is required");

  var collection = figma.variables.createVariableCollection(name);
  return {
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
  };
};

// createVariable — create a variable in a collection
// Supports COLOR, FLOAT, STRING, BOOLEAN
handlers.createVariable = async function(params) {
  var name = params.name;
  var collectionId = params.collectionId;
  var resolvedType = params.resolvedType || "COLOR";
  var value = params.value;

  if (!name) throw new Error("Variable name is required");
  if (!collectionId) throw new Error("collectionId is required");

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  var variable = figma.variables.createVariable(name, collection, resolvedType);

  // Set value for default mode
  var modeId = collection.modes[0].modeId;
  if (resolvedType === "COLOR" && typeof value === "string") {
    variable.setValueForMode(modeId, hexToRgbA(value));
  } else if (value !== undefined) {
    variable.setValueForMode(modeId, value);
  }

  return {
    id: variable.id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    collectionId: collection.id,
  };
};

// addVariableMode — add a new mode to an existing variable collection
