"use client";

// Set CESIUM_BASE_URL before any Cesium imports resolve assets
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CESIUM_BASE_URL = "/cesium";
}

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  ArcType,
  NearFarScalar,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  PolylineArrowMaterialProperty,
  ColorMaterialProperty,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  UrlTemplateImageryProvider,
  ImageryLayer,
  EllipsoidTerrainProvider,
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  Cartesian2,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import type {
  CountryMacro,
  TradeFlowAggregated,
  PortData,
  AirportData,
  ShippingDensityPoint,
  ConflictZone,
  CommodityFlowEdge,
  VesselPosition,
  AircraftPosition,
} from "@/lib/api";
import type { TradeMode } from "@/lib/trade-modes";
import { MAJOR_AIRPORTS } from "@/lib/airports";
import { SHIPPING_CORRIDORS } from "@/lib/shipping-corridors";

// Disable Cesium Ion — uses CartoDB + OpenStreetMap
Ion.defaultAccessToken = "";

/**
 * Compute 3D arc positions above the globe surface.
 * Creates a smooth parabolic arc between two geographic points.
 */
function computeArcPositions(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  segments: number = 40,
  heightScale: number = 0.15
): number[] {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;

  // Choose the shorter longitude path (handles antimeridian crossing)
  let dLonDeg = lon2 - lon1;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;

  const dLon = dLonDeg * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const distMeters = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6_371_000;
  const maxHeight = Math.min(distMeters * heightScale, 4_000_000); // cap at 4000km

  const points: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let lon = lon1 + dLonDeg * t;
    // Normalize longitude to [-180, 180]
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    const lat = lat1 + (lat2 - lat1) * t;
    const height = maxHeight * 4 * t * (1 - t); // parabolic
    points.push(lon, lat, height);
  }
  return points;
}

// Google Earth hybrid tiles — satellite + borders + roads + labels
const GOOGLE_EARTH_TILES = {
  url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  subdomains: ["0", "1", "2", "3"],
  credit: "© Google",
  maxZoom: 21,
};

interface GlobeViewerProps {
  countries: CountryMacro[];
  tradeFlows: TradeFlowAggregated[];
  ports: PortData[];
  shippingDensity: ShippingDensityPoint[];
  conflictZones?: ConflictZone[];
  commodityFlows?: CommodityFlowEdge[];
  vessels?: VesselPosition[];
  aircraftList?: AircraftPosition[];
  airports?: AirportData[];
  layers: {
    countries: boolean;
    tradeFlows: boolean;
    ports: boolean;
    shippingDensity: boolean;
    vessels: boolean;
    railroads: boolean;
    airports: boolean;
    aircraft: boolean;
  };
  indicator: string;
  onCountryClick?: (country: CountryMacro) => void;
  flyToCountry?: CountryMacro | null;
  flyToPosition?: { lon: number; lat: number; altitude: number } | null;
  highlightCountryIso?: string | null;
  tradeMode?: TradeMode;
}

export interface GlobeViewerHandle {
  captureScreenshot: () => string | null;
}

const GlobeViewer = forwardRef<GlobeViewerHandle, GlobeViewerProps>(function GlobeViewer({
  countries,
  tradeFlows,
  ports,
  shippingDensity,
  conflictZones = [],
  commodityFlows = [],
  vessels = [],
  aircraftList = [],
  airports: airportsProp = [],
  layers,
  indicator,
  onCountryClick,
  flyToCountry,
  flyToPosition,
  highlightCountryIso,
  tradeMode = "all",
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  // Expose screenshot method to parent
  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      const viewer = viewerRef.current;
      if (!viewer) return null;
      viewer.render();
      return viewer.canvas.toDataURL("image/png");
    },
  }));

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // Create a hidden credit container to prevent Ion credit image loading
    const creditContainer = document.createElement("div");
    creditContainer.style.display = "none";

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: true,
      timeline: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      // skyBox: default — renders built-in star field
      // skyAtmosphere: default — renders blue atmospheric glow
      creditContainer,
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true, // needed for screenshots
        },
      },
      baseLayer: false as unknown as ImageryLayer,  // we add imagery manually below
      terrainProvider: new EllipsoidTerrainProvider(),
    });

    // ── High-resolution rendering (match Google Earth sharpness) ──
    viewer.resolutionScale = window.devicePixelRatio || 1.0; // HiDPI / Retina support
    viewer.scene.globe.maximumScreenSpaceError = 1.0;        // load higher-detail tiles (default 2)
    viewer.scene.postProcessStages.fxaa.enabled = true;     // anti-aliasing
    viewer.scene.msaaSamples = 4;                            // multi-sample anti-aliasing

    // Add Google Earth hybrid imagery
    const initLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: GOOGLE_EARTH_TILES.url,
        subdomains: GOOGLE_EARTH_TILES.subdomains,
        credit: GOOGLE_EARTH_TILES.credit,
        minimumLevel: 0,
        maximumLevel: GOOGLE_EARTH_TILES.maxZoom,
      })
    );
    // 1:1 tile fidelity — matches Google Earth rendering
    initLayer.brightness = 1.03;
    initLayer.contrast = 1.02;
    initLayer.saturation = 1.05;

    // Deep-space background + ocean-blue globe base
    viewer.scene.backgroundColor = Color.fromCssColorString("#020209");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0f2a45");
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.enableLighting = false; // disabled — lighting darkens tiles making detail invisible

    // ── Allow ultra-close zoom (street/building level) ──
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 25;    // 25m from ground
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50000000; // 50,000km max

    // ── Bloom OFF — it blurs map labels/streets making tiles unreadable at close zoom ──
    viewer.scene.postProcessStages.bloom.enabled = false;

    // ── Atmosphere tuning ──
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.brightnessShift = 0.0;
      viewer.scene.skyAtmosphere.hueShift = 0.0;
      viewer.scene.skyAtmosphere.saturationShift = 0.0;
    }

    // ── No fog — matches Google Earth clarity ──
    viewer.scene.fog.enabled = false;

    // ── Depth testing so entities occlude properly ──
    viewer.scene.globe.depthTestAgainstTerrain = false;

    // ── Globe translucency for subtle ocean depth ──
    viewer.scene.globe.translucency.enabled = false;

    // Initial camera — centered globe view
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(15, 20, 22000000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration: 0,
    });

    viewerRef.current = viewer;

    // ── Block browser pinch-zoom globally ──
    // Windows precision touchpads send pinch as Ctrl+wheel at the document level;
    // we must intercept *there* so the browser never gets a chance to page-zoom.
    const blockBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("wheel", blockBrowserZoom, { passive: false });

    // Also set touch-action on the canvas so real touch screens pass through
    const canvas = viewer.canvas;
    canvas.style.touchAction = "none";

    // Safari pinch events
    const blockGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);

    return () => {
      document.removeEventListener("wheel", blockBrowserZoom);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // ─── Overlay layers: railroads, sea ports, airports ───
  // Helper to find an overlay layer by tag
  const findOverlayLayer = useCallback((viewer: Viewer, tag: string): ImageryLayer | null => {
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const layer = viewer.imageryLayers.get(i);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((layer as any)._overlayTag === tag) return layer;
    }
    return null;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // ── Railroads overlay (proxied via backend to avoid OpenRailwayMap 403) ──
    const existingRailroads = findOverlayLayer(viewer, "railroads");
    if (layers.railroads && !existingRailroads) {
      const provider = new UrlTemplateImageryProvider({
        url: "/api/tiles/railroad/{z}/{x}/{y}.png",
        credit: "© OpenRailwayMap contributors",
        minimumLevel: 2,
        maximumLevel: 18,
        hasAlphaChannel: true,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0.85;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._overlayTag = "railroads";
    } else if (!layers.railroads && existingRailroads) {
      viewer.imageryLayers.remove(existingRailroads, false);
    }

    // ── Airports rendered as entities (see separate effect below) ──
  }, [layers.railroads, findOverlayLayer]);

  // ─── Render Airport Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove existing airport entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("airport_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.airports) { viewer.entities.resumeEvents(); return; }

    // Use API data if available, fall back to hardcoded list
    const useApiData = airportsProp.length > 0;
    const airportsList = useApiData
      ? airportsProp.map((a) => ({
          iata: a.iata || "?",
          name: a.name,
          city: a.city || "",
          country: a.country_iso,
          lat: a.lat,
          lon: a.lon,
          pax: a.pax_annual || 0,
          elevation_ft: a.elevation_ft,
          icao: a.icao,
          runways: a.runways,
          airport_type: a.airport_type,
        }))
      : MAJOR_AIRPORTS.map((a) => ({
          ...a,
          elevation_ft: undefined as number | undefined,
          icao: undefined as string | undefined,
          runways: undefined as number | undefined,
          airport_type: undefined as string | undefined,
        }));

    const airportColor = Color.fromCssColorString("#d8b4fe"); // bright violet
    const airportColorFaded = airportColor.withAlpha(0.35);

    airportsList.forEach((apt) => {
      const pax = apt.pax || 0;
      const size = Math.min(8 + Math.log10(Math.max(pax, 1)) * 3, 18);

      // Airport point
      viewer.entities.add({
        name: `airport_${apt.iata}`,
        position: Cartesian3.fromDegrees(apt.lon, apt.lat),
        point: {
          pixelSize: size,
          color: airportColor,
          outlineColor: Color.WHITE.withAlpha(0.7),
          outlineWidth: 1.5,
          scaleByDistance: new NearFarScalar(5e5, 1.4, 2e7, 0.6),
          translucencyByDistance: new NearFarScalar(1e5, 1, 3e7, 0.5),
        },
        label: {
          text: apt.iata,
          font: "bold 11px 'Segoe UI', sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("rgba(0,0,0,0.7)"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian3(8, -8, 0) as any,
          scaleByDistance: new NearFarScalar(5e5, 1, 1.5e7, 0.35),
          translucencyByDistance: new NearFarScalar(5e5, 1, 2e7, 0.4),
        },
        description: `
          <h3>✈ ${apt.name} (${apt.iata})</h3>
          <p>${apt.city}, ${apt.country}</p>
          ${pax > 0 ? `<p>≈ ${pax.toFixed(1)}M passengers/year</p>` : ""}
          ${apt.icao ? `<p>ICAO: ${apt.icao}</p>` : ""}
          ${apt.elevation_ft != null ? `<p>Elevation: ${apt.elevation_ft.toLocaleString()} ft</p>` : ""}
          ${apt.runways ? `<p>Runways: ${apt.runways}</p>` : ""}
          ${apt.airport_type ? `<p>Type: ${apt.airport_type.replace("_", " ")}</p>` : ""}
        `,
      });

      // Glow ring around major hubs (pax > 50M)
      if (pax > 50) {
        viewer.entities.add({
          name: `airport_glow_${apt.iata}`,
          position: Cartesian3.fromDegrees(apt.lon, apt.lat),
          ellipse: {
            semiMajorAxis: 18000 + pax * 200,
            semiMinorAxis: 18000 + pax * 200,
            height: 0,
            material: airportColorFaded,
            outline: false,
          },
        });
      }
    });

    viewer.entities.resumeEvents();
  }, [layers.airports, airportsProp]);

  // ─── Click handler for country entities ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !onCountryClick) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id && picked.id.name) {
        const entityName = picked.id.name as string;
        if (entityName.startsWith("country_")) {
          const iso = entityName.replace("country_", "");
          const country = countries.find((c) => c.iso_code === iso);
          if (country) onCountryClick(country);
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [countries, onCountryClick]);

  // ─── Double-click to zoom (Google Earth style) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Disable default double-click behaviour (entity tracking)
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      // Ray-pick the globe surface at click position
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return;

      const height = viewer.camera.positionCartographic.height;
      const targetHeight = Math.max(height * 0.35, 100); // zoom to 35% of current height, min 100m

      viewer.camera.flyTo({
        destination: Cartesian3.fromRadians(
          viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian).longitude,
          viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian).latitude,
          targetHeight
        ),
        orientation: {
          heading: viewer.camera.heading,
          pitch: viewer.camera.pitch,
          roll: 0,
        },
        duration: 1.0,
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => handler.destroy();
  }, []);

  // ─── Fly to country when requested ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToCountry || !flyToCountry.centroid_lat || !flyToCountry.centroid_lon) return;

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToCountry.centroid_lon,
        flyToCountry.centroid_lat,
        4000000 // 4,000 km altitude — top-down view
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90), // straight down
        roll: 0,
      },
      duration: 1.5,
    });
  }, [flyToCountry]);

  // ─── Fly to position (region nav) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToPosition) return;

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToPosition.lon,
        flyToPosition.lat,
        flyToPosition.altitude
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration: 1.8,
    });
  }, [flyToPosition]);

  // ─── Render Country Points (with macro indicator coloring) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove existing country entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("country_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.countries || countries.length === 0) { viewer.entities.resumeEvents(); return; }

    // Calculate value range for color mapping

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
      // Computed indicators
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
      // Direct field lookup
      const val = (c as unknown as Record<string, unknown>)[indicator];
      return typeof val === "number" ? val : null;
    };

    const values = countries
      .map((c) => computeValue(c))
      .filter((v): v is number => v != null && v !== 0);

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);

    countries.forEach((country) => {
      if (!country.centroid_lat || !country.centroid_lon) return;

      const rawValue = computeValue(country);

      if (rawValue == null) return;

      // Normalize to 0-1
      const isDiverging = DIVERGING_INDICATORS.has(indicator);
      let normalized: number;
      if (isDiverging) {
        // Diverging: red for negative, green for positive
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        normalized = (rawValue + absMax) / (2 * absMax);
      } else {
        normalized = maxVal > minVal ? (rawValue - minVal) / (maxVal - minVal) : 0.5;
      }

      // Color interpolation
      let color: Color;
      if (isDiverging) {
        color = Color.fromCssColorString(
          normalized < 0.5
            ? `rgba(${Math.round(220 - normalized * 200)}, ${Math.round(50 + normalized * 150)}, 50, 0.8)`
            : `rgba(50, ${Math.round(100 + normalized * 155)}, ${Math.round(50 + normalized * 100)}, 0.8)`
        );
      } else {
        const hue = normalized * 0.35; // 0 (red) to 0.35 (green)
        color = Color.fromHsl(hue, 0.8, 0.45 + normalized * 0.2, 0.85);
      }

      const radius = 55000 + normalized * 220000;
      const extrudeHeight = 80000 + normalized * 2500000; // tall 3D column (up to ~2.5M meters)

      const formattedValue =
        PCT_INDICATORS.has(indicator)
          ? `${rawValue.toFixed(1)}%`
          : PLAIN_INDICATORS.has(indicator)
          ? rawValue >= 1e9 ? `${(rawValue / 1e9).toFixed(1)}B`
            : rawValue >= 1e6 ? `${(rawValue / 1e6).toFixed(1)}M`
            : rawValue.toFixed(1)
          : Math.abs(rawValue) >= 1e12
          ? `$${(rawValue / 1e12).toFixed(1)}T`
          : Math.abs(rawValue) >= 1e9
          ? `$${(rawValue / 1e9).toFixed(1)}B`
          : Math.abs(rawValue) >= 1e6
          ? `$${(rawValue / 1e6).toFixed(1)}M`
          : `$${rawValue.toFixed(0)}`;

      // Brighter outline for glow effect
      const outlineColor = Color.fromHsl(
        isDiverging ? (normalized < 0.5 ? 0.0 : 0.33) : normalized * 0.35,
        1.0, 0.65, 0.9
      );

      viewer.entities.add({
        name: `country_${country.iso_code}`,
        position: Cartesian3.fromDegrees(
          country.centroid_lon,
          country.centroid_lat
        ),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: 0,
          extrudedHeight: extrudeHeight,
          material: color,
          outline: true,
          outlineColor: outlineColor,
          outlineWidth: 1,
        },
        label: {
          text: country.iso_code,
          font: "bold 13px 'Segoe UI', sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("rgba(0,0,0,0.7)"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian3(0, -20, 0) as any,
          scaleByDistance: new NearFarScalar(1e6, 1, 1e7, 0.4),
          translucencyByDistance: new NearFarScalar(1e6, 1, 2e7, 0),
        },
        description: `
          <h3>${country.name} (${country.iso_code})</h3>
          <p><strong>${indicator.replace("_", " ")}:</strong> ${formattedValue}</p>
          ${country.gdp ? `<p>GDP: $${(country.gdp / 1e9).toFixed(1)}B</p>` : ""}
          ${country.population ? `<p>Population: ${(country.population / 1e6).toFixed(1)}M</p>` : ""}
          ${country.export_value ? `<p>Exports: $${(country.export_value / 1e9).toFixed(1)}B</p>` : ""}
          ${country.import_value ? `<p>Imports: $${(country.import_value / 1e9).toFixed(1)}B</p>` : ""}
        `,
      });
    });

    viewer.entities.resumeEvents();
  }, [countries, layers.countries, indicator]);

  // ─── Render Trade Flow Lines (mode-aware) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.tradeFlows || tradeFlows.length === 0) { viewer.entities.resumeEvents(); return; }

    const iso = highlightCountryIso;
    const isCountryMode = !!iso;

    // ── Filter flows based on trade mode ──
    let visibleFlows: TradeFlowAggregated[];
    if (!isCountryMode) {
      visibleFlows = tradeFlows;
    } else if (tradeMode === "exports") {
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
    } else {
      // "all"
      visibleFlows = tradeFlows.filter(
        (f) => f.exporter_iso === iso || f.importer_iso === iso
      );
    }

    if (visibleFlows.length === 0) { viewer.entities.resumeEvents(); return; }

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
      for (const f of visibleFlows) {
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
      for (const f of visibleFlows) {
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
      const isExport = flow.exporter_iso === iso;
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
        case "all":
        default:
          if (isExport) {
            return {
              startColor: new Color(30 / 255, 200 / 255, 80 / 255, alpha),
              endColor: new Color(30 / 255, 160 / 255, 60 / 255, alpha * 0.5),
            };
          } else {
            return {
              startColor: new Color(220 / 255, 80 / 255, 50 / 255, alpha * 0.5),
              endColor: new Color(220 / 255, 50 / 255, 50 / 255, alpha),
            };
          }
      }
    };

    // ── Get selected country centroid ──
    const selectedCountryData = isCountryMode
      ? countries.find((c) => c.iso_code === iso)
      : null;
    const sLat = selectedCountryData?.centroid_lat || 0;
    const sLon = selectedCountryData?.centroid_lon || 0;

    // ── Helper: add static arc curve ──
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
      viewer.entities.add({
        name: opts.name,
        polyline: {
          positions: arcCartesian,
          width: opts.particleWidth,
          material: new ColorMaterialProperty(opts.particleColor),
          arcType: ArcType.NONE,
        },
        description: opts.description,
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

        // Width from absolute log of value: log10(1+val) maps ~$1M→6, ~$1B→9, ~$100B→11
        const logAbsVal = Math.log10(1 + Math.abs(entry.net));
        const wTrail = 0.15 + logAbsVal * 0.08;
        const wParticle = 0.3 + logAbsVal * 0.18;

        addArc(arcCartesian, {
          name: `flow_balance_${index}`,
          trailColor,
          particleColor,
          particleHeadColor: headColor,
          trailWidth: wTrail,
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

        // Width from absolute log of value
        const logAbsVal = Math.log10(1 + entry.total);
        const wTrail = 0.15 + logAbsVal * 0.08;
        const wParticle = 0.3 + logAbsVal * 0.2;

        addArc(arcCartesian, {
          name: `flow_volume_${index}`,
          trailColor,
          particleColor,
          particleHeadColor: headColor,
          trailWidth: wTrail,
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
    const maxValue = Math.max(...visibleFlows.map((f) => f.total_value_usd));

    visibleFlows.forEach((flow, index) => {
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

      // Width from absolute log of value: log10(1+val) maps ~$1M→6, ~$1B→9, ~$100B→11
      const logAbsVal = Math.log10(1 + flow.total_value_usd);
      const wTrail = 0.1 + logAbsVal * 0.07;
      const wParticle = 0.2 + logAbsVal * 0.15;

      addArc(arcCartesian, {
        name: `flow_body_${index}`,
        trailColor,
        particleColor,
        particleHeadColor: headColor,
        trailWidth: wTrail,
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
  }, [tradeFlows, layers.tradeFlows, highlightCountryIso, tradeMode, countries]);

  // ─── Render Port Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("port_") || e.name?.startsWith("port_glow_") || e.name?.startsWith("port_pillar_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    // ── OpenSeaMap tile overlay (thousands of nautical features) ──
    const existingSeaPorts = findOverlayLayer(viewer, "seaPorts");
    if (layers.ports && !existingSeaPorts) {
      const provider = new UrlTemplateImageryProvider({
        url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
        credit: "© OpenSeaMap contributors",
        minimumLevel: 0,
        maximumLevel: 18,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0.9;
      layer.brightness = 1.3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer as any)._overlayTag = "seaPorts";
    } else if (!layers.ports && existingSeaPorts) {
      viewer.imageryLayers.remove(existingSeaPorts, false);
    }

    if (!layers.ports || ports.length === 0) { viewer.entities.resumeEvents(); return; }

    // ── Database ports (44 major ports with 3D pillars & info) ──
    ports.forEach((port) => {
      const throughput = port.throughput_teu || port.throughput_tons || 0;
      const size = Math.min(10 + Math.log10(Math.max(throughput, 1)) * 2.5, 24);
      const glowRadius = 25000 + Math.log10(Math.max(throughput, 1)) * 8000;

      const colorMap: Record<string, string> = {
        container: "#00ff99",
        oil: "#ff7722",
        bulk: "#ffdd33",
        transit: "#dd77ff",
      };
      const portColor = colorMap[port.port_type || "container"] || "#00ff99";
      const cesiumColor = Color.fromCssColorString(portColor);

      // 3D elevated port pillar
      const pillarHeight = 40000 + Math.log10(Math.max(throughput, 1)) * 20000;
      viewer.entities.add({
        name: `port_pillar_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat),
        ellipse: {
          semiMajorAxis: 8000,
          semiMinorAxis: 8000,
          height: 0,
          extrudedHeight: pillarHeight,
          material: cesiumColor.withAlpha(0.4),
          outline: true,
          outlineColor: cesiumColor.withAlpha(0.7),
          outlineWidth: 1,
        },
      });

      // Bright point on top of pillar
      viewer.entities.add({
        name: `port_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat, pillarHeight),
        point: {
          pixelSize: size,
          color: cesiumColor,
          outlineColor: Color.WHITE.withAlpha(0.6),
          outlineWidth: 1.5,
          scaleByDistance: new NearFarScalar(1e6, 1, 1e7, 0.5),
        },
        label: {
          text: port.name,
          font: "11px 'Segoe UI', sans-serif",
          fillColor: Color.WHITE.withAlpha(0.9),
          outlineColor: Color.fromCssColorString("rgba(0,0,0,0.6)"),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian3(8, -8, 0) as any,
          scaleByDistance: new NearFarScalar(1e5, 1, 5e6, 0),
          translucencyByDistance: new NearFarScalar(1e5, 1, 8e6, 0),
        },
        description: `
          <h3>${port.name}</h3>
          <p>Country: ${port.country_iso}</p>
          <p>Type: ${port.port_type || "N/A"}</p>
          ${port.throughput_teu ? `<p>Throughput: ${(port.throughput_teu / 1e6).toFixed(1)}M TEU</p>` : ""}
          ${port.throughput_tons ? `<p>Throughput: ${(port.throughput_tons / 1e6).toFixed(0)}M tons</p>` : ""}
        `,
      });

      // Outer glow ring
      viewer.entities.add({
        name: `port_glow_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat),
        ellipse: {
          semiMajorAxis: glowRadius,
          semiMinorAxis: glowRadius,
          height: 0,
          material: cesiumColor.withAlpha(0.12),
          outline: false,
        },
      });
    });

    viewer.entities.resumeEvents();
  }, [ports, layers.ports, findOverlayLayer]);

  // ─── Render Shipping Density — Real Corridor Polygons ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("density_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.shippingDensity) { viewer.entities.resumeEvents(); return; }

    const maxDensity = Math.max(...SHIPPING_CORRIDORS.map((c) => c.density));

    SHIPPING_CORRIDORS.forEach((corridor, index) => {
      const normalized = corridor.density / maxDensity;
      const alpha = 0.10 + normalized * 0.30;

      // Heat color: blue → cyan → yellow → orange → red
      let r: number, g: number, b: number;
      if (normalized < 0.33) {
        const t = normalized / 0.33;
        r = Math.round(30 * t);
        g = Math.round(100 + 155 * t);
        b = Math.round(255 - 100 * t);
      } else if (normalized < 0.66) {
        const t = (normalized - 0.33) / 0.33;
        r = Math.round(30 + 225 * t);
        g = Math.round(255 - 55 * t);
        b = Math.round(155 - 155 * t);
      } else {
        const t = (normalized - 0.66) / 0.34;
        r = 255;
        g = Math.round(200 - 200 * t);
        b = 0;
      }

      // Flatten [lon, lat][] to [lon, lat, lon, lat, ...]
      const degreesFlat: number[] = [];
      for (const [lon, lat] of corridor.coords) {
        degreesFlat.push(lon, lat);
      }

      viewer.entities.add({
        name: `density_${index}`,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(degreesFlat),
          height: 0,
          material: Color.fromBytes(r, g, b, Math.round(alpha * 255)),
          outline: false,
        },
        description: `
          <h3>${corridor.name}</h3>
          <p>Relative Traffic Density: ${corridor.density}%</p>
        `,
      });
    });

    viewer.entities.resumeEvents();
  }, [layers.shippingDensity]);

  // ─── Render Conflict Zone Overlays ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove existing conflict zone entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("conflict_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!conflictZones || conflictZones.length === 0) { viewer.entities.resumeEvents(); return; }

    conflictZones.forEach((zone) => {
      // Color by severity
      let fillColor: Color;
      let borderColor: Color;
      switch (zone.severity) {
        case "critical":
          fillColor = Color.RED.withAlpha(0.12);
          borderColor = Color.RED.withAlpha(0.7);
          break;
        case "high":
          fillColor = Color.ORANGE.withAlpha(0.10);
          borderColor = Color.ORANGE.withAlpha(0.6);
          break;
        case "moderate":
          fillColor = Color.YELLOW.withAlpha(0.08);
          borderColor = Color.YELLOW.withAlpha(0.5);
          break;
        default:
          fillColor = Color.GRAY.withAlpha(0.06);
          borderColor = Color.GRAY.withAlpha(0.4);
      }

      // Zone type icon for label
      const icon = zone.zone_type === "armed_conflict" ? "⚔️" :
                   zone.zone_type === "piracy" ? "🏴‍☠️" :
                   zone.zone_type === "territorial_dispute" ? "🗺️" : "🔥";

      viewer.entities.add({
        name: `conflict_${zone.id}`,
        position: Cartesian3.fromDegrees(zone.lon, zone.lat),
        ellipse: {
          semiMajorAxis: zone.radius_km * 1000,
          semiMinorAxis: zone.radius_km * 1000,
          height: 0,
          extrudedHeight: zone.severity === "critical" ? 120000 : zone.severity === "high" ? 80000 : 40000,
          material: fillColor,
          outline: true,
          outlineColor: borderColor,
          outlineWidth: 2,
        },
        label: {
          text: `${icon} ${zone.name}`,
          font: "11px sans-serif",
          fillColor: borderColor.withAlpha(1.0),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e6, 1, 8e6, 0.3),
          translucencyByDistance: new NearFarScalar(1e6, 1, 1.5e7, 0),
        },
        description: `
          <h3>${zone.name}</h3>
          <p>Type: ${zone.zone_type.replace("_", " ")}</p>
          <p>Severity: <strong>${zone.severity.toUpperCase()}</strong></p>
          <p>Radius: ${zone.radius_km} km</p>
          ${zone.affected_countries.length > 0 ? `<p>Affected: ${zone.affected_countries.join(", ")}</p>` : ""}
          ${zone.affected_chokepoints.length > 0 ? `<p>Chokepoints: ${zone.affected_chokepoints.join(", ")}</p>` : ""}
          ${zone.start_date ? `<p>Since: ${new Date(zone.start_date).toLocaleDateString()}</p>` : ""}
        `,
      });
    });

    viewer.entities.resumeEvents();
  }, [conflictZones]);

  // ─── Render Vessel Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove existing vessel entities
    const toRemove2 = viewer.entities.values.filter(
      (e) => e.name?.startsWith("vessel_")
    );
    toRemove2.forEach((e) => viewer.entities.remove(e));

    if (!layers.vessels || vessels.length === 0) { viewer.entities.resumeEvents(); return; }

    // Vessel type → color mapping
    const typeColors: Record<string, string> = {
      cargo:     "#22d3ee",
      tanker:    "#f97316",
      container: "#10b981",
      bulk:      "#a78bfa",
      lng:       "#38bdf8",
      passenger: "#f472b6",
      fishing:   "#84cc16",
      military:  "#ef4444",
      other:     "#94a3b8",
    };

    const typeIcons: Record<string, string> = {
      cargo: "🚢", tanker: "🛢", container: "📦", bulk: "⛴",
      lng: "❄", passenger: "🚤", fishing: "🎣", military: "⚓", other: "🔹",
    };

    vessels.forEach((v, i) => {
      if (!v.lat || !v.lon) return;

      const color = typeColors[v.vessel_type] || typeColors.other;
      const cesiumColor = Color.fromCssColorString(color);
      const icon = typeIcons[v.vessel_type] || "🚢";

      // Vessel point marker
      viewer.entities.add({
        name: `vessel_${i}`,
        position: Cartesian3.fromDegrees(v.lon, v.lat, 50),
        point: {
          pixelSize: 6,
          color: cesiumColor,
          outlineColor: Color.fromCssColorString(color).withAlpha(0.4),
          outlineWidth: 3,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1.2e7, 0.4),
        },
        label: {
          text: v.name,
          font: "11px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian2(8, -4),
          scaleByDistance: new NearFarScalar(5e4, 1.0, 5e6, 0.0),
          translucencyByDistance: new NearFarScalar(5e4, 1.0, 8e6, 0.0),
        },
        description: `
          <h3>${icon} ${v.name}</h3>
          <table style="width:100%">
            <tr><td>MMSI</td><td>${v.mmsi}</td></tr>
            <tr><td>Type</td><td>${v.vessel_type.charAt(0).toUpperCase() + v.vessel_type.slice(1)}</td></tr>
            <tr><td>Flag</td><td>${v.flag_iso || "—"}</td></tr>
            <tr><td>Speed</td><td>${v.speed_knots.toFixed(1)} kn</td></tr>
            <tr><td>Heading</td><td>${v.heading.toFixed(0)}°</td></tr>
            <tr><td>Destination</td><td>${v.destination || "—"}</td></tr>
            ${v.length_m ? `<tr><td>Length</td><td>${v.length_m}m</td></tr>` : ""}
            ${v.draught_m ? `<tr><td>Draught</td><td>${v.draught_m}m</td></tr>` : ""}
          </table>
        `,
      });

      // Heading indicator — short line showing vessel direction
      if (v.speed_knots > 0.5) {
        const headingRad = (v.heading * Math.PI) / 180;
        const offsetDeg = 0.15; // length of heading line in degrees
        const endLat = v.lat + Math.cos(headingRad) * offsetDeg;
        const endLon = v.lon + Math.sin(headingRad) * offsetDeg / Math.cos(v.lat * Math.PI / 180);

        viewer.entities.add({
          name: `vessel_hdg_${i}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights([
              v.lon, v.lat, 50,
              endLon, endLat, 50,
            ]),
            width: 2,
            material: cesiumColor.withAlpha(0.7),
            arcType: ArcType.NONE,
          },
        });
      }
    });

    viewer.entities.resumeEvents();
  }, [vessels, layers.vessels]);

  // ─── Render Aircraft Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove existing aircraft entities
    const toRemoveAc = viewer.entities.values.filter(
      (e) => e.name?.startsWith("aircraft_")
    );
    toRemoveAc.forEach((e) => viewer.entities.remove(e));

    if (!layers.aircraft || aircraftList.length === 0) { viewer.entities.resumeEvents(); return; }

    const catColors: Record<string, string> = {
      heavy:      "#ef4444",
      large:      "#f97316",
      small:      "#22d3ee",
      light:      "#84cc16",
      rotorcraft: "#a78bfa",
      other:      "#94a3b8",
    };

    aircraftList.forEach((ac, i) => {
      if (!ac.lat || !ac.lon) return;

      const color = catColors[ac.category] || catColors.other;
      const cesiumColor = Color.fromCssColorString(color);
      // Scale altitude for visual — show aircraft higher
      const displayAlt = Math.max(ac.altitude_m || 0, 500);

      // Aircraft point marker
      viewer.entities.add({
        name: `aircraft_${i}`,
        position: Cartesian3.fromDegrees(ac.lon, ac.lat, displayAlt),
        point: {
          pixelSize: 4,
          color: cesiumColor,
          outlineColor: cesiumColor.withAlpha(0.3),
          outlineWidth: 2,
          scaleByDistance: new NearFarScalar(1e5, 1.8, 1.2e7, 0.3),
        },
        label: {
          text: ac.callsign || ac.icao24,
          font: "10px monospace",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian2(6, -4),
          scaleByDistance: new NearFarScalar(3e4, 1.0, 3e6, 0.0),
          translucencyByDistance: new NearFarScalar(3e4, 1.0, 5e6, 0.0),
        },
        description: `
          <h3>✈️ ${ac.callsign || ac.icao24}</h3>
          <table style="width:100%">
            <tr><td>ICAO24</td><td>${ac.icao24}</td></tr>
            <tr><td>Country</td><td>${ac.origin_country}</td></tr>
            <tr><td>Category</td><td>${ac.category.charAt(0).toUpperCase() + ac.category.slice(1)}</td></tr>
            <tr><td>Altitude</td><td>${ac.altitude_ft.toLocaleString()} ft (${ac.altitude_m.toLocaleString()} m)</td></tr>
            <tr><td>Speed</td><td>${ac.velocity_knots} kn (${ac.velocity_kmh} km/h)</td></tr>
            <tr><td>Heading</td><td>${ac.heading}°</td></tr>
            <tr><td>V/S</td><td>${ac.vertical_rate > 0 ? "↑" : ac.vertical_rate < 0 ? "↓" : "—"} ${Math.abs(ac.vertical_rate).toFixed(1)} m/s</td></tr>
          </table>
        `,
      });

      // Heading indicator line for moving aircraft
      if (ac.velocity_knots > 10) {
        const headingRad = (ac.heading * Math.PI) / 180;
        const offsetDeg = 0.12;
        const endLat = ac.lat + Math.cos(headingRad) * offsetDeg;
        const endLon = ac.lon + Math.sin(headingRad) * offsetDeg / Math.cos(ac.lat * Math.PI / 180);

        viewer.entities.add({
          name: `aircraft_hdg_${i}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights([
              ac.lon, ac.lat, displayAlt,
              endLon, endLat, displayAlt,
            ]),
            width: 1.5,
            material: cesiumColor.withAlpha(0.6),
            arcType: ArcType.NONE,
          },
        });
      }
    });

    viewer.entities.resumeEvents();
  }, [aircraftList, layers.aircraft]);

  // ─── Port-Vessel Proximity: highlight ships near ports ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    // Remove old proximity entities
    const toRemoveProx = viewer.entities.values.filter(
      (e) => e.name?.startsWith("prox_")
    );
    toRemoveProx.forEach((e) => viewer.entities.remove(e));

    // Only show when both layers are active and have data
    if (!layers.ports || !layers.vessels || ports.length === 0 || vessels.length === 0) {
      viewer.entities.resumeEvents();
      return;
    }

    const PROXIMITY_KM = 50; // radius to consider "near port"
    const DEG_APPROX = PROXIMITY_KM / 111; // rough km→degrees conversion

    // For each port, find vessels within proximity
    const portProximity: { port: typeof ports[0]; nearVessels: typeof vessels }[] = [];

    ports.forEach((port) => {
      const near = vessels.filter((v) => {
        const dlat = Math.abs(v.lat - port.lat);
        const dlon = Math.abs(v.lon - port.lon);
        if (dlat > DEG_APPROX * 1.5 || dlon > DEG_APPROX * 2) return false;
        // Haversine-lite
        const dx = dlon * Math.cos((port.lat * Math.PI) / 180) * 111;
        const dy = dlat * 111;
        return Math.sqrt(dx * dx + dy * dy) < PROXIMITY_KM;
      });
      if (near.length > 0) {
        portProximity.push({ port, nearVessels: near });
      }
    });

    portProximity.forEach(({ port, nearVessels }) => {
      // Proximity ring around port
      viewer.entities.add({
        name: `prox_ring_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat),
        ellipse: {
          semiMajorAxis: PROXIMITY_KM * 1000,
          semiMinorAxis: PROXIMITY_KM * 1000,
          height: 0,
          material: Color.fromCssColorString("rgba(0, 255, 180, 0.04)"),
          outline: true,
          outlineColor: Color.fromCssColorString("rgba(0, 255, 180, 0.25)"),
          outlineWidth: 1,
        },
      });

      // Count badge
      viewer.entities.add({
        name: `prox_count_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat, 60000),
        label: {
          text: `${nearVessels.length} 🚢`,
          font: "bold 12px 'Segoe UI', sans-serif",
          fillColor: Color.fromCssColorString("#00ffb4"),
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(2e5, 1, 8e6, 0.3),
          translucencyByDistance: new NearFarScalar(2e5, 1, 1e7, 0),
        },
      });

      // Thin connecting lines from port to each nearby vessel
      nearVessels.forEach((v, vi) => {
        viewer.entities.add({
          name: `prox_line_${port.id}_${vi}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights([
              port.lon, port.lat, 200,
              v.lon, v.lat, 200,
            ]),
            width: 1,
            material: Color.fromCssColorString("rgba(0, 255, 180, 0.18)"),
            arcType: ArcType.NONE,
          },
        });
      });
    });

    viewer.entities.resumeEvents();
  }, [vessels, ports, layers.vessels, layers.ports]);

  // ─── Render Commodity Flow Arcs (Gold) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("commodity_flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (commodityFlows.length === 0) { viewer.entities.resumeEvents(); return; }

    commodityFlows.forEach((edge, i) => {
      const width = Math.max(2, edge.weight * 8);

      // 3D elevated arc
      const arcPoints = computeArcPositions(
        edge.exporter_lon, edge.exporter_lat,
        edge.importer_lon, edge.importer_lat,
        40, 0.18
      );

      // Gold/amber arc
      viewer.entities.add({
        name: `commodity_flow_${i}`,
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
          width: width,
          material: new PolylineArrowMaterialProperty(
            Color.fromCssColorString("rgba(255, 180, 20, 0.9)")
          ),
          arcType: ArcType.NONE,
        },
      });

      // Gold glow underlay
      viewer.entities.add({
        name: `commodity_flow_glow_${i}`,
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
          width: width + 8,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: Color.fromCssColorString("rgba(255, 160, 10, 0.25)"),
          }),
          arcType: ArcType.NONE,
        },
      });
    });

    viewer.entities.resumeEvents();
  }, [commodityFlows]);

  // ── Zoom helpers ──
  const zoomIn = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const camera = viewer.camera;
    const height = camera.positionCartographic.height;
    camera.zoomIn(height * 0.4);                     // zoom 40% closer
  }, []);

  const zoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const camera = viewer.camera;
    const height = camera.positionCartographic.height;
    camera.zoomOut(height * 0.6);                     // zoom 60% further
  }, []);

  const resetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(15, 20, 22000000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
      duration: 1.2,
    });
  }, []);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Cesium canvas */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          touchAction: "none",   // prevent browser from stealing pinch/pan gestures
        }}
      />

      {/* Zoom controls — left side, vertically centered */}
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 100,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 40,
        }}
      >
        <button
          onClick={zoomIn}
          title="Zoom in"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(10,15,30,0.85)",
            color: "#fff",
            fontSize: 20,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            backdropFilter: "blur(6px)",
          }}
        >
          +
        </button>
        <button
          onClick={zoomOut}
          title="Zoom out"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(10,15,30,0.85)",
            color: "#fff",
            fontSize: 20,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            backdropFilter: "blur(6px)",
          }}
        >
          −
        </button>
        <button
          onClick={resetView}
          title="Reset view"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(10,15,30,0.85)",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            backdropFilter: "blur(6px)",
          }}
        >
          ⌂
        </button>
      </div>
    </div>
  );
});

export default GlobeViewer;
