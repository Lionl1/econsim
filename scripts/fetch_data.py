#!/usr/bin/env python3
"""Collects data for all countries of the world -> public/data/countries.json

Sources:
  * world-countries (mledoze/countries, npm) — country list, ISO codes, coordinates, borders, Russian names
  * World Bank Open Data API — macro indicators (latest available value) and governance indicators (WGI)
  * Natural Earth via world-atlas — border polygons for the globe
Missing values are filled with the regional median and listed in the `imputed` field.
Usage: python3 scripts/fetch_data.py            — rebuild everything
       python3 scripts/fetch_data.py --add UNK  — add/update one country (world-countries code) without refetching the rest
"""
import json, statistics, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

def get(url, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:
            if i == retries - 1:
                raise

INDICATORS = {
    "gdp": "NY.GDP.MKTP.CD",          # GDP, current USD
    "gdpPc": "NY.GDP.PCAP.CD",        # GDP per capita
    "pop": "SP.POP.TOTL",             # population
    "growth": "NY.GDP.MKTP.KD.ZG",    # real GDP growth, %
    "infl": "FP.CPI.TOTL.ZG",         # CPI inflation, %
    "unemp": "SL.UEM.TOTL.ZS",        # unemployment, %
    "debt": "GC.DOD.TOTL.GD.ZS",      # government debt, % GDP
    "exports": "NE.EXP.GNFS.ZS",      # exports, % GDP
    "imports": "NE.IMP.GNFS.ZS",      # imports, % GDP
    "mil": "MS.MIL.XPND.GD.ZS",       # military spending, % GDP
    "lifeExp": "SP.DYN.LE00.IN",      # life expectancy
    "gini": "SI.POV.GINI",            # inequality
    "fuelExp": "TX.VAL.FUEL.ZS.UN",   # fuel, % of merchandise exports
    "energyImp": "EG.IMP.CONS.ZS",    # net energy imports, % of use
    "fdi": "BX.KLT.DINV.WD.GD.ZS",    # FDI inflows, % GDP
    "popGrowth": "SP.POP.GROW",       # population growth, %
    "urban": "SP.URB.TOTL.IN.ZS",     # urban population, %
    "tertiary": "SE.TER.ENRR",        # tertiary enrollment, %
    "internet": "IT.NET.USER.ZS",     # internet users, %
    "wgiVA": "GOV_WGI_VA.EST",        # voice and accountability (democracy)
    "wgiPV": "GOV_WGI_PV.EST",        # political stability
    "wgiGE": "GOV_WGI_GE.EST",        # government effectiveness
    "wgiCC": "GOV_WGI_CC.EST",        # control of corruption
}

# manual data for countries missing in WB (estimates, ~2023-24; marked as manual)
MANUAL = {
    "TWN": dict(gdp=7.9e11, gdpPc=33500, pop=23.4e6, growth=3.5, infl=2.2, unemp=3.4, debt=28, exports=62, imports=52,
                mil=2.5, lifeExp=80.7, gini=34, fuelExp=2, energyImp=97, fdi=2.0, urban=79, tertiary=85, internet=92,
                wgiVA=0.9, wgiPV=0.9, wgiGE=1.4, wgiCC=0.9),
    "PRK": dict(gdp=2.8e10, gdpPc=1100, pop=26.2e6, growth=-1.0, infl=15, unemp=4, debt=30, exports=3, imports=8,
                mil=20, lifeExp=73, gini=40, fuelExp=3, energyImp=5, fdi=0.1, urban=63, tertiary=40, internet=1,
                wgiVA=-2.2, wgiPV=-0.1, wgiGE=-1.8, wgiCC=-1.6),
}

# world-countries -> World Bank codes (Kosovo has the temporary code UNK and no numeric code in world-countries)
ISO_FIX = {"UNK": "XKX"}
NAME_RU_FIX = {"XKX": "Косово"}
EXTRA = ("TWN", "PSE", "UNK")   # partially recognized but separate economies

def fetch_indicator(item, country="all"):
    key, code = item
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{code}?format=json&per_page=400&mrnev=1"
    data = json.loads(get(url))
    out = {}
    if len(data) < 2 or not data[1]:
        return key, out
    for row in data[1]:
        v = row.get("value")
        iso = row.get("countryiso3code")
        if v is not None and iso:
            out[iso] = (v, row.get("date"))
    return key, out

def main():
    wc = json.loads(get("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json"))
    # Taiwan, Palestine and Kosovo lack full recognition but are separate actors in the model
    wc = [c for c in wc if (c.get("independent") and c.get("ccn3")) or c["cca3"] in EXTRA]
    print(f"independent countries with numeric code: {len(wc)}")

    with ThreadPoolExecutor(8) as ex:
        results = dict(ex.map(fetch_indicator, INDICATORS.items()))
    for k, v in results.items():
        print(f"  {k:10s} {len(v):4d} values")

    # WB metadata (region, income level, capital with coordinates)
    meta = json.loads(get("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1]
    wbmeta = {m["id"]: m for m in meta}

    countries = []
    for c in sorted(wc, key=lambda x: x["name"]["common"]):
        iso = ISO_FIX.get(c["cca3"], c["cca3"])
        rec = {
            "iso3": iso,
            "iso2": c["cca2"],
            "num": c.get("ccn3") or "",
            "name": c["name"]["common"],
            "nameRu": NAME_RU_FIX.get(iso) or c.get("translations", {}).get("rus", {}).get("common") or c["name"]["common"],
            "region": c.get("region"),
            "subregion": c.get("subregion"),
            "lat": c["latlng"][0] if c.get("latlng") else 0,
            "lon": c["latlng"][1] if c.get("latlng") else 0,
            "area": c.get("area") or 0,
            "borders": [ISO_FIX.get(b, b) for b in c.get("borders", [])],
            "landlocked": c.get("landlocked", False),
            "unMember": bool(c.get("unMember")),
            "imputed": [],
        }
        wb = wbmeta.get(iso)
        if wb:
            rec["income"] = wb["incomeLevel"]["id"]
            try:
                if wb.get("latitude") and wb.get("longitude"):
                    rec["capLat"], rec["capLon"] = float(wb["latitude"]), float(wb["longitude"])
            except ValueError:
                pass
            rec["capital"] = wb.get("capitalCity") or ""
        else:
            rec["income"] = "UNK"
            rec["capital"] = (c.get("capital") or [""])[0]
        years = {}
        for key in INDICATORS:
            hit = results[key].get(iso)
            if hit:
                rec[key] = hit[0]
                years[key] = hit[1]
        if iso in MANUAL:
            for k, v in MANUAL[iso].items():
                if k not in rec:
                    rec[k] = v
                    years[k] = "manual"
        rec["years"] = years
        countries.append(rec)

    # imputation: regional median (then world median)
    for key in INDICATORS:
        world = [r[key] for r in countries if key in r]
        wmed = statistics.median(world)
        by_region = {}
        for r in countries:
            if key in r:
                by_region.setdefault(r["region"], []).append(r[key])
        for r in countries:
            if key not in r:
                vals = by_region.get(r["region"])
                r[key] = statistics.median(vals) if vals else wmed
                r["imputed"].append(key)
    # keep GDP consistent with GDP per capita x population when imputed
    for r in countries:
        if "gdp" in r["imputed"] and "gdpPc" not in r["imputed"]:
            r["gdp"] = r["gdpPc"] * r["pop"]

    (OUT / "countries.json").write_text(json.dumps(countries, ensure_ascii=False, indent=0))
    (OUT / "world-50m.json").write_bytes(get("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"))
    print(f"wrote {len(countries)} countries")
    miss = [r["iso3"] for r in countries if len(r["imputed"]) > 6]
    print("heavily imputed:", miss)

def add_one(cca3):
    """Add or update one country in the existing countries.json without refetching the rest
    (imputation uses the regional median of the saved data)."""
    path = OUT / "countries.json"
    countries = json.loads(path.read_text())
    wc = {c["cca3"]: c for c in json.loads(get("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json"))}
    c = wc[cca3]; iso = ISO_FIX.get(cca3, cca3)
    wb = json.loads(get(f"https://api.worldbank.org/v2/country/{iso}?format=json"))[1][0]
    rec = {"iso3": iso, "iso2": c["cca2"], "num": c.get("ccn3") or "", "name": c["name"]["common"],
           "nameRu": NAME_RU_FIX.get(iso) or c["translations"]["rus"]["common"], "region": c.get("region"), "subregion": c.get("subregion"),
           "lat": c["latlng"][0], "lon": c["latlng"][1], "area": c.get("area") or 0,
           "borders": [ISO_FIX.get(b, b) for b in c.get("borders", [])], "landlocked": c.get("landlocked", False),
           "unMember": bool(c.get("unMember")), "imputed": [], "income": wb["incomeLevel"]["id"],
           "capLat": float(wb["latitude"]), "capLon": float(wb["longitude"]), "capital": wb.get("capitalCity") or ""}
    years = {}
    for key, code in INDICATORS.items():
        hit = fetch_indicator((key, code), iso)[1].get(iso)
        if hit:
            rec[key], years[key] = hit
        else:
            vals = [r[key] for r in countries if r["region"] == rec["region"] and key not in r["imputed"]]
            rec[key] = statistics.median(vals); rec["imputed"].append(key)
    rec["years"] = years
    countries = [r for r in countries if r["iso3"] != iso] + [rec]
    for r in countries:
        r["borders"] = [ISO_FIX.get(b, b) for b in r["borders"]]
    countries.sort(key=lambda r: r["name"])
    path.write_text(json.dumps(countries, ensure_ascii=False, indent=0))
    print(f"added {iso}: imputed {rec['imputed']}; total {len(countries)}")

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--add":
        add_one(sys.argv[2])
    else:
        main()
