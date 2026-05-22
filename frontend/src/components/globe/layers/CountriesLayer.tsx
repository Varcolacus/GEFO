"use client";

import { useEffect, type RefObject } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  NearFarScalar,
  LabelStyle,
  VerticalOrigin,
  PolygonHierarchy,
} from "cesium";

import type { CountryMacro } from "@/lib/api";
import { fetchCountriesGeoJSON } from "@/lib/api";

interface CountriesLayerProps {
  viewer: Viewer;
  enabled: boolean;
  countries: CountryMacro[];
  indicator: string;
  year: number | null;
  /** Shared GeoJSON cache. Owned by the orchestrator; CountriesLayer
   *  reads + writes; TradeFlowsLayer (still in orchestrator) also reads. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geoJsonRef: RefObject<any>;
}

/**
 * Renders country polygons as a transparent cyan choropleth keyed by an
 * arbitrary macro indicator (GDP, trade balance, governance, etc.). Polygon
 * alpha encodes the value; identical hue keeps the globe readable.
 *
 * Per-feature labels render at country centroids with the formatted value.
 * Entities tagged `country_<iso>_<ringIdx>` (polygons) and `country_<iso>`
 * (centroid label) — the orchestrator's click handler picks by this prefix.
 *
 * Year-aware: requests indicator values for the given year from the backend
 * GeoJSON endpoint and merges them over the in-memory `countries` array.
 */
export function CountriesLayer({
  viewer,
  enabled,
  countries,
  indicator,
  year,
  geoJsonRef,
}: CountriesLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    // Remove existing country entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("country_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!enabled || countries.length === 0) { viewer.entities.resumeEvents(); return; }

    // Indicators that are percentages or indices (not USD)
    const PCT_INDICATORS = new Set([
      "gdp_growth", "inflation_cpi", "trade_pct_gdp", "external_balance_pct_gdp",
      "high_tech_exports_pct", "fdi_inflows_pct_gdp", "gross_capital_formation_pct",
      "gross_savings_pct", "external_debt_pct_gni", "broad_money_pct_gdp",
      "domestic_credit_pct_gdp", "govt_revenue_pct_gdp", "govt_expense_pct_gdp",
      "govt_debt_pct_gdp", "urban_population_pct", "unemployment_pct",
      "labor_force_participation_pct", "poverty_headcount_pct",
      "education_expenditure_pct_gdp", "electricity_access_pct",
      "renewable_energy_pct", "military_expenditure_pct_gdp",
      "internet_users_pct", "rd_expenditure_pct_gdp",
      "natural_resource_rents_pct", "oil_rents_pct", "gas_rents_pct",
      "mineral_rents_pct", "coal_rents_pct", "forest_rents_pct",
      "agriculture_pct_gdp", "industry_pct_gdp", "services_pct_gdp",
      "arable_land_pct", "tariff_rate_weighted", "tariff_rate_simple",
      "trade_openness", "import_dependency",
    ]);

    // Indicators that can be negative (diverging color scale)
    const DIVERGING_INDICATORS = new Set([
      "trade_balance", "current_account", "external_balance_pct_gdp",
      "gdp_growth", "inflation_cpi",
      "control_corruption", "govt_effectiveness", "regulatory_quality",
      "rule_of_law", "political_stability", "voice_accountability",
    ]);

    // Plain-number indicators (no $ or %)
    const PLAIN_INDICATORS = new Set([
      "population", "life_expectancy", "gini_index", "energy_use_per_capita",
      "co2_per_capita", "electric_power_consumption", "mobile_subscriptions_per100",
      "patent_applications", "exchange_rate",
      "control_corruption", "govt_effectiveness", "regulatory_quality",
      "rule_of_law", "political_stability", "voice_accountability",
    ]);

    const computeValue = (c: CountryMacro): number | null | undefined => {
      if (indicator === "trade_openness") {
        if (c.gdp && c.export_value != null && c.import_value != null && c.gdp > 0)
          return ((c.export_value + c.import_value) / c.gdp) * 100;
        return null;
      }
      if (indicator === "import_dependency") {
        if (c.gdp && c.import_value != null && c.gdp > 0)
          return (c.import_value / c.gdp) * 100;
        return null;
      }
      const val = (c as unknown as Record<string, unknown>)[indicator];
      return typeof val === "number" ? val : null;
    };

    // Build value map by ISO
    const valueMap = new Map<string, number>();
    for (const c of countries) {
      const v = computeValue(c);
      if (v != null) valueMap.set(c.iso_code, v);
    }
    const values = Array.from(valueMap.values()).filter((v) => v !== 0);
    if (values.length === 0) { viewer.entities.resumeEvents(); return; }

    const isDiverging = DIVERGING_INDICATORS.has(indicator);
    const countryMap = new Map(countries.map((c) => [c.iso_code, c]));

    const formatValue = (rawValue: number): string => {
      if (PCT_INDICATORS.has(indicator)) return `${rawValue.toFixed(1)}%`;
      if (PLAIN_INDICATORS.has(indicator)) {
        if (rawValue >= 1e9) return `${(rawValue / 1e9).toFixed(1)}B`;
        if (rawValue >= 1e6) return `${(rawValue / 1e6).toFixed(1)}M`;
        return rawValue.toFixed(1);
      }
      if (Math.abs(rawValue) >= 1e12) return `$${(rawValue / 1e12).toFixed(1)}T`;
      if (Math.abs(rawValue) >= 1e9) return `$${(rawValue / 1e9).toFixed(1)}B`;
      if (Math.abs(rawValue) >= 1e6) return `$${(rawValue / 1e6).toFixed(1)}M`;
      return `$${rawValue.toFixed(0)}`;
    };

    // Render using GeoJSON polygons (transparent fills)
    (async () => {
      try {
        // Fetch year-aware GeoJSON (backend returns per-year indicator values)
        geoJsonRef.current = await fetchCountriesGeoJSON(indicator, year);
        const geojson = geoJsonRef.current;
        if (!geojson?.features) { viewer.entities.resumeEvents(); return; }

        // When we have year-aware GeoJSON, use its values instead of the countries array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const features = geojson.features as any[];
        const geoValueMap = new Map<string, number>();
        for (const feature of features) {
          const fIso = feature.properties?.iso_code;
          const val = feature.properties?.value;
          if (fIso && val != null) geoValueMap.set(fIso, val);
        }
        // Merge: prefer GeoJSON values (year-aware), fall back to computed valueMap
        const mergedMap = new Map(valueMap);
        for (const [iso, val] of geoValueMap) mergedMap.set(iso, val);

        // Recompute min/max from merged values
        const mergedValues = Array.from(mergedMap.values()).filter((v) => v !== 0);
        if (mergedValues.length === 0) { viewer.entities.resumeEvents(); return; }
        const mMax = Math.max(...mergedValues);
        const mMin = Math.min(...mergedValues);

        const computeColorFinal = (rawValue: number): Color => {
          let normalized: number;
          if (isDiverging) {
            const absMax = Math.max(Math.abs(mMin), Math.abs(mMax));
            normalized = absMax > 0 ? Math.abs(rawValue) / absMax : 0;
          } else {
            normalized = mMax > mMin ? (rawValue - mMin) / (mMax - mMin) : 0.5;
          }
          const alpha = 0.12 + normalized * 0.55;
          return new Color(34 / 255, 211 / 255, 238 / 255, alpha);
        };

        for (const feature of features) {
          const fIso = feature.properties?.iso_code;
          if (!fIso) continue;
          const rawValue = mergedMap.get(fIso);
          if (rawValue == null) continue;
          const geom = feature.geometry;
          if (!geom) continue;

          const color = computeColorFinal(rawValue);

          // Collect polygon outer rings
          const rings: number[][][] = [];
          if (geom.type === "Polygon") {
            rings.push(geom.coordinates[0]);
          } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates) {
              rings.push(poly[0]);
            }
          }

          for (let pi = 0; pi < rings.length; pi++) {
            const ring = rings[pi];
            const flat = new Array(ring.length * 2);
            for (let i = 0; i < ring.length; i++) {
              flat[i * 2] = ring[i][0];
              flat[i * 2 + 1] = ring[i][1];
            }
            viewer.entities.add({
              name: `country_${fIso}_${pi}`,
              polygon: {
                hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(flat)),
                material: color,
                outline: true,
                outlineColor: color.withAlpha(0.7),
                height: 0,
              },
            });
          }

          // Label at centroid
          const country = countryMap.get(fIso);
          if (country?.centroid_lat && country?.centroid_lon) {
            const formattedValue = formatValue(rawValue);
            viewer.entities.add({
              name: `country_${fIso}`,
              position: Cartesian3.fromDegrees(country.centroid_lon, country.centroid_lat),
              label: {
                text: `${fIso}\n${formattedValue}`,
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
        console.error("Failed to load GeoJSON for indicator choropleth:", err);
      } finally {
        viewer.entities.resumeEvents();
      }
    })();
  }, [viewer, enabled, countries, indicator, year, geoJsonRef]);

  return null;
}
