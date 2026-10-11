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
  "src/plugin/utils.js",
  "src/plugin/svg-path-helpers.js",
  "src/plugin/paint-and-effects.js",
  "src/plugin/read-helpers.js",
  "src/plugin/handlers-write.js",
  "src/plugin/handlers-library.js",
  "src/plugin/handlers-read.js",
  "src/plugin/handlers-read-detail.js",
  "src/plugin/handlers-tokens.js",
  "src/plugin/handlers-write-ops.js",
  "src/plugin/main.js",
];
