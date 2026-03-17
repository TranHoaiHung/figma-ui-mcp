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
      "Use the `figma` proxy object — all methods return Promises, use async/await. " +
      "Operations: create, modify, delete, clone, group, ungroup, flatten, resize, " +
      "set_selection, set_viewport, batch (multiple ops in one call). " +
      "Call figma_docs first to see all available operations and examples. " +
      "The code runs in a sandboxed VM: no access to require, process, fs, fetch, or network.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript using figma.create(), figma.modify(), figma.setPage(), etc.",
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
            "get_styles", "get_local_components", "get_viewport", "get_variables"
          ],
          description:
            "get_selection: data for currently selected node(s). " +
            "get_design: full node tree for a frame/page. " +
            "get_page_nodes: top-level frames on the current page. " +
            "screenshot: PNG of a node as base64. " +
            "export_svg: SVG markup of a node. " +
            "get_styles: all local paint, text, effect, grid styles. " +
            "get_local_components: enhanced component listing with properties. " +
            "get_viewport: current viewport position and zoom. " +
            "get_variables: read Figma local variables (Design Tokens).",
        },
        nodeId:   { type: "string", description: "Target node ID (optional — omit to use current selection)." },
        nodeName: { type: "string", description: "Target node name (alternative to nodeId)." },
        scale:    { type: "number", description: "Export scale for screenshot (default 1)." },
      },
      required: ["operation"],
    },
  },
  {
    name: "figma_docs",
    description:
      "Get the full API reference for figma_write — all operations, parameters, and code examples. " +
      "Always call this before writing non-trivial draw code.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];
