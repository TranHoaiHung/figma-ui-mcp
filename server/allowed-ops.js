// Operation allowlist. Both the sandbox in code-executor.js and the bridge's
// /exec route check against this, so it lives on its own rather than being
// exported from the executor.
export const WRITE_OPS = [
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
  // Component property definitions on master (v2.5.22)
  // — addComponentProperty + bindComponentPropertyToText is what makes instance
  //   text overrides actually re-measure auto-layout.
  "addComponentProperty", "bindComponentPropertyToText", "removeComponentProperty",
  // Generic property binding (v2.5.22) — supports .visible (BOOLEAN) and .mainComponent (INSTANCE_SWAP)
  "bindComponentProperty", "unbindComponentProperty",
  // Dynamic-page document access (v2.5.24)
  // — required so user code can opt-in to figma.loadAllPagesAsync() before
  //   cross-page queries. Without it, figma.root.findOne misses unloaded pages.
  "loadAllPagesAsync",
];

export const READ_OPS = [
  "get_selection", "get_design", "get_page_nodes",
  "screenshot", "export_svg",
  "get_styles", "get_local_components", "get_viewport", "get_variables",
  "get_node_detail", "export_image", "search_nodes", "scan_design",
  // Prototyping & component reads (v2.4.0)
  "getReactions", "getComponentProperties",
  // Design-to-code reads (v2.5.9) — handlers existed but were unreachable from
  // user code because they were missing here.
  "get_css", "get_design_context", "get_component_map", "get_unmapped_components",
];

export const ALL_OPS = [...WRITE_OPS, ...READ_OPS];
