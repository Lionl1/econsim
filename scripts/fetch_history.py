#!/usr/bin/env python3
"""World Bank history 1995-2024 -> public/data/history.json

Used by the calendar of global events (historical start years, actual series on charts) and by calibration.
Per country: real growth, inflation, unemployment, GDP (current USD), population, official exchange rate,
government debt. World aggregates (_WLD): growth and inflation.
"""
import json, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "history.json"
IND = {"growth": "NY.GDP.MKTP.KD.ZG", "infl": "FP.CPI.TOTL.ZG", "unemp": "SL.UEM.TOTL.ZS", "gdp": "NY.GDP.MKTP.CD",
       "pop": "SP.POP.TOTL", "fx": "PA.NUS.FCRF", "debt": "GC.DOD.TOTL.GD.ZS"}
iso3 = {c["iso3"] for c in json.load(open(ROOT / "public/data/countries.json"))}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "econsim-data-fetch"}), timeout=120) as r:
        return json.loads(r.read())

res = {}
for k, code in IND.items():
    rows = get(f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&date=1995:2024&per_page=20000")[1]
    for r in rows:
        if r["countryiso3code"] in iso3 and r["value"] is not None:
            v = r["value"]
            res.setdefault(r["countryiso3code"], {}).setdefault(k, {})[r["date"]] = round(v, 4) if abs(v) < 1e6 else round(v)
    print(k, len(rows))
res["_WLD"] = {}
for k, code in (("growth", "NY.GDP.MKTP.KD.ZG"), ("infl", "FP.CPI.TOTL.ZG")):
    rows = get(f"https://api.worldbank.org/v2/country/WLD/indicator/{code}?format=json&date=1995:2024&per_page=100")[1]
    res["_WLD"][k] = {r["date"]: round(r["value"], 3) for r in rows if r["value"] is not None}
OUT.write_text(json.dumps(res, separators=(",", ":")))
print(len(res) - 1, "countries ->", OUT)
