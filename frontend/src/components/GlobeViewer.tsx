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
  PolylineDashMaterialProperty,
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
  portCategory?: string;
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
  portCategory = "all",
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
  const [railFreightTooltip, setRailFreightTooltip] = useState<{
    x: number; y: number; origin: string; destination: string; tonnes: number; year: number; color: string;
  } | null>(null);
  const railFreightFlowsRef = useRef<typeof railFreight>([]);
  const railFreightColorsRef = useRef<string[]>([]);
  const [selectedRailFlow, setSelectedRailFlow] = useState<number | null>(null);
  const railFlowOriginalColors = useRef<Map<string, Color>>(new Map());
  const railFlowOriginalWidths = useRef<Map<string, number>>(new Map());

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
          setSelectedRailFlow(null);
          return;
        }
        // Rail freight flow click — toggle selection
        if (entityName.startsWith("rail_freight_") && !entityName.startsWith("rail_freight_flash_")) {
          const idx = parseInt(entityName.replace("rail_freight_", ""), 10);
          setSelectedRailFlow((prev) => (prev === idx ? null : idx));
          return;
        }
      }
      // Clicked on empty space — deselect
      setSelectedRailFlow(null);
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
          setRailFreightTooltip(null);
          return;
        }
        // Rail freight hover
        if (eName.startsWith("rail_freight_") && !eName.startsWith("rail_freight_flash_")) {
          const idx = parseInt(eName.replace("rail_freight_", ""), 10);
          const rf = railFreightFlowsRef.current[idx];
          if (rf) {
            setRailFreightTooltip({
              x: movement.endPosition.x, y: movement.endPosition.y,
              origin: rf.origin_name, destination: rf.destination_name,
              tonnes: rf.tonnes, year: rf.year,
              color: railFreightColorsRef.current[idx] || '#f59e0b',
            });
            setVesselTooltip(null);
            setCountryTooltip(null);
            return;
          }
        }
      }
      setVesselTooltip(null);
      setCountryTooltip(null);
      setRailFreightTooltip(null);
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
    const filteredPorts = portCategory === "all" ? ports : ports.filter(p => p.port_type === portCategory);
    filteredPorts.forEach((port) => {
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
  }, [ports, layers.ports, portCategory, findOverlayLayer]);

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

  // ─── Render Rail Freight — Real Rail Corridor Routing ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("rail_freight_") || e.name?.startsWith("rail_freight_flash_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));
    railFlowOriginalColors.current.clear();
    railFlowOriginalWidths.current.clear();
    setSelectedRailFlow(null);

    if (!layers.railroadFreight || railFreight.length === 0) {
      viewer.entities.resumeEvents();
      return;
    }

    // ── European rail junction graph (real cities) ──
    const J: Record<string, [number, number]> = {
      // Iberian Peninsula
      lisbon:[-9.14,38.74], badajoz:[-6.97,38.88], madrid:[-3.70,40.42],
      valladolid:[-4.72,41.65], burgos:[-3.70,42.34], vitoria:[-2.67,42.85],
      bilbao:[-2.93,43.26], san_sebastian:[-1.98,43.32],
      zaragoza:[-0.88,41.65], barcelona:[2.17,41.39],
      porto:[-8.61,41.15], salamanca:[-5.66,40.97],
      // France
      hendaye:[-1.77,43.35], toulouse:[1.44,43.60], perpignan:[2.89,42.70],
      montpellier:[3.88,43.61], marseille:[5.37,43.30], nice:[7.26,43.71],
      lyon:[4.83,45.76], grenoble:[5.72,45.19],
      bordeaux:[0.00,44.84], poitiers:[0.34,46.58], tours:[0.68,47.39],
      paris:[2.35,48.86], lille:[3.07,50.63], strasbourg:[7.75,48.58],
      dijon:[5.04,47.32], metz:[6.18,49.12],
      // Benelux
      calais:[1.86,50.95], brussels:[4.35,50.85],
      amsterdam:[4.90,52.37], rotterdam:[4.47,51.92],
      luxembourg:[6.13,49.61], liege:[5.57,50.63],
      // Germany
      cologne:[6.96,50.94], dusseldorf:[6.77,51.23],
      frankfurt:[8.68,50.11], stuttgart:[9.18,48.78],
      munich:[11.58,48.14], nuremberg:[11.08,49.45],
      hamburg:[10.00,53.55], hannover:[9.74,52.37],
      berlin:[13.40,52.52], leipzig:[12.37,51.34],
      dresden:[13.74,51.05], dortmund:[7.47,51.51],
      // Switzerland & Austria
      zurich:[8.54,47.38], bern:[7.45,46.95], basel:[7.59,47.56],
      innsbruck:[11.39,47.26], salzburg:[13.05,47.80],
      vienna:[16.37,48.21], graz:[15.44,47.07], linz:[14.29,48.31],
      // Italy
      milan:[9.19,45.46], turin:[7.69,45.07], genoa:[8.93,44.41],
      bologna:[11.34,44.49], florence:[11.25,43.77],
      rome:[12.50,41.89], naples:[14.27,40.85],
      venice:[12.34,45.44], verona:[10.99,45.44],
      // Central Europe
      prague:[14.42,50.08], brno:[16.61,49.20],
      bratislava:[17.11,48.15], budapest:[19.04,47.50],
      // Poland
      warsaw:[21.01,52.23], poznan:[16.93,52.41],
      wroclaw:[17.04,51.10], krakow:[19.94,50.06],
      katowice:[19.02,50.26], gdansk:[18.65,54.35],
      // Balkans
      zagreb:[15.97,45.81], ljubljana:[14.51,46.05],
      belgrade:[20.46,44.79], sarajevo:[18.41,43.86],
      sofia:[23.32,42.70], skopje:[21.43,41.99],
      thessaloniki:[22.94,40.64], bucharest:[26.10,44.43],
      nis:[21.90,43.32], craiova:[23.80,44.32],
      // Nordics
      copenhagen:[12.57,55.68], malmo:[13.00,55.60],
      stockholm:[18.07,59.33], gothenburg:[11.97,57.71],
      oslo:[10.75,59.91],
      gavle:[17.14,60.67], sundsvall:[17.31,62.39], umea:[20.26,63.83], boden:[21.69,65.82],
      // Finland
      helsinki:[24.94,60.17], tampere:[23.79,61.50],
      oulu:[25.47,65.01], tornio:[24.14,65.85],
      // Baltics
      tallinn:[24.75,59.44], riga:[24.11,56.95],
      vilnius:[25.28,54.69], kaunas:[23.90,54.90],
      // East
      minsk:[27.57,53.90],
      // UK
      london:[-0.12,51.51],

      // ── US rail junction graph (major rail hubs) ──
      seattle:[-122.33,47.61], portland_or:[-122.68,45.52],
      sacramento:[-121.49,38.58], san_francisco:[-122.42,37.77],
      los_angeles:[-118.24,34.05], san_diego:[-117.16,32.72],
      reno:[-119.81,39.53], salt_lake:[-111.89,40.76],
      boise:[-116.20,43.62], spokane:[-117.43,47.66],
      billings:[-108.50,45.78], cheyenne:[-104.82,41.14],
      denver:[-104.99,39.74], albuquerque:[-106.65,35.08],
      el_paso:[-106.44,31.76], tucson:[-110.97,32.22],
      phoenix:[-112.07,33.45],
      fargo:[-96.79,46.88], minneapolis:[-93.27,44.98],
      duluth:[-92.10,46.79], sioux_falls:[-96.73,43.55],
      omaha:[-95.93,41.26], kansas_city:[-94.58,39.10],
      des_moines:[-93.61,41.59], lincoln:[-96.70,40.81],
      chicago:[-87.63,41.88], milwaukee:[-87.91,43.04],
      st_louis:[-90.20,38.63], springfield_il:[-89.64,39.78],
      indianapolis:[-86.16,39.77], cincinnati:[-84.51,39.10],
      columbus:[-82.99,39.96], cleveland:[-81.69,41.50],
      detroit:[-83.05,42.33], toledo:[-83.54,41.65],
      buffalo:[-78.88,42.89], albany:[-73.76,42.65],
      new_york:[-74.01,40.71], philadelphia:[-75.17,39.95],
      pittsburgh:[-80.00,40.44], baltimore:[-76.61,39.29],
      washington_dc:[-77.04,38.91], richmond:[-77.44,37.54],
      raleigh:[-78.64,35.78], charlotte:[-80.84,35.23],
      columbia_sc:[-81.03,34.00], charleston_sc:[-79.93,32.78],
      atlanta:[-84.39,33.75], savannah:[-81.10,32.08],
      jacksonville:[-81.66,30.33], orlando:[-81.38,28.54],
      tampa:[-82.46,27.95], miami:[-80.19,25.76],
      birmingham:[-86.80,33.52], mobile:[-88.04,30.69],
      nashville:[-86.78,36.16], memphis:[-90.05,35.15],
      chattanooga:[-85.31,35.05], knoxville:[-83.92,35.96],
      little_rock:[-92.29,34.75], shreveport:[-93.75,32.52],
      dallas:[-96.80,32.78], houston:[-95.36,29.76],
      san_antonio:[-98.49,29.42], laredo:[-99.51,27.51],
      oklahoma_city:[-97.52,35.47], tulsa:[-95.99,36.15],
      wichita:[-97.34,37.69],
      new_orleans:[-90.07,29.95], baton_rouge:[-91.15,30.45],
      jackson_ms:[-90.18,32.30],
      boston:[-71.06,42.36], providence:[-71.41,41.82],
      hartford:[-72.68,41.76], new_haven:[-72.93,41.31],
      portland_me:[-70.25,43.66],
      charleston_wv:[-81.63,38.35],
      louisville:[-85.76,38.25],
      green_bay:[-88.01,44.51],
    };

    // Adjacency — tracing real major rail corridors
    const EDGES: [string, string][] = [
      // UK-Continent (Channel Tunnel)
      ["london","calais"],
      // Belgium-France-Netherlands
      ["calais","lille"],["lille","paris"],["lille","brussels"],
      ["paris","brussels"],["brussels","liege"],["liege","luxembourg"],
      ["brussels","amsterdam"],["amsterdam","rotterdam"],["rotterdam","brussels"],
      ["liege","cologne"],
      // France inland
      ["paris","metz"],["metz","strasbourg"],["paris","dijon"],
      ["dijon","lyon"],["paris","tours"],["tours","poitiers"],
      ["poitiers","bordeaux"],["paris","strasbourg"],
      ["metz","luxembourg"],
      // France south-west → Spain
      ["bordeaux","toulouse"],["bordeaux","hendaye"],
      ["hendaye","san_sebastian"],["san_sebastian","bilbao"],
      ["bilbao","vitoria"],["vitoria","burgos"],["burgos","madrid"],
      ["toulouse","montpellier"],["montpellier","perpignan"],
      ["perpignan","barcelona"],["barcelona","zaragoza"],["zaragoza","madrid"],
      // Iberian internal
      ["madrid","valladolid"],["valladolid","burgos"],
      ["madrid","badajoz"],["badajoz","lisbon"],
      ["valladolid","salamanca"],["salamanca","porto"],["porto","lisbon"],
      // France south-east
      ["lyon","marseille"],["marseille","montpellier"],
      ["lyon","grenoble"],["grenoble","marseille"],
      ["marseille","nice"],["nice","genoa"],
      // France-Switzerland-Germany
      ["lyon","zurich"],
      ["strasbourg","basel"],["basel","zurich"],["basel","bern"],
      ["zurich","bern"],["strasbourg","frankfurt"],
      // Germany Rhine corridor
      ["cologne","frankfurt"],["cologne","dusseldorf"],
      ["dusseldorf","dortmund"],["dortmund","hannover"],
      ["hannover","hamburg"],["hamburg","berlin"],
      ["hannover","berlin"],["frankfurt","nuremberg"],
      ["nuremberg","munich"],["frankfurt","stuttgart"],
      ["stuttgart","munich"],["stuttgart","zurich"],
      // Germany east
      ["berlin","leipzig"],["leipzig","dresden"],["leipzig","nuremberg"],
      ["berlin","gdansk"],["berlin","poznan"],["poznan","warsaw"],
      // Switzerland-Italy
      ["zurich","milan"],["bern","milan"],
      ["milan","turin"],["turin","lyon"],["turin","genoa"],
      ["milan","genoa"],["milan","verona"],["verona","venice"],
      ["milan","bologna"],["bologna","florence"],["florence","rome"],
      ["rome","naples"],["bologna","venice"],
      // Austria
      ["munich","innsbruck"],["innsbruck","salzburg"],["salzburg","linz"],
      ["linz","vienna"],["munich","salzburg"],
      ["vienna","graz"],["graz","ljubljana"],
      ["innsbruck","verona"],
      // Czechia-Slovakia
      ["berlin","dresden"],["dresden","prague"],["prague","brno"],
      ["brno","bratislava"],["brno","vienna"],
      ["prague","nuremberg"],
      // Poland
      ["poznan","wroclaw"],["wroclaw","katowice"],["katowice","krakow"],
      ["krakow","vienna"],["katowice","vienna"],
      ["warsaw","krakow"],["warsaw","gdansk"],
      ["warsaw","vilnius"],["warsaw","minsk"],
      // Hungary-Balkans
      ["vienna","bratislava"],["bratislava","budapest"],
      ["budapest","zagreb"],["budapest","belgrade"],
      ["budapest","bucharest"],
      ["zagreb","ljubljana"],["zagreb","belgrade"],
      ["belgrade","nis"],["nis","sofia"],["nis","skopje"],
      ["belgrade","bucharest"],["bucharest","craiova"],["craiova","sofia"],
      ["sofia","thessaloniki"],["skopje","thessaloniki"],
      ["sarajevo","belgrade"],["sarajevo","zagreb"],
      // Nordics  
      ["hamburg","copenhagen"],["copenhagen","malmo"],
      ["malmo","gothenburg"],["gothenburg","oslo"],
      ["malmo","stockholm"],["stockholm","oslo"],
      ["stockholm","gavle"],["gavle","sundsvall"],["sundsvall","umea"],["umea","boden"],["boden","tornio"],["tornio","oulu"],
      ["oulu","tampere"],["tampere","helsinki"],
      // Baltics
      ["tallinn","riga"],["riga","vilnius"],
      ["vilnius","kaunas"],["kaunas","warsaw"],
      // East
      ["minsk","vilnius"],

      // ── US major rail corridors ──
      // Pacific Northwest
      ["seattle","portland_or"],["portland_or","sacramento"],
      ["seattle","spokane"],["spokane","boise"],["boise","portland_or"],
      ["sacramento","san_francisco"],["sacramento","reno"],
      // California
      ["san_francisco","los_angeles"],["los_angeles","san_diego"],
      ["los_angeles","tucson"],["los_angeles","phoenix"],
      // Mountain West
      ["reno","salt_lake"],["salt_lake","boise"],
      ["spokane","billings"],["billings","cheyenne"],
      ["salt_lake","cheyenne"],["salt_lake","denver"],
      ["denver","cheyenne"],["denver","albuquerque"],
      ["albuquerque","el_paso"],["el_paso","tucson"],["tucson","phoenix"],["phoenix","albuquerque"],
      // Northern Plains
      ["billings","fargo"],["fargo","minneapolis"],["fargo","duluth"],
      ["duluth","minneapolis"],["minneapolis","milwaukee"],
      ["minneapolis","sioux_falls"],["sioux_falls","omaha"],
      // Central corridor
      ["cheyenne","lincoln"],["lincoln","omaha"],["omaha","des_moines"],
      ["des_moines","chicago"],["omaha","kansas_city"],
      ["lincoln","kansas_city"],["kansas_city","st_louis"],
      ["kansas_city","oklahoma_city"],["kansas_city","wichita"],
      ["wichita","oklahoma_city"],
      // Chicago hub
      ["chicago","milwaukee"],["chicago","springfield_il"],
      ["springfield_il","st_louis"],["chicago","indianapolis"],
      ["chicago","detroit"],["chicago","toledo"],
      ["chicago","green_bay"],["green_bay","milwaukee"],
      // Great Lakes / Ohio Valley
      ["detroit","toledo"],["toledo","cleveland"],["cleveland","buffalo"],
      ["cleveland","columbus"],["columbus","indianapolis"],
      ["columbus","pittsburgh"],["indianapolis","cincinnati"],
      ["cincinnati","louisville"],["louisville","nashville"],
      ["indianapolis","st_louis"],
      // Northeast
      ["buffalo","albany"],["albany","new_york"],["albany","boston"],
      ["new_york","new_haven"],["new_haven","hartford"],["hartford","boston"],
      ["boston","providence"],["providence","new_haven"],
      ["boston","portland_me"],
      ["new_york","philadelphia"],["philadelphia","baltimore"],
      ["baltimore","washington_dc"],["pittsburgh","philadelphia"],
      ["pittsburgh","buffalo"],
      // Southeast
      ["washington_dc","richmond"],["richmond","raleigh"],
      ["raleigh","charlotte"],["charlotte","columbia_sc"],
      ["columbia_sc","charleston_sc"],["columbia_sc","savannah"],
      ["charlotte","atlanta"],["atlanta","savannah"],
      ["savannah","jacksonville"],["jacksonville","orlando"],
      ["orlando","tampa"],["orlando","miami"],
      ["atlanta","birmingham"],["birmingham","nashville"],
      ["atlanta","chattanooga"],["chattanooga","nashville"],
      ["chattanooga","knoxville"],["knoxville","richmond"],
      ["birmingham","mobile"],["mobile","new_orleans"],
      // South Central
      ["nashville","memphis"],["memphis","little_rock"],
      ["little_rock","dallas"],["memphis","jackson_ms"],
      ["jackson_ms","new_orleans"],
      ["new_orleans","baton_rouge"],["baton_rouge","houston"],
      ["houston","dallas"],["dallas","san_antonio"],
      ["san_antonio","laredo"],["san_antonio","el_paso"],
      ["houston","new_orleans"],
      ["dallas","oklahoma_city"],["oklahoma_city","tulsa"],
      ["dallas","shreveport"],["shreveport","little_rock"],
      // Cross-connections
      ["st_louis","memphis"],["st_louis","nashville"],
      ["st_louis","little_rock"],
      ["charleston_wv","richmond"],["charleston_wv","columbus"],
      ["charleston_wv","louisville"],
    ];

    // Build adjacency map
    const adj: Record<string, Set<string>> = {};
    for (const k of Object.keys(J)) adj[k] = new Set();
    for (const [a, b] of EDGES) {
      if (adj[a]) adj[a].add(b);
      if (adj[b]) adj[b].add(a);
    }

    // Map country ISO3 → nearest junction
    const ISO_JUNCTION: Record<string, string> = {
      AUT: "vienna",    BEL: "brussels",  BGR: "sofia",
      CHE: "zurich",    CZE: "prague",    DEU: "frankfurt",
      DNK: "copenhagen", EST: "tallinn",   ESP: "madrid",
      FIN: "helsinki",   FRA: "paris",     GBR: "london",
      GRC: "thessaloniki", HRV: "zagreb",  HUN: "budapest",
      IRL: "london",    ITA: "milan",     LTU: "vilnius",
      LUX: "luxembourg", LVA: "riga",     MKD: "skopje",
      NLD: "amsterdam", NOR: "oslo",      POL: "warsaw",
      PRT: "lisbon",    ROU: "bucharest", SWE: "stockholm",
      SVN: "ljubljana", SVK: "bratislava", SRB: "belgrade",
      BIH: "sarajevo",  BLR: "minsk",
      // US states
      "US-AL": "birmingham",                              "US-AZ": "phoenix",
      "US-AR": "little_rock",  "US-CA": "los_angeles",  "US-CO": "denver",
      "US-CT": "hartford",     "US-DE": "philadelphia", "US-FL": "jacksonville",
      "US-GA": "atlanta",                                  "US-ID": "boise",
      "US-IL": "chicago",      "US-IN": "indianapolis", "US-IA": "des_moines",
      "US-KS": "wichita",      "US-KY": "louisville",   "US-LA": "new_orleans",
      "US-ME": "portland_me",  "US-MD": "baltimore",    "US-MA": "boston",
      "US-MI": "detroit",      "US-MN": "minneapolis",  "US-MS": "jackson_ms",
      "US-MO": "st_louis",     "US-MT": "billings",     "US-NE": "lincoln",
      "US-NV": "reno",         "US-NH": "boston",        "US-NJ": "new_york",
      "US-NM": "albuquerque",  "US-NY": "albany",       "US-NC": "raleigh",
      "US-ND": "fargo",        "US-OH": "columbus",     "US-OK": "oklahoma_city",
      "US-OR": "portland_or",  "US-PA": "pittsburgh",   "US-RI": "providence",
      "US-SC": "columbia_sc",  "US-SD": "sioux_falls",  "US-TN": "nashville",
      "US-TX": "dallas",       "US-UT": "salt_lake",    "US-VT": "albany",
      "US-VA": "richmond",     "US-WA": "seattle",      "US-WV": "charleston_wv",
      "US-WI": "milwaukee",    "US-WY": "cheyenne",     "US-DC": "washington_dc",
    };

    // BFS shortest path
    function bfsPath(start: string, end: string): string[] | null {
      if (start === end) return [start];
      const visited = new Set<string>([start]);
      const queue: [string, string[]][] = [[start, [start]]];
      while (queue.length > 0) {
        const [node, path] = queue.shift()!;
        for (const neighbor of adj[node] || []) {
          if (visited.has(neighbor)) continue;
          const newPath = [...path, neighbor];
          if (neighbor === end) return newPath;
          visited.add(neighbor);
          queue.push([neighbor, newPath]);
        }
      }
      return null;
    }

    // Cardinal spline — very tight tension to stay close to land
    function cardinalSpline(
      points: [number, number][], segsPerSpan: number = 6, tension: number = 0.15
    ): number[] {
      if (points.length <= 2) return points.flatMap(([lon, lat]) => [lon, lat]);
      const P = [points[0], ...points, points[points.length - 1]];
      const s = tension;
      const out: number[] = [];
      for (let i = 1; i < P.length - 2; i++) {
        const [x0, y0] = P[i - 1];
        const [x1, y1] = P[i];
        const [x2, y2] = P[i + 1];
        const [x3, y3] = P[i + 2];
        const startJ = i === 1 ? 0 : 1;
        for (let j = startJ; j <= segsPerSpan; j++) {
          const t = j / segsPerSpan;
          const t2 = t * t;
          const t3 = t2 * t;
          const h1 = 2 * t3 - 3 * t2 + 1;
          const h2 = -2 * t3 + 3 * t2;
          const h3 = t3 - 2 * t2 + t;
          const h4 = t3 - t2;
          out.push(
            h1 * x1 + h2 * x2 + h3 * s * (x2 - x0) + h4 * s * (x3 - x1),
            h1 * y1 + h2 * y2 + h3 * s * (y2 - y0) + h4 * s * (y3 - y1)
          );
        }
      }
      return out;
    }

    // Route between two ISO3 countries through real rail junctions
    function railRoute(iso1: string, iso2: string): string[] | null {
      const j1 = ISO_JUNCTION[iso1];
      const j2 = ISO_JUNCTION[iso2];
      if (!j1 || !j2 || !J[j1] || !J[j2]) return null;
      return bfsPath(j1, j2);
    }

    // ── Per-flow directional arrows — thickness = magnitude, unique color per flow ──
    const maxTonnes = Math.max(...railFreight.map((rf) => rf.tonnes), 1);

    // HSL-to-RGB helper for generating distinct colors
    function hslToColor(h: number, s: number, l: number, a: number): Color {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;
      if (h < 60)      { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else              { r = c; b = x; }
      return new Color(r + m, g + m, b + m, a);
    }

    // Offset a waypoint perpendicular to the segment direction
    function offsetPoint(
      lon: number, lat: number, nextLon: number, nextLat: number, dist: number
    ): [number, number] {
      const dx = nextLon - lon;
      const dy = nextLat - lat;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return [lon + (-dy / len) * dist, lat + (dx / len) * dist];
    }

    // Group flows by sorted corridor key and assign lane indices
    const validFlows = railFreight.filter((rf) => {
      const p = railRoute(rf.origin_iso, rf.destination_iso);
      return p && p.length >= 2;
    });
    const totalFlows = validFlows.length;

    // Build corridor groups: sorted ISO pair → list of flow indices
    const corridorMap = new Map<string, number[]>();
    validFlows.forEach((rf, i) => {
      const key = [rf.origin_iso, rf.destination_iso].sort().join('-');
      if (!corridorMap.has(key)) corridorMap.set(key, []);
      corridorMap.get(key)!.push(i);
    });

    // Assign each flow a lane offset within its corridor
    const flowLaneOffset = new Float64Array(validFlows.length);
    const laneSpacing = 0.35; // degrees between lane centers
    corridorMap.forEach((indices) => {
      const n = indices.length;
      indices.forEach((fi, laneIdx) => {
        // Center lanes around 0: e.g. for 3 flows → -1, 0, +1
        flowLaneOffset[fi] = (laneIdx - (n - 1) / 2) * laneSpacing;
      });
    });

    const flowColorsCss: string[] = [];
    let flowIdx = 0;
    validFlows.forEach((rf, vi) => {
      const path = railRoute(rf.origin_iso, rf.destination_iso);
      if (!path || path.length < 2) return;

      const norm = Math.sqrt(rf.tonnes / maxTonnes);
      const width = 2 + norm * 57;

      // Lane-based lateral offset so flows in the same corridor don't overlap
      const side = flowLaneOffset[vi];

      // Unique color per flow — evenly spaced hues, warm saturation
      const hue = (flowIdx / totalFlows) * 360;
      const flowColor = hslToColor(hue, 0.85, 0.55, 0.8);
      flowColorsCss.push(`hsl(${hue.toFixed(0)}, 85%, 55%)`);

      // Build waypoints from junction path with offset
      const waypoints: [number, number][] = path.map((jName, i) => {
        const [lon, lat] = J[jName];
        if (path.length < 2) return [lon, lat] as [number, number];
        const nextIdx = Math.min(i + 1, path.length - 1);
        const prevIdx = Math.max(i - 1, 0);
        const refIdx = i < path.length - 1 ? nextIdx : prevIdx;
        const [refLon, refLat] = J[path[refIdx]];
        return offsetPoint(lon, lat, refLon, refLat, side);
      });

      const smoothPts = cardinalSpline(waypoints, 6, 0.6);
      const positions = Cartesian3.fromDegreesArray(smoothPts);

      viewer.entities.add({
        name: `rail_freight_${flowIdx}`,
        polyline: {
          positions,
          width,
          material: new PolylineArrowMaterialProperty(flowColor),
          clampToGround: true,
        },
      });
      railFlowOriginalColors.current.set(`rail_freight_${flowIdx}`, flowColor);
      railFlowOriginalWidths.current.set(`rail_freight_${flowIdx}`, width);
      flowIdx++;
    });

    // Store flow data and colors for hover tooltips
    railFreightFlowsRef.current = validFlows;
    railFreightColorsRef.current = flowColorsCss;

    // Junction dots at active nodes
    const activeJunctions = new Set<string>();
    railFreight.forEach((rf) => {
      const path = railRoute(rf.origin_iso, rf.destination_iso);
      if (path) path.forEach((j) => activeJunctions.add(j));
    });
    let dotIdx = 0;
    activeJunctions.forEach((jName) => {
      if (!J[jName]) return;
      const [lon, lat] = J[jName];
      viewer.entities.add({
        name: `rail_freight_flash_${dotIdx}`,
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: 4,
          color: new Color(1.0, 0.6, 0.1, 0.7),
          outlineColor: new Color(0.4, 0.2, 0.0, 0.4),
          outlineWidth: 1.5,
        },
      });
      dotIdx++;
    });

    viewer.entities.resumeEvents();
  }, [railFreight, layers.railroadFreight]);

  // ── Rail freight: highlight selected flow, dim others ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const dimColor = new Color(0.4, 0.4, 0.4, 0.25);

    viewer.entities.values.forEach((entity) => {
      const n = entity.name;
      if (!n || !n.startsWith("rail_freight_") || n.startsWith("rail_freight_flash_")) return;
      if (!entity.polyline) return;

      const origColor = railFlowOriginalColors.current.get(n);
      const origWidth = railFlowOriginalWidths.current.get(n);
      if (!origColor || origWidth == null) return;

      if (selectedRailFlow === null) {
        // No selection — restore all to original
        entity.polyline.material = new PolylineArrowMaterialProperty(origColor) as any;
        entity.polyline.width = origWidth as any;
      } else {
        const idx = parseInt(n.replace("rail_freight_", ""), 10);
        if (idx === selectedRailFlow) {
          // Selected flow — brighten and widen
          const bright = new Color(
            Math.min(origColor.red * 1.3, 1),
            Math.min(origColor.green * 1.3, 1),
            Math.min(origColor.blue * 1.3, 1),
            1.0
          );
          entity.polyline.material = new PolylineArrowMaterialProperty(bright) as any;
          entity.polyline.width = (origWidth * 1.4) as any;
        } else {
          // Other flows — keep their color but slightly faded
          const faded = new Color(
            origColor.red * 0.6 + 0.15,
            origColor.green * 0.6 + 0.15,
            origColor.blue * 0.6 + 0.15,
            0.45
          );
          entity.polyline.material = new PolylineArrowMaterialProperty(faded) as any;
          entity.polyline.width = (origWidth * 0.85) as any;
        }
      }
    });
  }, [selectedRailFlow]);

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

      {/* Rail freight hover tooltip */}
      {railFreightTooltip && (
        <div
          style={{
            position: "absolute",
            left: railFreightTooltip.x + 16,
            top: railFreightTooltip.y - 10,
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
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#f59e0b", display: "flex", alignItems: "center", gap: 8 }}>
            {"\u{1F682}"} Rail Freight
            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: railFreightTooltip.color, border: "1px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Origin</td><td>{railFreightTooltip.origin}</td></tr>
              <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Destination</td><td>{railFreightTooltip.destination}</td></tr>
              <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Volume</td><td style={{ fontWeight: 700, color: "#fbbf24" }}>{railFreightTooltip.tonnes >= 1000 ? `${(railFreightTooltip.tonnes / 1000).toFixed(1)}K` : railFreightTooltip.tonnes.toLocaleString()} tonnes</td></tr>
              <tr><td style={{ color: "#94a3b8", paddingRight: 10 }}>Year</td><td>{railFreightTooltip.year}</td></tr>
            </tbody>
          </table>
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
