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
  // Node operations
  "clone", "group", "ungroup", "flatten", "resize",
  "set_selection", "set_viewport", "batch",
];

const READ_OPS = [
  "get_selection", "get_design", "get_page_nodes",
  "screenshot", "export_svg",
  "get_styles", "get_local_components", "get_viewport", "get_variables",
  "get_node_detail", "export_image", "search_nodes", "scan_design",
];

const ALL_OPS = [...WRITE_OPS, ...READ_OPS];

// ─── Icon library config ──────────────────────────────────────────────────────
const ICON_LIBRARIES = [
  { name: "fluent",    urlFn: (n) => `https://unpkg.com/@fluentui/svg-icons/icons/${n.replace(/-/g, "_")}_24_filled.svg`, fillType: "fill" },
  { name: "bootstrap", urlFn: (n) => `https://unpkg.com/bootstrap-icons@1.11.3/icons/${n}-fill.svg`, fillType: "fill" },
  { name: "phosphor",  urlFn: (n) => `https://unpkg.com/@phosphor-icons/core@latest/assets/fill/${n}-fill.svg`, fillType: "fill" },
  { name: "lucide",    urlFn: (n) => `https://unpkg.com/lucide-static@0.577.0/icons/${n}.svg`, fillType: "stroke" },
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

// ─── Build figma proxy with helper methods ────────────────────────────────────
function buildFigmaProxy(bridge) {
  const proxy = { notify: (msg) => Promise.resolve(msg) };
  for (const op of ALL_OPS) {
    proxy[op] = (params = {}) => bridge.sendOperation(op, params);
  }

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
  // Fetches SVG icon from libraries (Fluent → Bootstrap → Phosphor → Lucide)
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
          usedLib = lib.name;
          break;
        }
      } catch { /* try next library */ }
    }

    if (!svg) throw new Error(`Icon "${iconName}" not found in any library`);

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
  // Icon inside a centered circle background (icon at 50% container size)
  // opts: { parentId, containerSize, fill, bgOpacity }
  proxy.loadIconIn = async (iconName, opts = {}) => {
    const cSize = opts.containerSize || 40;
    const fill = opts.fill || "#6C5CE7";
    const bgOpacity = opts.bgOpacity || 0.1;
    const iSize = Math.floor(cSize / 2);

    // Create container circle with auto-layout centering
    const container = await bridge.sendOperation("create", {
      type: "FRAME",
      name: opts.name || `icon-${iconName}-wrap`,
      parentId: opts.parentId,
      x: opts.x || 0,
      y: opts.y || 0,
      width: cSize,
      height: cSize,
      fill,
      fillOpacity: bgOpacity,
      cornerRadius: Math.floor(cSize / 2),
      layoutMode: "HORIZONTAL",
      primaryAxisAlignItems: "CENTER",
      counterAxisAlignItems: "CENTER",
    });

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
export async function executeCode(code, bridge) {
  const logs = [];
  const ctx = vm.createContext({
    figma:   buildFigmaProxy(bridge),
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
    return { success: false, error: err.message, logs };
  }
}
