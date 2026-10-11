// The `figma` object user code sees inside the sandbox. Each method forwards to
// the plugin over the bridge.
import { ALL_OPS } from "./allowed-ops.js";
import { ICON_LIBRARIES, MATERIAL_TO_IONICONS } from "./icon-libraries.js";
import { httpFetch, normalizeArcData } from "./http-fetch.js";

export function buildFigmaProxy(bridge) {
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
    // get_node_detail never returns a children array, so this always answered
    // []. get_design builds the tree, so ask it for one level.
    const tree = await bridge.sendOperation("get_design", { id: nodeId, depth: 1 });
    const root = tree && tree.tree ? tree.tree : tree;
    return root && Array.isArray(root.children) ? root.children : [];
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

    if (!svg) {
      // BUG-04: suggest Ionicons name when user passes Material/snake_case naming
      const suggestion = MATERIAL_TO_IONICONS[iconName];
      const hint = suggestion
        ? ` Did you mean "${suggestion}"? (Material Icons names like "${iconName}" are not supported — use Ionicons names instead.)`
        : iconName.includes("_")
          ? ` Hint: snake_case names (e.g. "${iconName}") are typical of Material Icons — Ionicons uses kebab-case (e.g. "${iconName.replace(/_/g, "-")}"). See figma_docs { section: "icons" }.`
          : "";
      throw new Error(`Icon "${iconName}" not found in any library (tried: ${ICON_LIBRARIES.map(l => l.name).join(", ")}).${hint}`);
    }

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

