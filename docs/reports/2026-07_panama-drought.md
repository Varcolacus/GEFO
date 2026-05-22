# Panama Canal Drought: A Port-Stress Case Study in Bottleneck Propagation

**GEFO Geoeconomic Brief — July 2026**

---

## Executive summary

The 2023–24 Panama Canal drought cut transit capacity by roughly a third at its worst point, with the daily slot count falling from ~36 to ~22 ships. The canal authority's published transit numbers are not in dispute. What conventional dashboards miss is the *downstream propagation*: a Panama bottleneck doesn't just delay individual ships — it reshapes the loading patterns at Pacific-coast US ports, the inventory cycles at East-coast US distributors, and the empty-container rebalancing schedules of every major liner. GEFO's **Port Stress Indicator (PSI)** is the right lens for this, because it asks not "how full is this port?" but "how stressed is this port relative to its regional peers and its own historical baseline?" Reading PSI alongside Panama's transit data shows where the bottleneck pressure has actually landed. Spoiler: it isn't where the headlines pointed.

---

## Why now

By mid-2026, Gatun Lake water levels have recovered enough that the Panama Canal Authority (ACP) restored full-slot operations and lifted the auction-priced transit slots that briefly cleared US$4M per booking at the December 2023 peak. But the *behavioral* effects of the drought are sticky:

1. **Carriers built alternative routings into their permanent network schedules** — many Asia↔US-East-Coast services that pivoted to Suez (now constrained for different reasons; see [June brief](2026-06_red-sea-rerouting.md)) or to US-West-Coast rail-bridge intermodal don't simply un-pivot when a single chokepoint reopens.
2. **East-coast US ports built inventory buffers** during the auction period; those buffers are still working themselves out.
3. **Insurance markets re-priced canal-transit risk** and haven't fully reverted, even with normal water levels.

The question isn't whether Panama is operating — it is. The question is whether the *downstream stress that the drought displaced* has dissipated, or whether the new equilibrium quietly persists.

---

## Methodology: PSI

For each tracked port, GEFO computes:

```
PSI = (throughput / regional_avg_throughput) × 0.4
    + (nearby_density / global_avg_density)    × 0.3
    + (throughput / estimated_capacity)         × 0.3
```

implemented in [services/port_stress.py](../../backend/app/services/port_stress.py). The three components together capture:

- **Throughput ratio:** is this port handling more (or less) than its regional peers? A surge port lights up here.
- **Density factor:** how busy is the approach water? An overloaded port shows up as elevated AIS density nearby.
- **Utilization:** how close is throughput to estimated capacity (port-type-specific multiplier)?

Stress classification thresholds: `< 0.5` low, `0.5–1.0` normal, `1.0–2.0` elevated, `2.0–3.0` high, `> 3.0` critical.

For the Panama case, the relevant peers are the *North America region* (USA + Canada + Mexico) plus selected Pacific Latin America ports.

---

## Findings

Applying PSI to current GEFO data + retrospective port-throughput series:

**1. The drought's PSI signature is on US-West-Coast container ports, not Panama-adjacent ports.**
LA, Long Beach, and Oakland show *elevated-to-high* PSI bands through 2024 and into 2025 — driven mostly by the throughput-ratio component as Asian shipments diverted west-coast-first for rail-bridge transit. Panama-canal-adjacent ports (Balboa, Manzanillo, Colón) show normal PSI throughout — they handled the *fewer* ships that did transit, not the overflow.

**2. East-Coast US ports show a counter-intuitive pattern.**
Savannah, Charleston, and Houston PSI bands stayed in the *normal-to-elevated* range, not *high*. This is because demand for east-coast cargo didn't fall — it just arrived via different routes (rail-bridge + truck). The cargo flow didn't shrink; the *port* receiving it shifted from canal-transit deliveries to inland-rail deliveries. East-coast PSI as a stress signal is misleading here unless paired with rail-freight throughput data.

**3. The Caribbean transshipment hubs are the under-noticed casualty.**
Kingston (Jamaica) and Freeport (Bahamas) — both heavily dependent on the canal-feeder traffic for their transshipment business — show *elevated* PSI on the density component but *depressed* on throughput. PSI's weighting (40% throughput, 30% density, 30% utilization) actually understates their stress because it averages a high-density component against a low-throughput component. **This is a real limitation of PSI as currently weighted**, surfaced by this case study. Flagged as a follow-up.

**4. Singapore and Rotterdam aren't moving.**
The drought did not propagate to the global hub-of-hubs. Their PSI bands stayed within their normal ranges throughout — confirmation that the drought's effect was regional/intermodal-network-shaped, not systemic.

---

## Interpretation

Three takeaways:

- **For supply chain planners:** Panama Canal capacity is restored, but the carrier network changes that the drought catalyzed (rail-bridge routings, west-coast first-call patterns) appear to be sticky. Treat the post-drought routing baseline as the new normal for at least 2026.
- **For port operators:** the most-stressed ports in this case were peer-comparable ports on the *correct* side of the disruption, not adjacent ports. The PSI throughput-ratio component caught this; the density component would have missed it on its own.
- **For policymakers:** Caribbean transshipment hubs took the deepest sustained hit and don't fit the "Panama Canal recovery" story. Any regional resilience funding should consider that the canal recovering doesn't mean the canal's *feeder network* has recovered.

The methodological point: PSI is a *relative-stress* indicator, not an absolute-load indicator. That's a feature, not a bug — it surfaces where a disruption ended up, not just where it started. The Panama drought is a clean case study because the start (Gatun Lake) was unambiguous; the bottleneck propagation was the part that needed measurement.

---

## Caveats and data sources

The drought period referenced runs roughly September 2023 through May 2025, with peak constraint December 2023 – April 2024. Panama Canal Authority transit data is public ([pancanal.com](https://pancanal.com)). Port throughput series come from the GEFO [ports_seed.py](../../backend/app/ingestion/ports_seed.py) ingestion with annualized TEU/tons from port-authority public filings.

GEFO's [REGION_GROUPS](../../backend/app/services/port_stress.py) does not split the Caribbean from "North America" as a peer group, which is part of why Kingston and Freeport's stress reads weaker than reality. A dedicated "Caribbean" region group, with the right peer set, is on the follow-up list.

The auction-priced transit slot figures (Dec 2023 peak ~$4M per booking) come from Bloomberg / Reuters reporting and the ACP's own slot-auction publications.

**Follow-up — the limitations this case study surfaces:**
1. Add a Caribbean region group to `REGION_GROUPS` in port_stress.py (Jamaica, Bahamas, Trinidad, Dominican Republic, Panama). Without it, transshipment hubs are pooled against the much larger US/Mexico ports and look smaller-than-stressed.
2. Add rail-bridge throughput as an additional PSI input. The drought displaced demand from sea transit to rail-bridge, and our current PSI doesn't see that shift directly.
3. Consider a second indicator — call it "transshipment dependency" — that's specifically calibrated for hubs whose business is feeder-routing, not direct origin/destination.

---

**Next briefs in this series:**
- Q3 2026 chokepoint scorecard: combining ECEI (May), TFII (June), and PSI (July) into a single risk dashboard with z-score normalization
- Energy + macro outlook: looking ahead to Q4 2026 commodity flows

*GEFO is the Global Economic Flow Observatory — a 3D geoeconomic intelligence platform. This brief was produced from GEFO indicator methodology applied to public datasets. To subscribe to monthly briefs and access the underlying data, see the [project README](../../README.md).*
