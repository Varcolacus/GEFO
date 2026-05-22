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
import { fetchCountriesGeoJSON } from "@/lib/api";
import { computeArcPositions } from "./globe/lib/geometry";
import { GOOGLE_EARTH_TILES } from "./globe/lib/tile-providers";
import { ShippingDensityLayer } from "./globe/layers/ShippingDensityLayer";
import { CommodityFlowsLayer } from "./globe/layers/CommodityFlowsLayer";
import { ConflictZonesLayer } from "./globe/layers/ConflictZonesLayer";
import { AircraftLayer } from "./globe/layers/AircraftLayer";
import { AirportsLayer } from "./globe/layers/AirportsLayer";
import { VesselsLayer } from "./globe/layers/VesselsLayer";
import { PortsLayer } from "./globe/layers/PortsLayer";
import { CountriesLayer } from "./globe/layers/CountriesLayer";
import { TradeFlowsLayer } from "./globe/layers/TradeFlowsLayer";
import { RailFreightLayer } from "./globe/layers/RailFreightLayer";
import { findOverlayLayer } from "./globe/lib/overlay-utils";

// Disable Cesium Ion — uses CartoDB + OpenStreetMap
Ion.defaultAccessToken = "";

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
  const railFlowEstimated = useRef<Map<string, boolean>>(new Map());

  // Signals layer-component children that viewerRef.current is non-null.
  // Without this, layers that default-on would mount before the viewer exists
  // and their first render would silently no-op.
  const [viewerReady, setViewerReady] = useState(false);

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
    setViewerReady(true);

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
  }, [layers.railroads]);

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

      {/* Globe data layers — each is a render-null effect component */}
      {viewerReady && viewerRef.current && (
        <>
          <ShippingDensityLayer
            viewer={viewerRef.current}
            enabled={layers.shippingDensity}
          />
          <CommodityFlowsLayer
            viewer={viewerRef.current}
            flows={commodityFlows}
          />
          <ConflictZonesLayer
            viewer={viewerRef.current}
            zones={conflictZones}
          />
          <AircraftLayer
            viewer={viewerRef.current}
            enabled={layers.aircraft}
            aircraft={aircraftList}
          />
          <AirportsLayer
            viewer={viewerRef.current}
            enabled={layers.airports}
            airports={airportsProp}
          />
          <VesselsLayer
            viewer={viewerRef.current}
            vesselsEnabled={layers.vessels}
            portsEnabled={layers.ports}
            vessels={vessels}
            ports={ports}
          />
          <PortsLayer
            viewer={viewerRef.current}
            enabled={layers.ports}
            ports={ports}
            category={portCategory}
          />
          <CountriesLayer
            viewer={viewerRef.current}
            enabled={layers.countries}
            countries={countries}
            indicator={indicator}
            year={year}
            geoJsonRef={geoJsonRef}
          />
          <TradeFlowsLayer
            viewer={viewerRef.current}
            enabled={layers.tradeFlows}
            tradeFlows={tradeFlows}
            countries={countries}
            highlightCountryIso={highlightCountryIso ?? null}
            tradeMode={tradeMode}
            year={year}
            geoJsonRef={geoJsonRef}
          />
          <RailFreightLayer
            viewer={viewerRef.current}
            enabled={layers.railroads}
            flows={railFreight}
            selectedFlow={selectedRailFlow}
            onResetSelection={() => setSelectedRailFlow(null)}
            flowsRef={railFreightFlowsRef}
            colorsRef={railFreightColorsRef}
            originalColorsRef={railFlowOriginalColors}
            originalWidthsRef={railFlowOriginalWidths}
            estimatedRef={railFlowEstimated}
          />
        </>
      )}

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
