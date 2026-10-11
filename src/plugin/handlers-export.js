// ─── HANDLERS EXPORT ───
// Base64/UTF-8 helpers, screenshot, SVG and image export.
// Split out of handlers-read.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

var _B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function uint8ArrayToBase64(bytes) {
  var arr = (typeof Uint8Array !== "undefined" && !(bytes instanceof Uint8Array)) ? new Uint8Array(bytes) : bytes;
  var b64 = "";
  var len = arr.length;
  for (var j = 0; j < len; j += 3) {
    var b0 = arr[j];
    var b1 = j + 1 < len ? arr[j + 1] : 0;
    var b2 = j + 2 < len ? arr[j + 2] : 0;
    b64 += _B64_CHARS[b0 >> 2];
    b64 += _B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    b64 += j + 1 < len ? _B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    b64 += j + 2 < len ? _B64_CHARS[b2 & 63] : "=";
  }
  return b64;
}

// screenshot — export node as PNG base64 (v1.2.5)
handlers.screenshot = async function(params) {
  var id = params && params.id ? params.id : null;
  var nodeName = params && params.name ? params.name : null;
  var s = params && params.scale ? params.scale : 1;

  var page = figma.currentPage;
  var children = page.children;
  var node = null;
  var i;

  // Search by ID — deep search only (skip redundant top-level loop)
  if (id) {
    node = figma.currentPage.findOne(function(n) { return n.id === id; });
  }

  // Search by name — deep search only
  if (node === null && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  // Fallback: any exportable top-level node (FRAME, COMPONENT, COMPONENT_SET, SECTION)
  if (node === null) {
    var exportableTypes = ["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "INSTANCE", "GROUP"];
    for (i = 0; i < children.length; i++) {
      if (exportableTypes.indexOf(children[i].type) !== -1) { node = children[i]; break; }
    }
  }
  if (node === null) {
    return Promise.reject(new Error("[v1.2.5] No exportable node found. children=" + children.length));
  }

  // BUG-05 fix: nodes created in the current session may not have been rendered yet.
  // scrollAndZoomIntoView forces the Figma renderer to paint the node before exportAsync,
  // preventing blank/white PNG output on freshly-created nodes.
  try { figma.viewport.scrollAndZoomIntoView([node]); } catch(e) { /* non-fatal */ }

  try {
    var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: s } });
  } catch(exportErr) {
    return Promise.reject(new Error("[v1.9.1-export] " + exportErr.message + " type=" + node.type + " id=" + node.id));
  }

  try {
    return { dataUrl: "data:image/png;base64," + uint8ArrayToBase64(bytes), nodeId: node.id, width: node.width, height: node.height };
  } catch(encodeErr) {
    return Promise.reject(new Error("[v1.9.1-encode] " + encodeErr.message));
  }
};

// Manual UTF-8 decode for Figma sandbox (no TextDecoder available)
function uint8ArrayToString(arr) {
  var result = "";
  var i = 0;
  while (i < arr.length) {
    var byte1 = arr[i++];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if (byte1 < 0xE0) {
      var byte2 = arr[i++] & 0x3F;
      result += String.fromCharCode(((byte1 & 0x1F) << 6) | byte2);
    } else if (byte1 < 0xF0) {
      var byte2 = arr[i++] & 0x3F;
      var byte3 = arr[i++] & 0x3F;
      result += String.fromCharCode(((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3);
    } else {
      var byte2 = arr[i++] & 0x3F;
      var byte3 = arr[i++] & 0x3F;
      var byte4 = arr[i++] & 0x3F;
      var codePoint = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4;
      codePoint -= 0x10000;
      result += String.fromCharCode(0xD800 + (codePoint >> 10), 0xDC00 + (codePoint & 0x3FF));
    }
  }
  return result;
}

// Export node SVG — helper used by export_svg and inline icon extraction
async function exportNodeSvg(node) {
  var bytes = await node.exportAsync({ format: "SVG" });
  var arr = (typeof Uint8Array !== "undefined" && !(bytes instanceof Uint8Array)) ? new Uint8Array(bytes) : bytes;
  return uint8ArrayToString(arr);
}

// export_svg — export node as SVG string
handlers.export_svg = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  if (!node) node = figma.currentPage;
  if (!node) throw new Error("Node not found");
  var svg = await exportNodeSvg(node);
  return { svg: svg, nodeId: node.id, width: Math.round(node.width), height: Math.round(node.height) };
};

// export_image — export node as base64 PNG/JPG (for saving to disk, not for inline display)
handlers.export_image = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var format = (params && params.format) ? params.format.toUpperCase() : "PNG";
  var scale = (params && params.scale) ? params.scale : 2;

  if (format !== "PNG" && format !== "JPG") format = "PNG";

  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  if (!node) throw new Error("Node not found for export");

  // BUG-05 fix: same as screenshot — force render before export
  try { figma.viewport.scrollAndZoomIntoView([node]); } catch(e) { /* non-fatal */ }

  var bytes = await node.exportAsync({ format: format, constraint: { type: "SCALE", value: scale } });
  var b64 = uint8ArrayToBase64(bytes);

  return {
    base64: b64,
    format: format.toLowerCase(),
    width: Math.round(node.width * scale),
    height: Math.round(node.height * scale),
    nodeId: node.id,
    nodeName: node.name,
    sizeBytes: bytes.length,
  };
};
