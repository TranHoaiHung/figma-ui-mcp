// ─── HANDLERS COMPONENT MAP ───
// Component mapping and unmapped-component reporting.
// Split out of handlers-read-detail.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.get_component_map = async function(params) {
  var id = params ? (params.id || params.nodeId) : null;
  var nodeName = params ? (params.name || params.nodeName) : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  if (!node) {
    var sel = figma.currentPage.selection;
    node = sel && sel.length > 0 ? sel[0] : figma.currentPage;
  }

  // Find all INSTANCE nodes in subtree
  var instances = [];
  function walkInstances(nd) {
    if (!nd) return;
    if (nd.type === "INSTANCE") {
      var entry = { id: nd.id, name: nd.name, x: Math.round(nd.x), y: Math.round(nd.y), width: Math.round(nd.width), height: Math.round(nd.height) };
      try {
        var mc = nd.mainComponent;
        if (mc) {
          entry.componentName = mc.name;
          entry.componentKey = mc.key || null;
          if (mc.parent && mc.parent.type === "COMPONENT_SET") {
            entry.componentSetName = mc.parent.name;
            entry.variantLabel = mc.name.indexOf(mc.parent.name) === 0
              ? mc.name.slice(mc.parent.name.length).replace(/^[,\s/]+/, "")
              : mc.name;
          }
        }
      } catch(e) {}
      try {
        if (nd.componentProperties) {
          var props = {};
          var pks = Object.keys(nd.componentProperties);
          for (var pi = 0; pi < pks.length; pi++) props[pks[pi]] = nd.componentProperties[pks[pi]].value;
          if (Object.keys(props).length > 0) entry.properties = props;
        }
      } catch(e) {}
      // Suggested import path based on component name convention
      var cname = entry.componentSetName || entry.componentName || "";
      var cnameLast = cname ? cname.split("/").slice(-1)[0].replace(/[^a-zA-Z0-9]/g, "") : "";
      entry.suggestedImport = cname ? "import { " + cnameLast + " } from '@/components/" + cnameLast + "'" : null;
      instances.push(entry);
    }
    if (nd.children) nd.children.forEach(walkInstances);
  }
  walkInstances(node);

  // Deduplicate by componentName for summary
  var uniqueComponents = {};
  instances.forEach(function(inst) {
    var key = inst.componentSetName || inst.componentName || inst.name;
    if (key && !uniqueComponents[key]) uniqueComponents[key] = { name: key, count: 0, suggestedImport: inst.suggestedImport };
    if (key) uniqueComponents[key].count++;
  });

  return {
    frameId: node.id,
    frameName: node.name,
    totalInstances: instances.length,
    instances: instances,
    uniqueComponents: Object.values(uniqueComponents),
    hint: "suggestedImport is a best-guess based on component name. Adjust the import path to match your actual codebase structure.",
  };
};

// get_unmapped_components — find component instances with no description (likely no code mapping)
// Helps AI ask: "do you have a Button component in your codebase?"
handlers.get_unmapped_components = async function(params) {
  var mapResult = await handlers.get_component_map(params);
  var allLocalComps = await handlers.get_local_components();

  // Build set of components that have descriptions (likely mapped)
  var described = new Set();
  allLocalComps.components.forEach(function(c) { if (c.description && c.description.trim()) described.add(c.name); });
  allLocalComps.componentSets.forEach(function(s) { if (s.description && s.description.trim()) described.add(s.name); });

  // Filter to only unique components that are used in frame but have no description
  var unmapped = mapResult.uniqueComponents.filter(function(uc) { return !described.has(uc.name); });
  var mapped = mapResult.uniqueComponents.filter(function(uc) { return described.has(uc.name); });

  return {
    frameId: mapResult.frameId,
    frameName: mapResult.frameName,
    totalUsed: mapResult.uniqueComponents.length,
    unmapped: unmapped.map(function(u) { return { name: u.name, count: u.count, suggestedImport: u.suggestedImport }; }),
    mapped: mapped.map(function(u) { return { name: u.name, count: u.count }; }),
    hint: unmapped.length > 0
      ? "These " + unmapped.length + " components have no description. Add a code import path to each component's description in Figma (e.g. '@/components/Button') so get_component_map can suggest accurate imports."
      : "All components in this frame have descriptions — fully mapped.",
  };
};

// get_styles — read all local paint, text, effect, and grid styles
