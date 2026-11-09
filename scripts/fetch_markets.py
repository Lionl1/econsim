#!/usr/bin/env python3
"""Currencies, exchange rates, forecasts, crypto and stock markets from open sources -> public/data/markets.json

  * world-countries (mledoze)   — each country's currency
  * open.er-api.com             — current rates vs USD (exchangerate-api, free, no key)
  * World Bank PA.NUS.FCRF      — annual official rates 2005–2024 (FX volatility calibration)
  * IMF WEO DataMapper API      — growth, inflation and unemployment forecasts for 2026–2031
  * CoinGecko public API        — BTC/ETH price and market cap, one year of daily BTC prices (volatility)
  * World Bank CM.MKT.*         — stock market capitalization and annual index changes
  * Wikidata (SPARQL, P2226)    — company market caps, used only when recent and plausible
Exchange rate regimes (union / peg / dollarization) are set by hand after the IMF AREAER classification (simplified).
"""
import json, math, statistics, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "markets.json"

def get(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "econsim-data-fetch"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:
            err = e; time.sleep(2 * (k + 1))
    print("  ! failed", url, err); return None

# anchor currency for countries without their own floating currency
DOLLARIZED = {"ECU": "USD", "SLV": "USD", "PAN": "USD", "TLS": "USD", "FSM": "USD", "MHL": "USD", "PLW": "USD", "ZWE": "USD",
              "MNE": "EUR", "XKX": "EUR", "AND": "EUR", "MCO": "EUR", "SMR": "EUR", "VAT": "EUR",
              "LIE": "CHF", "KIR": "AUD", "NRU": "AUD", "TUV": "AUD"}
PEG_USD = ["SAU", "ARE", "QAT", "BHR", "OMN", "JOR", "BLZ", "BHS", "BRB", "DJI", "ERI", "CUB", "TKM",
           "ATG", "DMA", "GRD", "KNA", "LCA", "VCT"]          # XCD: currency union pegged to the dollar
PEG_EUR = ["DNK", "BGR", "BEN", "BFA", "CIV", "GNB", "MLI", "NER", "SEN", "TGO", "CMR", "CAF", "TCD", "COG", "GNQ", "GAB",
           "COM", "CPV", "STP", "BIH"]
CURRENCY_FIX = {"PSE": "ILS", "XKX": "EUR", "ZWE": "USD", "CUB": "CUP"}
IMF_CODE = {"XKX": "UVK", "PSE": "WBG", "SSD": "SSD"}

# Largest corporations: curated list (country, sector, foreign revenue share, approximate 2025 market cap, USD bn).
# The market cap is replaced by the Wikidata value when that is recent (2024+) and plausible.
COMPANIES = [
  ("Nvidia", "USA", "semis", 0.55, 4300), ("Microsoft", "USA", "tech", 0.5, 3500), ("Apple", "USA", "tech", 0.6, 3600),
  ("Alphabet", "USA", "tech", 0.5, 3000), ("Amazon", "USA", "consumer", 0.4, 2300), ("Meta Platforms", "USA", "tech", 0.55, 1700),
  ("Broadcom", "USA", "semis", 0.6, 1600), ("TSMC", "TWN", "semis", 0.65, 1200), ("Tesla", "USA", "auto", 0.5, 1300),
  ("Berkshire Hathaway", "USA", "finance", 0.1, 1050), ("Saudi Aramco", "SAU", "energy", 0.7, 1600), ("JPMorgan Chase", "USA", "finance", 0.25, 800),
  ("Eli Lilly", "USA", "pharma", 0.4, 800), ("Walmart", "USA", "consumer", 0.2, 800), ("Visa", "USA", "finance", 0.55, 650),
  ("Tencent", "CHN", "tech", 0.1, 600), ("Samsung Electronics", "KOR", "semis", 0.8, 500), ("Oracle", "USA", "tech", 0.45, 600),
  ("ExxonMobil", "USA", "energy", 0.6, 470), ("LVMH", "FRA", "consumer", 0.85, 330), ("ASML", "NLD", "semis", 0.9, 300),
  ("Novo Nordisk", "DNK", "pharma", 0.95, 250), ("SAP", "DEU", "tech", 0.8, 300), ("Nestlé", "CHE", "consumer", 0.95, 240),
  ("Roche", "CHE", "pharma", 0.95, 270), ("Toyota", "JPN", "auto", 0.75, 280), ("Alibaba Group", "CHN", "consumer", 0.1, 300),
  ("Reliance Industries", "IND", "energy", 0.3, 220), ("ICBC", "CHN", "finance", 0.1, 300), ("PetroChina", "CHN", "energy", 0.3, 200),
  ("Shell", "GBR", "energy", 0.8, 210), ("HSBC", "GBR", "finance", 0.8, 220), ("AstraZeneca", "GBR", "pharma", 0.9, 230),
  ("Siemens", "DEU", "industrial", 0.75, 200), ("Hermès", "FRA", "consumer", 0.9, 260), ("TotalEnergies", "FRA", "energy", 0.8, 140),
  ("Mitsubishi UFJ", "JPN", "finance", 0.4, 160), ("Sony", "JPN", "tech", 0.7, 170), ("Xiaomi", "CHN", "tech", 0.4, 170),
  ("BYD", "CHN", "auto", 0.35, 130), ("Commonwealth Bank", "AUS", "finance", 0.1, 180), ("Royal Bank of Canada", "CAN", "finance", 0.3, 200),
  ("Shopify", "CAN", "tech", 0.8, 200), ("Petrobras", "BRA", "energy", 0.4, 80), ("Sberbank", "RUS", "finance", 0.05, 75),
  ("Gazprom", "RUS", "energy", 0.5, 40), ("Inditex", "ESP", "consumer", 0.85, 170), ("Volkswagen", "DEU", "auto", 0.8, 55),
  ("Airbus", "FRA", "industrial", 0.8, 170), ("Boeing", "USA", "industrial", 0.45, 170), ("Lockheed Martin", "USA", "defense", 0.25, 110),
  ("Rheinmetall", "DEU", "defense", 0.6, 90), ("Tata Consultancy Services", "IND", "tech", 0.9, 130), ("Infosys", "IND", "tech", 0.95, 75),
  ("Hyundai Motor", "KOR", "auto", 0.7, 45), ("Al Rajhi Bank", "SAU", "finance", 0.05, 100), ("Itaú Unibanco", "BRA", "finance", 0.2, 65),
  ("Naspers", "ZAF", "tech", 0.9, 50), ("América Movil", "MEX", "telecom", 0.5, 55), ("Verizon", "USA", "telecom", 0.05, 180),
  ("SK Hynix", "KOR", "semis", 0.9, 150), ("Tokyo Electron", "JPN", "semis", 0.85, 80), ("Kweichow Moutai", "CHN", "consumer", 0.05, 250),
]

# where companies that mostly manufacture abroad make their products (country, share of costs)
PROD = {"Apple": ["CHN", 0.7], "Nvidia": ["TWN", 0.8], "Broadcom": ["TWN", 0.6], "Amazon": ["CHN", 0.3], "Walmart": ["CHN", 0.25],
        "Tesla": ["CHN", 0.3], "Sony": ["CHN", 0.4], "Samsung Electronics": ["VNM", 0.4], "Qualcomm": ["TWN", 0.8],
        "Meta Platforms": ["CHN", 0.1], "Alphabet": ["CHN", 0.1], "Microsoft": ["CHN", 0.15], "Toyota": ["USA", 0.2]}

def wikidata_caps():
    """Recent USD market caps from Wikidata (two simple queries: one complex query times out)."""
    import urllib.parse
    def q(s):
        url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": s})
        req = urllib.request.Request(url, headers={"Accept": "application/sparql-results+json", "User-Agent": "econsim-data-fetch/1.0 (educational simulator)"})
        return json.loads(urllib.request.urlopen(req, timeout=120).read())["results"]["bindings"]
    try:
        ids = sorted({r["c"]["value"].split("/")[-1] for r in q("SELECT DISTINCT ?c WHERE { ?c wdt:P2226 ?mc . FILTER(?mc > 3e10) }")})
        rows = q("SELECT ?c ?cLabel ?mc ?date WHERE { VALUES ?c { " + " ".join("wd:" + i for i in ids) + " } ?c p:P2226 ?st . ?st psv:P2226 ?v . "
                 "?v wikibase:quantityAmount ?mc ; wikibase:quantityUnit wd:Q4917 . ?st pq:P585 ?date . "
                 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }')
    except Exception as e:
        print("  ! wikidata failed:", e); return {}
    best = {}
    for r in rows:
        name, d, v = r["cLabel"]["value"].lower(), r["date"]["value"], float(r["mc"]["value"])
        if d[:4] >= "2024" and d >= best.get(name, ("", 0))[0]:
            best[name] = (d, v)
    return best

def main():
    countries = json.loads((ROOT / "public/data/countries.json").read_text())
    isos = [c["iso3"] for c in countries]
    wc = {("XKX" if c["cca3"] == "UNK" else c["cca3"]): c for c in get("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json")}
    rates = get("https://open.er-api.com/v6/latest/USD")
    cur = {}
    for iso in isos:
        cs = list((wc.get(iso) or {}).get("currencies", {}).items())
        code = CURRENCY_FIX.get(iso) or (cs[0][0] if cs else "USD")
        name = next((v["name"] for k, v in cs if k == code), code); sym = next((v.get("symbol", "") for k, v in cs if k == code), "")
        if code == "EUR" and iso not in DOLLARIZED: regime, anchor = "union", "EUR"
        elif iso in DOLLARIZED: regime, anchor = "dollarized", DOLLARIZED[iso]
        elif iso in PEG_USD: regime, anchor = "peg", "USD"
        elif iso in PEG_EUR: regime, anchor = "peg", "EUR"
        elif iso == "USA": regime, anchor = "anchor", "USD"
        else: regime, anchor = "float", None
        cur[iso] = {"code": code, "name": name, "symbol": sym, "regime": regime, "anchor": anchor,
                    "rateUSD": rates["rates"].get(code) if rates else None}
    print("currencies without rate:", [i for i, c in cur.items() if not c["rateUSD"]])

    # World Bank official exchange rates -> annual volatility of log changes (2008–2024)
    wb = get("https://api.worldbank.org/v2/country/all/indicator/PA.NUS.FCRF?format=json&date=2005:2024&per_page=20000")
    series = {}
    for r in (wb[1] if wb else []):
        if r["value"] and r["countryiso3code"] in cur:
            series.setdefault(r["countryiso3code"], {})[int(r["date"])] = r["value"]
    for iso, s in series.items():
        ys = sorted(y for y in s if y >= 2008)
        ch = [math.log(s[b] / s[a]) for a, b in zip(ys, ys[1:]) if b == a + 1]
        if len(ch) >= 8:
            cur[iso]["fxVol"] = round(statistics.pstdev(ch), 4)                 # sd of annual log change
            cur[iso]["fxDrift"] = round(statistics.median(ch), 4)               # typical annual depreciation
    # IMF WEO forecast
    fc = {}
    for key, ind in (("growth", "NGDP_RPCH"), ("infl", "PCPIPCH"), ("unemp", "LUR")):
        d = get(f"https://www.imf.org/external/datamapper/api/v1/{ind}?periods=2026,2027,2028,2029,2030,2031")
        vals = (d or {}).get("values", {}).get(ind, {})
        for iso in isos:
            v = vals.get(IMF_CODE.get(iso, iso))
            if v: fc.setdefault(iso, {})[key] = {y: round(x, 2) for y, x in v.items() if x is not None and 2026 <= int(y) <= 2031}
        time.sleep(1)
    print("no IMF forecast:", [i for i in isos if i not in fc])
    weo = get("https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/WEOWORLD?periods=2026,2027,2028,2029,2030,2031")
    world_fc = {y: x for y, x in (weo or {}).get("values", {}).get("NGDP_RPCH", {}).get("WEOWORLD", {}).items() if 2026 <= int(y) <= 2031}

    # crypto
    px = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=true")
    hist = get("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily")
    vol = None
    if hist and hist.get("prices"):
        p = [x[1] for x in hist["prices"]]
        r = [math.log(b / a) for a, b in zip(p, p[1:])]
        vol = round(statistics.pstdev(r) * math.sqrt(365), 3)
    crypto = {"btc": {"price": px["bitcoin"]["usd"], "mcap": px["bitcoin"]["usd_market_cap"], "volAnnual": vol},
              "eth": {"price": px["ethereum"]["usd"], "mcap": px["ethereum"]["usd_market_cap"]}} if px else None

    # stock markets: capitalization (World Bank) and index volatility (S&P Global Equity Indices, annual changes)
    equity = {}
    for key, ind in (("mcap", "CM.MKT.LCAP.CD"), ("mcapGdp", "CM.MKT.LCAP.GD.ZS")):
        d = get(f"https://api.worldbank.org/v2/country/all/indicator/{ind}?format=json&mrnev=1&per_page=400")
        for r in (d[1] if d and len(d) > 1 else []):
            if r["value"] and r["countryiso3code"] in cur: equity.setdefault(r["countryiso3code"], {})[key] = round(r["value"], 2)
    d = get("https://api.worldbank.org/v2/country/all/indicator/CM.MKT.INDX.ZG?format=json&date=2008:2024&per_page=20000")
    ser = {}
    for r in (d[1] if d and len(d) > 1 else []):
        if r["value"] is not None and r["countryiso3code"] in cur: ser.setdefault(r["countryiso3code"], []).append(math.log(1 + r["value"] / 100))
    for iso, ch in ser.items():
        if len(ch) >= 8: equity.setdefault(iso, {})["vol"] = round(statistics.pstdev(ch), 3)
    equity.setdefault("TWN", {"mcap": 2.5e12, "mcapGdp": 300, "vol": 0.22, "manual": True})   # not in World Bank: TWSE-based estimate
    print(f"equity: {len(equity)} countries, {sum('vol' in e for e in equity.values())} with index history")
    wd = wikidata_caps()
    companies = []
    for name, iso, sector, foreign, est in COMPANIES:
        hit = next((v for k, v in wd.items() if k == name.lower() or k.startswith(name.lower() + " ") or name.lower().startswith(k + " ")), None)
        mcap, src = est * 1e9, "estimate"
        if hit and est * 1e9 / 3 < hit[1] < est * 1e9 * 3:
            mcap, src = hit[1], "wikidata " + hit[0][:10]
        companies.append({"name": name, "iso": iso, "sector": sector, "foreign": foreign, "mcap": mcap, "mcapSource": src,
                          **({"prod": PROD[name]} if name in PROD else {})})
    print(f"companies: {len(companies)}, from wikidata: {sum(c['mcapSource'] != 'estimate' for c in companies)}")

    out = {"asOf": rates.get("time_last_update_utc") if rates else None,
           "sources": ["world-countries", "open.er-api.com", "World Bank PA.NUS.FCRF", "IMF WEO DataMapper", "CoinGecko",
                       "World Bank CM.MKT.LCAP / CM.MKT.INDX.ZG", "Wikidata P2226"],
           "currencies": cur, "forecast": fc, "worldForecast": world_fc, "crypto": crypto, "equity": equity, "companies": companies}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"markets.json: {len(cur)} currencies, {sum('fxVol' in c for c in cur.values())} with FX history, {len(fc)} IMF forecasts; BTC {crypto and crypto['btc']}")

if __name__ == "__main__":
    main()
