"""
GEFO API Test & Stress Test Suite
Run: python tests/test_api.py [--stress]
"""
import httpx
import time
import sys
import json
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://localhost:8000"

# ─── Colors ───
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"


def check(label: str, ok: bool, detail: str = ""):
    icon = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    print(f"  {icon}  {label}  {detail}")
    return ok


# ──────────────────────────────────────────────
#  FUNCTIONAL TESTS
# ──────────────────────────────────────────────

def test_health():
    print(f"\n{CYAN}─── Health ───{RESET}")
    r = httpx.get(f"{BASE_URL}/health", timeout=10)
    data = r.json()
    check("GET /health", r.status_code == 200, f"status={data.get('status')}")
    check("Scheduler running", data.get("scheduler", {}).get("running") is True)
    return r.status_code == 200


def test_root():
    print(f"\n{CYAN}─── Root ───{RESET}")
    r = httpx.get(f"{BASE_URL}/", timeout=10)
    data = r.json()
    ok = r.status_code == 200 and data.get("name") == "GEFO API"
    check("GET /", ok, f"version={data.get('version')}")
    return ok


def test_countries():
    print(f"\n{CYAN}─── Countries ───{RESET}")
    passed = True

    # List all
    r = httpx.get(f"{BASE_URL}/api/countries/", timeout=15)
    countries = r.json()
    ok = r.status_code == 200 and len(countries) > 0
    passed &= check("GET /api/countries/", ok, f"{len(countries)} countries")

    # Filter by region
    r = httpx.get(f"{BASE_URL}/api/countries/?region=Europe", timeout=15)
    europe = r.json()
    ok = r.status_code == 200 and len(europe) > 0
    passed &= check("Filter by region", ok, f"{len(europe)} European countries")

    # Single country
    r = httpx.get(f"{BASE_URL}/api/countries/USA", timeout=10)
    ok = r.status_code == 200 and r.json().get("iso_code") == "USA"
    passed &= check("GET /api/countries/USA", ok)

    # Country profile
    r = httpx.get(f"{BASE_URL}/api/countries/USA/profile", timeout=15)
    profile = r.json()
    ok = r.status_code == 200 and "trade_history" in profile
    passed &= check("GET /api/countries/USA/profile", ok,
                     f"{len(profile.get('trade_history', []))} years history")

    # 404
    r = httpx.get(f"{BASE_URL}/api/countries/ZZZ", timeout=10)
    passed &= check("404 for unknown country", r.status_code == 404)

    return passed


def test_trade_flows():
    print(f"\n{CYAN}─── Trade Flows ───{RESET}")
    passed = True

    r = httpx.get(f"{BASE_URL}/api/trade_flows/?year=2023", timeout=15)
    flows = r.json()
    ok = r.status_code == 200 and len(flows) > 0
    passed &= check("GET /api/trade_flows/?year=2023", ok, f"{len(flows)} flows")

    # Aggregated
    r = httpx.get(f"{BASE_URL}/api/trade_flows/aggregated?year=2023&top_n=10", timeout=15)
    agg = r.json()
    ok = r.status_code == 200 and len(agg) > 0
    passed &= check("Aggregated flows", ok, f"top {len(agg)} corridors")

    # Filter by exporter
    r = httpx.get(f"{BASE_URL}/api/trade_flows/?year=2023&exporter=CHN", timeout=15)
    china = r.json()
    ok = r.status_code == 200
    passed &= check("Filter by exporter (CHN)", ok, f"{len(china)} flows")

    return passed


def test_ports():
    print(f"\n{CYAN}─── Ports ───{RESET}")
    passed = True

    r = httpx.get(f"{BASE_URL}/api/ports/", timeout=10)
    ports = r.json()
    ok = r.status_code == 200 and len(ports) > 0
    passed &= check("GET /api/ports/", ok, f"{len(ports)} ports")

    r = httpx.get(f"{BASE_URL}/api/ports/?country=CHN", timeout=10)
    cn = r.json()
    ok = r.status_code == 200
    passed &= check("Filter by country (CHN)", ok, f"{len(cn)} ports")

    return passed


def test_shipping_density():
    print(f"\n{CYAN}─── Shipping Density ───{RESET}")
    passed = True

    r = httpx.get(f"{BASE_URL}/api/shipping_density/?year=2023", timeout=15)
    data = r.json()
    ok = r.status_code == 200 and len(data.get("data", [])) > 0
    passed &= check("GET /api/shipping_density/?year=2023", ok,
                     f"{len(data.get('data', []))} points")

    return passed


def test_indicators():
    print(f"\n{CYAN}─── Indicators ───{RESET}")
    passed = True

    # Global indicators
    r = httpx.get(f"{BASE_URL}/api/indicators/?year=2023", timeout=15)
    indicators = r.json()
    ok = r.status_code == 200 and len(indicators) > 0
    passed &= check("GET /api/indicators/?year=2023", ok, f"{len(indicators)} indicators")

    # Check some are non-zero
    nonzero = [i for i in indicators if i.get("value", 0) > 0]
    passed &= check("Non-zero indicator values", len(nonzero) > 0,
                     f"{len(nonzero)}/{len(indicators)} non-zero")

    # Country indicators
    r = httpx.get(f"{BASE_URL}/api/indicators/country/USA?year=2023", timeout=15)
    ci = r.json()
    ok = r.status_code == 200 and len(ci) > 0
    passed &= check("Country indicators (USA)", ok, f"{len(ci)} indicators")

    # Rankings
    r = httpx.get(f"{BASE_URL}/api/indicators/rankings?indicator=trade_openness&year=2023&top_n=10", timeout=15)
    rankings = r.json()
    ok = r.status_code == 200 and len(rankings) > 0
    passed &= check("Rankings (trade_openness)", ok, f"top {len(rankings)}")

    return passed


# ──────────────────────────────────────────────
#  STRESS TEST
# ──────────────────────────────────────────────

def stress_single_request(url: str) -> float:
    """Make a single request and return elapsed time in ms."""
    start = time.perf_counter()
    try:
        r = httpx.get(url, timeout=30)
        r.raise_for_status()
    except Exception:
        return -1.0
    return (time.perf_counter() - start) * 1000


def run_stress_test():
    print(f"\n{YELLOW}══════════════════════════════════════{RESET}")
    print(f"{YELLOW}  STRESS TEST  (50 concurrent requests){RESET}")
    print(f"{YELLOW}══════════════════════════════════════{RESET}")

    endpoints = [
        ("/api/countries/", 50),
        ("/api/trade_flows/?year=2023", 30),
        ("/api/ports/", 50),
        ("/api/shipping_density/?year=2023", 30),
        ("/api/indicators/?year=2023", 30),
        ("/api/countries/USA/profile", 40),
    ]

    for path, n_requests in endpoints:
        url = f"{BASE_URL}{path}"
        print(f"\n  {CYAN}{path}{RESET}  ({n_requests} concurrent requests)")

        timings = []
        errors = 0

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(stress_single_request, url) for _ in range(n_requests)]
            for f in as_completed(futures):
                ms = f.result()
                if ms < 0:
                    errors += 1
                else:
                    timings.append(ms)

        if timings:
            avg = statistics.mean(timings)
            p50 = statistics.median(timings)
            p95 = sorted(timings)[int(len(timings) * 0.95)]
            mn = min(timings)
            mx = max(timings)
            ok = avg < 2000  # <2s average
            icon = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
            print(f"    {icon}  avg={avg:.0f}ms  p50={p50:.0f}ms  p95={p95:.0f}ms  "
                  f"min={mn:.0f}ms  max={mx:.0f}ms  errors={errors}")
        else:
            print(f"    {RED}✗  ALL REQUESTS FAILED{RESET}")


# ──────────────────────────────────────────────
#  MAIN
# ──────────────────────────────────────────────

def main():
    print(f"\n{YELLOW}══════════════════════════════════════{RESET}")
    print(f"{YELLOW}      GEFO API Test Suite{RESET}")
    print(f"{YELLOW}      {BASE_URL}{RESET}")
    print(f"{YELLOW}══════════════════════════════════════{RESET}")

    # Check server is up
    try:
        httpx.get(f"{BASE_URL}/health", timeout=5)
    except Exception:
        print(f"\n{RED}  ✗  Server not reachable at {BASE_URL}{RESET}")
        print(f"     Start with: uvicorn app.main:app --host 0.0.0.0 --port 8000")
        sys.exit(1)

    results = []
    results.append(("Health", test_health()))
    results.append(("Root", test_root()))
    results.append(("Countries", test_countries()))
    results.append(("Trade Flows", test_trade_flows()))
    results.append(("Ports", test_ports()))
    results.append(("Shipping Density", test_shipping_density()))
    results.append(("Indicators", test_indicators()))

    # Summary
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"\n{YELLOW}══════════════════════════════════════{RESET}")
    color = GREEN if passed == total else RED
    print(f"  {color}{passed}/{total} test groups passed{RESET}")
    print(f"{YELLOW}══════════════════════════════════════{RESET}")

    # Stress test if requested
    if "--stress" in sys.argv:
        run_stress_test()

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
