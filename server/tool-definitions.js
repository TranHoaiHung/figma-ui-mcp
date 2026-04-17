// MCP tool schema definitions
export const TOOLS = [
  {
    name: "figma_status",
    description:
      "Check whether the Figma plugin bridge is connected. " +
      "Always call this first to confirm the plugin is running before any other tool.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "figma_write",
    description:
      "Execute JavaScript code to CREATE or MODIFY designs in Figma. " +
      "⚠️ MANDATORY: Call figma_docs BEFORE writing any design code. Skipping figma_docs causes hardcoded colors, wrong sizing, broken layouts, and low-quality UI. " +
      "Use the `figma` proxy object — all methods return Promises, use async/await. " +
      "Operations: create, modify, delete, clone, group, ungroup, flatten, resize, " +
      "set_selection, set_viewport, batch (multiple ops in one call). " +
      "Design Tokens: createVariableCollection, createVariable, setVariableValue, " +
      "addVariableMode, renameVariableMode, removeVariableMode, applyVariable, " +
      "setFrameVariableMode, clearFrameVariableMode, " +
      "createPaintStyle, createTextStyle, createComponent. " +
      "Prototyping: setReactions, getReactions, removeReactions (click/hover/press → navigate/overlay/swap with Smart Animate transitions). " +
      "Scroll: setScrollBehavior (overflowDirection: NONE/HORIZONTAL/VERTICAL/BOTH). " +
      "Variants: setComponentProperties, swapComponent, getComponentProperties. " +
      "The code runs in a sandboxed VM: no access to require, process, fs, fetch, or network.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript using figma.create(), figma.modify(), figma.setPage(), etc.",
        },
        sessionId: {
          type: "string",
          description: "Target a specific Figma file/tab when multiple are connected. Omit to auto-select.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "figma_read",
    description:
      "READ design data from Figma — extract node trees, colors, typography, spacing, and screenshots. " +
      "Use to understand an existing design before generating code, or to inspect what's on the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "get_selection", "get_design", "get_page_nodes", "screenshot", "export_svg",
            "get_styles", "get_local_components", "get_viewport", "get_variables",
            "get_node_detail", "get_css",
            "get_design_context", "get_component_map", "get_unmapped_components",
            "export_image",
            "search_nodes",
            "scan_design"
          ],
          description:
            "── Design-to-code (use these for code generation) ──\n" +
            "get_design_context: AI-optimized payload for a node — flex layout, token-resolved colors, typography with style names, component instances with variant properties. Best single call for design→React/Vue/Swift code.\n" +
            "get_css: ready-to-use CSS string for a single node — background, flex, border, radius, shadow, typography, opacity, transform.\n" +
            "get_component_map: list every component instance in a frame with componentSetName, variantLabel, properties, and suggestedImport path. Use to scaffold import statements.\n" +
            "get_unmapped_components: find component instances that have no description in Figma (likely no code mapping yet). Prompts AI to ask user for correct import paths.\n" +
            "── Inspect ──\n" +
            "get_node_detail: structured properties for a single node — fills, bound variables (resolved to name+value), style refs (resolved to name+hex), instance overrides (full field list), componentSetName/variantLabel.\n" +
            "get_selection: full design tree of selected node(s) + design tokens summary.\n" +
            "get_design: full node tree for a frame/page (depth param: number or 'full').\n" +
            "get_page_nodes: top-level frames on the current page.\n" +
            "── Styles & tokens ──\n" +
            "get_styles: all local paint, text, effect, grid styles.\n" +
            "get_variables: all local Design Token variables — collections, modes, resolved values.\n" +
            "get_local_components: component listing with descriptions + variant property definitions.\n" +
            "── Export ──\n" +
            "screenshot: PNG of a node — displays inline in Claude Code.\n" +
            "export_svg: SVG markup string.\n" +
            "export_image: base64 PNG/JPG for saving to disk (scale param for resolution).\n" +
            "── Search ──\n" +
            "search_nodes: filter by type, namePattern (wildcard *), fill color, fontFamily, fontSize, hasImage, hasIcon.\n" +
            "scan_design: structured summary of large frames — all text, colors, fonts, images, icons, sections.\n" +
            "── Viewport ──\n" +
            "get_viewport: current viewport center, zoom, bounds.",
        },
        nodeId:   { type: "string", description: "Target node ID (optional — omit to use current selection)." },
        nodeName: { type: "string", description: "Target node name (alternative to nodeId)." },
        scale:    { type: "number", description: "Export scale for screenshot (default 1)." },
        depth:    { type: "string", description: "Tree depth for get_design/get_selection. Number (default 10) or 'full' for unlimited. Higher = more detail but larger output." },
        format:   { type: "string", description: "Image format for export_image: 'png' (default) or 'jpg'." },
        detail:   { type: "string", description: "Detail level for get_design/get_selection: 'minimal' (~5% tokens), 'compact' (~30%), 'full' (default, 100%). Use minimal for large files." },
        includeHidden: { type: "boolean", description: "Include invisible nodes (visible:false) in results. Default false — hidden layers are skipped to reduce noise." },
        sessionId: { type: "string", description: "Target a specific Figma file/tab when multiple are connected. Omit to auto-select." },
      },
      required: ["operation"],
    },
  },
  {
    name: "figma_docs",
    description:
      "Get the API reference and design rules for figma_write. " +
      "Call with no args first — returns quick-start guide + critical rules. " +
      "Then load specific sections as needed: " +
      "section='rules' (design principles, token rules, layer order, component-first), " +
      "section='layout' (auto-layout, button/card/badge/progress/mobile rules), " +
      "section='api' (create/modify/delete/clone/batch/read operations + workflow), " +
      "section='tokens' (variables, multi-mode, paint styles, text styles), " +
      "section='icons' (loadImage, loadIcon, loadIconIn, icon libraries, coloring, sizing). " +
      "Always call figma_docs BEFORE any figma_write code.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["rules", "layout", "api", "tokens", "icons"],
          description:
            "Which section to load. Omit (or null) for quick-start + critical rules. " +
            "Load layout before any auto-layout work. Load api for full operation reference. " +
            "Load tokens for variable/multi-mode work. Load icons for image/icon placement.",
        },
      },
      required: [],
    },
  },
  {
    name: "figma_rules",
    description:
      "Generate a design system rule sheet from the current Figma file — aggregates color tokens, " +
      "typography styles, variables (all modes), and component catalog into a single markdown block. " +
      "Equivalent to official Figma MCP's create_design_system_rules. " +
      "Call once at the start of a design-to-code session to give the AI full context: " +
      "what tokens to use, what text styles exist, which components are available. " +
      "Re-run when the design system changes.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Target a specific Figma file/tab. Omit to auto-select.",
        },
      },
      required: [],
    },
  },
];
