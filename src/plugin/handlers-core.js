// ─── WRITE HANDLERS ───────────────────────────────────────────────────────────

const handlers = {};

handlers.status = async () => ({
  connected:   true,
  version:     "{{PLUGIN_VERSION}}",
  fileName:    figma.root.name,
  currentPage: figma.currentPage.name,
  pageCount:   figma.root.children.length,
  selection:   figma.currentPage.selection.map(nodeToInfo),
});

handlers.listPages = async () =>
  figma.root.children.map(p => ({ id: p.id, name: p.name }));

handlers.setPage = async (params) => {
  var name = params.name || params.pageName || (typeof params.page === "string" ? params.page : null);
  var id   = params.id   || params.pageId;
  var page = null;
  if (id)   page = figma.root.children.find(function(p) { return p.id === id; });
  if (!page && name) page = figma.root.children.find(function(p) { return p.name === name; });
  if (!page && figma.root.children.length === 1) page = figma.root.children[0];
  if (!page) throw new Error("Page not found: \"" + (name || id) + "\". Available: " + figma.root.children.map(function(p) { return p.name; }).join(", "));
  await figma.setCurrentPageAsync(page);
  // Optional prototype flow starts: [{ nodeId, name }] — replaces the page's list.
  if (Array.isArray(params.flowStartingPoints)) {
    page.flowStartingPoints = params.flowStartingPoints.map(function(f) {
      return { nodeId: f.nodeId || f.id, name: f.name || "Flow" };
    });
  }
  return { id: page.id, name: page.name, flowStartingPoints: page.flowStartingPoints };
};

handlers.createPage = async ({ name }) => {
  const existing = figma.root.children.find(p => p.name === name);
  if (existing) return { id: existing.id, name: existing.name, existed: true };
  const page = figma.createPage();
  page.name = name;
  return { id: page.id, name: page.name };
};

handlers.query = async (params) => {
  var type = params.type, name = params.name, id = params.id;
  var parentId = params.parentId, limit = params.limit || 500;
  if (id) {
    const n = await findNodeByIdAsync(id);
    return n ? [nodeToInfo(n)] : [];
  }
  if (!type && !name) throw new Error("query requires at least one of: type, name, id");
  // BUG-03: parentId filter scopes search to a subtree; default cap raised 100 → 500.
  var scope = figma.currentPage;
  if (parentId) {
    var parent = await findNodeByIdAsync(parentId);
    if (!parent) throw new Error("parentId not found: " + parentId);
    if (typeof parent.findAll !== "function") return [];
    scope = parent;
  }
  const results = scope.findAll(n => {
    if (type && name) return n.type === type && n.name === name;
    if (type) return n.type === type;
    return n.name === name;
  });
  return results.slice(0, limit).map(nodeToInfo);
};
