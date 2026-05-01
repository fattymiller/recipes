"""Lite n' Easy ingredient-library scraper.

These pages are listings of packaged-meal ingredient declarations rather than
cookable recipes. Each entry contains:
    - meal name              (h2 inside .IngredName)
    - ingredient blob        (.Ingred_Ingred_Contents) — comma-separated label text
    - serving size           (.Ingred_Serving_Contents) — e.g. "425 g"
    - allergens              (.Ingred_Allergens_Contents) — comma-separated
    - per-serving NIP table  (.Ingred_NIP)

Output JSON is compatible with the existing recipe shape, with these extras:
    - source: "liteneasy"
    - category: "breakfast-lunch" | "dinner"
    - serving_grams: int
    - allergens: [str]
    - nutrition: { energy_kj, protein_g, fat_g, sat_fat_g, carb_g, sugar_g, fibre_g, sodium_mg }
    - instructions: []   (Lite n' Easy meals are pre-prepared)
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Tag

LNE_HOST = "liteneasy.com.au"


def is_liteneasy_url(url: str) -> bool:
    return LNE_HOST in urlparse(url).netloc


def category_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    if "dinner" in path:
        return "dinner"
    if "breakfast" in path or "lunch" in path:
        return "breakfast-lunch"
    return "liteneasy"


def _split_top_level_commas(text: str) -> list[str]:
    """Split on commas that are at parenthesis depth 0."""
    parts, buf, depth = [], [], 0
    for ch in text:
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth = max(depth - 1, 0)
            buf.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    # strip trailing periods
    return [p.rstrip(".").strip() for p in parts if p]


def _parse_ingredient_token(raw: str) -> dict:
    """Pull out an optional leading percentage and name, e.g. 'Beef (14%)' -> name='Beef'."""
    name = raw
    percent = None
    m = re.match(r"^(.+?)\s*\((\d+(?:\.\d+)?)%\)\s*(.*)$", raw)
    if m:
        name = m.group(1).strip()
        percent = float(m.group(2))
        # anything after "(14%)" is sub-ingredients in another paren group; keep raw as-is
    return {
        "raw": raw,
        "name": name,
        "percent": percent,
        "quantity": None,
        "unit": None,
    }


_NIP_KEYS = {
    "energy": "energy_kj",
    "protein": "protein_g",
    "fat, total": "fat_g",
    "- saturated": "sat_fat_g",
    "carbohydrate": "carb_g",
    "- sugars": "sugar_g",
    "dietary fibre": "fibre_g",
    "sodium": "sodium_mg",
}


def _parse_nip_table(nip_span: Tag | None) -> dict:
    out: dict = {}
    if nip_span is None:
        return out
    for row in nip_span.select("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        label = cells[0].get_text(" ", strip=True).lower()
        per_serving = cells[1].get_text(" ", strip=True)
        key = _NIP_KEYS.get(label)
        if not key:
            continue
        # extract the first number from the per-serving cell
        m = re.search(r"(-?\d+(?:\.\d+)?)", per_serving)
        if m:
            out[key] = float(m.group(1))
    return out


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "liteneasy-item"


def parse_listing(html: str, url: str) -> list[dict]:
    """Return a list of normalised recipe dicts from one listing page."""
    soup = BeautifulSoup(html, "html.parser")
    category = category_from_url(url)
    host = urlparse(url).netloc.removeprefix("www.")
    recipes: list[dict] = []

    for name_span in soup.select("span.IngredName"):
        h2 = name_span.find("h2")
        anchor = name_span.find("a")
        if h2 is None:
            continue
        title = h2.get_text(" ", strip=True)
        if not title:
            continue

        # Walk forward through siblings inside the same <td> to gather companion spans.
        td = name_span.find_parent("td")
        if td is None:
            continue

        ing_span = td.select_one("span.Ingred_Ingred_Contents")
        serv_span = td.select_one("span.Ingred_Serving_Contents")
        nip_span = td.select_one("span.Ingred_NIP")
        allerg_span = td.select_one("span.Ingred_Allergens_Contents")

        ing_text = ing_span.get_text(" ", strip=True) if ing_span else ""
        ingredients_raw = _split_top_level_commas(ing_text)
        ingredients = [_parse_ingredient_token(t) for t in ingredients_raw]

        serving_grams = None
        yields = None
        if serv_span:
            yields = serv_span.get_text(" ", strip=True)
            m = re.search(r"(\d+(?:\.\d+)?)\s*g", yields, flags=re.I)
            if m:
                serving_grams = float(m.group(1))

        allergens: list[str] = []
        if allerg_span:
            allergens = [
                a.strip(" .")
                for a in allerg_span.get_text(" ", strip=True).split(",")
                if a.strip(" .")
            ]

        nutrition = _parse_nip_table(nip_span)

        anchor_name = anchor.get("name") if anchor and anchor.has_attr("name") else None
        source_url = f"{url}#{anchor_name}" if anchor_name else url

        prefix = "lne-" + ("dinner" if category == "dinner" else "bl") + "-"
        recipe_id = prefix + _slugify(title)

        recipes.append({
            "id": recipe_id,
            "title": title,
            "source": "liteneasy",
            "source_url": source_url,
            "host": host,
            "category": category,
            "image": None,
            "yields": yields,
            "servings": 1,
            "serving_grams": serving_grams,
            "total_time": None,
            "prep_time": None,
            "cook_time": None,
            "ingredients": ingredients,
            "instructions": [],
            "allergens": allergens,
            "nutrition": nutrition,
            "tags": [category, "liteneasy"],
            "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })

    return recipes
