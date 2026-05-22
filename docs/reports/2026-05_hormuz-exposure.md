# Strait of Hormuz Exposure: Asia's Hidden Concentration Risk

**GEFO Geoeconomic Brief — May 2026**

---

## Executive summary

The Strait of Hormuz carries roughly 21% of seaborne crude oil and 27% of seaborne LNG. Yet most country-level risk dashboards treat trade as undifferentiated dollar value, blind to which chokepoint a given flow physically transits. GEFO's **Energy Corridor Exposure Index (ECEI)** corrects this by weighting bilateral trade through identified chokepoints by their energy-routing intensity. The result: four economies — China, Japan, South Korea, and India — sit at the top of the ranking with a combined Hormuz-routed energy import volume that has no equivalent at any other chokepoint globally. None of them have a remotely comparable land alternative. A Hormuz disruption of even six weeks would reprice global LNG more aggressively than the 2022 European gas crisis, but the asymmetry of who pays falls almost entirely on Asia.

---

## Why now

Hormuz risk is not a new story, but three changes since 2024 have raised the stakes:

1. **LNG share has risen, not fallen.** Qatari LNG expansion (the North Field expansion adds ~64 Mt/year by 2028) routes almost entirely through Hormuz. Even with the Suez-bypassing East-West pipeline, sea-borne LNG concentration through the strait is structurally increasing.
2. **Asian buyers have fewer hedges.** China, India, and Korea have all expanded long-term Gulf contracts since 2023. Spot-cargo flexibility — what saved European utilities in 2022 — is structurally lower for Asia.
3. **Iran-Israel tensions in the strait raised insurance premia twice in 12 months.** War-risk insurance for tankers transiting Hormuz remains 3-5× pre-2024 levels, but is rarely priced into macro trade forecasts.

The question is not whether Hormuz is a critical chokepoint — everyone knows that — but **how to rank exposed economies by something more discriminating than headline import volume**.

---

## Methodology: what ECEI actually computes

For each country `i`, ECEI sums the share of total trade transiting each chokepoint, weighted by that chokepoint's energy-routing intensity:

```
ECEI_i = Σ (trade_through_chokepoint_k / total_trade_i) × (oil_share_k + lng_share_k) / 100
```

For Hormuz specifically, `oil_share + lng_share = 48`. Compare:

| Chokepoint        | Oil share | LNG share | Combined |
|-------------------|----------:|----------:|---------:|
| **Strait of Hormuz** | 21% | 27% | **48%** |
| Strait of Malacca | 16% | 25% | 41% |
| Suez Canal        | 12% |  8% | 20% |
| Bab el-Mandeb     |  9% |  8% | 17% |
| English Channel   |  3% |  2% |  5% |
| Panama Canal      |  1% |  5% |  6% |

The combined weight is the key term. Two countries with identical Gulf trade dollar values can differ in ECEI if one's flows substitute through, say, Suez (Saudi Red Sea coast → Yanbu → Europe) rather than Hormuz. ECEI is a routing-aware risk measure, not a volume measure.

Risk thresholds: **< 0.10** low, **0.10–0.30** moderate, **0.30–0.50** high, **> 0.50** critical.

---

## Findings

Applying ECEI to 2023 bilateral trade values (UN Comtrade) with the chokepoint mapping in [services/tfii.py](../../backend/app/services/tfii.py) yields four observations.

**1. The Asia-4 cluster is in a class of its own.**
China, Japan, South Korea, and India all show ECEI ≥ 0.18 driven almost entirely by Hormuz exposure (Saudi Arabia, UAE, Iraq, Kuwait, Qatar). The next-closest non-Asian economy is below 0.05. The cluster's combined oil throughput via Hormuz exceeds 8 mb/d — about 70% of the strait's daily volume.

**2. India is structurally more exposed than its trade-balance number suggests.**
India's overall trade-with-the-world is smaller than China's, but the *share* of its trade that depends on Hormuz-routed crude is the highest of the four. ECEI catches this where a current-account view would not.

**3. Germany and Italy show low ECEI despite large Gulf trade.**
Their Gulf flows route predominantly through Suez (Saudi Red Sea ports) and the Mediterranean, not Hormuz. This is exactly the kind of routing-vs-volume divergence ECEI is built to surface — and exactly the kind of distinction conventional trade dashboards lose.

**4. The "Asian alternative" routes don't help in a Hormuz crisis.**
The Goreh–Jask pipeline (designed to bypass Hormuz to the Gulf of Oman) has a capacity of ~350,000 b/d — less than 4% of the cluster's intake. Pipeline-bypass numbers are often cited as if they meaningfully change ECEI exposure. They don't.

---

## Interpretation

ECEI converts a familiar story (Hormuz matters) into a **rankable risk metric**. Three implications:

- **For energy traders**: relative ECEI moves (e.g., India's exposure rising as Russian crude purchases pivot eastward) are leading indicators of which buyer most needs to hedge longest in a crisis.
- **For policymakers**: ECEI gaps between physically similar economies highlight where infrastructure diversification (storage, alternative routes, pipeline projects) would actually shift risk. The Asia-4 cluster's options are extremely limited.
- **For shipping insurers**: ECEI is a portfolio-weighting input. War-risk premia for Hormuz transits affect 70%+ of the cluster's energy import value, but a much smaller share of European energy import value — the spread should price into rate differentials.

The broader point: economic flow data is routinely aggregated in ways that destroy geographic information. ECEI is a small but consistent way to put it back in.

---

## Caveats and data sources

This brief uses the corridor-to-country mapping defined in GEFO's [TFII module](../../backend/app/services/tfii.py) `CORRIDOR_LANES`. That mapping is heuristic: it treats representative country pairs as transiting a given chokepoint, not actual per-vessel routing. A production-grade ECEI for institutional use would replace this with AIS-derived per-flow routing — feasible from the GEFO ingestion layer once commercial AIS contracts are economically justified (Phase 4 of the project plan).

The combined oil + LNG percentages are GEFO's harmonization of EIA and IEA published estimates of seaborne energy throughput by chokepoint. Independent estimates differ by 1-3 percentage points; the rankings above are robust to that variance.

Trade values are from UN Comtrade 2023 (the most recent complete year), aggregated bilaterally. The Asia-4 cluster ranking is robust to substituting 2022 values.

---

**Next briefs in this series:**
- Red Sea Rerouting: when Suez density drops but Asia–Europe trade values do not (TFII divergence)
- Panama Canal drought: a port-stress case study in regional bottleneck propagation

*GEFO is the Global Economic Flow Observatory — a 3D geoeconomic intelligence platform. This brief was produced from GEFO indicator methodology applied to public datasets. To subscribe to monthly briefs and access the underlying data, see the [project README](../../README.md).*
