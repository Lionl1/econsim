#!/usr/bin/env python3
"""Собирает данные по всем независимым странам мира -> public/data/countries.json

Источники:
  * world-countries (mledoze/countries, npm) — список стран, ISO-коды, координаты, границы, русские названия
  * World Bank Open Data API — макро-индикаторы (последнее доступное значение) и индикаторы управления (WGI)
  * Natural Earth через world-atlas — полигоны границ для глобуса
Недостающие значения заполняются медианой по региону и помечаются в поле `imputed`.
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
    "gdp": "NY.GDP.MKTP.CD",          # ВВП, текущ. $
    "gdpPc": "NY.GDP.PCAP.CD",        # ВВП на душу
    "pop": "SP.POP.TOTL",             # население
    "growth": "NY.GDP.MKTP.KD.ZG",    # рост ВВП %
    "infl": "FP.CPI.TOTL.ZG",         # инфляция %
    "unemp": "SL.UEM.TOTL.ZS",        # безработица %
    "debt": "GC.DOD.TOTL.GD.ZS",      # гос. долг % ВВП
    "exports": "NE.EXP.GNFS.ZS",      # экспорт % ВВП
    "imports": "NE.IMP.GNFS.ZS",      # импорт % ВВП
    "mil": "MS.MIL.XPND.GD.ZS",       # военные расходы % ВВП
    "lifeExp": "SP.DYN.LE00.IN",      # продолжительность жизни
    "gini": "SI.POV.GINI",            # неравенство
    "fuelExp": "TX.VAL.FUEL.ZS.UN",   # топливо % экспорта товаров
    "energyImp": "EG.IMP.CONS.ZS",    # чистый импорт энергии % потребления
    "fdi": "BX.KLT.DINV.WD.GD.ZS",    # ПИИ % ВВП
    "popGrowth": "SP.POP.GROW",       # прирост населения %
    "urban": "SP.URB.TOTL.IN.ZS",     # урбанизация %
    "tertiary": "SE.TER.ENRR",        # высшее образование %
    "internet": "IT.NET.USER.ZS",     # интернет %
    "wgiVA": "GOV_WGI_VA.EST",        # голос и подотчётность (демократичность)
    "wgiPV": "GOV_WGI_PV.EST",        # политическая стабильность
    "wgiGE": "GOV_WGI_GE.EST",        # эффективность государства
    "wgiCC": "GOV_WGI_CC.EST",        # контроль коррупции
}

# ручные данные для стран, отсутствующих в WB (оценки, ~2023-24; помечаются как manual)
MANUAL = {
    "TWN": dict(gdp=7.9e11, gdpPc=33500, pop=23.4e6, growth=3.5, infl=2.2, unemp=3.4, debt=28, exports=62, imports=52,
                mil=2.5, lifeExp=80.7, gini=34, fuelExp=2, energyImp=97, fdi=2.0, urban=79, tertiary=85, internet=92,
                wgiVA=0.9, wgiPV=0.9, wgiGE=1.4, wgiCC=0.9),
    "PRK": dict(gdp=2.8e10, gdpPc=1100, pop=26.2e6, growth=-1.0, infl=15, unemp=4, debt=30, exports=3, imports=8,
                mil=20, lifeExp=73, gini=40, fuelExp=3, energyImp=5, fdi=0.1, urban=63, tertiary=40, internet=1,
                wgiVA=-2.2, wgiPV=-0.1, wgiGE=-1.8, wgiCC=-1.6),
}

def fetch_indicator(item):
    key, code = item
    url = f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=400&mrnev=1"
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
    # Тайвань и Палестина формально без полного признания, но нужны как самостоятельные акторы модели
    wc = [c for c in wc if (c.get("independent") or c["cca3"] in ("TWN", "PSE")) and c.get("ccn3")]
    print(f"independent countries with numeric code: {len(wc)}")

    with ThreadPoolExecutor(8) as ex:
        results = dict(ex.map(fetch_indicator, INDICATORS.items()))
    for k, v in results.items():
        print(f"  {k:10s} {len(v):4d} values")

    # метаданные WB (регион, уровень дохода, столица с координатами)
    meta = json.loads(get("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1]
    wbmeta = {m["id"]: m for m in meta}

    countries = []
    for c in sorted(wc, key=lambda x: x["name"]["common"]):
        iso = c["cca3"]
        rec = {
            "iso3": iso,
            "iso2": c["cca2"],
            "num": c["ccn3"],
            "name": c["name"]["common"],
            "nameRu": c.get("translations", {}).get("rus", {}).get("common") or c["name"]["common"],
            "region": c.get("region"),
            "subregion": c.get("subregion"),
            "lat": c["latlng"][0] if c.get("latlng") else 0,
            "lon": c["latlng"][1] if c.get("latlng") else 0,
            "area": c.get("area") or 0,
            "borders": c.get("borders", []),
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

    # импутация: медиана по региону (затем по миру)
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
    # ВВП/душу согласовать с ВВП/население, если импутировано
    for r in countries:
        if "gdp" in r["imputed"] and "gdpPc" not in r["imputed"]:
            r["gdp"] = r["gdpPc"] * r["pop"]

    (OUT / "countries.json").write_text(json.dumps(countries, ensure_ascii=False, indent=0))
    (OUT / "world-50m.json").write_bytes(get("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"))
    print(f"wrote {len(countries)} countries")
    miss = [r["iso3"] for r in countries if len(r["imputed"]) > 6]
    print("heavily imputed:", miss)

if __name__ == "__main__":
    main()
