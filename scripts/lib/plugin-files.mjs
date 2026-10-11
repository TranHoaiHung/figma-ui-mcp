// Single source of truth for plugin concatenation order.
//
// The plugin has no module system: these files are concatenated into one shared
// scope. Only top-level statements that run at load time care about order —
// function declarations hoist — so handlers-core must come before anything that
// adds to `handlers`.
//
// Both scripts/build-plugin.js and the test loader read this list, so splitting a
// file means editing it in one place instead of in the build script and in
// thirteen tests.
export const PLUGIN_FILES = [
  "src/plugin/color-utils.js",
  "src/plugin/node-utils.js",
  "src/plugin/text-utils.js",
  "src/plugin/svg-path-helpers.js",
  "src/plugin/paint-and-effects.js",
  "src/plugin/read-node-predicates.js",
  "src/plugin/extract-design-tree.js",
  // handlers-core declares `const handlers`, so it must precede every file
  // that adds to it.
  "src/plugin/handlers-core.js",
  "src/plugin/layout-helpers.js",
  "src/plugin/node-builders.js",
  "src/plugin/node-builders-media.js",
  "src/plugin/handlers-create.js",
  "src/plugin/handlers-modify.js",
  "src/plugin/handlers-delete-append.js",
  "src/plugin/handlers-components.js",
  "src/plugin/handlers-instance-properties.js",
  "src/plugin/handlers-prototype.js",
  "src/plugin/handlers-library.js",
  "src/plugin/handlers-selection-design.js",
  "src/plugin/handlers-scan-design.js",
  "src/plugin/handlers-search-nodes.js",
  "src/plugin/handlers-export.js",
  "src/plugin/handlers-node-detail.js",
  "src/plugin/handlers-css.js",
  "src/plugin/handlers-design-context.js",
  "src/plugin/handlers-component-map.js",
  "src/plugin/handlers-read-styles.js",
  "src/plugin/handlers-viewport.js",
  "src/plugin/token-helpers.js",
  "src/plugin/handlers-variables.js",
  "src/plugin/handlers-variable-modes.js",
  "src/plugin/handlers-variable-binding.js",
  "src/plugin/handlers-styles.js",
  "src/plugin/handlers-setup-tokens.js",
  "src/plugin/handlers-text-styles.js",
  "src/plugin/handlers-component-property-defs.js",
  "src/plugin/handlers-component-property-bind.js",
  "src/plugin/handlers-write-ops.js",
  "src/plugin/main.js",
];
