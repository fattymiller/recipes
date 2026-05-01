# Viewer (Phase 1)

A no-build static site. Recipe JSON lives in `./data/recipes/`, alongside the
HTML/CSS/JS, so the whole folder can be deployed as a single static bundle.

```bash
./viewer/serve.sh                 # http://localhost:8000/
# or, equivalently:
cd viewer && python3 -m http.server 8000
# then open http://localhost:8000/
```

Three tabs:
1. **Recipes** — browse / search every scraped recipe; click for full ingredients + instructions.
2. **Weekly Plan** — 5 days × 4 slots. Pick any recipe in any slot. Saved in `localStorage`.
3. **Shopping List** — auto-aggregated from the current plan, grouped by ingredient + unit.

This will be replaced by a React + Vite + TypeScript app talking to the Rails API in Phase 3.
