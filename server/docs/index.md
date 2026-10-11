
# figma-ui-mcp — API Reference

Call `figma_docs` with a `section` param to load a specific part:

| section | What's inside |
|---------|---------------|
| _(none)_ | **Quick-start checklist + Critical rules 0–9 + Design Library defaults** — load this first |
| `"rules"` | Design rules 10–20 (spacing, radius, shadow, semantic colors, states) + component reuse |
| `"layout"` | Auto-layout, button/card/badge/progress bar/mobile anchoring/header centering rules |
| `"api"` | Create / Modify / Delete / Clone / Batch / Read operations + full workflow example |
| `"tokens"` | setupDesignTokens, applyTextStyle, modifyVariable, applyVariable, multi-mode workflow |
| `"icons"` | loadImage, loadIcon, loadIconIn, icon library priority table, coloring & sizing rules |

**Recommended call order for a new design session:**
1. `figma_docs` (no section) → rules + quick-start
2. `figma_docs { section: "layout" }` → layout patterns
3. `figma_docs { section: "api" }` → create/modify API
4. `figma_docs { section: "tokens" }` → if using variables/multi-mode
5. `figma_docs { section: "icons" }` → if placing icons or images
