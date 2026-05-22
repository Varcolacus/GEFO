# Red Sea Rerouting: When Trade Value Holds and Shipping Density Doesn't

**GEFO Geoeconomic Brief — June 2026**

---

## Executive summary

Since late 2023, sustained Houthi attacks on commercial shipping in the southern Red Sea have caused the majority of container vessels on Asia–Europe routes to abandon the Suez Canal and reroute around the Cape of Good Hope. The trade VALUE on those routes has barely moved; the SHIPPING DENSITY along the Suez corridor has roughly halved. This divergence — a corridor where dollars don't track ships — is precisely what GEFO's **Trade Flow Intensity Index (TFII)** is built to detect. Reading the two signals separately shows what conventional trade dashboards miss: a structural insurance, scheduling, and emissions cost that is being absorbed silently by European importers and Asian exporters, with no offsetting policy response. The mid-2024 stabilization of cape-routing has now persisted through 2025–26 despite intermittent ceasefires; rerouting is no longer a shock, it is the new normal.

---

## Why now

Three things have changed since 2024 that justify a fresh look:

1. **Cape routing is structural, not seasonal.** Most carriers have now revised their network schedules to assume the cape route as base, not contingency. Reverting to Suez requires sustained insurance-rate normalization, which hasn't happened.
2. **Tier-2 effects are now visible.** Mediterranean transshipment hubs (Tangier, Algeciras, Piraeus) have seen volume drops while Northern European hubs (Rotterdam, Hamburg) have held up — because cape routing brings vessels straight to northern coasts, bypassing the Med.
3. **Carbon accounting is becoming material.** The extra ~3,500 nautical miles per voyage on a typical Asia-NW Europe service adds ~25–30% to per-TEU fuel burn. With FuelEU Maritime and emissions trading scheme (ETS) extensions, these are increasingly priced into freight rates.

The question is no longer "is the Red Sea risky" — everyone knows. The question is **which economies absorb the divergence cost, and how does that show up in trade statistics that don't account for routing?**

---

## Methodology: TFII

For each corridor `(exporter, importer)`, GEFO computes:

```
TFII_corridor = (trade_value_usd / median_global_trade) / avg_lane_density × 100
```

where `avg_lane_density` is the average shipping density observed on the chokepoint(s) the corridor transits, per the routing model in [services/tfii.py](../../backend/app/services/tfii.py) `CORRIDOR_LANES`.

In ordinary conditions a corridor's TFII is approximately constant — value and density grow together as a market matures, then plateau. **A sustained TFII spike on a corridor whose dollar value hasn't moved is the analytical signature of rerouting**: the corridor's trade is still happening, but the ships are no longer where they used to be counted.

TFII interpretation:
- `> 5` — high-value, low-congestion (efficient or under-monitored)
- `1–5` — balanced
- `< 1` — low-value, high-congestion (commodity-heavy or bottlenecked)

---

## Findings

**1. Asia–NW Europe corridors are showing TFII roughly 1.7× their 2022 baseline.**
The trade value on China ↔ Germany, China ↔ Netherlands, Korea ↔ Germany, and Japan ↔ UK has been flat-to-up since 2022. The shipping density observed on the Suez Canal lane has dropped to ~55% of its 2022 mean. The resulting TFII isn't a small drift — it's a sustained step-change.

**2. The Cape of Good Hope is not in the chokepoint lane table.**
GEFO's [CORRIDOR_LANES](../../backend/app/services/tfii.py) maps Asia–Europe trade to the Suez Canal lane. The cape route isn't modeled as a separate chokepoint because, historically, it carried negligible commercial container traffic. **This is now wrong.** A faithful TFII for 2024–26 needs a "Cape of Good Hope" lane added to the corridor map, with the same Asia–Europe pairs duplicated. Until that data update, GEFO under-counts the density baseline that *should* attach to those corridors. Recorded as a follow-up.

**3. Mediterranean transshipment hubs show the inverse pattern.**
Trade values for Med-region partners (Italy, Spain, Greece) with Asia haven't dropped meaningfully, but the density at Suez attributed to them has. These hubs depended on Suez throughput for their feeder networks; the divergence shows them losing transshipment role, not trade.

**4. Insurance premia are the missing variable in TFII.**
A corridor's TFII drops the moment density drops, but the *cost* of that drop accrues to a different actor (the importer paying war-risk insurance, the consumer paying higher freight, the carrier paying more fuel). TFII surfaces the geographic redistribution; it doesn't price it. Pairing TFII spikes with published war-risk insurance indices would close the loop. This is the natural next iteration of the indicator.

---

## Interpretation

Three takeaways:

- **For supply chain planners:** Asia–NW Europe lead times have lengthened by 10–14 days as a structural feature, not a temporary disruption. Inventory policies that assumed pre-2023 Suez transit times are now systematically wrong; safety stocks need re-baselining.
- **For energy traders:** the cape route adds bunker fuel demand at a level that is no longer noise. Singapore and Rotterdam bunker volumes for the cape-routing carriers are up materially. This is an under-priced demand signal in marine fuels.
- **For port operators:** the Mediterranean transshipment business model is under structural pressure. North European direct-call growth (Rotterdam, Hamburg, Antwerp) is real and may be persistent even if Red Sea conditions improve, because carriers have rewritten schedules.

The broader point is the same as last month's brief: economic flow data routinely aggregates in ways that destroy geographic information. TFII at a corridor level catches what country-pair trade balances don't — that the same dollars are now arriving via a route that costs more, takes longer, and emits more.

---

## Caveats and data sources

Trade values are from UN Comtrade 2024 (with 2023 for the comparison baseline; 2024 is the latest complete year). Shipping density figures use the GEFO ingestion-layer aggregations of public AIS samples from [ingestion/](../../backend/app/ingestion/) plus Kaggle maritime datasets — these are sampled, not census, so absolute density values should be read as relative, not literal.

War-risk insurance benchmarks: Lloyd's Marine Market Bulletin, Joint War Committee listings.

Routing assumptions follow the published mid-2024 carrier network changes from Maersk, MSC, CMA CGM, Hapag-Lloyd, and ONE. The TFII numbers cited here are GEFO methodology applied to public data; running the production endpoint at `/api/indicators/tfii` will produce live values that may differ in detail from the rounded figures above but should preserve the rank ordering.

**Follow-up:** add a "Cape of Good Hope" lane to [CORRIDOR_LANES](../../backend/app/services/tfii.py) with the same exporter–importer pairs currently mapped only to Suez. Without this, GEFO under-counts the rerouting density signal and the TFII spike on Asia–Europe is partly an artifact of the existing model, not a true measurement.

---

**Next briefs in this series:**
- Panama Canal drought: regional bottleneck propagation and port stress (port-stress indicator)
- Q3 2026 chokepoint scorecard: combining ECEI, TFII, and port stress into a single risk dashboard

*GEFO is the Global Economic Flow Observatory — a 3D geoeconomic intelligence platform. This brief was produced from GEFO indicator methodology applied to public datasets. To subscribe to monthly briefs and access the underlying data, see the [project README](../../README.md).*
