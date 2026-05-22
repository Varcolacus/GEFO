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
    railFlowEstimated.current.clear();
    setSelectedRailFlow(null);

    if (!layers.railroads || railFreight.length === 0) {
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

      // ── Turkey ──
      istanbul:[28.98,41.01], ankara:[32.87,39.93],
      eskisehir:[30.52,39.78], konya:[32.49,37.87],
      kayseri:[35.48,38.73], edirne:[26.56,41.68],
      // ── Russia (west) ──
      moscow:[37.62,55.76], st_petersburg:[30.32,59.93],
      // ── Ukraine ──
      kyiv:[30.52,50.45], lviv:[24.03,49.84],
      odesa:[30.73,46.48], kharkiv:[36.23,49.99],

      // ── Iran ──
      tehran:[51.39,35.69], isfahan:[51.68,32.65],
      shiraz:[52.58,29.59], tabriz:[46.30,38.08],
      mashhad:[59.60,36.30], bandar_abbas:[56.27,27.18],
      chabahar:[60.64,25.29], qom:[50.88,34.64],
      zahedan:[60.86,29.50], khorramshahr:[48.17,30.44],
      astara_ir:[48.87,38.43], herat:[62.20,34.35],
      sarakhs_tm:[61.16,36.54], // Turkmenistan border

      // ── India ──
      delhi:[77.21,28.61], mumbai:[72.88,19.08],
      kolkata:[88.36,22.57], chennai:[80.27,13.08],
      amritsar:[74.87,31.63], lucknow:[80.95,26.85],
      varanasi:[83.00,25.32], jaipur:[75.79,26.92],
      ahmedabad:[72.57,23.02], siliguri:[88.43,26.71],
      chandigarh:[76.78,30.73], biratnagar:[87.28,26.45],

      // ── Pakistan ──
      lahore:[74.35,31.56], islamabad:[73.05,33.69],
      peshawar:[71.58,34.01], multan:[71.47,30.20],
      karachi:[67.01,24.86], quetta:[67.01,30.18],

      // ── Bangladesh ──
      dhaka:[90.41,23.81],

      // ── Afghanistan ──
      // (herat already defined above under Iran section)

      // ── Iraq ──
      baghdad:[44.37,33.31], basra:[47.78,30.51], mosul:[43.13,36.34],

      // ── Saudi Arabia & UAE ──
      riyadh:[46.68,24.71], dammam:[50.10,26.43], jeddah:[39.17,21.49],
      al_batha:[51.58,24.27], // Saudi-UAE land border crossing
      abu_dhabi:[54.37,24.45], dubai:[55.27,25.20],

      // ── Southeast Asia ──
      kunming:[102.68,25.04], vientiane:[102.63,17.97],
      bangkok:[100.50,13.76], chumphon:[99.18,10.49], hat_yai:[100.47,7.00],
      hanoi:[105.85,21.03], ho_chi_minh:[106.66,10.82],
      mandalay:[96.08,21.97], yangon:[96.15,16.87],
      kuala_lumpur:[101.69,3.14], singapore_city:[103.85,1.29],

      // ── Africa ──
      // Southern Africa
      johannesburg:[28.05,-26.20], pretoria:[28.19,-25.75],
      durban:[31.02,-29.86], cape_town:[18.42,-33.93],
      maputo:[32.57,-25.97], beira:[34.87,-19.84],
      harare:[31.05,-17.83], bulawayo:[28.58,-20.15],
      gaborone:[25.91,-24.66], lusaka:[28.28,-15.39],
      livingstone:[25.86,-17.84], lubumbashi:[27.47,-11.66],
      // East Africa
      dar_es_salaam:[39.27,-6.79], kapiri_mposhi:[28.68,-14.97],
      nairobi:[36.82,-1.29], mombasa:[39.66,-4.04], malaba:[34.28,0.64],
      kampala:[32.58,0.31],
      addis_ababa:[38.75,9.02], djibouti_city:[43.15,11.59], dire_dawa:[42.00,9.60],
      // Nacala corridor
      nacala:[40.69,-14.54], lilongwe:[33.79,-13.96], blantyre:[35.01,-15.79],
      // South African domestic
      sishen:[22.00,-27.75], saldanha:[17.93,-33.01],
      emalahleni:[29.24,-25.87], richards_bay:[32.04,-28.78],
      // ── Brazil ──
      sao_luis:[-44.28,-2.53], belem:[-48.50,-1.46],
      belo_horizonte:[-43.94,-19.92], vitoria_br:[-40.34,-20.32],
      sao_paulo:[-46.63,-23.55], santos:[-46.33,-23.96],
      cuiaba:[-56.10,-15.60], rio_de_janeiro:[-43.17,-22.91],
      curitiba:[-49.27,-25.43], porto_alegre:[-51.23,-30.03],
      florianopolis:[-48.55,-27.59], campinas:[-47.06,-22.91],
      salvador:[-38.51,-12.97],
      // ── Colombia ──
      cerrejon:[-72.67,10.95], puerto_bolivar:[-71.98,12.22],
      // ── Morocco ──
      khouribga:[-6.91,32.88], casablanca:[-7.59,33.57],
      jorf_lasfar:[-8.64,33.12], safi:[-9.24,32.30],
      // ── Mauritania ──
      zouerat:[-12.47,22.73], nouadhibou:[-17.03,20.94],

      // ── Australia ──
      sydney:[151.21,-33.87], melbourne:[144.96,-37.81],
      brisbane:[153.03,-27.47], adelaide:[138.60,-34.93],
      perth:[115.86,-31.95], darwin:[130.84,-12.46],
      broken_hill:[141.47,-31.95], kalgoorlie:[121.47,-30.75],
      alice_springs:[133.88,-23.70],
      cook_sa:[129.50,-30.61], port_augusta:[137.78,-32.49], // Nullarbor waypoints

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

      // ── Canadian rail junction cities ──
      vancouver:[-123.12,49.28], calgary:[-114.07,51.05],
      edmonton:[-113.49,53.55], saskatoon:[-106.67,52.13],
      winnipeg:[-97.14,49.90], thunder_bay:[-89.25,48.38],
      sudbury:[-80.99,46.49], toronto:[-79.38,43.65],
      ottawa:[-75.70,45.42], montreal:[-73.57,45.50],
      quebec_city:[-71.21,46.81], halifax:[-63.57,44.65],
      moncton:[-64.77,46.09],

      // ── Mexican rail junction cities ──
      mexico_city:[-99.13,19.43], monterrey:[-100.31,25.67],
      guadalajara:[-103.35,20.66], san_luis_potosi:[-100.99,22.15],
      chihuahua:[-106.09,28.63], ciudad_juarez:[-106.44,31.69],
      nuevo_laredo:[-99.55,27.48], nogales:[-110.94,31.34],
      tijuana:[-117.04,32.53], aguascalientes:[-102.29,21.88],
      queretaro:[-100.39,20.59], veracruz:[-96.13,19.18],
      lazaro_cardenas:[-102.20,17.96], manzanillo:[-104.34,19.05],

      // ── Russia (extended Trans-Siberian) ──
      yekaterinburg:[60.60,56.84], novosibirsk:[82.92,55.03],
      omsk_ru:[73.37,54.99], krasnoyarsk:[92.87,56.01],
      irkutsk:[104.30,52.30], ulan_ude:[107.59,51.83],
      chita:[113.50,52.03], khabarovsk:[135.07,48.48],
      vladivostok:[131.89,43.12],

      // ── Kazakhstan ──
      almaty:[76.95,43.24], astana:[71.43,51.13],
      khorgos:[80.34,43.35], dostyk:[78.23,45.12],
      aktau:[51.15,43.65], aktobe:[57.21,50.28],
      shymkent:[69.60,42.32],

      // ── Mongolia ──
      ulaanbaatar:[106.91,47.92], zamiin_uud:[111.90,43.72],
      sukhbaatar:[106.21,50.24],

      // ── Caucasus ──
      baku:[49.87,40.41], tbilisi:[44.83,41.72],
      kars:[43.09,40.60],

      // ── China (main rail hubs) ──
      beijing:[116.40,39.90], xian:[108.94,34.26],
      chongqing:[106.55,29.56], chengdu:[104.07,30.57],
      zhengzhou:[113.65,34.76], wuhan:[114.31,30.59],
      lanzhou:[103.83,36.06], urumqi:[87.62,43.83],
      yiwu:[120.08,29.31], shanghai:[121.47,31.23],
      harbin:[126.65,45.75], shenyang:[123.43,41.80],
      guangzhou:[113.26,23.13], shenzhen:[114.06,22.54],
      manzhouli:[117.38,49.60],

      // ── Uzbekistan / Turkmenistan ──
      tashkent:[69.28,41.30],
      andijan:[72.34,40.78], bukhara:[64.42,39.77],
      samarkand:[66.96,39.65], navoi:[65.38,40.10],

      // ── China (extra domestic hubs) ──
      taiyuan:[112.55,37.87], hohhot:[111.65,40.82],
      nanchang:[115.89,28.68], changsha:[112.97,28.21],
      fuzhou_cn:[119.30,26.08], jinan:[117.00,36.67],
      nanjing:[118.80,32.06],

      // ── India (extra domestic hubs) ──
      ranchi:[85.31,23.36], bhubaneswar:[85.83,20.30],
      raipur:[81.63,21.25], nagpur:[79.08,21.15],
      bhopal:[77.41,23.26], hyderabad_in:[78.47,17.39],
      bangalore:[77.59,12.97], panaji:[73.83,15.50],
      kochi:[76.27,9.93],

      // ── Russia (extra domestic hubs) ──
      kemerovo:[86.09,55.35], murmansk:[33.09,68.97],
      krasnodar:[38.97,45.04], tyumen:[65.53,57.15],
      ufa:[55.97,54.74], chelyabinsk:[61.40,55.16],

      // ── Kazakhstan (extra) ──
      karaganda:[73.10,49.80], pavlodar:[76.95,52.29],
      kostanay:[63.63,53.21],

      // ── Ukraine (extra) ──
      dnipro:[35.05,48.46], zaporizhzhia:[35.14,47.84],
      poltava:[34.55,49.59], cherkasy:[32.06,49.44],
      zhytomyr:[28.66,50.25], donetsk:[37.80,48.00],
      luhansk:[39.31,48.57],

      // ── Turkey (extra) ──
      izmir:[27.13,38.42], kocaeli:[29.92,40.77],
      erzurum:[41.28,39.91],

      // ── Japan ──
      tokyo:[139.69,35.68], osaka:[135.50,34.69],
      sapporo:[141.35,43.06], fukuoka:[130.40,33.59],
      nagoya:[136.91,35.18],

      // ── South Korea ──
      seoul:[126.98,37.57], busan:[129.08,35.18],
      incheon:[126.71,37.46], daejeon:[127.38,36.35],

      // ── Indonesia (Java + Sumatra) ──
      palembang:[104.91,-3.32], lampung_bj:[105.26,-5.45],
      jakarta:[106.85,-6.17], bandung:[107.61,-6.92],
      semarang:[110.14,-7.15], surabaya:[112.24,-7.54],

      // ── Argentina ──
      buenos_aires:[-58.38,-34.61], cordoba_ar:[-64.18,-31.42],
      rosario:[-60.67,-32.94], tucuman:[-65.22,-26.81],
      parana:[-60.52,-31.74],

      // ── Chile ──
      iquique:[-69.33,-20.21], antofagasta:[-70.40,-23.65],
      copiapo:[-70.33,-27.37], santiago:[-70.67,-33.45],
      valparaiso_cl:[-71.62,-33.05],

      // ── Egypt ──
      cairo:[31.24,30.04], alexandria_eg:[29.92,31.20],
      suez_city:[32.54,29.97], aswan:[32.90,24.09],

      // ── Peru ──
      lima:[-77.04,-12.05], la_oroya:[-75.90,-11.52],
      arequipa:[-71.54,-16.41], tacna:[-70.25,-17.60],

      // ── Nigeria ──
      lagos:[3.38,6.52], abeokuta:[3.35,7.00],
      ilorin:[4.54,8.49], abuja:[7.49,9.06], kano:[8.52,12.00],

      // ── Tunisia ──
      tunis:[10.18,36.81], sfax:[10.76,34.74],
      gafsa:[8.78,34.42], sousse:[10.61,35.83],

      // ── Mongolia (extra) ──
      darkhan:[106.00,49.47], erdenet:[104.15,49.07],

      // ── Bangladesh (extra) ──
      chittagong:[91.83,22.34], rangpur:[89.25,25.75],
      sylhet:[91.87,24.90], barisal:[90.37,22.70],

      // ── Thailand (extra) ──
      nakhon_ratchasima:[102.10,14.97], khon_kaen:[102.83,16.43],
      chiang_mai:[98.98,18.79], ratchaburi:[99.81,13.54],

      // ── Vietnam (extra) ──
      hai_phong:[106.68,20.86], da_nang:[108.22,16.07],

      // ── Myanmar (extra) ──
      bago:[96.48,17.34], taunggyi:[97.04,20.79],

      // ── North Korea ──
      pyongyang:[125.75,39.03], hamhung:[128.17,40.81],
      wonsan:[127.56,38.84],

      // ── Namibia ──
      windhoek:[17.08,-22.57], walvis_bay:[14.53,-22.56],

      // ── Ghana ──
      accra:[-0.19,5.61], cape_coast:[-1.03,5.93],
      takoradi:[-1.98,5.55],

      // ── Cameroon ──
      douala:[9.70,4.05], yaounde:[11.52,3.87],
      bafoussam:[10.15,5.49], ngaoundere:[13.57,7.39],

      // ── Senegal ──
      dakar:[-17.47,14.72], thies:[-16.93,14.79],
      kaolack:[-16.07,14.15],

      // ── Jordan ──
      maan:[35.73,30.20], aqaba:[35.01,29.53],

      // ── Cuba ──
      havana:[-82.35,23.05], camaguey:[-77.92,21.38],
      santiago_cu:[-75.83,20.02],

      // ── Taiwan ──
      taipei:[121.57,25.03], kaohsiung:[120.31,22.62],
      taichung:[120.67,24.15],

      // ── Algeria ──
      algiers:[3.04,36.75], oran:[-0.63,35.70],

      // ── Sudan ──
      khartoum:[32.53,15.55], port_sudan:[37.22,19.62],

      // ── Cross-border extra ──
      mbabane:[31.13,-26.30],   // eSwatini
      abidjan:[-4.02,5.35],     // Côte d'Ivoire
      ouagadougou:[-1.52,12.37],// Burkina Faso
      ndjamena:[15.04,12.13],   // Chad
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

      // Turkey
      ["edirne","istanbul"],["istanbul","eskisehir"],
      ["eskisehir","ankara"],["ankara","konya"],
      ["ankara","kayseri"],["eskisehir","konya"],
      // Turkey cross-border
      ["edirne","sofia"],["edirne","thessaloniki"],

      // Russia (west)
      ["st_petersburg","moscow"],
      // Russia cross-border
      ["st_petersburg","helsinki"],

      // Ukraine
      ["lviv","kyiv"],["kyiv","kharkiv"],["kyiv","odesa"],
      // Ukraine cross-border
      ["lviv","krakow"],["lviv","budapest"],
      ["kyiv","minsk"],
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

      // ── Canadian rail corridors ──
      // Transcontinental
      ["vancouver","calgary"],["calgary","edmonton"],
      ["calgary","saskatoon"],["saskatoon","winnipeg"],
      ["edmonton","saskatoon"],
      ["winnipeg","thunder_bay"],["thunder_bay","sudbury"],
      ["sudbury","toronto"],["toronto","ottawa"],
      ["ottawa","montreal"],["montreal","quebec_city"],
      ["quebec_city","moncton"],["moncton","halifax"],
      ["montreal","moncton"],
      // US-Canada cross-border connections
      ["vancouver","seattle"],
      ["winnipeg","fargo"],["winnipeg","duluth"],
      ["thunder_bay","duluth"],
      ["toronto","buffalo"],["toronto","detroit"],
      ["montreal","albany"],["montreal","portland_me"],

      // ── Mexican rail corridors ──
      // Main trunk lines
      ["mexico_city","queretaro"],["queretaro","san_luis_potosi"],
      ["san_luis_potosi","monterrey"],["monterrey","nuevo_laredo"],
      ["san_luis_potosi","aguascalientes"],["aguascalientes","guadalajara"],
      ["guadalajara","manzanillo"],["guadalajara","mexico_city"],
      ["mexico_city","veracruz"],["mexico_city","lazaro_cardenas"],
      ["monterrey","chihuahua"],["chihuahua","ciudad_juarez"],
      ["chihuahua","nogales"],["nogales","tijuana"],
      // US-Mexico cross-border connections
      ["nuevo_laredo","san_antonio"],["ciudad_juarez","el_paso"],
      ["nogales","tucson"],["tijuana","los_angeles"],
      ["nuevo_laredo","dallas"],

      // ── Russia — Trans-Siberian Railway ──
      ["moscow","yekaterinburg"],["yekaterinburg","omsk_ru"],
      ["omsk_ru","novosibirsk"],["novosibirsk","krasnoyarsk"],
      ["krasnoyarsk","irkutsk"],["irkutsk","ulan_ude"],
      ["ulan_ude","chita"],["chita","khabarovsk"],
      ["khabarovsk","vladivostok"],
      // Moscow — St Petersburg & Belarus
      ["moscow","st_petersburg"],["moscow","minsk"],

      // ── Kazakhstan rail corridors ──
      ["khorgos","almaty"],["dostyk","almaty"],
      ["almaty","shymkent"],["shymkent","tashkent"],
      ["almaty","astana"],["astana","aktobe"],
      ["aktobe","aktau"],["astana","yekaterinburg"],
      ["astana","omsk_ru"],

      // ── Mongolia (Trans-Mongolian) ──
      ["zamiin_uud","ulaanbaatar"],["ulaanbaatar","sukhbaatar"],
      ["sukhbaatar","ulan_ude"],

      // ── Caucasus / Middle Corridor ──
      ["aktau","baku"],  // Caspian crossing
      ["baku","tbilisi"],["tbilisi","kars"],
      ["kars","ankara"],["kars","istanbul"],

      // ── China rail corridors ──
      // East-West trunk
      ["shanghai","zhengzhou"],["zhengzhou","xian"],
      ["xian","lanzhou"],["lanzhou","urumqi"],
      ["urumqi","khorgos"],["urumqi","dostyk"],
      // Beijing connections
      ["beijing","zhengzhou"],["beijing","xian"],
      ["beijing","shenyang"],["beijing","harbin"],
      // Southwest
      ["chengdu","xian"],["chongqing","xian"],
      ["chengdu","chongqing"],["chongqing","wuhan"],
      ["wuhan","zhengzhou"],["wuhan","guangzhou"],
      ["guangzhou","shenzhen"],
      // Yiwu (small commodity city)
      ["yiwu","shanghai"],["yiwu","zhengzhou"],
      // Northeast (Trans-Manchurian)
      ["harbin","manzhouli"],["manzhouli","chita"],
      ["shenyang","harbin"],
      // Zamiin-Uud (China-Mongolia border)
      ["beijing","zamiin_uud"],

      // ── Iran rail corridors ──
      ["tehran","isfahan"],["isfahan","shiraz"],
      ["tehran","tabriz"],["tabriz","kars"], // Turkey-Iran via Tabriz
      ["tehran","mashhad"],["mashhad","sarakhs_tm"], // Iran-Turkmenistan
      ["tehran","bandar_abbas"],["bandar_abbas","isfahan"],
      ["tehran","qom"],["qom","isfahan"],
      ["mashhad","zahedan"],["zahedan","quetta"], // Iran-Pakistan
      ["mashhad","herat"], // Iran-Afghanistan (Khaf-Herat)
      ["tehran","astara_ir"],["astara_ir","baku"], // INSTC Iran-Azerbaijan
      ["bandar_abbas","chabahar"],
      ["tehran","khorramshahr"],["khorramshahr","basra"], // Iran-Iraq

      // ── India rail corridors ──
      ["delhi","mumbai"],["delhi","kolkata"],
      ["mumbai","chennai"],["chennai","kolkata"],
      ["delhi","amritsar"],["amritsar","lahore"], // India-Pakistan
      ["kolkata","dhaka"], // India-Bangladesh
      ["delhi","lucknow"],["lucknow","varanasi"],
      ["varanasi","kolkata"],
      ["delhi","jaipur"],["jaipur","ahmedabad"],["ahmedabad","mumbai"],
      // Mumbai-Bandar Abbas is a maritime route (not rail), omitted
      ["kolkata","siliguri"],["siliguri","biratnagar"], // India-Nepal
      ["delhi","chandigarh"],

      // ── Pakistan rail corridors ──
      ["lahore","islamabad"],["islamabad","peshawar"],
      ["lahore","multan"],["multan","quetta"],
      ["multan","karachi"],["karachi","quetta"],

      // ── Southeast Asia rail corridors ──
      // China-Laos-Thailand
      ["kunming","vientiane"],["vientiane","bangkok"],
      ["kunming","hanoi"], // China-Vietnam
      ["hanoi","ho_chi_minh"],
      // China-Myanmar
      ["kunming","mandalay"],["mandalay","yangon"],
      // Thailand-Malaysia-Singapore
      ["bangkok","chumphon"],["chumphon","hat_yai"],["hat_yai","kuala_lumpur"],
      ["kuala_lumpur","singapore_city"],
      // SW China connections
      ["chengdu","kunming"],["kunming","xian"],

      // ── Middle East ──
      // Iraq
      ["basra","baghdad"],["baghdad","mosul"],
      // Saudi-UAE
      ["riyadh","dammam"],["riyadh","jeddah"],
      ["dammam","al_batha"],["al_batha","abu_dhabi"],["abu_dhabi","dubai"],
      // Turkey-Iraq
      ["istanbul","ankara"],["ankara","kayseri"],["kayseri","mosul"],

      // ── African rail corridors ──
      // South Africa internal trunk
      ["johannesburg","pretoria"],["johannesburg","durban"],
      ["johannesburg","cape_town"],["pretoria","johannesburg"],
      // Maputo corridor (ZAF ↔ MOZ)
      ["johannesburg","maputo"],["pretoria","maputo"],
      // Beira corridor
      ["harare","beira"],
      // Beitbridge corridor (ZAF ↔ ZWE)
      ["johannesburg","bulawayo"],["bulawayo","harare"],
      // ZAF ↔ BWA
      ["johannesburg","gaborone"],
      // ZWE ↔ ZMB (Victoria Falls)
      ["bulawayo","livingstone"],["livingstone","lusaka"],
      // ZMB ↔ COD (Copperbelt)
      ["lusaka","lubumbashi"],
      // TAZARA (ZMB ↔ TZA)
      ["kapiri_mposhi","dar_es_salaam"],["lusaka","kapiri_mposhi"],
      // ETH ↔ DJI (Addis Ababa – Djibouti SGR)
      ["addis_ababa","dire_dawa"],["dire_dawa","djibouti_city"],
      // KEN ↔ UGA
      ["mombasa","nairobi"],["nairobi","malaba"],["malaba","kampala"],
      // Nacala corridor (MOZ ↔ MWI)
      ["nacala","lilongwe"],["lilongwe","blantyre"],
      ["blantyre","beira"],

      // ── Australian interstate corridors ──
      ["sydney","melbourne"],              // NSW ↔ VIC
      ["sydney","brisbane"],               // NSW ↔ QLD
      ["melbourne","adelaide"],            // VIC ↔ SA
      ["adelaide","broken_hill"],["broken_hill","sydney"], // SA ↔ NSW via Broken Hill
      ["adelaide","alice_springs"],["alice_springs","darwin"], // SA ↔ NT (The Ghan)
      ["brisbane","melbourne"],            // QLD ↔ VIC (via NSW inland)
      ["perth","kalgoorlie"],["kalgoorlie","cook_sa"],["cook_sa","port_augusta"],["port_augusta","adelaide"], // WA ↔ SA via Nullarbor

      // ── Brazilian domestic rail corridors ──
      // Carajás Railway (Vale EFC): Pará → Maranhão
      ["belem","sao_luis"],
      // Vitória–Minas (Vale EFVM): MG → ES
      ["belo_horizonte","vitoria_br"],
      // MRS Logística: MG → SP/RJ
      ["belo_horizonte","sao_paulo"],["belo_horizonte","rio_de_janeiro"],
      ["sao_paulo","campinas"],["campinas","santos"],
      // Rumo grain corridor: MT → SP
      ["cuiaba","campinas"],["campinas","sao_paulo"],
      ["curitiba","sao_paulo"],
      // FCA/VLI: MG → BA
      ["belo_horizonte","salvador"],["sao_paulo","salvador"],
      // Rio Grande do Sul
      ["porto_alegre","florianopolis"],["florianopolis","curitiba"],

      // ── South African domestic corridors ──
      // Sishen–Saldanha (iron ore)
      ["sishen","saldanha"],
      // Richards Bay coal line
      ["emalahleni","richards_bay"],
      // Gauteng ↔ KZN (Natcor)
      ["johannesburg","durban"],["johannesburg","richards_bay"],
      // Gauteng ↔ Western Cape
      ["johannesburg","cape_town"],

      // ── Colombian domestic — Cerrejón coal ──
      ["cerrejon","puerto_bolivar"],

      // ── Moroccan domestic — OCP phosphate ──
      ["khouribga","casablanca"],["khouribga","jorf_lasfar"],["khouribga","safi"],

      // ── Mauritanian domestic — SNIM iron ore ──
      ["zouerat","nouadhibou"],

      // ── China domestic extras ──
      ["taiyuan","beijing"],["hohhot","beijing"],["hohhot","taiyuan"],
      ["nanchang","wuhan"],["nanchang","changsha"],
      ["changsha","wuhan"],["changsha","guangzhou"],
      ["fuzhou_cn","guangzhou"],["fuzhou_cn","nanchang"],
      ["jinan","beijing"],["jinan","zhengzhou"],["jinan","nanjing"],
      ["nanjing","shanghai"],["nanjing","zhengzhou"],
      ["taiyuan","zhengzhou"],["taiyuan","jinan"],

      // ── India domestic extras ──
      ["ranchi","kolkata"],["ranchi","varanasi"],
      ["bhubaneswar","kolkata"],["bhubaneswar","hyderabad_in"],
      ["raipur","nagpur"],["raipur","bhubaneswar"],
      ["nagpur","mumbai"],["nagpur","bhopal"],
      ["bhopal","delhi"],["bhopal","jaipur"],
      ["hyderabad_in","chennai"],["hyderabad_in","nagpur"],
      ["bangalore","chennai"],["bangalore","hyderabad_in"],
      ["panaji","mumbai"],["panaji","bangalore"],
      ["kochi","bangalore"],["kochi","chennai"],

      // ── Russia domestic extras ──
      ["kemerovo","novosibirsk"],["kemerovo","krasnoyarsk"],
      ["murmansk","st_petersburg"],
      ["krasnodar","moscow"],
      ["tyumen","yekaterinburg"],
      ["ufa","chelyabinsk"],["ufa","yekaterinburg"],
      ["chelyabinsk","yekaterinburg"],

      // ── Kazakhstan extras ──
      ["karaganda","astana"],["karaganda","almaty"],
      ["pavlodar","astana"],["pavlodar","karaganda"],
      ["kostanay","astana"],["kostanay","aktobe"],

      // ── Ukraine extras ──
      ["dnipro","kyiv"],["dnipro","zaporizhzhia"],
      ["zaporizhzhia","odesa"],["zaporizhzhia","kharkiv"],
      ["poltava","kyiv"],["poltava","kharkiv"],
      ["cherkasy","kyiv"],["cherkasy","dnipro"],
      ["zhytomyr","kyiv"],["zhytomyr","lviv"],
      ["donetsk","dnipro"],["donetsk","luhansk"],
      ["luhansk","kharkiv"],

      // ── Turkey extras ──
      ["kocaeli","istanbul"],["kocaeli","ankara"],
      ["izmir","ankara"],["izmir","eskisehir"],
      ["erzurum","kayseri"],["erzurum","kars"],

      // ── Uzbekistan extras ──
      ["tashkent","andijan"],["tashkent","samarkand"],
      ["samarkand","bukhara"],["samarkand","navoi"],
      ["navoi","bukhara"],

      // ── Japan domestic ──
      ["tokyo","nagoya"],["nagoya","osaka"],
      ["osaka","fukuoka"],["tokyo","sapporo"],

      // ── South Korea domestic ──
      ["seoul","incheon"],["seoul","daejeon"],["daejeon","busan"],

      // ── Indonesia (Java-Sumatra) ──
      ["palembang","lampung_bj"],["lampung_bj","jakarta"],
      ["jakarta","bandung"],["bandung","semarang"],
      ["semarang","surabaya"],

      // ── Argentina domestic ──
      ["buenos_aires","rosario"],["rosario","cordoba_ar"],
      ["cordoba_ar","tucuman"],
      ["buenos_aires","parana"],["parana","rosario"],

      // ── Chile domestic ──
      ["iquique","antofagasta"],["antofagasta","copiapo"],
      ["copiapo","santiago"],["santiago","valparaiso_cl"],

      // ── Egypt domestic ──
      ["cairo","alexandria_eg"],["cairo","suez_city"],["cairo","aswan"],

      // ── Peru domestic ──
      ["lima","la_oroya"],["la_oroya","arequipa"],["arequipa","tacna"],

      // ── Nigeria domestic ──
      ["lagos","abeokuta"],["abeokuta","ilorin"],
      ["ilorin","abuja"],["abuja","kano"],

      // ── Tunisia domestic ──
      ["gafsa","sfax"],["sfax","sousse"],["sousse","tunis"],["gafsa","tunis"],

      // ── Mongolia extras ──
      ["darkhan","ulaanbaatar"],["erdenet","darkhan"],
      ["sukhbaatar","darkhan"],

      // ── Bangladesh extras ──
      ["chittagong","dhaka"],["dhaka","rangpur"],
      ["dhaka","sylhet"],["dhaka","barisal"],

      // ── Thailand extras ──
      ["bangkok","ratchaburi"],["bangkok","nakhon_ratchasima"],
      ["nakhon_ratchasima","khon_kaen"],["bangkok","chiang_mai"],

      // ── Vietnam extras ──
      ["hanoi","hai_phong"],["hanoi","da_nang"],
      ["da_nang","ho_chi_minh"],

      // ── Myanmar extras ──
      ["yangon","bago"],["bago","mandalay"],["mandalay","taunggyi"],

      // ── North Korea ──
      ["pyongyang","hamhung"],["pyongyang","wonsan"],

      // ── Namibia ──
      ["windhoek","walvis_bay"],

      // ── Ghana ──
      ["takoradi","cape_coast"],["cape_coast","accra"],

      // ── Cameroon ──
      ["douala","yaounde"],["yaounde","bafoussam"],
      ["bafoussam","ngaoundere"],["douala","bafoussam"],

      // ── Senegal ──
      ["dakar","thies"],["thies","kaolack"],

      // ── Jordan ──
      ["maan","aqaba"],

      // ── Cuba ──
      ["havana","camaguey"],["camaguey","santiago_cu"],

      // ── Taiwan ──
      ["taipei","taichung"],["taichung","kaohsiung"],

      // ── Algeria ──
      ["algiers","oran"],

      // ── Sudan ──
      ["khartoum","port_sudan"],

      // ── Cross-border extras ──
      ["shenyang","pyongyang"],           // China-North Korea
      ["hohhot","zamiin_uud"],            // China-Mongolia via Inner Mongolia
      ["windhoek","sishen"],              // Namibia-South Africa
      ["mbabane","maputo"],               // eSwatini-Mozambique
      ["mbabane","johannesburg"],          // eSwatini connectivity
      ["abidjan","ouagadougou"],           // Côte d'Ivoire-Burkina Faso
      ["ngaoundere","ndjamena"],           // Cameroon-Chad
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
      // Turkey, Russia, Ukraine
      TUR: "istanbul",  RUS: "moscow",   UKR: "kyiv",
      // Central Asia, Caucasus, China, Mongolia
      CHN: "zhengzhou",  KAZ: "astana",  MNG: "ulaanbaatar",
      AZE: "baku",       GEO: "tbilisi", UZB: "tashkent",
      // Iran & Middle East
      IRN: "tehran",     IRQ: "baghdad",  AFG: "herat",
      SAU: "riyadh",     ARE: "abu_dhabi",
      // South Asia
      IND: "delhi",      PAK: "lahore",   BGD: "dhaka",
      NPL: "biratnagar", LKA: "chennai",
      // Southeast Asia
      LAO: "vientiane",  VNM: "hanoi",    THA: "bangkok",
      MMR: "mandalay",   MYS: "kuala_lumpur", SGP: "singapore_city",
      // Africa
      ZAF: "johannesburg", MOZ: "maputo",   ZWE: "harare",
      BWA: "gaborone",     ZMB: "lusaka",   COD: "lubumbashi",
      TZA: "dar_es_salaam", ETH: "addis_ababa", DJI: "djibouti_city",
      MWI: "lilongwe",     KEN: "nairobi",  UGA: "kampala",
      // Australia (state codes)
      "AU-NSW": "sydney",    "AU-VIC": "melbourne",
      "AU-QLD": "brisbane",  "AU-SA": "adelaide",
      "AU-WA": "perth",      "AU-NT": "darwin",
      // Brazilian states
      "BR-PA": "belem",         "BR-MA": "sao_luis",
      "BR-MG": "belo_horizonte","BR-ES": "vitoria_br",
      "BR-SP": "sao_paulo",     "BR-RJ": "rio_de_janeiro",
      "BR-MT": "cuiaba",        "BR-PR": "curitiba",
      "BR-BA": "salvador",      "BR-RS": "porto_alegre",
      "BR-SC": "florianopolis",
      // South African provinces
      "ZA-NC": "sishen",        "ZA-WC": "saldanha",
      "ZA-MP": "emalahleni",    "ZA-KZN": "richards_bay",
      "ZA-GP": "johannesburg",
      // Colombia departments
      "CO-LAG": "cerrejon",
      // Morocco regions
      "MA-05": "khouribga",     "MA-06": "casablanca",
      "MA-09": "safi",
      // Mauritania regions
      "MR-07": "zouerat",       "MR-08": "nouadhibou",
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
      // Canada (single entity for cross-border flows)
      "CA": "toronto",
      // Mexico (single entity for cross-border flows)
      "MX": "mexico_city",
      // ── Canadian provinces ──
      "CA-SK": "saskatoon",   "CA-AB": "calgary",     "CA-BC": "vancouver",
      "CA-ON": "toronto",     "CA-MB": "winnipeg",    "CA-QC": "montreal",
      "CA-NB": "moncton",
      // ── Mexican states ──
      "MX-QUE": "queretaro",  "MX-NLE": "monterrey",  "MX-JAL": "guadalajara",
      "MX-AGU": "aguascalientes", "MX-MEX": "mexico_city", "MX-HID": "mexico_city",
      "MX-SIN": "manzanillo", "MX-SON": "nogales",    "MX-CHH": "chihuahua",
      // ── China provinces ──
      "CN-SX": "taiyuan",     "CN-HE": "beijing",     "CN-NM": "hohhot",
      "CN-JX": "nanchang",    "CN-HN": "changsha",    "CN-GD": "guangzhou",
      "CN-GS": "lanzhou",     "CN-XJ": "urumqi",      "CN-SC": "chengdu",
      "CN-JS": "nanjing",     "CN-SN": "xian",        "CN-HL": "harbin",
      "CN-LN": "shenyang",    "CN-JL": "shenyang",    "CN-SH": "shanghai",
      "CN-HB": "wuhan",       "CN-AH": "nanjing",     "CN-YN": "kunming",
      "CN-GZ": "chongqing",   "CN-SD": "jinan",       "CN-ZJ": "shanghai",
      "CN-FJ": "fuzhou_cn",
      // ── India states ──
      "IN-JH": "ranchi",      "IN-OR": "bhubaneswar", "IN-UP": "lucknow",
      "IN-HR": "delhi",       "IN-MH": "mumbai",      "IN-GJ": "ahmedabad",
      "IN-RJ": "jaipur",      "IN-CT": "raipur",      "IN-TN": "chennai",
      "IN-KA": "bangalore",   "IN-AP": "hyderabad_in","IN-WB": "kolkata",
      "IN-BR": "varanasi",    "IN-MP": "bhopal",      "IN-GA": "panaji",
      "IN-DL": "delhi",       "IN-PB": "chandigarh",  "IN-KL": "kochi",
      // ── Russia regions ──
      "RU-KEM": "kemerovo",   "RU-PRI": "vladivostok","RU-LEN": "st_petersburg",
      "RU-MUR": "murmansk",   "RU-KDA": "krasnodar",  "RU-NVS": "novosibirsk",
      "RU-MOW": "moscow",     "RU-SVE": "yekaterinburg","RU-IRK": "irkutsk",
      "RU-KHA": "khabarovsk", "RU-AMU": "chita",      "RU-TYU": "tyumen",
      "RU-BA": "ufa",         "RU-CHE": "chelyabinsk","RU-NVG": "st_petersburg",
      // ── Kazakhstan regions ──
      "KZ-KAR": "karaganda",  "KZ-PAV": "pavlodar",   "KZ-AKM": "astana",
      "KZ-ALA": "almaty",     "KZ-KUS": "kostanay",   "KZ-MAN": "aktau",
      // ── Ukraine oblasts ──
      "UA-12": "dnipro",      "UA-65": "odesa",       "UA-23": "zaporizhzhia",
      "UA-30": "kyiv",        "UA-14": "donetsk",     "UA-44": "luhansk",
      "UA-53": "poltava",     "UA-71": "cherkasy",    "UA-18": "zhytomyr",
      "UA-46": "lviv",        "UA-63": "kharkiv",
      // ── Turkey provinces ──
      "TR-34": "istanbul",    "TR-06": "ankara",      "TR-42": "kocaeli",
      "TR-35": "izmir",       "TR-38": "kayseri",     "TR-25": "erzurum",
      // ── Iran provinces ──
      "IR-23": "isfahan",     "IR-08": "tehran",      "IR-10": "mashhad",
      "IR-07": "bandar_abbas","IR-04": "tabriz",      "IR-06": "khorramshahr",
      // ── Indonesia provinces ──
      "ID-SS": "palembang",   "ID-LA": "lampung_bj",  "ID-JK": "jakarta",
      "ID-JB": "bandung",     "ID-JT": "semarang",    "ID-JI": "surabaya",
      // ── South Korea ──
      "KR-11": "seoul",       "KR-26": "busan",       "KR-28": "incheon",
      "KR-27": "busan",       "KR-30": "daejeon",
      // ── Japan ──
      "JP-13": "tokyo",       "JP-01": "sapporo",     "JP-27": "osaka",
      "JP-40": "fukuoka",     "JP-23": "nagoya",
      // ── Argentina ──
      "AR-B": "buenos_aires", "AR-C": "buenos_aires", "AR-X": "cordoba_ar",
      "AR-S": "rosario",      "AR-T": "tucuman",      "AR-E": "parana",
      // ── Chile ──
      "CL-AN": "antofagasta", "CL-AT": "copiapo",     "CL-TA": "iquique",
      "CL-RM": "santiago",    "CL-VS": "valparaiso_cl",
      // ── Egypt ──
      "EG-C": "cairo",        "EG-ALX": "alexandria_eg","EG-SUZ": "suez_city",
      "EG-ASN": "aswan",
      // ── Uzbekistan ──
      "UZ-TK": "tashkent",    "UZ-AN": "andijan",     "UZ-BU": "bukhara",
      "UZ-SA": "samarkand",   "UZ-NW": "navoi",
      // ── Peru ──
      "PE-JUN": "la_oroya",   "PE-LIM": "lima",       "PE-TAC": "tacna",
      "PE-ARE": "arequipa",
      // ── Nigeria ──
      "NG-LA": "lagos",       "NG-OG": "abeokuta",    "NG-KW": "ilorin",
      "NG-FC": "abuja",       "NG-KN": "kano",
      // ── Tunisia ──
      "TN-12": "gafsa",       "TN-23": "sfax",        "TN-11": "tunis",
      "TN-51": "sousse",
      // ── Mongolia ──
      "MN-1": "darkhan",      "MN-UB": "ulaanbaatar", "MN-047": "erdenet",
      // ── Pakistan ──
      "PK-PB": "lahore",      "PK-SD": "karachi",     "PK-KP": "peshawar",
      "PK-BA": "quetta",
      // ── Bangladesh ──
      "BD-C": "chittagong",   "BD-E": "dhaka",        "BD-D": "rangpur",
      "BD-G": "sylhet",       "BD-A": "barisal",
      // ── Thailand ──
      "TH-10": "bangkok",     "TH-70": "ratchaburi",  "TH-20": "nakhon_ratchasima",
      "TH-40": "khon_kaen",   "TH-90": "hat_yai",     "TH-50": "chiang_mai",
      // ── Vietnam ──
      "VN-HN": "hanoi",       "VN-SG": "ho_chi_minh", "VN-HP": "hai_phong",
      "VN-QN": "hanoi",       "VN-DN": "da_nang",
      // ── Myanmar ──
      "MM-06": "yangon",      "MM-07": "mandalay",    "MM-12": "bago",
      "MM-17": "taunggyi",
      // ── North Korea ──
      "KP-01": "pyongyang",   "KP-06": "hamhung",
      "KP-07": "wonsan",      "KP-04": "pyongyang",
      // ── Namibia ──
      "NA-KU": "windhoek",    "NA-ER": "walvis_bay",  "NA-KH": "windhoek",
      "NAM": "windhoek",
      // ── Ghana ──
      "GH-WP": "takoradi",    "GH-CP": "cape_coast",  "GH-AA": "accra",
      // ── Cameroon ──
      "CM-LT": "douala",      "CM-CE": "yaounde",     "CM-OU": "bafoussam",
      "CM-AD": "ngaoundere",
      // ── Senegal ──
      "SN-DK": "dakar",       "SN-TH": "thies",       "SN-KD": "kaolack",
      // ── Jordan ──
      "JO-MA": "maan",        "JO-AQ": "aqaba",
      // ── Cuba ──
      "CU-03": "havana",      "CU-07": "camaguey",    "CU-13": "santiago_cu",
      // ── Taiwan ──
      "TW-TPE": "taipei",     "TW-KHH": "kaohsiung",  "TW-TXG": "taichung",
      // ── Country-level extras for cross-border ──
      "JPN": "tokyo",  "KOR": "seoul",  "PRK": "pyongyang",
      "IDN": "jakarta","TWN": "taipei",
      "DZA": "algiers","SDN": "khartoum",
      "CIV": "abidjan","BFA": "ouagadougou","TCD": "ndjamena",
      "SWZ": "mbabane","NGA": "lagos",  "EGY": "cairo",
      "GHA": "accra",  "CMR": "douala", "SEN": "dakar",
      "JOR": "maan",   "CUB": "havana", "TUN": "tunis",
      "PER": "lima",   "ARG": "buenos_aires", "CHL": "santiago",
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
    // Region classification for normalization and color distribution
    const ASIA_ISOS = new Set([
      'CHN','KAZ','MNG','AZE','GEO','UZB','TKM','KGZ','TJK','RUS','BLR',
      'IND','PAK','BGD','NPL','LKA',
      'IRN','IRQ','AFG','SAU','ARE',
      'LAO','VNM','THA','MMR','MYS','SGP',
      'JPN','KOR','PRK','IDN','TWN',
    ]);
    const ASIA_PFX = ['CN-','IN-','RU-','KZ-','MN-','UZ-','PK-','BD-','IR-','VN-','TH-','MM-','KP-','JP-','KR-','ID-','TW-'];
    const US_PFX = ['US-','CA-','MX-'];
    function flowRegion(orig: string, dest: string): 'us' | 'eu' | 'asia' {
      if (US_PFX.some(p => orig.startsWith(p)) || orig === 'CA' || orig === 'MX') return 'us';
      if (ASIA_ISOS.has(orig) || ASIA_ISOS.has(dest)
        || ASIA_PFX.some(p => orig.startsWith(p)) || ASIA_PFX.some(p => dest.startsWith(p))) return 'asia';
      return 'eu';
    }

    // Normalize width separately per region so each uses its own scale
    const usFlows = railFreight.filter((rf) => flowRegion(rf.origin_iso, rf.destination_iso) === 'us');
    const euFlows = railFreight.filter((rf) => flowRegion(rf.origin_iso, rf.destination_iso) === 'eu');
    const asiaFlows = railFreight.filter((rf) => flowRegion(rf.origin_iso, rf.destination_iso) === 'asia');
    const maxTonnesUS = Math.max(...usFlows.map((rf) => rf.tonnes), 1);
    const maxTonnesEU = Math.max(...euFlows.map((rf) => rf.tonnes), 1);
    const maxTonnesAsia = Math.max(...asiaFlows.map((rf) => rf.tonnes), 1);

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

    // Split valid flows into region groups for independent color indexing
    const regionValidIndices: Record<string, number[]> = { us: [], eu: [], asia: [] };
    validFlows.forEach((rf, i) => {
      regionValidIndices[flowRegion(rf.origin_iso, rf.destination_iso)].push(i);
    });

    const flowColorsCss: string[] = [];
    let flowIdx = 0;
    validFlows.forEach((rf, vi) => {
      const path = railRoute(rf.origin_iso, rf.destination_iso);
      if (!path || path.length < 2) return;

      const reg = flowRegion(rf.origin_iso, rf.destination_iso);
      const regionMax = reg === 'us' ? maxTonnesUS : reg === 'asia' ? maxTonnesAsia : maxTonnesEU;
      const norm = Math.sqrt(rf.tonnes / regionMax);
      const width = 2 + norm * 12;

      // Lane-based lateral offset so flows in the same corridor don't overlap
      const side = flowLaneOffset[vi];

      // Unique color per flow — hues distributed independently per region
      const regionIndices = regionValidIndices[reg];
      const regionIdx = regionIndices.indexOf(vi);
      const hue = (regionIdx / regionIndices.length) * 360;
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

      // Estimated flows use dashed lines; real data uses solid arrows
      const material = rf.estimated
        ? new PolylineDashMaterialProperty({ color: flowColor, dashLength: 12, dashPattern: 255 })
        : new PolylineArrowMaterialProperty(flowColor);

      viewer.entities.add({
        name: `rail_freight_${flowIdx}`,
        polyline: {
          positions,
          width,
          material,
          clampToGround: true,
        },
      });
      railFlowOriginalColors.current.set(`rail_freight_${flowIdx}`, flowColor);
      railFlowOriginalWidths.current.set(`rail_freight_${flowIdx}`, width);
      railFlowEstimated.current.set(`rail_freight_${flowIdx}`, rf.estimated);
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
  }, [railFreight, layers.railroads]);

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
      const isEstimated = railFlowEstimated.current.get(n) ?? false;
      if (!origColor || origWidth == null) return;

      // Helper to create the correct material type (dashed for estimated, arrow for real)
      const makeMat = (c: Color) => isEstimated
        ? new PolylineDashMaterialProperty({ color: c, dashLength: 12, dashPattern: 255 })
        : new PolylineArrowMaterialProperty(c);

      if (selectedRailFlow === null) {
        // No selection — restore all to original
        entity.polyline.material = makeMat(origColor) as any;
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
          entity.polyline.material = makeMat(bright) as any;
          entity.polyline.width = (origWidth * 1.4) as any;
        } else {
          // Other flows — keep their color but slightly faded
          const faded = new Color(
            origColor.red * 0.6 + 0.15,
            origColor.green * 0.6 + 0.15,
            origColor.blue * 0.6 + 0.15,
            0.45
          );
          entity.polyline.material = makeMat(faded) as any;
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
