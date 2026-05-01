// Static-site Phase 1 viewer.
// Loads ../data/recipes/index.json + per-recipe JSON files,
// lets you browse, build a 5-day x 4-slot plan, and aggregate a shopping list.
// Plan state is persisted in localStorage so refreshes don't blow it away.

const DATA_BASE = "../data/recipes";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SLOTS = [
  { key: "am1", label: "Mid-morning #1" },
  { key: "am2", label: "Mid-morning #2" },
  { key: "pm1", label: "Mid-afternoon #1" },
  { key: "pm2", label: "Mid-afternoon #2" },
];
const STORAGE_KEY = "mealprep.plan.v1";

const state = {
  index: [],            // [{id, file, title, ...}]
  recipes: new Map(),   // id -> full recipe JSON (lazy-loaded)
  plan: loadPlan(),     // { "Mon.am1": "recipe-id", ... }
  search: "",
};

// ---------- bootstrap ----------
init().catch(err => {
  document.body.insertAdjacentHTML("beforeend",
    `<pre style="color:#c0392b;padding:20px">Failed to load recipes:\n${err}</pre>`);
});

async function init() {
  const res = await fetch(`${DATA_BASE}/index.json`);
  if (!res.ok) throw new Error(`index.json ${res.status}`);
  state.index = await res.json();

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("search").addEventListener("input", e => {
    state.search = e.target.value.toLowerCase().trim();
    renderRecipeList();
  });

  document.getElementById("clear-plan").addEventListener("click", () => {
    if (!confirm("Clear the whole plan?")) return;
    state.plan = {};
    savePlan();
    renderPlanner();
    renderShopping();
  });

  document.getElementById("copy-shopping").addEventListener("click", copyShopping);

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", e => {
    if (e.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  renderRecipeList();
  renderPlanner();
  renderShopping();
  lneInit();
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "shopping") renderShopping();
  if (view === "liteneasy") ensureLneLoaded();
}

// ---------- persistence ----------
function loadPlan() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function savePlan() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan));
}

// ---------- recipe loading ----------
async function loadRecipe(id) {
  if (state.recipes.has(id)) return state.recipes.get(id);
  const meta = state.index.find(r => r.id === id);
  if (!meta) return null;
  const res = await fetch(`${DATA_BASE}/${meta.file}`);
  if (!res.ok) return null;
  const data = await res.json();
  state.recipes.set(id, data);
  return data;
}

// ---------- recipes view ----------
function renderRecipeList() {
  const list = document.getElementById("recipe-list");
  const q = state.search;
  const filtered = state.index.filter(r => {
    if (!q) return true;
    return (r.title || "").toLowerCase().includes(q) || (r.host || "").toLowerCase().includes(q);
  });
  document.getElementById("recipe-count").textContent =
    `${filtered.length} of ${state.index.length} recipes`;

  list.innerHTML = filtered.map(r => `
    <li class="recipe-card" data-id="${escapeAttr(r.id)}">
      <div class="thumb" style="${r.image ? `background-image:url('${escapeAttr(r.image)}')` : ""}"></div>
      <div class="meta">
        <p class="title">${escapeHtml(r.title || "Untitled")}</p>
        <div class="sub">
          <span>${escapeHtml(r.host || "")}</span>
          ${r.total_time ? `<span class="badge">${r.total_time} min</span>` : ""}
          ${r.servings ? `<span>· ${r.servings} servings</span>` : ""}
          <span>· ${r.ingredient_count} ingr.</span>
        </div>
      </div>
    </li>
  `).join("");

  list.querySelectorAll(".recipe-card").forEach(card => {
    card.addEventListener("click", () => openRecipe(card.dataset.id));
  });
}

async function openRecipe(id) {
  const recipe = await loadRecipe(id);
  if (!recipe) return;
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <h2>${escapeHtml(recipe.title)}</h2>
    <div class="src">
      <a href="${escapeAttr(recipe.source_url)}" target="_blank" rel="noopener">${escapeHtml(recipe.host)}</a>
      ${recipe.total_time ? ` · ${recipe.total_time} min` : ""}
      ${recipe.yields ? ` · ${escapeHtml(recipe.yields)}` : ""}
    </div>
    ${recipe.image ? `<img src="${escapeAttr(recipe.image)}" alt="" style="width:100%;border-radius:8px;margin-bottom:8px;max-height:280px;object-fit:cover">` : ""}
    <h3>Ingredients</h3>
    <ul class="ing-list">
      ${recipe.ingredients.map(i => `<li>${escapeHtml(i.raw)}</li>`).join("")}
    </ul>
    <h3>Instructions</h3>
    <ol class="step-list">
      ${recipe.instructions.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
    </ol>
  `;
  document.getElementById("modal").classList.remove("hidden");
}
function closeModal() { document.getElementById("modal").classList.add("hidden"); }

// ---------- planner ----------
function renderPlanner() {
  const grid = document.getElementById("planner-grid");
  const options = ['<option value="">— none —</option>']
    .concat(state.index.map(r => `<option value="${escapeAttr(r.id)}">${escapeHtml(r.title)}</option>`))
    .join("");

  grid.innerHTML = DAYS.map(day => `
    <div class="day-card">
      <h3>${day}</h3>
      ${SLOTS.map(slot => {
        const k = `${day}.${slot.key}`;
        const selected = state.plan[k] || "";
        return `
          <div class="slot">
            <label>${slot.label}</label>
            <select data-slot="${k}">
              ${options.replace(`value="${selected}"`, `value="${selected}" selected`)}
            </select>
          </div>`;
      }).join("")}
    </div>
  `).join("");

  grid.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", e => {
      const k = sel.dataset.slot;
      if (e.target.value) state.plan[k] = e.target.value;
      else delete state.plan[k];
      savePlan();
      renderShopping();
    });
  });
}

// ---------- shopping list ----------
async function renderShopping() {
  const ul = document.getElementById("shopping-list");
  const summary = document.getElementById("shopping-summary");
  const ids = Object.values(state.plan).filter(Boolean);
  if (!ids.length) {
    summary.textContent = "No meals planned yet.";
    ul.innerHTML = "";
    return;
  }

  // Make sure all picked recipes are loaded.
  await Promise.all(ids.map(loadRecipe));

  // Aggregate: key by (name + unit). When units differ, list separate lines.
  const buckets = new Map();
  for (const id of ids) {
    const r = state.recipes.get(id);
    if (!r) continue;
    for (const ing of r.ingredients) {
      const name = (ing.name || ing.raw).trim().toLowerCase();
      const unit = (ing.unit || "").toLowerCase();
      const key = `${name}::${unit}`;
      const entry = buckets.get(key) || {
        name: ing.name || ing.raw,
        unit: ing.unit || "",
        quantity: 0,
        anyQuantity: false,
        sources: new Set(),
        rawSamples: new Set(),
      };
      if (typeof ing.quantity === "number") {
        entry.quantity += ing.quantity;
        entry.anyQuantity = true;
      } else {
        entry.rawSamples.add(ing.raw);
      }
      entry.sources.add(r.title);
      buckets.set(key, entry);
    }
  }

  const rows = [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name));
  summary.textContent = `${rows.length} ingredients · ${ids.length} meals`;

  ul.innerHTML = rows.map((row, i) => {
    const qtyText = row.anyQuantity
      ? `${formatQty(row.quantity)}${row.unit ? " " + row.unit : ""}`
      : "—";
    const fromText = [...row.sources].join(", ");
    return `
      <li data-i="${i}">
        <input type="checkbox" />
        <span class="qty">${escapeHtml(qtyText)}</span>
        <span class="name">${escapeHtml(row.name)}</span>
        <span class="from" title="${escapeAttr(fromText)}">×${row.sources.size}</span>
      </li>`;
  }).join("");

  ul.querySelectorAll("li").forEach(li => {
    li.querySelector("input").addEventListener("change", e => {
      li.classList.toggle("checked", e.target.checked);
    });
  });
}

function copyShopping() {
  const lines = [...document.querySelectorAll("#shopping-list li")].map(li => {
    const qty = li.querySelector(".qty").textContent;
    const name = li.querySelector(".name").textContent;
    return `- ${qty === "—" ? "" : qty + " "}${name}`;
  });
  navigator.clipboard.writeText(lines.join("\n"))
    .then(() => alert("Shopping list copied"))
    .catch(() => alert("Copy failed"));
}

// ---------- helpers ----------
function formatQty(n) {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return (Math.round(n * 100) / 100).toString();
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ============================================================================
// Lite n' Easy tab — rate meals, list liked/disliked ingredients,
// build suggestions from ingredient overlap. All persisted in localStorage.
// ============================================================================
const LNE_RATINGS_KEY = "mealprep.lne.ratings.v1";
const LNE_PREFS_KEY   = "mealprep.lne.ingredients.v1";

const lneState = {
  ready: false,
  loading: false,
  meals: [],                       // [{ id, title, category, ingredientNames: [norm strings] }]
  ratings: loadJSON(LNE_RATINGS_KEY, {}),
  prefs:   loadJSON(LNE_PREFS_KEY, { liked: [], disliked: [], hideDisliked: false }),
  search: "",
  category: "all",                 // all | breakfast-lunch | dinner
  ratingFilter: "any",             // any | unrated | up | down
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function saveLneRatings() { saveJSON(LNE_RATINGS_KEY, lneState.ratings); }
function saveLnePrefs()   { saveJSON(LNE_PREFS_KEY,   lneState.prefs); }

// Normalize an ingredient name into a comparable token string.
// Strips parenthetical sub-ingredients and percentage markers.
function normIng(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, " ")    // drop "(40%)" / "(Tomato, Citric Acid)"
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function lneSummary() {
  const r = lneState.ratings;
  let up = 0, down = 0, neutral = 0;
  for (const v of Object.values(r)) {
    if (v === "up") up++; else if (v === "down") down++; else if (v === "neutral") neutral++;
  }
  return { up, down, neutral, total: up + down + neutral };
}

async function ensureLneLoaded() {
  if (lneState.ready || lneState.loading) return;
  lneState.loading = true;
  document.getElementById("lne-loading").classList.remove("hidden");

  const lneIndex = state.index.filter(r => r.source === "liteneasy");
  // Bulk fetch every LNE recipe in parallel; results cached in state.recipes.
  await Promise.all(lneIndex.map(meta => loadRecipe(meta.id)));

  lneState.meals = lneIndex.map(meta => {
    const full = state.recipes.get(meta.id);
    const names = (full?.ingredients || [])
      .map(i => normIng(i.name || i.raw))
      .filter(Boolean);
    return {
      id: meta.id,
      title: meta.title,
      category: meta.category || "liteneasy",
      ingredientNames: names,
      ingredientSet: new Set(names),
    };
  });

  lneState.ready = true;
  lneState.loading = false;
  document.getElementById("lne-loading").classList.add("hidden");
  renderLne();
}

function lneInit() {
  // Search
  document.getElementById("lne-search").addEventListener("input", e => {
    lneState.search = e.target.value.toLowerCase().trim();
    renderLneLists();
  });

  // Category segmented control
  document.querySelectorAll('#view-liteneasy .seg-btn[data-cat]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('#view-liteneasy .seg-btn[data-cat]')
        .forEach(b => b.classList.toggle("active", b === btn));
      lneState.category = btn.dataset.cat;
      renderLneLists();
    });
  });

  // Rating filter segmented control
  document.querySelectorAll('#view-liteneasy .seg-btn[data-rating]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('#view-liteneasy .seg-btn[data-rating]')
        .forEach(b => b.classList.toggle("active", b === btn));
      lneState.ratingFilter = btn.dataset.rating;
      renderLneLists();
    });
  });

  // Liked ingredients form
  document.getElementById("lne-liked-form").addEventListener("submit", e => {
    e.preventDefault();
    const input = e.currentTarget.querySelector("input");
    addPrefIngredient("liked", input.value);
    input.value = "";
  });
  document.getElementById("lne-disliked-form").addEventListener("submit", e => {
    e.preventDefault();
    const input = e.currentTarget.querySelector("input");
    addPrefIngredient("disliked", input.value);
    input.value = "";
  });

  // Hide-disliked toggle
  const hide = document.getElementById("lne-hide-disliked");
  hide.checked = !!lneState.prefs.hideDisliked;
  hide.addEventListener("change", () => {
    lneState.prefs.hideDisliked = hide.checked;
    saveLnePrefs();
    renderLneLists();
  });

  // Profile actions
  document.getElementById("lne-reset").addEventListener("click", () => {
    if (!confirm("Clear all Lite n' Easy ratings and ingredient preferences?")) return;
    lneState.ratings = {};
    lneState.prefs = { liked: [], disliked: [], hideDisliked: false };
    saveLneRatings(); saveLnePrefs();
    document.getElementById("lne-hide-disliked").checked = false;
    renderLne();
  });
  document.getElementById("lne-export").addEventListener("click", () => {
    const payload = JSON.stringify({
      ratings: lneState.ratings, preferences: lneState.prefs,
    }, null, 2);
    navigator.clipboard.writeText(payload)
      .then(() => alert("Taste profile copied to clipboard"))
      .catch(() => alert("Copy failed"));
  });
}

function addPrefIngredient(kind, raw) {
  const term = String(raw || "").trim().toLowerCase();
  if (!term) return;
  const list = lneState.prefs[kind];
  if (!list.includes(term)) list.push(term);
  // Make liked/disliked mutually exclusive.
  const other = kind === "liked" ? "disliked" : "liked";
  lneState.prefs[other] = lneState.prefs[other].filter(t => t !== term);
  saveLnePrefs();
  renderLnePrefs();
  renderLneLists();
}
function removePrefIngredient(kind, term) {
  lneState.prefs[kind] = lneState.prefs[kind].filter(t => t !== term);
  saveLnePrefs();
  renderLnePrefs();
  renderLneLists();
}

function renderLne() {
  renderLnePrefs();
  renderLneSummary();
  renderLneLists();
}

function renderLneSummary() {
  const s = lneSummary();
  const el = document.getElementById("lne-summary");
  if (!s.total) {
    el.textContent = "No ratings yet. Rate a few meals to unlock suggestions.";
  } else {
    el.innerHTML = `👍 <b>${s.up}</b> · 👎 <b>${s.down}</b> · neutral <b>${s.neutral}</b>`;
  }
}

function renderLnePrefs() {
  const liked = document.getElementById("lne-liked-chips");
  const disliked = document.getElementById("lne-disliked-chips");
  liked.innerHTML = lneState.prefs.liked.map(t => `
    <span class="chip">${escapeHtml(t)}<button data-kind="liked" data-term="${escapeAttr(t)}" aria-label="Remove">×</button></span>
  `).join("");
  disliked.innerHTML = lneState.prefs.disliked.map(t => `
    <span class="chip bad">${escapeHtml(t)}<button data-kind="disliked" data-term="${escapeAttr(t)}" aria-label="Remove">×</button></span>
  `).join("");
  document.querySelectorAll("#lne-liked-chips button, #lne-disliked-chips button").forEach(btn => {
    btn.addEventListener("click", () =>
      removePrefIngredient(btn.dataset.kind, btn.dataset.term));
  });
}

// Does any ingredient name in the meal contain the given preference term?
function mealMatchesTerm(meal, term) {
  if (!term) return false;
  const t = term.toLowerCase();
  for (const name of meal.ingredientNames) {
    if (name.includes(t)) return true;
  }
  return false;
}
function mealHasAnyDisliked(meal) {
  return lneState.prefs.disliked.some(t => mealMatchesTerm(meal, t));
}

function applyMealFilters(meals) {
  const q = lneState.search;
  const cat = lneState.category;
  const rf = lneState.ratingFilter;
  const hide = lneState.prefs.hideDisliked;
  return meals.filter(m => {
    if (cat !== "all" && m.category !== cat) return false;
    if (rf === "unrated" && lneState.ratings[m.id]) return false;
    if (rf === "up"   && lneState.ratings[m.id] !== "up")   return false;
    if (rf === "down" && lneState.ratings[m.id] !== "down") return false;
    if (hide && mealHasAnyDisliked(m)) return false;
    if (q) {
      const titleMatch = m.title.toLowerCase().includes(q);
      const ingMatch = m.ingredientNames.some(n => n.includes(q));
      if (!titleMatch && !ingMatch) return false;
    }
    return true;
  });
}

// Build a Map<ingredientName, signedCount> aggregated over rated meals.
function buildIngredientSignals() {
  const signals = new Map();   // name -> +N (from up) / -N (from down)
  for (const m of lneState.meals) {
    const verdict = lneState.ratings[m.id];
    if (verdict !== "up" && verdict !== "down") continue;
    const sign = verdict === "up" ? 1 : -1;
    for (const name of m.ingredientSet) {
      signals.set(name, (signals.get(name) || 0) + sign);
    }
  }
  return signals;
}

function scoreMeal(meal, signals) {
  let score = 0;
  let posMatches = [];
  let negMatches = [];
  for (const name of meal.ingredientSet) {
    const s = signals.get(name);
    if (s) {
      score += s;
      if (s > 0) posMatches.push(name);
      else negMatches.push(name);
    }
  }
  // Bonus/penalty from explicit liked/disliked ingredient terms (substring).
  for (const t of lneState.prefs.liked) {
    if (mealMatchesTerm(meal, t)) score += 2;
  }
  for (const t of lneState.prefs.disliked) {
    if (mealMatchesTerm(meal, t)) score -= 3;
  }
  // Normalise gently by ingredient count so large meals don't dominate.
  const denom = Math.max(meal.ingredientSet.size, 4);
  return { score, normScore: score / Math.sqrt(denom), posMatches, negMatches };
}

function renderLneLists() {
  if (!lneState.ready) return;
  const filtered = applyMealFilters(lneState.meals);
  document.getElementById("lne-count").textContent =
    `${filtered.length} of ${lneState.meals.length} meals`;

  // Suggestions: only over UNRATED + filtered meals, top 8 with score > 0.
  const signals = buildIngredientSignals();
  const haveSignal = signals.size > 0 || lneState.prefs.liked.length || lneState.prefs.disliked.length;
  const suggestionsWrap = document.getElementById("lne-suggestions-wrap");
  if (haveSignal) {
    const candidates = filtered
      .filter(m => !lneState.ratings[m.id])
      .map(m => ({ meal: m, ...scoreMeal(m, signals) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.normScore - a.normScore)
      .slice(0, 8);
    if (candidates.length) {
      suggestionsWrap.classList.remove("hidden");
      document.getElementById("lne-suggestions").innerHTML =
        candidates.map(c => mealCardHtml(c.meal, c)).join("");
      bindMealCardEvents("#lne-suggestions");
    } else {
      suggestionsWrap.classList.add("hidden");
    }
  } else {
    suggestionsWrap.classList.add("hidden");
  }

  // Main list: stable A-Z within each category.
  const sorted = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  document.getElementById("lne-list").innerHTML =
    sorted.map(m => mealCardHtml(m)).join("");
  bindMealCardEvents("#lne-list");
}

function mealCardHtml(meal, scoreInfo) {
  const verdict = lneState.ratings[meal.id] || "";
  const cat = meal.category === "dinner" ? "Dinner" : "Breakfast & Lunch";
  const hasDisliked = mealHasAnyDisliked(meal);
  return `
    <li class="lne-card ${verdict}" data-id="${escapeAttr(meal.id)}" tabindex="0">
      <div class="row">
        <span class="title">${escapeHtml(meal.title)}</span>
        <span class="badge cat">${cat}</span>
        ${scoreInfo ? `<span class="badge score" title="Suggestion score">+${scoreInfo.score}</span>` : ""}
        ${hasDisliked ? `<span class="badge warn" title="Contains a disliked ingredient">!</span>` : ""}
      </div>
      <div class="meta">${meal.ingredientSet.size} ingredients</div>
      ${scoreInfo && scoreInfo.posMatches.length
        ? `<div class="matched">Shared with liked meals: <b>${escapeHtml(scoreInfo.posMatches.slice(0, 4).join(", "))}</b>${scoreInfo.posMatches.length > 4 ? "…" : ""}</div>`
        : ""}
      <div class="rate-row" data-id="${escapeAttr(meal.id)}">
        <button class="rate-btn up ${verdict === "up" ? "active" : ""}" data-rate="up" aria-label="Thumbs up">👍</button>
        <button class="rate-btn neutral ${verdict === "neutral" ? "active" : ""}" data-rate="neutral" aria-label="Neutral">·</button>
        <button class="rate-btn down ${verdict === "down" ? "active" : ""}" data-rate="down" aria-label="Thumbs down">👎</button>
      </div>
    </li>`;
}

function bindMealCardEvents(rootSelector) {
  document.querySelectorAll(`${rootSelector} .lne-card`).forEach(card => {
    // Open detail when clicking the card body (not the rating buttons).
    card.addEventListener("click", e => {
      if (e.target.closest(".rate-row")) return;
      openRecipe(card.dataset.id);
    });
    card.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".rate-row")) {
        e.preventDefault();
        openRecipe(card.dataset.id);
      }
    });
  });
  document.querySelectorAll(`${rootSelector} .rate-btn`).forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.parentElement.dataset.id;
      const next = btn.dataset.rate;
      // Toggle off if pressing the already-active rating.
      if (lneState.ratings[id] === next) delete lneState.ratings[id];
      else lneState.ratings[id] = next;
      saveLneRatings();
      renderLneSummary();
      renderLneLists();
    });
  });
}
