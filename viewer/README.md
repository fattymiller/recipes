# Viewer (Phase 1)

A no-build static site that reads `../data/recipes/*.json` directly.

Must be served from the **repo root** (so `../data/recipes/` is reachable):

```bash
./viewer/serve.sh                 # http://localhost:8000/viewer/
# or, equivalently:
cd /path/to/recipes && python3 -m http.server 8000
# then open http://localhost:8000/viewer/
```

Three tabs:
1. **Recipes** — browse / search every scraped recipe; click for full ingredients + instructions.
2. **Weekly Plan** — 5 days × 4 slots. Pick any recipe in any slot. Saved in `localStorage`.
3. **Shopping List** — auto-aggregated from the current plan, grouped by ingredient + unit.

This will be replaced by a React + Vite + TypeScript app talking to the Rails API in Phase 3.
