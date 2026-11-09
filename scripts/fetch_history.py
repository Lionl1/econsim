#!/usr/bin/env python3
"""История World Bank 2000-2024 (рост, инфляция, безработица, ВВП $) -> data/history.json (для калибровки, не для UI)."""
import json, urllib.request
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "data"; OUT.mkdir(exist_ok=True)
IND = {"growth": "NY.GDP.MKTP.KD.ZG", "infl": "FP.CPI.TOTL.ZG", "unemp": "SL.UEM.TOTL.ZS", "gdp": "NY.GDP.MKTP.CD"}
iso3 = {c["iso3"] for c in json.load(open(Path(__file__).resolve().parent.parent / "public/data/countries.json"))}
res = {}
for k, code in IND.items():
    url = f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&date=2000:2024&per_page=20000"
    rows = json.load(urllib.request.urlopen(url, timeout=120))[1]
    for r in rows:
        if r["countryiso3code"] in iso3 and r["value"] is not None:
            res.setdefault(r["countryiso3code"], {}).setdefault(k, {})[r["date"]] = r["value"]
    print(k, len(rows))
# мировой рост
url = "https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&date=2000:2024&per_page=100"
res["_WLD"] = {"growth": {r["date"]: r["value"] for r in json.load(urllib.request.urlopen(url, timeout=60))[1] if r["value"] is not None}}
json.dump(res, open(OUT / "history.json", "w"))
print(len(res), "countries")
