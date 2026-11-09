#!/usr/bin/env python3
"""Двусторонняя торговля из UN Comtrade (публичный preview API, без ключа) -> data/trade_raw.json -> public/data/trade.json

Для каждой страны берём импорт (M) и экспорт (X) товаров по партнёрам, HS TOTAL, за последний доступный год.
Поток i->j оцениваем по отчёту импортёра j (CIF, точнее), иначе по отчёту экспортёра i ("зеркальные" данные).
Так покрываются и страны, которые сами не отчитываются (Тайвань, КНДР, ...).
Запуск: python3 scripts/fetch_trade.py            — докачать недостающее и собрать trade.json
        python3 scripts/fetch_trade.py --build    — только собрать trade.json из уже скачанного
"""
import json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "trade_raw.json"
OUT = ROOT / "public" / "data" / "trade.json"
YEARS = ["2023", "2022"]
TWN_CODE = 490          # «Other Asia, nes» в Comtrade = Тайвань
API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode={r}&period={y}&partnerCode=&cmdCode=TOTAL&flowCode={f}&maxRecords=500"

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:
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
    todo = [(c["iso3"], f) for c in countries if c["iso3"] in iso2rep for f in ("M", "X") if f"{c['iso3']}:{f}" not in raw["flows"]]
    print(f"to download: {len(todo)}", flush=True)
    for n, (iso, f) in enumerate(todo):
        rows, year = [], None
        for y in YEARS:
            d = get(API.format(r=iso2rep[iso], y=y, f=f))
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
    X = {}   # (exporter, importer) -> $; сначала отчёт импортёра, затем зеркальный отчёт экспортёра
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
        exp[a][b] = round(v / 1e6, 2)           # млн $
    reported = sorted({k.split(":")[0] for k, r in raw["flows"].items() if r["rows"]})
    out = {"source": "UN Comtrade (HS TOTAL, goods), importer-reported flows with exporter mirror fallback",
           "years": sorted({r["year"] for r in raw["flows"].values() if r["year"]}), "unit": "USD mn", "reporters": reported, "exports": exp}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    cover = sum(1 for i in isos if exp[i])
    print(f"trade.json: {len(X)} flows, exporters with data {cover}/{len(isos)}, reporters {len(reported)}")

if __name__ == "__main__":
    if "--build" not in sys.argv:
        download()
    build()
