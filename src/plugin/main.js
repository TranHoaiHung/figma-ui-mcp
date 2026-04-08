// ─── PLUGIN ENTRY POINT ───────────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 420, title: "Figma UI MCP Bridge" });

// ─── DISPATCHER ───────────────────────────────────────────────────────────────

// Sanitize data before postMessage — remove Symbol values (e.g. figma.mixed)
// that cannot be serialized via structured clone / JSON
function sanitizeForPostMessage(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "symbol") return "mixed";
  if (typeof obj === "number" || typeof obj === "string" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForPostMessage);
  if (typeof obj === "object") {
    var clean = {};
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        var val = obj[key];
        if (typeof val === "symbol") {
          clean[key] = "mixed";
        } else {
          clean[key] = sanitizeForPostMessage(val);
        }
      }
    }
    return clean;
  }
  return obj;
}

figma.ui.onmessage = async (request) => {
  const { id, operation, params } = request;
  
  if (operation === "set_config") {
    if (params && params.filterInvisible !== undefined) {
      FILTER_INVISIBLE = params.filterInvisible;
    }
    return;
  }
  
  const handler = handlers[operation];

  if (!handler) {
    figma.ui.postMessage({
      id, operation, success: false,
      error: `Unknown operation "${operation}". Available: ${Object.keys(handlers).join(", ")}`,
    });
    return;
  }

  try {
    var data = await handler(params || {});
    figma.ui.postMessage({ id: id, operation: operation, success: true, data: sanitizeForPostMessage(data) });
  } catch (err) {
    var errMsg = "[dispatch:" + operation + "] " + (err && err.message ? err.message : String(err));
    figma.ui.postMessage({ id: id, operation: operation, success: false, error: errMsg });
  }
};
