// ─── NODE BUILDERS MEDIA ───
// Node builders for media: svg, vector, image.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

function buildSvg(params, width, height, fill, stroke, strokeWeight) {
  var svgStr = params.svg;
  if (!svgStr) throw new Error("SVG type requires 'svg' param with SVG markup string");
  var node = figma.createNodeFromSvg(svgStr);
  if (width && height) node.resize(width, height);

  if ((fill || stroke) && node.findAll) {
    var allVectors = node.findAll(function(n) { return n.type === "VECTOR"; });
    for (var vi = 0; vi < allVectors.length; vi++) {
      var vec = allVectors[vi];
      var hasFill   = vec.fills   && vec.fills.length   > 0 && vec.fills[0].type === "SOLID";
      var hasStroke = vec.strokes && vec.strokes.length  > 0;
      if (fill) {
        if (hasFill || !hasStroke) vec.fills   = solidFill(fill);
        else                        vec.strokes = solidStroke(fill);
      }
      if (stroke) { vec.strokes = solidStroke(stroke); vec.strokeWeight = strokeWeight; }
    }
  }
  return node;
}

function buildVector(params, width, height, fill, stroke, strokeWeight) {
  var pathData = params.d || params.path;
  var pathsArr = params.paths;
  if (!pathData && !pathsArr) {
    throw new Error('VECTOR type requires "d" (path data string) or "paths" (array of {d, windingRule})');
  }

  var node = figma.createVector();
  try {
    node.resize(width, height);
    if (pathsArr && Array.isArray(pathsArr)) {
      node.vectorPaths = pathsArr.map(function(p) {
        var raw = typeof p === "string" ? p : p.d;
        return { data: normalizeSvgPath(raw), windingRule: (typeof p === "object" && p.windingRule) ? p.windingRule : "NONZERO" };
      });
    } else {
      node.vectorPaths = [{ data: normalizeSvgPath(pathData), windingRule: params.windingRule || "NONZERO" }];
    }
    // BUG-04: Figma resets bounding box to path geometry after setVectorPaths.
    // Re-apply resize() so the node matches the requested dimensions.
    if (width && height) node.resize(width, height);
    // BUG-02: VECTOR fill now supports gradient objects (same as FRAME/RECTANGLE)
    node.fills = fill ? buildFillArray(fill, params.fillOpacity) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (params.strokeCap)  node.strokeCap  = params.strokeCap;
    if (params.strokeJoin) node.strokeJoin = params.strokeJoin;
  } catch (vectorErr) {
    try { node.remove(); } catch(e) {}
    throw new Error("VECTOR path error: " + vectorErr.message + ". Check that 'd' is valid SVG path data (commas and A/arc are now supported).");
  }
  return node;
}

function buildImage(params, width, height, cornerRadius, stroke, strokeWeight) {
  var imgData = params.imageData;
  if (!imgData) throw new Error("IMAGE type requires 'imageData' param with base64 string");

  var strippedData = imgData.indexOf(",") !== -1 ? imgData.substring(imgData.indexOf(",") + 1) : imgData;
  var cleanData = strippedData.replace(/[^A-Za-z0-9+/=]/g, "");
  var outLen = Math.floor(cleanData.replace(/=/g, "").length * 3 / 4);
  var raw = new Uint8Array(outLen);
  var j = 0;
  for (var ci = 0; ci < cleanData.length; ci += 4) {
    // Use explicit undefined check — lookup['A']===0 is valid, lookup[undefined] must not default to 0
    var a = (_B64_LOOKUP[cleanData[ci]]     !== undefined) ? _B64_LOOKUP[cleanData[ci]]     : 0;
    var b = (_B64_LOOKUP[cleanData[ci + 1]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 1]] : 0;
    var c = (_B64_LOOKUP[cleanData[ci + 2]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 2]] : 0;
    var d = (_B64_LOOKUP[cleanData[ci + 3]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 3]] : 0;
    raw[j++] = (a << 2) | (b >> 4);
    if (j < outLen) raw[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < outLen) raw[j++] = ((c & 3) << 6) | d;
  }

  var image = figma.createImage(raw);
  var node = figma.createRectangle();
  node.resize(width, height);
  if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;
  node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: params.scaleMode || "FILL" }];
  if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
  return node;
}
