// ─── HANDLERS DELETE APPEND ───
// Delete and append, including the contains-components guard.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

function findComponentDescendants(node) {
  if (!node || node.removed || typeof node.findAll !== "function") return [];
  try {
    return node.findAll(function(n) { return n.type === "COMPONENT" || n.type === "COMPONENT_SET"; });
  } catch (e) { return []; }
}

function describeDeleteImpact(node) {
  var impact = { hasComponents: false, componentCount: 0, componentNames: [] };
  if (!node) return impact;
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    impact.hasComponents = true;
    impact.componentCount = 1;
    impact.componentNames = [node.name];
    return impact;
  }
  var found = findComponentDescendants(node);
  if (found.length > 0) {
    impact.hasComponents = true;
    impact.componentCount = found.length;
    impact.componentNames = found.slice(0, 10).map(function(c) { return c.name; });
  }
  return impact;
}

// "delete" is a JS reserved keyword — use bracket notation
handlers["delete"] = async (params) => {
  var allowComponentDelete = params && params.force === true;
  if (params && Array.isArray(params.ids)) {
    var results = [];
    for (var di = 0; di < params.ids.length; di++) {
      var targetId = params.ids[di];
      var n = await findNodeByIdAsync(targetId);
      if (!n || n.removed) {
        results.push({ deleted: true, alreadyGone: true, ref: targetId });
      } else {
        var impact = describeDeleteImpact(n);
        if (impact.hasComponents && !allowComponentDelete) {
          results.push({
            deleted: false, ref: targetId, blocked: "contains-components",
            componentCount: impact.componentCount, componentNames: impact.componentNames,
            hint: "Deleting this would remove " + impact.componentCount + " component master(s) " +
                  "and break every instance in the file. Pass force:true to override."
          });
          continue;
        }
        var inf = nodeToInfo(n);
        n.remove();
        results.push(Object.assign({ deleted: true }, inf));
      }
    }
    return { deleted: true, count: results.length, results: results };
  }
  const node = await resolveNode(params);
  if (!node || node.removed) {
    var ref = params.id || params.nodeId || params.name || params.nodeName;
    return { deleted: true, alreadyGone: true, ref: ref };
  }
  var impactSingle = describeDeleteImpact(node);
  if (impactSingle.hasComponents && !allowComponentDelete) {
    return {
      deleted: false, ref: node.id, blocked: "contains-components",
      componentCount: impactSingle.componentCount, componentNames: impactSingle.componentNames,
      hint: "Deleting this would remove " + impactSingle.componentCount + " component master(s) " +
            "and break every instance in the file. Pass force:true to override."
    };
  }
  const info = nodeToInfo(node);
  node.remove();
  return Object.assign({ deleted: true }, info);
};

handlers.append = async function(params) {
  var parentId   = params.parentId   || null;
  var parentName = params.parentName || null;
  var childId    = params.childId    || null;
  var childName  = params.childName  || null;
  var parent = parentId   ? (await findNodeByIdAsync(parentId))   : (parentName ? findNodeByName(parentName) : null);
  var child  = childId    ? (await findNodeByIdAsync(childId))    : (childName  ? findNodeByName(childName)  : null);
  if (!parent || !child) throw new Error("Parent or child not found");
  parent.appendChild(child);
  return { parentId: parent.id, childId: child.id };
};
