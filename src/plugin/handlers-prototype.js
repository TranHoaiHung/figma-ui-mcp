// ─── HANDLERS PROTOTYPE ───
// Prototype interactions, scroll behavior and component swapping.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

function normalizeReactionAction(action) {
  if (action && action.type === "NAVIGATE") {
    return {
      type: "NODE",
      destinationId: action.destinationId,
      navigation: "NAVIGATE",
      transition: action.transition || null,
      preserveScrollPosition: false,
    };
  }
  return action;
}

handlers.setReactions = async function(params) {
  var nodeId = params.id || params.nodeId;
  if (!nodeId) throw new Error("id is required");
  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!("setReactionsAsync" in node)) throw new Error("Node does not support reactions: " + node.type);
  var reactions = (params.reactions || []).map(function(r) {
    var actions = r.actions || (r.action ? [r.action] : []);
    return { trigger: r.trigger, actions: actions.map(normalizeReactionAction) };
  });
  await node.setReactionsAsync(reactions);
  return { id: node.id, name: node.name, count: reactions.length };
};

handlers.getReactions = async function(params) {
  var nodeId = params.id || params.nodeId;
  if (!nodeId) throw new Error("id is required");
  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  return { id: node.id, name: node.name, reactions: node.reactions || [] };
};

// setScrollBehavior — scroll overflow on a frame.
// This op was in the executor allowlist, tool-definitions and api-docs, and
// documented in CLAUDE.md, but no handler existed, so every call failed with
// "Unknown operation".
var OVERFLOW_DIRECTIONS = ["NONE", "HORIZONTAL", "VERTICAL", "BOTH"];

handlers.setScrollBehavior = async function(params) {
  var node = await resolveNode(params);
  if (!node) throw new Error("Node not found: " + (params.id || params.nodeId || params.name));

  var out = { id: node.id, name: node.name };

  if (params.overflowDirection !== undefined) {
    if (!("overflowDirection" in node)) {
      throw new Error("Node type " + node.type + " has no overflowDirection (frame-like nodes only)");
    }
    var dir = String(params.overflowDirection).toUpperCase();
    if (OVERFLOW_DIRECTIONS.indexOf(dir) === -1) {
      throw new Error("overflowDirection must be one of " + OVERFLOW_DIRECTIONS.join(", ") + " — got " + params.overflowDirection);
    }
    node.overflowDirection = dir;
    out.overflowDirection = node.overflowDirection;
  }

  if (params.clipsContent !== undefined) {
    if (!("clipsContent" in node)) {
      throw new Error("Node type " + node.type + " has no clipsContent (frame-like nodes only)");
    }
    node.clipsContent = !!params.clipsContent;
    out.clipsContent = node.clipsContent;
  }

  // scrollBehavior governs whether the node scrolls with the frame or stays
  // fixed — the companion property to overflowDirection in prototypes.
  if (params.scrollBehavior !== undefined && "scrollBehavior" in node) {
    node.scrollBehavior = String(params.scrollBehavior).toUpperCase();
    out.scrollBehavior = node.scrollBehavior;
  }

  return out;
};

handlers.removeReactions = async function(params) {
  var nodeId = params.id || params.nodeId;
  if (!nodeId) throw new Error("id is required");
  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  await node.setReactionsAsync([]);
  return { id: node.id, removed: true };
};

// swapComponent — point an instance at a different main component.
// Wraps Figma's InstanceNode.swapComponent(targetComponent).
// Different from INSTANCE_SWAP component properties (which are nested swaps
// inside a main component's slots) — this swaps the instance's own main.
handlers.swapComponent = async function(params) {
  var nodeId = params.id || params.nodeId;
  var componentId = params.componentId || params.targetComponentId;

  if (!nodeId) throw new Error("id is required");
  if (!componentId) throw new Error("componentId is required");

  var instance = await findNodeByIdAsync(nodeId);
  if (!instance) throw new Error("Instance not found: " + nodeId);
  if (instance.type !== "INSTANCE") {
    throw new Error("swapComponent source must be an INSTANCE, got: " + instance.type);
  }

  var target = await findNodeByIdAsync(componentId);
  if (!target) throw new Error("Target component not found: " + componentId);
  if (target.type !== "COMPONENT") {
    throw new Error("swapComponent target must be a COMPONENT, got: " + target.type);
  }

  instance.swapComponent(target);

  return {
    id: instance.id,
    name: instance.name,
    newMainComponentId: target.id,
    newMainComponentName: target.name,
  };
};
