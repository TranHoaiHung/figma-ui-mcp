// ─── HANDLERS SETUP TOKENS ───
// handlers.setupDesignTokens and its ref/literal resolution.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.setupDesignTokens = async function(params) {
  var collectionName = params.collectionName || "Design Tokens";
  var colors = params.colors || {};
  var numbers = params.numbers || {};
  var fontSizes = params.fontSizes || {};
  var fonts = params.fonts || {};
  var textStyles = params.textStyles || {};
  var requestedModes = params.modes || null;

  // Find or create collection
  var collection = null;
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var ci = 0; ci < allCollections.length; ci++) {
    if (allCollections[ci].name === collectionName) {
      collection = allCollections[ci]; break;
    }
  }
  if (!collection) {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  // Apply requested modes (rename default + add missing)
  if (Array.isArray(requestedModes) && requestedModes.length > 0) {
    var existingModes = collection.modes;
    if (existingModes.length >= 1 && existingModes[0].name !== requestedModes[0]) {
      try { collection.renameMode(existingModes[0].modeId, requestedModes[0]); }
      catch (e) {}
    }
    for (var rm = 1; rm < requestedModes.length; rm++) {
      var rmName = requestedModes[rm];
      var modeExists = false;
      for (var em = 0; em < collection.modes.length; em++) {
        if (collection.modes[em].name === rmName) { modeExists = true; break; }
      }
      if (!modeExists) {
        try { collection.addMode(rmName); } catch (e) {}
      }
    }
  }

  // Build modeName → modeId lookup
  var modesByName = {};
  for (var mi = 0; mi < collection.modes.length; mi++) {
    modesByName[collection.modes[mi].name] = collection.modes[mi].modeId;
  }
  var defaultModeId = collection.modes[0].modeId;

  // Read existing variables in this collection
  var existing = {};
  for (var vi = 0; vi < collection.variableIds.length; vi++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[vi]);
    if (v) existing[v.name] = v;
  }

  var created = [];
  var skipped = [];

  // Helper: apply scalar OR {modeName: value} spec to variable.
  // BUG-NUM-01/FONT-02: scalar values now apply to ALL modes (was: only default mode).
  // Previously, scalar numbers/strings on multi-mode collections left other modes at 0/null,
  // causing FLOAT to read as 0 in non-default modes and STRING to resolve as "String value".
  function applyVariableValue(variable, valueSpec, mapValueFn) {
    if (valueSpec && typeof valueSpec === "object" && !Array.isArray(valueSpec)) {
      var keys = Object.keys(valueSpec);
      for (var k = 0; k < keys.length; k++) {
        var mid = modesByName[keys[k]] || defaultModeId;
        variable.setValueForMode(mid, mapValueFn(valueSpec[keys[k]]));
      }
    } else {
      // Scalar — apply to every mode so non-default modes don't end up with placeholder values
      var mapped = mapValueFn(valueSpec);
      for (var mk = 0; mk < collection.modes.length; mk++) {
        variable.setValueForMode(collection.modes[mk].modeId, mapped);
      }
    }
  }

  // Create/update COLOR variables
  var colorNames = Object.keys(colors);
  for (var i = 0; i < colorNames.length; i++) {
    var cName = colorNames[i];
    var cVar = existing[cName];
    if (!cVar) {
      cVar = figma.variables.createVariable(cName, collection, "COLOR");
      created.push({ name: cName, id: cVar.id, type: "COLOR" });
    } else {
      skipped.push(cName);
    }
    applyVariableValue(cVar, colors[cName], function(hex) { return hexToRgbA(hex); });
  }

  // Create/update FLOAT variables (spacing, radius, etc.)
  var numNames = Object.keys(numbers);
  for (var n = 0; n < numNames.length; n++) {
    var numName = numNames[n];
    var numVar = existing[numName];
    if (!numVar) {
      numVar = figma.variables.createVariable(numName, collection, "FLOAT");
      created.push({ name: numName, id: numVar.id, type: "FLOAT" });
    } else {
      skipped.push(numName);
    }
    applyVariableValue(numVar, numbers[numName], function(v) { return Number(v); });
  }

  // Create/update FLOAT variables for fontSizes
  var fsNames = Object.keys(fontSizes);
  for (var fs = 0; fs < fsNames.length; fs++) {
    var fsName = fsNames[fs];
    var fsVar = existing[fsName];
    if (!fsVar) {
      fsVar = figma.variables.createVariable(fsName, collection, "FLOAT");
      created.push({ name: fsName, id: fsVar.id, type: "FLOAT" });
    } else {
      skipped.push(fsName);
    }
    applyVariableValue(fsVar, fontSizes[fsName], function(v) { return Number(v); });
  }

  // Create/update STRING variables for fonts
  var fontVarNames = Object.keys(fonts);
  for (var fn = 0; fn < fontVarNames.length; fn++) {
    var fontVarName = fontVarNames[fn];
    var fontVar = existing[fontVarName];
    if (!fontVar) {
      fontVar = figma.variables.createVariable(fontVarName, collection, "STRING");
      created.push({ name: fontVarName, id: fontVar.id, type: "STRING" });
    } else {
      skipped.push(fontVarName);
    }
    applyVariableValue(fontVar, fonts[fontVarName], function(v) { return String(v); });
  }

  // Re-read existing after creates so textStyles can reference new vars
  for (var vi2 = 0; vi2 < collection.variableIds.length; vi2++) {
    var v2 = await figma.variables.getVariableByIdAsync(collection.variableIds[vi2]);
    if (v2) existing[v2.name] = v2;
  }

  // Create/update TEXT STYLES with variable references
  var textStyleResults = [];
  var tsNames = Object.keys(textStyles);
  if (tsNames.length > 0) {
    // BUG-01: only use async API. Sync getLocalTextStyles throws under documentAccess: dynamic-page
    var existingTextStyles = {};
    var allStyles = await figma.getLocalTextStylesAsync();
    for (var as = 0; as < allStyles.length; as++) {
      existingTextStyles[allStyles[as].name] = allStyles[as];
    }

    for (var ts = 0; ts < tsNames.length; ts++) {
      var styleName = tsNames[ts];
      var spec = textStyles[styleName] || {};
      var style = existingTextStyles[styleName];
      var wasCreated = false;
      if (!style) {
        style = figma.createTextStyle();
        style.name = styleName;
        wasCreated = true;
      }

      var resolvedFamily = resolveRefOrLiteral(spec.fontFamily || "Inter", existing);
      var resolvedStyle = resolveRefOrLiteral(spec.fontWeight || "Regular", existing);
      var familyLiteral = typeof resolvedFamily === "string"
        ? resolvedFamily
        : getStringVarValue(resolvedFamily, defaultModeId) || "Inter";
      var styleLiteral = typeof resolvedStyle === "string"
        ? (FONT_STYLE_MAP[resolvedStyle] || resolvedStyle)
        : (FONT_STYLE_MAP[getStringVarValue(resolvedStyle, defaultModeId)] ||
           getStringVarValue(resolvedStyle, defaultModeId) || "Regular");

      try {
        await figma.loadFontAsync({ family: familyLiteral, style: styleLiteral });
      } catch (fontErr) {
        // BUG-FONT-01: system fonts like "SF Mono", "SF Pro" aren't in Figma's font registry.
        // Suggest a cloud-available replacement instead of cryptic "could not be loaded".
        try {
          await figma.loadFontAsync({ family: familyLiteral, style: "Regular" });
          styleLiteral = "Regular";
        } catch (regularErr) {
          var hint = "";
          var lower = familyLiteral.toLowerCase();
          if (lower.indexOf("sf mono") !== -1)  hint = " Figma cloud doesn't have SF Mono (macOS system font). Use JetBrains Mono, Roboto Mono, or Fira Code.";
          else if (lower.indexOf("sf pro") !== -1) hint = " Figma cloud doesn't have SF Pro (macOS system font). Use Inter, Manrope, or DM Sans.";
          else if (lower.indexOf("system-ui") !== -1 || lower.indexOf("-apple-system") !== -1) hint = " CSS system-ui keyword isn't a real font in Figma. Use Inter (closest cross-platform match).";
          throw new Error('Font "' + familyLiteral + ' ' + styleLiteral + '" not available in Figma.' + hint + ' Text style "' + styleName + '" not created.');
        }
      }
      style.fontName = { family: familyLiteral, style: styleLiteral };

      var sizeSpec = spec.fontSize;
      if (sizeSpec !== undefined) {
        var resolvedSize = resolveRefOrLiteral(sizeSpec, existing);
        if (typeof resolvedSize === "number") {
          style.fontSize = resolvedSize;
        } else if (resolvedSize && resolvedSize.resolvedType === "FLOAT") {
          style.fontSize = Number(resolvedSize.valuesByMode[defaultModeId]) || 14;
          try { style.setBoundVariable("fontSize", resolvedSize); } catch (e) {}
        } else {
          style.fontSize = 14;
        }
      }

      if (spec.lineHeight !== undefined) {
        if (spec.lineHeight === "auto" || spec.lineHeight === "AUTO") {
          style.lineHeight = { unit: "AUTO" };
        } else if (typeof spec.lineHeight === "string" && spec.lineHeight.indexOf("%") !== -1) {
          style.lineHeight = { unit: "PERCENT", value: parseFloat(spec.lineHeight) };
        } else {
          var lhNum = typeof spec.lineHeight === "number" ? spec.lineHeight : Number(spec.lineHeight);
          if (!isNaN(lhNum)) style.lineHeight = { unit: "PIXELS", value: lhNum };
        }
      }

      if (spec.letterSpacing !== undefined) {
        style.letterSpacing = { unit: "PIXELS", value: Number(spec.letterSpacing) };
      }

      // BUG-TS-01: explicit unbind when caller passes a literal font name,
      // so re-running setupDesignTokens without `fonts:` clears stale STRING bindings.
      if (typeof resolvedFamily === "string") {
        try { style.setBoundVariable("fontFamily", null); } catch (e) {}
      }
      if (typeof resolvedStyle === "string") {
        try { style.setBoundVariable("fontStyle", null); } catch (e) {}
      }
      if (typeof resolvedFamily !== "string" && resolvedFamily && resolvedFamily.resolvedType === "STRING") {
        try { style.setBoundVariable("fontFamily", resolvedFamily); } catch (e) {}
      }
      if (typeof resolvedStyle !== "string" && resolvedStyle && resolvedStyle.resolvedType === "STRING") {
        try { style.setBoundVariable("fontStyle", resolvedStyle); } catch (e) {}
      }

      textStyleResults.push({
        name: styleName,
        id: style.id,
        created: wasCreated,
        fontFamily: familyLiteral,
        fontStyle: styleLiteral,
      });
      if (wasCreated) created.push({ name: styleName, id: style.id, type: "TEXT_STYLE" });
      else skipped.push(styleName);
    }
  }

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
    created: created,
    updated: skipped,
    textStyles: textStyleResults,
    totalVariables: collection.variableIds.length,
  };
};

// resolveRefOrLiteral — return variable object if "{name}" reference, else literal
function resolveRefOrLiteral(value, existingVarsByName) {
  if (typeof value === "string") {
    var m = value.match(/^\{([^}]+)\}$/);
    if (m && existingVarsByName[m[1]]) return existingVarsByName[m[1]];
  }
  return value;
}

function getStringVarValue(variable, modeId) {
  try {
    var val = variable.valuesByMode[modeId];
    return typeof val === "string" ? val : null;
  } catch (e) { return null; }
}

// applyTextStyle — apply a text style by name to a TEXT node
