# Meal Prep Planner

A multi-phase project to plan 4 prepped meals per day (2 mid-morning + 2 mid-afternoon),
buying a single weekly shop where ingredients are shared across recipes.

> **Meal model:** all 4 daily slots draw from one common pool of recipes — any recipe can be
> assigned to any slot.

## Repo layout (monorepo for now, will split later)

```
recipes/
├── scraper/      # Phase 1: Python scraper using `recipe-scrapers`
├── data/         # Canonical recipe JSON files (the database for now)
│   └── recipes/  # one file per recipe
├── viewer/       # Phase 1: static HTML/JS viewer + weekly planner + shopping list
├── server/       # Phase 2/3: Ruby on Rails API + SQLite (future, separate repo)
└── web/          # Phase 2/3: React + Vite + TypeScript app (future, separate repo)
```

## Phases

### Phase 1 — Ingest + view (this repo, now)
- `scraper/` pulls recipes from food blogs (RecipeTinEats, Budget Bytes, etc.)
  using the [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers) library.
- Recipes are normalised and saved as JSON in `data/recipes/`.
- `viewer/` is a static site that lists recipes, lets you build a 5-day plan
  (4 meals/day = 20 slots), and aggregates a shopping list with shared ingredients.

### Phase 2 — Rails API + SQLite
- Move `data/recipes/*.json` into a SQLite-backed Rails app.
- Add user-editable recipes, tags, prep/cook timing, batch-cook scheduling.
- This becomes its own repo (`meal-prep-server`).

### Phase 3 — React + Vite + TypeScript frontend
- Replace `viewer/` with a real SPA that talks to the Rails API.
- Drag-and-drop weekly planner, shopping list checkout view, prep schedule.
- Its own repo (`meal-prep-web`).

### Phase 4 — Woolworths pricing
- Hook into Woolworths API to attach prices to ingredients.
- Cost per meal / per day / per week, optimise plans by price.

## Quick start (Phase 1)

```bash
# 1. Scrape some seed recipes -> data/recipes/*.json
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scrape.py --seed   # uses urls in seeds.txt

# add your own:
python scrape.py https://www.recipetineats.com/some-recipe/

# 2. Open the viewer (must be served from the repo root)
cd ..
./viewer/serve.sh         # then visit http://localhost:8000/viewer/
```
