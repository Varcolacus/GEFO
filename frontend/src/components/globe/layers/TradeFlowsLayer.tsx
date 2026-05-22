"use client";

import { useEffect, type RefObject } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  ArcType,
  CallbackProperty,
  PolygonHierarchy,
  PolylineGlowMaterialProperty,
  ColorMaterialProperty,
  NearFarScalar,
  LabelStyle,
  VerticalOrigin,
} from "cesium";

import type { CountryMacro, TradeFlowAggregated } from "@/lib/api";
import { fetchCountriesGeoJSON } from "@/lib/api";
import type { TradeMode } from "@/lib/trade-modes";
import { computeArcPositions } from "../lib/geometry";

interface TradeFlowsLayerProps {
  viewer: Viewer;
  enabled: boolean;
  tradeFlows: TradeFlowAggregated[];
  countries: CountryMacro[];
  highlightCountryIso: string | null;
  tradeMode: TradeMode;
  year: number | null;
  /** Shared GeoJSON cache owned by the orchestrator. CountriesLayer
   *  primes it; this layer falls back to fetching with the "gdp"
   *  indicator when no value is cached. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geoJsonRef: RefObject<any>;
}

/**
 * Renders bilateral trade flows in one of two visual modes:
 *
 * - GLOBAL (no country highlighted): country polygons tinted by the
 *   per-country trade metric (balance / exports / imports / volume).
 *   Entities tagged `flow_balance_poly_<iso>_<ringIdx>` and
 *   `flow_balance_label_<iso>`.
 *
 * - COUNTRY (one ISO highlighted): animated arcs from the selected
 *   country to its trading partners. Color depends on tradeMode
 *   (green=exports/surplus, red=imports/deficit, violet=volume).
 *   Arcs have a glow + core polyline pair with breathing animation.
 *   Entities tagged `flow_balance_<i>_glow`/`_core`,
 *   `flow_volume_<i>_glow`/`_core`, `flow_body_<i>_glow`/`_core`.
 */
export function TradeFlowsLayer({
  viewer,
  enabled,
  tradeFlows,
  countries,
  highlightCountryIso,
  tradeMode,
  year,
  geoJsonRef,
}: TradeFlowsLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!enabled || tradeFlows.length === 0) { viewer.entities.resumeEvents(); return; }

    const iso = highlightCountryIso;
    const isCountryMode = !!iso;

    // ── GLOBAL MODE: color country polygons by trade metric (no country selected) ──
    if (!isCountryMode) {
      // Aggregate per country: exports, imports, net
      const dataByCountry = new Map<string, { net: number; exports: number; imports: number }>();
      for (const f of tradeFlows) {
        const exp = dataByCountry.get(f.exporter_iso) || { net: 0, exports: 0, imports: 0 };
        exp.exports += f.total_value_usd;
        exp.net += f.total_value_usd;
        dataByCountry.set(f.exporter_iso, exp);
        const imp = dataByCountry.get(f.importer_iso) || { net: 0, exports: 0, imports: 0 };
        imp.imports += f.total_value_usd;
        imp.net -= f.total_value_usd;
        dataByCountry.set(f.importer_iso, imp);
      }

      // Compute max based on current trade mode
      const metricValue = (d: { net: number; exports: number; imports: number }) => {
        switch (tradeMode) {
          case "exports": return d.exports;
          case "imports": return d.imports;
          case "volume": return d.exports + d.imports;
          default: return Math.abs(d.net);
        }
      };
      const maxVal = Math.max(
        ...Array.from(dataByCountry.values()).map((v) => metricValue(v)),
        1
      );

      // Pre-build O(1) country lookup
      const countryMap = new Map(countries.map((c) => [c.iso_code, c]));

      // Load GeoJSON (already pre-fetched on mount) and render polygons
      (async () => {
        try {
          if (!geoJsonRef.current) {
            geoJsonRef.current = await fetchCountriesGeoJSON("gdp", year);
          }
          const geojson = geoJsonRef.current;
          if (!geojson?.features) { viewer.entities.resumeEvents(); return; }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const feature of geojson.features as any[]) {
            const fIso = feature.properties?.iso_code;
            if (!fIso) continue;
            const data = dataByCountry.get(fIso);
            if (!data) continue;
            const geom = feature.geometry;
            if (!geom) continue;

            const val = metricValue(data);
            const sqrtNorm = Math.sqrt(val) / Math.sqrt(maxVal);
            const alpha = 0.25 + sqrtNorm * 0.35;

            let color: Color;
            let labelPrefix: string;
            switch (tradeMode) {
              case "exports":
                color = new Color(30 / 255, 200 / 255, 80 / 255, alpha);
                labelPrefix = `$${(data.exports / 1e9).toFixed(1)}B`;
                break;
              case "imports":
                color = new Color(220 / 255, 50 / 255, 40 / 255, alpha);
                labelPrefix = `$${(data.imports / 1e9).toFixed(1)}B`;
                break;
              case "volume":
                color = new Color(40 / 255, 180 / 255, 220 / 255, alpha);
                labelPrefix = `$${((data.exports + data.imports) / 1e9).toFixed(1)}B`;
                break;
              default: {
                const isSurplus = data.net >= 0;
                color = isSurplus
                  ? new Color(30 / 255, 200 / 255, 80 / 255, alpha)
                  : new Color(220 / 255, 50 / 255, 40 / 255, alpha);
                labelPrefix = `${data.net >= 0 ? "+" : ""}${(data.net / 1e9).toFixed(1)}B`;
                break;
              }
            }

            const netB = (data.net / 1e9).toFixed(1);
            const expB = (data.exports / 1e9).toFixed(1);
            const impB = (data.imports / 1e9).toFixed(1);
            const volB = ((data.exports + data.imports) / 1e9).toFixed(1);
            const country = countryMap.get(fIso);
            const countryName = country?.name || fIso;

            // Collect polygon outer rings
            const rings: number[][][] = [];
            if (geom.type === "Polygon") {
              rings.push(geom.coordinates[0]);
            } else if (geom.type === "MultiPolygon") {
              for (const poly of geom.coordinates) {
                rings.push(poly[0]);
              }
            }

            const desc = `<h3>${countryName} (${fIso})</h3><p>Balance: $${netB}B</p><p>Exp: $${expB}B | Imp: $${impB}B | Vol: $${volB}B</p>`;

            // Batch-convert coords via fromDegreesArray (no outline for perf)
            for (let pi = 0; pi < rings.length; pi++) {
              const ring = rings[pi];
              const flat = new Array(ring.length * 2);
              for (let i = 0; i < ring.length; i++) {
                flat[i * 2] = ring[i][0];
                flat[i * 2 + 1] = ring[i][1];
              }
              viewer.entities.add({
                name: `flow_balance_poly_${fIso}_${pi}`,
                polygon: {
                  hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(flat)),
                  material: color,
                  outline: false,
                  height: 0,
                },
                description: desc,
              });
            }

            // Label at centroid
            if (country?.centroid_lat && country?.centroid_lon) {
              viewer.entities.add({
                name: `flow_balance_label_${fIso}`,
                position: Cartesian3.fromDegrees(country.centroid_lon, country.centroid_lat),
                label: {
                  text: `${fIso}\n${labelPrefix}`,
                  font: "bold 11px 'Segoe UI', sans-serif",
                  fillColor: Color.WHITE,
                  outlineColor: Color.fromCssColorString("rgba(0,0,0,0.7)"),
                  outlineWidth: 3,
                  style: LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: VerticalOrigin.CENTER,
                  scaleByDistance: new NearFarScalar(1e6, 1, 8e6, 0.3),
                  translucencyByDistance: new NearFarScalar(1e6, 1, 1.5e7, 0),
                },
              });
            }
          }
        } catch (err) {
          console.error("Failed to load GeoJSON for trade choropleth:", err);
        } finally {
          viewer.entities.resumeEvents();
        }
      })();
      return;
    }

    // ── COUNTRY MODE: show arcs for selected country ──
    let visibleFlows: TradeFlowAggregated[];
    if (tradeMode === "exports") {
      visibleFlows = tradeFlows.filter((f) => f.exporter_iso === iso);
    } else if (tradeMode === "imports") {
      visibleFlows = tradeFlows.filter((f) => f.importer_iso === iso);
    } else if (tradeMode === "balance") {
      // Show both directions — we'll compute net per partner below
      visibleFlows = tradeFlows.filter(
        (f) => f.exporter_iso === iso || f.importer_iso === iso
      );
    } else if (tradeMode === "volume") {
      visibleFlows = tradeFlows.filter(
        (f) => f.exporter_iso === iso || f.importer_iso === iso
      );
    }

    if (visibleFlows!.length === 0) { viewer.entities.resumeEvents(); return; }

    // ── For balance mode, aggregate net per partner ──
    type BalanceEntry = {
      partner: string;
      net: number; // positive = surplus, negative = deficit
      exportVal: number;
      importVal: number;
      lat: number;
      lon: number;
    };
    let balanceMap: Map<string, BalanceEntry> | null = null;

    if (isCountryMode && tradeMode === "balance") {
      balanceMap = new Map();
      for (const f of visibleFlows!) {
        const isExport = f.exporter_iso === iso;
        const partner = isExport ? f.importer_iso : f.exporter_iso;
        const pLat = isExport ? f.importer_lat : f.exporter_lat;
        const pLon = isExport ? f.importer_lon : f.exporter_lon;
        if (!pLat || !pLon) continue;
        const existing = balanceMap.get(partner) || {
          partner,
          net: 0,
          exportVal: 0,
          importVal: 0,
          lat: pLat,
          lon: pLon,
        };
        if (isExport) {
          existing.exportVal += f.total_value_usd;
          existing.net += f.total_value_usd;
        } else {
          existing.importVal += f.total_value_usd;
          existing.net -= f.total_value_usd;
        }
        balanceMap.set(partner, existing);
      }
    }

    // ── For volume mode, aggregate total per partner ──
    type VolumeEntry = {
      partner: string;
      total: number;
      lat: number;
      lon: number;
    };
    let volumeMap: Map<string, VolumeEntry> | null = null;

    if (isCountryMode && tradeMode === "volume") {
      volumeMap = new Map();
      for (const f of visibleFlows!) {
        const isExport = f.exporter_iso === iso;
        const partner = isExport ? f.importer_iso : f.exporter_iso;
        const pLat = isExport ? f.importer_lat : f.exporter_lat;
        const pLon = isExport ? f.importer_lon : f.exporter_lon;
        if (!pLat || !pLon) continue;
        const existing = volumeMap.get(partner) || { partner, total: 0, lat: pLat, lon: pLon };
        existing.total += f.total_value_usd;
        volumeMap.set(partner, existing);
      }
    }

    // ── Color schemes per mode ──
    const getArcColors = (
      flow: TradeFlowAggregated,
      alpha: number
    ): { startColor: Color; endColor: Color } => {
      if (!isCountryMode) {
        // Global view: green→red gradient
        return {
          startColor: new Color(30 / 255, 200 / 255, 80 / 255, alpha),
          endColor: new Color(220 / 255, 50 / 255, 50 / 255, alpha),
        };
      }
      // Note: `isExport` here is not actually referenced in the current
      // colour scheme — kept for parity with the pre-refactor inline code.
      switch (tradeMode) {
        case "exports":
          // Green arcs outward
          return {
            startColor: new Color(20 / 255, 230 / 255, 100 / 255, alpha * 1.2),
            endColor: new Color(20 / 255, 180 / 255, 80 / 255, alpha * 0.6),
          };
        case "imports":
          // Red/orange arcs inward
          return {
            startColor: new Color(255 / 255, 100 / 255, 50 / 255, alpha * 0.6),
            endColor: new Color(220 / 255, 40 / 255, 40 / 255, alpha * 1.2),
          };
        default:
          return {
            startColor: new Color(30 / 255, 200 / 255, 80 / 255, alpha),
            endColor: new Color(220 / 255, 50 / 255, 50 / 255, alpha),
          };
      }
    };

    // ── Get selected country centroid ──
    const selectedCountryData = isCountryMode
      ? countries.find((c) => c.iso_code === iso)
      : null;
    const sLat = selectedCountryData?.centroid_lat || 0;
    const sLon = selectedCountryData?.centroid_lon || 0;

    // ── Helper: add glowing arc with gentle breathing animation ──
    const addArc = (
      arcCartesian: InstanceType<typeof Cartesian3>[],
      opts: {
        name: string;
        trailColor: InstanceType<typeof Color>;
        particleColor: InstanceType<typeof Color>;
        particleHeadColor: InstanceType<typeof Color>;
        trailWidth: number;
        particleWidth: number;
        speed: number;
        stagger: number;
        description: string;
        particleFrac?: number;
      }
    ) => {
      // 1) Outer glow — soft, subtle, breathing
      viewer.entities.add({
        name: `${opts.name}_glow`,
        polyline: {
          positions: arcCartesian,
          width: new CallbackProperty(() => {
            // Gentle breathing: slow sine wave makes glow pulse softly
            const breathe = Math.sin((Date.now() + opts.stagger) / 3000) * 0.15 + 1;
            return opts.particleWidth * 2 * breathe;
          }, false),
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.15,
            taperPower: 0.9,
            color: new CallbackProperty(() => {
              const breathe = Math.sin((Date.now() + opts.stagger) / 3000) * 0.12 + 1;
              const a = opts.particleColor.alpha * 0.2 * breathe;
              return new Color(
                opts.particleColor.red,
                opts.particleColor.green,
                opts.particleColor.blue,
                Math.min(0.5, a)
              );
            }, false),
          }),
          arcType: ArcType.NONE,
        },
        description: opts.description,
      });

      // 2) Inner core — bright thin line, subtle alpha breathing
      viewer.entities.add({
        name: `${opts.name}_core`,
        polyline: {
          positions: arcCartesian,
          width: Math.max(1, opts.particleWidth * 0.5),
          material: new ColorMaterialProperty(
            new CallbackProperty(() => {
              const breathe = Math.sin((Date.now() + opts.stagger + 1500) / 3000) * 0.1 + 1;
              return new Color(
                Math.min(1, opts.particleHeadColor.red * 0.6 + 0.4),
                Math.min(1, opts.particleHeadColor.green * 0.6 + 0.4),
                Math.min(1, opts.particleHeadColor.blue * 0.6 + 0.4),
                Math.min(0.85, opts.particleColor.alpha * 0.7 * breathe)
              );
            }, false)
          ),
          arcType: ArcType.NONE,
        },
      });
    };

    // ── Render BALANCE mode ──
    if (balanceMap) {
      const entries = Array.from(balanceMap.values());
      const maxAbs = Math.max(...entries.map((e) => Math.abs(e.net)), 1);

      entries.forEach((entry, index) => {
        const logNorm = Math.log10(1 + Math.abs(entry.net)) / Math.log10(1 + maxAbs);
        const isSurplus = entry.net >= 0;

        const baseAlpha = 0.06 + logNorm * 0.12;
        const particleAlpha = 0.4 + logNorm * 0.5;
        const speed = Math.max(18000, 72000 - logNorm * 48000); // 18-72s

        const trailColor = isSurplus
          ? new Color(30 / 255, 220 / 255, 100 / 255, baseAlpha)
          : new Color(240 / 255, 60 / 255, 60 / 255, baseAlpha);
        const particleColor = isSurplus
          ? new Color(50 / 255, 255 / 255, 130 / 255, particleAlpha)
          : new Color(255 / 255, 80 / 255, 80 / 255, particleAlpha);
        const headColor = isSurplus
          ? new Color(180 / 255, 255 / 255, 200 / 255, Math.min(1, particleAlpha * 1.5))
          : new Color(255 / 255, 180 / 255, 180 / 255, Math.min(1, particleAlpha * 1.5));

        const arcPoints = isSurplus
          ? computeArcPositions(sLon, sLat, entry.lon, entry.lat, 50, 0.08 + logNorm * 0.2)
          : computeArcPositions(entry.lon, entry.lat, sLon, sLat, 50, 0.08 + logNorm * 0.2);
        const arcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);

        const netB = (entry.net / 1e9).toFixed(2);
        const expB = (entry.exportVal / 1e9).toFixed(2);
        const impB = (entry.importVal / 1e9).toFixed(2);

        // Width from log-normalized value: thin for small, thick for large
        const wParticle = 1 + logNorm * 5;

        addArc(arcCartesian, {
          name: `flow_balance_${index}`,
          trailColor,
          particleColor,
          particleHeadColor: headColor,
          trailWidth: wParticle * 0.5,
          particleWidth: wParticle,
          speed,
          stagger: index * 731,
          particleFrac: 0.55 + logNorm * 0.12,
          description: `
            <h3>Trade Balance: ${iso} ↔ ${entry.partner}</h3>
            <p>${isSurplus ? "🟢 Surplus" : "🔴 Deficit"}: $${netB}B</p>
            <p>Exports: $${expB}B | Imports: $${impB}B</p>
          `,
        });
      });

      viewer.entities.resumeEvents();
      return;
    }

    // ── Render VOLUME mode ──
    if (volumeMap) {
      const entries = Array.from(volumeMap.values());
      const maxVol = Math.max(...entries.map((e) => e.total), 1);

      entries.forEach((entry, index) => {
        const logNorm = Math.log10(1 + entry.total) / Math.log10(1 + maxVol);
        const speed = Math.max(18000, 72000 - logNorm * 48000);

        const trailColor = new Color(130 / 255, 80 / 255, 220 / 255, 0.05 + logNorm * 0.1);
        const particleColor = new Color(180 / 255, 120 / 255, 255 / 255, 0.4 + logNorm * 0.5);
        const headColor = new Color(220 / 255, 200 / 255, 255 / 255, Math.min(1, 0.7 + logNorm * 0.3));

        const arcPoints = computeArcPositions(
          sLon, sLat, entry.lon, entry.lat, 50, 0.08 + logNorm * 0.2
        );
        const arcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);

        // Width from log-normalized value: thin for small, thick for large
        const wParticle = 1 + logNorm * 5;

        addArc(arcCartesian, {
          name: `flow_volume_${index}`,
          trailColor,
          particleColor,
          particleHeadColor: headColor,
          trailWidth: wParticle * 0.5,
          particleWidth: wParticle,
          speed,
          stagger: index * 731,
          particleFrac: 0.55 + logNorm * 0.12,
          description: `
            <h3>Trade Volume: ${iso} ↔ ${entry.partner}</h3>
            <p>Total: $${(entry.total / 1e9).toFixed(2)}B</p>
          `,
        });
      });

      viewer.entities.resumeEvents();
      return;
    }

    // ── Render ALL / EXPORTS / IMPORTS modes ──
    const maxValue = Math.max(...visibleFlows!.map((f) => f.total_value_usd));

    visibleFlows!.forEach((flow, index) => {
      if (
        !flow.exporter_lat ||
        !flow.exporter_lon ||
        !flow.importer_lat ||
        !flow.importer_lon
      )
        return;

      const logValue = Math.log10(1 + flow.total_value_usd);
      const logMax = Math.log10(1 + maxValue);
      const logNorm = logMax > 0 ? logValue / logMax : 0;

      const isExportFromSelected = isCountryMode && flow.exporter_iso === iso;
      const speed = Math.max(18000, 84000 - logNorm * 60000); // 18-84s
      const trailAlpha = isCountryMode ? 0.04 + logNorm * 0.1 : 0.03 + logNorm * 0.07;
      const particleAlpha = isCountryMode ? 0.3 + logNorm * 0.5 : 0.2 + logNorm * 0.4;

      const { startColor: scRaw, endColor: ecRaw } = getArcColors(flow, 1);

      // Trail uses raw color with low alpha
      const trailColor = new Color(scRaw.red, scRaw.green, scRaw.blue, trailAlpha);
      // Particle uses raw color with higher alpha
      const particleColor = new Color(
        (scRaw.red + ecRaw.red) / 2,
        (scRaw.green + ecRaw.green) / 2,
        (scRaw.blue + ecRaw.blue) / 2,
        particleAlpha
      );
      // Bright white-tinted head
      const headColor = new Color(
        Math.min(1, scRaw.red * 0.5 + 0.5),
        Math.min(1, scRaw.green * 0.5 + 0.5),
        Math.min(1, scRaw.blue * 0.5 + 0.5),
        Math.min(1, particleAlpha * 1.4)
      );

      const arcPoints = computeArcPositions(
        flow.exporter_lon, flow.exporter_lat,
        flow.importer_lon, flow.importer_lat,
        50, 0.08 + logNorm * 0.2
      );
      const arcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);

      const modeLabel =
        tradeMode === "exports"
          ? "Export"
          : tradeMode === "imports"
          ? "Import"
          : isCountryMode
          ? isExportFromSelected
            ? "Export"
            : "Import"
          : "Trade Flow";

      // Width from log-normalized value: thin for small, thick for large
      const wParticle = 1 + logNorm * 5;

      addArc(arcCartesian, {
        name: `flow_body_${index}`,
        trailColor,
        particleColor,
        particleHeadColor: headColor,
        trailWidth: wParticle * 0.5,
        particleWidth: wParticle,
        speed,
        stagger: index * 731,
        particleFrac: 0.55 + logNorm * 0.12,
        description: `
          <h3>${modeLabel}</h3>
          <p>${flow.exporter_iso} → ${flow.importer_iso}</p>
          <p>Value: $${(flow.total_value_usd / 1e9).toFixed(2)}B</p>
        `,
      });
    });

    viewer.entities.resumeEvents();
  }, [viewer, enabled, tradeFlows, countries, highlightCountryIso, tradeMode, year, geoJsonRef]);

  return null;
}
