// Executes user-provided JS code inside a Node.js vm sandbox.
// Only the figma proxy (allowlisted operations) + safe builtins are available.
// Blocked: require, process, fs, fetch, setTimeout, eval, Function constructor.
import { createRequire } from "node:module";
import https from "node:https";
import http from "node:http";

const vm = createRequire(import.meta.url)("vm");

const TIMEOUT_MS = 30_000;

const WRITE_OPS = [
  "status", "listPages", "setPage", "createPage",
  "query", "create", "modify", "delete", "append",
  "listComponents", "instantiate",
  "ensure_library", "get_library_tokens",
  // Design token operations (v1.7.0+)
  "createVariableCollection", "createVariable", "applyVariable",
  "modifyVariable", "setupDesignTokens",
  // Variable multi-mode (v1.9.6)
  "addVariableMode", "renameVariableMode", "removeVariableMode", "setVariableValue",
  // Frame variable mode override (v1.9.7)
  "setFrameVariableMode", "clearFrameVariableMode",
  "createPaintStyle", "createTextStyle", "createComponent",
  // Typography tokens + text style application (v2.5.4)
  "applyTextStyle",
  // Node operations
  "clone", "group", "ungroup", "flatten", "resize",
  "set_selection", "set_viewport", "batch",
  // Prototyping & interactions (v2.4.0)
  "setReactions", "removeReactions",
  // Scroll behavior (v2.4.0)
  "setScrollBehavior",
  // Component variant swapping (v2.4.0)
  "setComponentProperties", "swapComponent",
];

const READ_OPS = [
  "get_selection", "get_design", "get_page_nodes",
  "screenshot", "export_svg",
  "get_styles", "get_local_components", "get_viewport", "get_variables",
  "get_node_detail", "export_image", "search_nodes", "scan_design",
  // Prototyping & component reads (v2.4.0)
  "getReactions", "getComponentProperties",
];

const ALL_OPS = [...WRITE_OPS, ...READ_OPS];

// ─── Icon library config ──────────────────────────────────────────────────────
// Priority order: iOS-style filled → Win11 filled → Bootstrap filled → Phosphor filled
//                 → Tabler filled → Tabler outline → Lucide (outline fallback)
// v2.5.5+: Added Ionicons (iOS-native filled, replaces Icons8 ios-filled use case)
//          + Tabler filled (4500+ icons, broadest coverage).
const ICON_LIBRARIES = [
  // iOS-style filled (default-filled, outline/sharp variants via suffix)
  { name: "ionicons",     urlFn: (n) => `https://unpkg.com/ionicons@7.4.0/dist/svg/${n}.svg`,                                                         fillType: "none" },
  // Win11 Fluent filled (Microsoft)
  { name: "fluent",       urlFn: (n) => `https://unpkg.com/@fluentui/svg-icons/icons/${n.replace(/-/g, "_")}_24_filled.svg`,                           fillType: "fill" },
  // Bootstrap filled
  { name: "bootstrap",    urlFn: (n) => `https://unpkg.com/bootstrap-icons@1.11.3/icons/${n}-fill.svg`,                                                fillType: "fill" },
  // Phosphor filled
  { name: "phosphor",     urlFn: (n) => `https://unpkg.com/@phosphor-icons/core@latest/assets/fill/${n}-fill.svg`,                                     fillType: "fill" },
  // Tabler filled — 4,500+ icons, broadest coverage of filled-style
  { name: "tabler-filled",urlFn: (n) => `https://unpkg.com/@tabler/icons@3.24.0/icons/filled/${n}.svg`,                                                fillType: "fill" },
  // Tabler outline — very thorough outline set
  { name: "tabler",       urlFn: (n) => `https://unpkg.com/@tabler/icons@3.24.0/icons/outline/${n}.svg`,                                               fillType: "stroke" },
  // Lucide — last resort outline
  { name: "lucide",       urlFn: (n) => `https://unpkg.com/lucide-static@0.577.0/icons/${n}.svg`,                                                      fillType: "stroke" },
];

// ─── HTTP fetch helper (server-side, NOT in sandbox) ──────────────────────────
function httpFetch(url, maxBytes = 10_000_000, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      // Follow redirects (up to 3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) { res.resume(); return reject(new Error("Too many redirects")); }
        return httpFetch(res.headers.location, maxBytes, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(); reject(new Error("Response too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Normalize arcData keys: startAngle/endAngle (SVG-style) → startingAngle/endingAngle (Figma API)
// Applied server-side so tests and real plugin both behave consistently.
function normalizeArcData(arcData) {
  if (!arcData || typeof arcData !== "object") return arcData;
  return {
    startingAngle: arcData.startingAngle !== undefined ? arcData.startingAngle
                 : (arcData.startAngle   !== undefined ? arcData.startAngle : 0),
    endingAngle:   arcData.endingAngle   !== undefined ? arcData.endingAngle
                 : (arcData.endAngle     !== undefined ? arcData.endAngle   : Math.PI * 2),
    innerRadius:   arcData.innerRadius   !== undefined ? arcData.innerRadius : 0,
  };
}

// ─── Build figma proxy with helper methods ────────────────────────────────────
function buildFigmaProxy(bridge) {
  const proxy = { notify: (msg) => Promise.resolve(msg) };
  for (const op of ALL_OPS) {
    proxy[op] = (params = {}) => bridge.sendOperation(op, params);
  }

  // Override create to normalize arcData keys before forwarding to plugin
  proxy.create = (params = {}) => {
    if (params.arcData) {
      params = Object.assign({}, params, { arcData: normalizeArcData(params.arcData) });
    }
    return bridge.sendOperation("create", params);
  };

  // ── BUG-12: figma.getNodeById(id) — read node detail by ID ────────────
  proxy.getNodeById = async (id) => {
    return bridge.sendOperation("get_node_detail", { id });
  };

  // ── BUG-09: figma.getChildren(nodeId) — returns children array ──────────
  proxy.getChildren = async (nodeId) => {
    const detail = await bridge.sendOperation("get_node_detail", { id: nodeId, depth: 1 });
    return (detail && Array.isArray(detail.children)) ? detail.children : [];
  };

  // ── BUG-10: figma.getNode(id) — alias for getNodeById ───────────────────
  proxy.getNode = async (id) => {
    return bridge.sendOperation("get_node_detail", { id });
  };

  // ── BUG-13: figma.zoom_to_fit(opts) — alias for set_viewport ──────────
  proxy.zoom_to_fit = async (opts = {}) => {
    var nodeIds = opts.nodeIds || (opts.nodeId ? [opts.nodeId] : []);
    return bridge.sendOperation("set_viewport", { nodeId: nodeIds[0] || null });
  };

  // ── BUG-14: figma.getCurrentPage() — returns current page info ─────────
  proxy.getCurrentPage = async () => {
    return bridge.sendOperation("status", {});
  };

  // ── figma.get_page_nodes() — returns nodes array (with .page property) ─
  // Plugin returns { page, nodes: [...] }. Proxy unwraps to array so that
  // `for (var i = 0; i < nodes.length; i++)` works directly.
  proxy.get_page_nodes = async () => {
    const raw = await bridge.sendOperation("get_page_nodes", {});
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.nodes) ? raw.nodes : []);
    // Attach .page metadata as a non-enumerable property so array usage still works
    Object.defineProperty(arr, "page", { value: raw && raw.page ? raw.page : null, enumerable: false });
    return arr;
  };

  // ── figma.loadImage(url, opts) ──────────────────────────────────────────
  // Downloads image from URL, converts to base64, creates IMAGE node in Figma
  // opts: { parentId, x, y, width, height, cornerRadius, scaleMode, name }
  proxy.loadImage = async (url, opts = {}) => {
    const buf = await httpFetch(url, 5_000_000);
    const b64 = buf.toString("base64");
    return bridge.sendOperation("create", {
      type: "IMAGE",
      name: opts.name || "image",
      parentId: opts.parentId,
      x: opts.x || 0,
      y: opts.y || 0,
      width: opts.width || 100,
      height: opts.height || 100,
      imageData: b64,
      scaleMode: opts.scaleMode || "FILL",
      cornerRadius: opts.cornerRadius,
    });
  };

  // ── figma.loadIcon(name, opts) ──────────────────────────────────────────
  // Fetches SVG icon from libraries in priority order (filled first):
  // Ionicons → Fluent → Bootstrap → Phosphor → Tabler-filled → Tabler → Lucide
  // opts: { parentId, x, y, size, fill }
  proxy.loadIcon = async (iconName, opts = {}) => {
    const size = opts.size || 24;
    const fill = opts.fill || "#1E3150";
    let svg = null;
    let usedLib = null;

    for (const lib of ICON_LIBRARIES) {
      try {
        const url = lib.urlFn(iconName);
        const buf = await httpFetch(url, 100_000);
        const text = buf.toString("utf-8");
        if (text.includes("<svg")) {
          svg = text
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/class="[^"]*"/g, "")
            .replace(/fill="currentColor"/g, `fill="${fill}"`)
            .replace(/stroke="currentColor"/g, `stroke="${fill}"`);
          // Ionicons and similar libs have <path> tags without fill attribute;
          // inject `fill` at the <svg> root so Figma imports with the requested color.
          if (lib.fillType === "none" && !/fill="/.test(svg.slice(0, svg.indexOf(">") + 1))) {
            svg = svg.replace(/<svg([^>]*)>/, `<svg$1 fill="${fill}">`);
          }
          // BUG-10: normalize stroke-width to the requested pixel size.
          // SVG icons (esp. Ionicons outline) use stroke-width in their own coordinate space
          // (e.g. stroke-width="48" in a 512×512 viewBox). When Figma scales the icon down
          // to `size` pixels the stroke looks correct visually, but after createNodeFromSvg
          // the vector's strokeWeight is the raw SVG value (48), which overflows a 14px frame.
          // Fix: detect viewBox width, compute scale = size / viewBoxW, replace stroke-width.
          const vbMatch = svg.match(/viewBox="[^"]*"/);
          if (vbMatch) {
            const parts = vbMatch[0].replace('viewBox="', "").replace('"', "").trim().split(/[\s,]+/);
            const vbW = parseFloat(parts[2]);
            if (vbW > 0 && vbW !== size) {
              const scale = size / vbW;
              svg = svg.replace(/stroke-width="([^"]+)"/g, (_, w) => {
                const normalized = Math.max(0.5, parseFloat(w) * scale);
                return `stroke-width="${Math.round(normalized * 100) / 100}"`;
              });
            }
          }
          usedLib = lib.name;
          break;
        }
      } catch { /* try next library */ }
    }

    if (!svg) throw new Error(`Icon "${iconName}" not found in any library (tried: ${ICON_LIBRARIES.map(l => l.name).join(", ")})`);

    return bridge.sendOperation("create", {
      type: "SVG",
      name: opts.name || `icon/${iconName}`,
      parentId: opts.parentId,
      x: opts.x || 0,
      y: opts.y || 0,
      width: size,
      height: size,
      svg,
      fill,
    });
  };

  // ── figma.loadIconIn(name, opts) ────────────────────────────────────────
  // Icon inside a centered circle background (icon at 50% container size).
  // opts: { parentId, containerSize, fill, bgOpacity, iconSize,
  //         layoutAlign, layoutGrow, x, y, name, noContainer }
  //
  // BUG-15 fix: noContainer:true loads icon directly into parentId without
  // creating an extra wrapper — use when caller already created the container
  // frame. Prevents double-nesting (outer 28px → inner 14px → icon 7px).
  //
  // BUG-05 fix: bgOpacity:0 respected (was ||0.1 falsy trap — fixed to !== undefined).
  // iconSize exposed (defaults to floor(containerSize/2)).
  proxy.loadIconIn = async (iconName, opts = {}) => {
    const cSize = opts.containerSize || 40;
    const fill = opts.fill || "#6C5CE7";
    const bgOpacity = opts.bgOpacity !== undefined ? opts.bgOpacity : 0.1;
    const iSize = opts.iconSize || Math.floor(cSize / 2);

    // BUG-15: noContainer skips wrapper creation — icon goes directly into parentId
    if (opts.noContainer) {
      await proxy.loadIcon(iconName, {
        parentId: opts.parentId,
        size: iSize,
        fill,
      });
      return { id: opts.parentId };
    }

    // Create container circle with auto-layout centering
    const createParams = {
      type: "FRAME",
      name: opts.name || ("icon-" + iconName + "-wrap"),
      parentId: opts.parentId,
      x: opts.x !== undefined ? opts.x : 0,
      y: opts.y !== undefined ? opts.y : 0,
      width: cSize,
      height: cSize,
      fill,
      fillOpacity: bgOpacity,
      cornerRadius: Math.floor(cSize / 2),
      layoutMode: "HORIZONTAL",
      primaryAxisAlignItems: "CENTER",
      counterAxisAlignItems: "CENTER",
    };
    if (opts.layoutAlign !== undefined) createParams.layoutAlign = opts.layoutAlign;
    if (opts.layoutGrow  !== undefined) createParams.layoutGrow  = opts.layoutGrow;

    const container = await bridge.sendOperation("create", createParams);

    // Load icon inside container
    await proxy.loadIcon(iconName, {
      parentId: container.id,
      size: iSize,
      fill,
    });

    return container;
  };

  return proxy;
}

function buildConsole(logs) {
  const fmt = (args) =>
    args.map(x => typeof x === "object" ? JSON.stringify(x, null, 2) : String(x)).join(" ");
  return {
    log:   (...a) => logs.push(fmt(a)),
    error: (...a) => logs.push("[error] " + fmt(a)),
    warn:  (...a) => logs.push("[warn] "  + fmt(a)),
    info:  (...a) => logs.push("[info] "  + fmt(a)),
  };
}

/**
 * @returns {{ success: boolean, result?: unknown, error?: string, logs: string[] }}
 */
export async function executeCode(code, bridge, sessionId) {
  // Wrap bridge to pin sessionId for all operations in this execution
  var wrappedBridge = sessionId ? {
    sendOperation: function(op, params) { return bridge.sendOperation(op, params, sessionId); }
  } : bridge;

  const logs = [];
  const ctx = vm.createContext({
    figma:   buildFigmaProxy(wrappedBridge),
    console: buildConsole(logs),
    // Safe builtins
    Promise, JSON, Math, Object, Array, String, Number,
    Boolean, Error, parseInt, parseFloat, isNaN, isFinite,
    // Blocked
    require: undefined, process: undefined, fetch: undefined,
    setTimeout: undefined, setInterval: undefined,
    queueMicrotask: undefined, XMLHttpRequest: undefined,
  });

  try {
    const result = await vm.runInContext(`(async()=>{ ${code} })()`, ctx, {
      timeout:  TIMEOUT_MS,
      filename: "figma-code.js",
    });
    return { success: true, result: result ?? null, logs };
  } catch (err) {
    let msg = err.message;
    // Bug 5 fix: ReferenceError in sandbox means the variable was defined in a previous
    // figma_write call. Each call runs in an isolated VM context — variables don't persist.
    if (err instanceof ReferenceError || (err.name === "ReferenceError")) {
      msg += "\nNote: Each figma_write call runs in an isolated sandbox — variables from previous calls are not available. Re-query node IDs with figma.get_page_nodes() or figma.query() at the start of each call.";
    }
    return { success: false, error: msg, logs };
  }
}
