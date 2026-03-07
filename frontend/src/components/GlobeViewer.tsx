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
  CallbackProperty,
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
  PolygonHierarchy,
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
  RailFreightFlow,
} from "@/lib/api";
import type { TradeMode } from "@/lib/trade-modes";
import { MAJOR_AIRPORTS } from "@/lib/airports";
import { SHIPPING_CORRIDORS } from "@/lib/shipping-corridors";
import { fetchCountriesGeoJSON } from "@/lib/api";

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
  railFreight?: RailFreightFlow[];
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
  year?: number | null;
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
  railFreight = [],
  layers,
  indicator,
  year = null,
  onCountryClick,
  flyToCountry,
  flyToPosition,
  highlightCountryIso,
  tradeMode = "balance",
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoJsonRef = useRef<any>(null);
  const vesselsRef = useRef<VesselPosition[]>(vessels);
  vesselsRef.current = vessels;
  const countriesRef = useRef<CountryMacro[]>(countries);
  countriesRef.current = countries;
  const indicatorRef = useRef(indicator);
  indicatorRef.current = indicator;
  const yearRef = useRef(year);
  yearRef.current = year;
  const [vesselTooltip, setVesselTooltip] = useState<{
    x: number; y: number; vessel: VesselPosition;
  } | null>(null);
  const [countryTooltip, setCountryTooltip] = useState<{
    x: number; y: number; iso: string;
  } | null>(null);

  // Fetch GeoJSON (with year-aware indicator values) on mount and when year changes
  const geoJsonYearRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (geoJsonYearRef.current !== year || !geoJsonRef.current) {
      geoJsonYearRef.current = year;
      fetchCountriesGeoJSON("gdp", year).then((data) => { geoJsonRef.current = data; }).catch(() => {});
    }
  }, [year]);

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
          const iso = entityName.replace(/^country_/, "").replace(/_\d+$/, "");
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

  // ─── Vessel hover tooltip ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.endPosition);
      if (defined(picked) && picked.id && typeof picked.id.name === "string") {
        const eName = picked.id.name as string;
        // Vessel hover
        if (eName.startsWith("vessel_") && !eName.startsWith("vessel_hdg_")) {
          const idx = parseInt(eName.replace("vessel_", ""), 10);
          const v = vesselsRef.current[idx];
          if (v) {
            setVesselTooltip({ x: movement.endPosition.x, y: movement.endPosition.y, vessel: v });
            setCountryTooltip(null);
            return;
          }
        }
        // Country hover (polygon or label)
        if (eName.startsWith("country_")) {
          const iso = eName.replace(/^country_/, "").replace(/_\d+$/, "");
          setCountryTooltip({ x: movement.endPosition.x, y: movement.endPosition.y, iso });
          setVesselTooltip(null);
          return;
        }
      }
      setVesselTooltip(null);
      setCountryTooltip(null);
    }, ScreenSpaceEventType.MOUSE_MOVE);

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

  // ─── Render Country Polygons (transparent fill by macro indicator) ───
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

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
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

    const computeColor = (rawValue: number): Color => {
      let normalized: number;
      if (isDiverging) {
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        normalized = absMax > 0 ? Math.abs(rawValue) / absMax : 0;
      } else {
        normalized = maxVal > minVal ? (rawValue - minVal) / (maxVal - minVal) : 0.5;
      }
      const alpha = 0.12 + normalized * 0.55;
      // Single cyan color — only transparency changes with value
      return new Color(34 / 255, 211 / 255, 238 / 255, alpha);
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [countries, layers.countries, indicator, year]);

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
      const glowScratch = new Color();
      const coreScratch = new Color();

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
            ${v.imo ? `<tr><td>IMO</td><td>${v.imo}</td></tr>` : ""}
            ${v.callsign ? `<tr><td>Callsign</td><td>${v.callsign}</td></tr>` : ""}
            <tr><td>Speed</td><td>${v.speed_knots.toFixed(1)} kn</td></tr>
            <tr><td>Heading</td><td>${v.heading.toFixed(0)}°</td></tr>
            <tr><td>Destination</td><td>${v.destination || "—"}</td></tr>
            ${v.eta ? `<tr><td>ETA</td><td>${v.eta}</td></tr>` : ""}
            ${v.length_m ? `<tr><td>Length</td><td>${v.length_m} m</td></tr>` : ""}
            ${v.draught_m ? `<tr><td>Draught</td><td>${v.draught_m} m</td></tr>` : ""}
            <tr><td>Position</td><td>${v.lat.toFixed(4)}°, ${v.lon.toFixed(4)}°</td></tr>
            <tr><td>Last update</td><td>${new Date(v.last_update * 1000).toLocaleTimeString()}</td></tr>
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

  // ─── Render Rail Freight Arcs (Orange/Amber) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("rail_freight_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.railroadFreight || railFreight.length === 0) {
      viewer.entities.resumeEvents();
      return;
    }

    const maxTonnes = Math.max(...railFreight.map((f) => f.tonnes), 1);

    railFreight.forEach((rf, i) => {
      if (!rf.origin_lat || !rf.origin_lon || !rf.dest_lat || !rf.dest_lon) return;

      const logNorm = Math.log10(1 + rf.tonnes) / Math.log10(1 + maxTonnes);
      const width = 1.5 + logNorm * 5;
      const alpha = 0.4 + logNorm * 0.5;

      const arcPoints = computeArcPositions(
        rf.origin_lon, rf.origin_lat,
        rf.dest_lon, rf.dest_lat,
        40, 0.06 + logNorm * 0.12
      );
      const arcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);

      // Core line
      viewer.entities.add({
        name: `rail_freight_${i}`,
        polyline: {
          positions: arcCartesian,
          width: width,
          material: new PolylineArrowMaterialProperty(
            new Color(255 / 255, 160 / 255, 40 / 255, alpha)
          ),
          arcType: ArcType.NONE,
        },
        description: `
          <h3>Rail Freight: ${rf.origin_name} → ${rf.destination_name}</h3>
          <p>Volume: ${(rf.tonnes / 1000).toFixed(0)} thousand tonnes</p>
          <p>Year: ${rf.year}</p>
        `,
      });

      // Glow underlay
      viewer.entities.add({
        name: `rail_freight_glow_${i}`,
        polyline: {
          positions: arcCartesian,
          width: width + 6,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: new Color(255 / 255, 140 / 255, 20 / 255, alpha * 0.3),
          }),
          arcType: ArcType.NONE,
        },
      });
    });

    viewer.entities.resumeEvents();
  }, [railFreight, layers.railroadFreight]);

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

      {/* Vessel hover tooltip */}
      {vesselTooltip && (
        <div
          style={{
            position: "absolute",
            left: vesselTooltip.x + 16,
            top: vesselTooltip.y - 10,
            zIndex: 60,
            background: "rgba(8,12,28,0.94)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e2e8f0",
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace, sans-serif",
            pointerEvents: "none",
            backdropFilter: "blur(10px)",
            maxWidth: 320,
            lineHeight: 1.5,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          {(() => {
            const v = vesselTooltip.vessel;
            const typeLabel = v.vessel_type.charAt(0).toUpperCase() + v.vessel_type.slice(1);
            const typeColorMap: Record<string, string> = {
              cargo: "#22d3ee", tanker: "#f97316", container: "#10b981", bulk: "#a78bfa",
              lng: "#38bdf8", passenger: "#f472b6", fishing: "#84cc16", military: "#ef4444", other: "#94a3b8",
            };
            const tColor = typeColorMap[v.vessel_type] || "#94a3b8";
            const iconMap: Record<string, string> = {
              cargo: "\u{1F6A2}", tanker: "\u{1F6E2}\uFE0F", container: "\u{1F4E6}", bulk: "\u26F4\uFE0F",
              lng: "\u2744\uFE0F", passenger: "\u{1F6A4}", fishing: "\u{1F3A3}", military: "\u2693", other: "\u{1F539}",
            };
            const icon = iconMap[v.vessel_type] || "\u{1F6A2}";
            return (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: tColor }}>
                  {icon} {v.name}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>MMSI</td><td>{v.mmsi}</td></tr>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Type</td><td style={{ color: tColor }}>{typeLabel}</td></tr>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Flag</td><td>{v.flag_iso || "\u2014"}</td></tr>
                    {v.imo ? <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>IMO</td><td>{v.imo}</td></tr> : null}
                    {v.callsign ? <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Callsign</td><td>{v.callsign}</td></tr> : null}
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Speed</td><td>{v.speed_knots.toFixed(1)} kn</td></tr>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Heading</td><td>{v.heading.toFixed(0)}\u00B0</td></tr>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Destination</td><td>{v.destination || "\u2014"}</td></tr>
                    {v.eta ? <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>ETA</td><td>{v.eta}</td></tr> : null}
                    {v.length_m ? <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Length</td><td>{v.length_m} m</td></tr> : null}
                    {v.draught_m ? <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Draught</td><td>{v.draught_m} m</td></tr> : null}
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Position</td><td>{v.lat.toFixed(4)}\u00B0, {v.lon.toFixed(4)}\u00B0</td></tr>
                    <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Updated</td><td>{new Date(v.last_update * 1000).toLocaleTimeString()}</td></tr>
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      )}

      {/* Country hover tooltip */}
      {countryTooltip && (() => {
        const iso = countryTooltip.iso;
        const c = countries.find((cc) => cc.iso_code === iso);
        if (!c) return null;

        // Indicator metadata lookup
        const INDICATOR_META: Record<string, { label: string; group: string; source: string; unit: string }> = {
          gdp: { label: "GDP (US$)", group: "Macro", source: "World Bank (NY.GDP.MKTP.CD)", unit: "$" },
          gdp_per_capita: { label: "GDP per Capita", group: "Macro", source: "World Bank (NY.GDP.PCAP.CD)", unit: "$" },
          gdp_growth: { label: "GDP Growth", group: "Macro", source: "World Bank (NY.GDP.MKTP.KD.ZG)", unit: "%" },
          gdp_per_capita_ppp: { label: "GDP/Capita PPP", group: "Macro", source: "World Bank (NY.GDP.PCAP.PP.CD)", unit: "$" },
          gni: { label: "GNI (US$)", group: "Macro", source: "World Bank (NY.GNP.MKTP.CD)", unit: "$" },
          inflation_cpi: { label: "Inflation (CPI)", group: "Macro", source: "World Bank (FP.CPI.TOTL.ZG)", unit: "%" },
          export_value: { label: "Exports", group: "Trade", source: "World Bank (NE.EXP.GNFS.CD)", unit: "$" },
          import_value: { label: "Imports", group: "Trade", source: "World Bank (NE.IMP.GNFS.CD)", unit: "$" },
          trade_balance: { label: "Trade Balance", group: "Trade", source: "World Bank (computed)", unit: "$" },
          current_account: { label: "Current Account", group: "Trade", source: "World Bank (BN.CAB.XOKA.CD)", unit: "$" },
          trade_pct_gdp: { label: "Trade % of GDP", group: "Trade", source: "World Bank (NE.TRD.GNFS.ZS)", unit: "%" },
          trade_openness: { label: "Trade Openness", group: "Trade", source: "Computed (Exp+Imp)/GDP", unit: "%" },
          import_dependency: { label: "Import Dependency", group: "Trade", source: "Computed Imp/GDP", unit: "%" },
          external_balance_pct_gdp: { label: "Ext. Balance % GDP", group: "Trade", source: "World Bank (NE.RSB.GNFS.ZS)", unit: "%" },
          high_tech_exports_pct: { label: "High-Tech Exports", group: "Trade", source: "World Bank (TX.VAL.TECH.MF.ZS)", unit: "%" },
          population: { label: "Population", group: "Demographics", source: "World Bank (SP.POP.TOTL)", unit: "" },
          life_expectancy: { label: "Life Expectancy", group: "Demographics", source: "World Bank (SP.DYN.LE00.IN)", unit: "years" },
          unemployment_pct: { label: "Unemployment", group: "Demographics", source: "World Bank (SL.UEM.TOTL.ZS)", unit: "%" },
          gini_index: { label: "GINI Index", group: "Demographics", source: "World Bank (SI.POV.GINI)", unit: "" },
          fdi_inflows_pct_gdp: { label: "FDI Inflows % GDP", group: "Investment", source: "World Bank (BX.KLT.DINV.WD.GD.ZS)", unit: "%" },
          military_expenditure_pct_gdp: { label: "Military % GDP", group: "Military", source: "World Bank (MS.MIL.XPND.GD.ZS)", unit: "%" },
          co2_per_capita: { label: "CO\u2082/Capita", group: "Environment", source: "World Bank (EN.ATM.CO2E.PC)", unit: "tons" },
          renewable_energy_pct: { label: "Renewable Energy", group: "Energy", source: "World Bank (EG.FEC.RNEW.ZS)", unit: "%" },
          internet_users_pct: { label: "Internet Users", group: "Technology", source: "World Bank (IT.NET.USER.ZS)", unit: "%" },
          control_corruption: { label: "Control of Corruption", group: "Governance", source: "World Bank (CC.EST)", unit: "index" },
          political_stability: { label: "Political Stability", group: "Governance", source: "World Bank (PV.EST)", unit: "index" },
          rule_of_law: { label: "Rule of Law", group: "Governance", source: "World Bank (RL.EST)", unit: "index" },
        };

        const meta = INDICATOR_META[indicator] || {
          label: indicator.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          group: "Indicator",
          source: "World Bank",
          unit: "",
        };

        // Compute value
        const computeVal = (): number | null => {
          if (indicator === "trade_openness") {
            if (c.gdp && c.export_value != null && c.import_value != null && c.gdp > 0)
              return ((c.export_value + c.import_value) / c.gdp) * 100;
            return null;
          }
          if (indicator === "import_dependency") {
            if (c.gdp && c.import_value != null && c.gdp > 0) return (c.import_value / c.gdp) * 100;
            return null;
          }
          const val = (c as unknown as Record<string, unknown>)[indicator];
          return typeof val === "number" ? val : null;
        };
        const rawValue = computeVal();

        const formatVal = (v: number): string => {
          if (meta.unit === "%") return `${v.toFixed(1)}%`;
          if (meta.unit === "$") {
            if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
            if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
            if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
            return `$${v.toFixed(0)}`;
          }
          if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
          if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
          return v.toFixed(1);
        };

        return (
          <div
            style={{
              position: "absolute",
              left: countryTooltip.x + 16,
              top: countryTooltip.y - 10,
              zIndex: 60,
              background: "rgba(8,12,28,0.94)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#e2e8f0",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace, sans-serif",
              pointerEvents: "none",
              backdropFilter: "blur(10px)",
              maxWidth: 330,
              lineHeight: 1.6,
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#67e8f9" }}>
              {c.name} ({c.iso_code})
            </div>
            {c.region && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                {c.region}{c.sub_region ? ` \u203A ${c.sub_region}` : ""}
              </div>
            )}
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "6px 10px", marginBottom: 6,
            }}>
              <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {meta.group} \u2014 {meta.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0fdf4" }}>
                {rawValue != null ? formatVal(rawValue) : "N/A"}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                Source: {meta.source}
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                {c.gdp != null && indicator !== "gdp" && (
                  <tr><td style={{ color: "#94a3b8", paddingRight: 8 }}>GDP</td><td>${(c.gdp / 1e9).toFixed(1)}B</td></tr>
                )}
                {c.population != null && indicator !== "population" && (
                  <tr><td style={{ color: "#94a3b8", paddingRight: 8 }}>Population</td><td>{(c.population / 1e6).toFixed(1)}M</td></tr>
                )}
                {c.gdp_growth != null && indicator !== "gdp_growth" && (
                  <tr><td style={{ color: "#94a3b8", paddingRight: 8 }}>GDP Growth</td><td>{c.gdp_growth.toFixed(1)}%</td></tr>
                )}
                {c.export_value != null && indicator !== "export_value" && (
                  <tr><td style={{ color: "#94a3b8", paddingRight: 8 }}>Exports</td><td>${(c.export_value / 1e9).toFixed(1)}B</td></tr>
                )}
                {c.import_value != null && indicator !== "import_value" && (
                  <tr><td style={{ color: "#94a3b8", paddingRight: 8 }}>Imports</td><td>${(c.import_value / 1e9).toFixed(1)}B</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Vessel type color legend */}
      {layers.vessels && vessels.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 36,
            zIndex: 40,
            background: "rgba(8,12,28,0.88)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "8px 12px",
            backdropFilter: "blur(8px)",
            fontSize: 11,
            color: "#cbd5e1",
            lineHeight: 1.8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "#e2e8f0", letterSpacing: 0.5 }}>
            VESSEL TYPES
          </div>
          {([
            ["cargo",     "#22d3ee", "\u{1F6A2} Cargo"],
            ["tanker",    "#f97316", "\u{1F6E2}\uFE0F Tanker"],
            ["container", "#10b981", "\u{1F4E6} Container"],
            ["bulk",      "#a78bfa", "\u26F4\uFE0F Bulk Carrier"],
            ["lng",       "#38bdf8", "\u2744\uFE0F LNG"],
            ["passenger", "#f472b6", "\u{1F6A4} Passenger"],
            ["fishing",   "#84cc16", "\u{1F3A3} Fishing"],
            ["military",  "#ef4444", "\u2693 Military"],
            ["other",     "#94a3b8", "\u{1F539} Other"],
          ] as [string, string, string][]).map(([key, color, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                background: color, boxShadow: `0 0 4px ${color}`,
              }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default GlobeViewer;
