#!/usr/bin/env python3
"""Bilateral trade from UN Comtrade (public preview API, no key) -> data/trade_raw.json -> public/data/trade.json

For every country we fetch goods imports (M) and exports (X) by partner, HS TOTAL, for the latest available year.
A flow i->j comes from the importer j's report (CIF, more reliable), otherwise from the exporter i's report (mirror data).
This also covers countries that do not report themselves (Taiwan, North Korea, ...).
Usage: python3 scripts/fetch_trade.py            — download what is missing and build trade.json (slow: ~20 s per request)
       python3 scripts/fetch_trade.py --build    — only rebuild trade.json from the downloaded cache
"""
import json, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "trade_raw.json"
OUT = ROOT / "public" / "data" / "trade.json"
YEARS = ["2023", "2022"]
TWN_CODE = 490          # "Other Asia, nes" in Comtrade = Taiwan
API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode={r}&period={y}&partnerCode=&cmdCode=TOTAL&flowCode={f}&maxRecords=500"

class RateLimited(Exception):
    pass

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                raise RateLimited(f"HTTP {e.code}")
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    return None

def reference():
    rep = get("https://comtradeapi.un.org/files/v1/app/reference/Reporters.json")["results"]
    par = get("https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json")["results"]
    rep = [r for r in rep if not r.get("isGroup") and not r.get("entryExpiredDate")]
    code2iso = {p["PartnerCode"]: p.get("PartnerCodeIsoAlpha3") for p in par if not p.get("isGroup")}
    code2iso[TWN_CODE] = "TWN"
    iso2rep = {r["reporterCodeIsoAlpha3"]: r["reporterCode"] for r in rep if r.get("reporterCodeIsoAlpha3")}
    return iso2rep, code2iso

def download():
    countries = json.loads((ROOT / "public/data/countries.json").read_text())
    iso2rep, code2iso = reference()
    raw = json.loads(RAW.read_text()) if RAW.exists() else {"code2iso": {}, "flows": {}}
    raw["code2iso"] = {str(k): v for k, v in code2iso.items()}
    # resume: anything not downloaded yet, plus empty answers (they may have been refused earlier)
    # largest economies first, so a rate limit hits the small ones
    todo = [(c["iso3"], f) for c in sorted(countries, key=lambda c: -(c.get("gdp") or 0)) if c["iso3"] in iso2rep for f in ("M", "X")
            if not raw["flows"].get(f"{c['iso3']}:{f}", {}).get("rows")]
    print(f"to download: {len(todo)}", flush=True)
    for n, (iso, f) in enumerate(todo):
        rows, year = [], None
        for y in YEARS:
            try:
                d = get(API.format(r=iso2rep[iso], y=y, f=f))
            except RateLimited as e:
                RAW.write_text(json.dumps(raw))
                print(f"Comtrade refused requests ({e}) at {iso}:{f}; {len(todo) - n} left. Run again later to resume.", flush=True)
                return
            rows = [x for x in (d or {}).get("data") or [] if x.get("partner2Code") in (0, None) and x.get("motCode") in (0, None) and x.get("customsCode") in ("C00", None)]
            if rows:
                year = y; break
            time.sleep(1.2)
        raw["flows"][f"{iso}:{f}"] = {"year": year, "rows": {str(x["partnerCode"]): x["primaryValue"] for x in rows}}
        if n % 10 == 0:
            RAW.write_text(json.dumps(raw)); print(f"{n}/{len(todo)} {iso}:{f} {year} {len(rows)}", flush=True)
        time.sleep(1.2)
    RAW.write_text(json.dumps(raw))

def build():
    raw = json.loads(RAW.read_text())
    countries = json.loads((ROOT / "public/data/countries.json").read_text())
    isos = [c["iso3"] for c in countries]; ours = set(isos)
    c2i = raw["code2iso"]
    X = {}   # (exporter, importer) -> $; importer report first, exporter mirror report as fallback
    src = {}
    for key, rec in raw["flows"].items():
        iso, f = key.split(":")
        for code, v in rec["rows"].items():
            p = c2i.get(code)
            if not p or p not in ours or p == iso or not v:
                continue
            if f == "M":
                X[(p, iso)] = v / 1.06; src[(p, iso)] = "M"          # CIF -> FOB
            elif src.get((iso, p)) != "M":
                X[(iso, p)] = v; src[(iso, p)] = "X"
    exp = {i: {} for i in isos}
    for (a, b), v in X.items():
        exp[a][b] = round(v / 1e6, 2)           # USD mn
    reported = sorted({k.split(":")[0] for k, r in raw["flows"].items() if r["rows"]})
    repM = sorted({k.split(":")[0] for k, r in raw["flows"].items() if r["rows"] and k.endswith(":M")})
    repX = sorted({k.split(":")[0] for k, r in raw["flows"].items() if r["rows"] and k.endswith(":X")})
    out = {"source": "UN Comtrade (HS TOTAL, goods), importer-reported flows with exporter mirror fallback",
           "years": sorted({r["year"] for r in raw["flows"].values() if r["year"]}), "unit": "USD mn", "reporters": reported,
           "reportersM": repM, "reportersX": repX, "exports": exp}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    cover = sum(1 for i in isos if exp[i])
    print(f"trade.json: {len(X)} flows, exporters with data {cover}/{len(isos)}, import reporters {len(repM)}, export reporters {len(repX)}")

if __name__ == "__main__":
    if "--build" not in sys.argv:
        download()
    build()
