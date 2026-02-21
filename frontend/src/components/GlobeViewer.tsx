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
  HeightReference,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  PolylineArrowMaterialProperty,
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
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import type {
  CountryMacro,
  TradeFlowAggregated,
  PortData,
  ShippingDensityPoint,
  ConflictZone,
  CommodityFlowEdge,
} from "@/lib/api";

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
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const distMeters = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6_371_000;
  const maxHeight = Math.min(distMeters * heightScale, 4_000_000); // cap at 4000km

  const points: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lon = lon1 + (lon2 - lon1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    const height = maxHeight * 4 * t * (1 - t); // parabolic
    points.push(lon, lat, height);
  }
  return points;
}

export type MapStyle = "satellite" | "physical" | "dark" | "street" | "natgeo";

const MAP_TILE_PROVIDERS: Record<MapStyle, { url: string; subdomains?: string[]; credit: string; maxZoom: number; label: string; icon: string }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    label: "Satellite",
    icon: "🛰",
  },
  physical: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri, HERE, Garmin, FAO, USGS — © OpenStreetMap contributors",
    maxZoom: 19,
    label: "Terrain",
    icon: "🏔",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c", "d"],
    credit: "© OpenStreetMap contributors, © CARTO",
    maxZoom: 20,
    label: "Dark",
    icon: "🌑",
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
    credit: "© OpenStreetMap contributors",
    maxZoom: 19,
    label: "Street",
    icon: "🗺",
  },
  natgeo: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    credit: "National Geographic, Esri, Garmin, HERE, UNEP-WCMC, NASA, ESA",
    maxZoom: 16,
    label: "NatGeo",
    icon: "🌍",
  },
};

interface GlobeViewerProps {
  countries: CountryMacro[];
  tradeFlows: TradeFlowAggregated[];
  ports: PortData[];
  shippingDensity: ShippingDensityPoint[];
  conflictZones?: ConflictZone[];
  liveTradeArcs?: TradeFlowAggregated[];
  commodityFlows?: CommodityFlowEdge[];
  layers: {
    countries: boolean;
    tradeFlows: boolean;
    ports: boolean;
    shippingDensity: boolean;
  };
  indicator: string;
  mapStyle?: MapStyle;
  onMapStyleChange?: (style: MapStyle) => void;
  onCountryClick?: (country: CountryMacro) => void;
  flyToCountry?: CountryMacro | null;
  flyToPosition?: { lon: number; lat: number; altitude: number } | null;
  highlightCountryIso?: string | null;
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
  liveTradeArcs = [],
  commodityFlows = [],
  layers,
  indicator,
  mapStyle = "satellite",
  onMapStyleChange,
  onCountryClick,
  flyToCountry,
  flyToPosition,
  highlightCountryIso,
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

    // Add initial map style imagery
    const initStyle = MAP_TILE_PROVIDERS["satellite"];
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: initStyle.url,
        ...(initStyle.subdomains ? { subdomains: initStyle.subdomains } : {}),
        credit: initStyle.credit,
        minimumLevel: 0,
        maximumLevel: initStyle.maxZoom,
      })
    );

    // Deep-space background + ocean-blue globe base
    viewer.scene.backgroundColor = Color.fromCssColorString("#020209");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#1a3a5c");
    viewer.scene.globe.showGroundAtmosphere = true;
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
      viewer.scene.skyAtmosphere.saturationShift = -0.1;
    }

    // ── Fog for atmospheric depth (subtle — doesn't obscure close zoom) ──
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 5.0e-5;
    viewer.scene.fog.minimumBrightness = 0.03;

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

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // ─── Switch map style when prop changes ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const style = MAP_TILE_PROVIDERS[mapStyle];
    if (!style) return;

    // Remove all existing imagery layers
    viewer.imageryLayers.removeAll();

    // Add new style
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: style.url,
        ...(style.subdomains ? { subdomains: style.subdomains } : {}),
        credit: style.credit,
        minimumLevel: 0,
        maximumLevel: style.maxZoom,
      })
    );

    // Adjust globe base color per style
    if (mapStyle === "dark") {
      viewer.scene.globe.baseColor = Color.fromCssColorString("#080c14");
    } else {
      viewer.scene.globe.baseColor = Color.fromCssColorString("#1a3a5c");
    }
  }, [mapStyle]);

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

    // Remove existing country entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("country_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.countries || countries.length === 0) return;

    // Calculate value range for color mapping
    const computeValue = (c: CountryMacro): number | null | undefined => {
      switch (indicator) {
        case "gdp": return c.gdp;
        case "trade_balance": return c.trade_balance;
        case "current_account": return c.current_account;
        case "export_value": return c.export_value;
        case "trade_openness": {
          if (c.gdp && c.export_value != null && c.import_value != null && c.gdp > 0)
            return ((c.export_value + c.import_value) / c.gdp) * 100;
          return null;
        }
        case "import_dependency": {
          if (c.gdp && c.import_value != null && c.gdp > 0)
            return (c.import_value / c.gdp) * 100;
          return null;
        }
        default: return c.gdp;
      }
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
      const isDiverging = indicator === "trade_balance" || indicator === "current_account";
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
        indicator === "trade_openness" || indicator === "import_dependency"
          ? `${rawValue.toFixed(1)}%`
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
  }, [countries, layers.countries, indicator]);

  // ─── Render Trade Flow Lines (only when a country is selected) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.tradeFlows || tradeFlows.length === 0) return;

    // If a country is selected, filter to its flows; otherwise show all globally
    const isCountryMode = !!highlightCountryIso;
    const visibleFlows = isCountryMode
      ? tradeFlows.filter(
          (f) =>
            f.exporter_iso === highlightCountryIso ||
            f.importer_iso === highlightCountryIso
        )
      : tradeFlows;

    if (visibleFlows.length === 0) return;

    const maxValue = Math.max(...visibleFlows.map((f) => f.total_value_usd));

    visibleFlows.forEach((flow, index) => {
      if (
        !flow.exporter_lat ||
        !flow.exporter_lon ||
        !flow.importer_lat ||
        !flow.importer_lon
      )
        return;

      const normalized = flow.total_value_usd / maxValue;
      // Use power curve so only the largest flows are truly thick
      const curve = Math.pow(normalized, 0.6);

      // Width: thin for small flows, bold for large ones
      const width = isCountryMode
        ? 1.5 + curve * 8
        : 1 + curve * 6;

      // Alpha for the arrow color
      const alpha = isCountryMode
        ? 0.35 + curve * 0.55
        : 0.2 + curve * 0.5;

      // Green at exporter, smoothly transitions to red at importer
      const greenBase = new Color(30/255, 200/255, 80/255, alpha);
      const redBase = new Color(220/255, 50/255, 50/255, alpha);
      const lerpScratch = new Color();

      // 3D elevated arc positions — height also scales with magnitude
      const arcPoints = computeArcPositions(
        flow.exporter_lon, flow.exporter_lat,
        flow.importer_lon, flow.importer_lat,
        40, 0.08 + curve * 0.18
      );

      const isExportLabel =
        isCountryMode && flow.exporter_iso === highlightCountryIso;

      // Only the moving arrow is visible — no static underlying line
      const arcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);
      const pulseLen = Math.max(6, Math.floor(arcCartesian.length * 0.2));
      const animSpeed = 6000;
      const stagger = index * 317;

      // Single arrow that transitions green → red based on journey progress
      viewer.entities.add({
        name: `flow_${index}`,
        polyline: {
          positions: new CallbackProperty(() => {
            const t = ((Date.now() + stagger) % animSpeed) / animSpeed;
            const maxStart = Math.max(0, arcCartesian.length - pulseLen);
            const startIdx = Math.floor(t * maxStart);
            return arcCartesian.slice(startIdx, startIdx + pulseLen);
          }, false),
          width: width,
          material: new PolylineArrowMaterialProperty(
            new CallbackProperty(() => {
              const t = ((Date.now() + stagger) % animSpeed) / animSpeed;
              return Color.lerp(greenBase, redBase, t, lerpScratch);
            }, false)
          ),
          arcType: ArcType.NONE,
        },
        description: `
          <h3>${isCountryMode ? (isExportLabel ? "Export" : "Import") : "Trade Flow"}</h3>
          <p>${flow.exporter_iso} → ${flow.importer_iso}</p>
          <p>Value: $${(flow.total_value_usd / 1e9).toFixed(2)}B</p>
        `,
      });
    });
  }, [tradeFlows, layers.tradeFlows, highlightCountryIso]);

  // ─── Render Live Trade Arcs (from WebSocket) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("live_arc_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.tradeFlows || liveTradeArcs.length === 0) return;

    liveTradeArcs.forEach((arc, i) => {
      if (!arc.exporter_lat || !arc.exporter_lon || !arc.importer_lat || !arc.importer_lon) return;

      const value = arc.total_value_usd || 100_000_000;
      const width = Math.min(3 + (value / 500_000_000) * 4, 8);

      // 3D elevated arc
      const arcPoints = computeArcPositions(
        arc.exporter_lon, arc.exporter_lat,
        arc.importer_lon, arc.importer_lat,
        40, 0.22
      );

      // Single arrow that transitions green → red based on journey progress
      const liveArcCartesian = Cartesian3.fromDegreesArrayHeights(arcPoints);
      const livePulseLen = Math.max(6, Math.floor(liveArcCartesian.length * 0.2));
      const liveSpeed = 6000;
      const liveStagger = i * 293;

      const greenBase = new Color(30/255, 200/255, 80/255, 0.75);
      const redBase = new Color(220/255, 50/255, 50/255, 0.75);
      const lerpScratch = new Color();

      viewer.entities.add({
        name: `live_arc_${i}`,
        polyline: {
          positions: new CallbackProperty(() => {
            const t = ((Date.now() + liveStagger) % liveSpeed) / liveSpeed;
            const maxStart = Math.max(0, liveArcCartesian.length - livePulseLen);
            const startIdx = Math.floor(t * maxStart);
            return liveArcCartesian.slice(startIdx, startIdx + livePulseLen);
          }, false),
          width: width,
          material: new PolylineArrowMaterialProperty(
            new CallbackProperty(() => {
              const t = ((Date.now() + liveStagger) % liveSpeed) / liveSpeed;
              return Color.lerp(greenBase, redBase, t, lerpScratch);
            }, false)
          ),
          arcType: ArcType.NONE,
        },
      });
    });
  }, [liveTradeArcs, layers.tradeFlows]);

  // ─── Render Port Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("port_") || e.name?.startsWith("port_glow_") || e.name?.startsWith("port_pillar_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.ports || ports.length === 0) return;

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
          outline: true,
          outlineColor: cesiumColor.withAlpha(0.35),
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      });
    });
  }, [ports, layers.ports]);

  // ─── Render Shipping Density Heatmap ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("density_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.shippingDensity || shippingDensity.length === 0) return;

    const maxDensity = Math.max(...shippingDensity.map((d) => d.density_value));

    shippingDensity.forEach((point, index) => {
      const normalized = point.density_value / maxDensity;
      const alpha = 0.15 + normalized * 0.6;

      // Heat color: blue → yellow → red
      let r: number, g: number, b: number;
      if (normalized < 0.5) {
        r = Math.round(normalized * 2 * 255);
        g = Math.round(normalized * 2 * 255);
        b = Math.round(255 - normalized * 2 * 200);
      } else {
        r = 255;
        g = Math.round(255 - (normalized - 0.5) * 2 * 255);
        b = 0;
      }

      const radius = 40000 + normalized * 80000;
      const densityHeight = 15000 + normalized * 250000; // extruded 3D columns

      viewer.entities.add({
        name: `density_${index}`,
        position: Cartesian3.fromDegrees(point.lon, point.lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: 0,
          extrudedHeight: densityHeight,
          material: Color.fromBytes(r, g, b, Math.round(alpha * 255)),
          outline: true,
          outlineColor: Color.fromBytes(r, g, b, Math.round(alpha * 100)),
          outlineWidth: 1,
        },
      });
    });
  }, [shippingDensity, layers.shippingDensity]);

  // ─── Render Conflict Zone Overlays ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove existing conflict zone entities
    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("conflict_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!conflictZones || conflictZones.length === 0) return;

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
  }, [conflictZones]);

  // ─── Render Commodity Flow Arcs (Gold) ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("commodity_flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (commodityFlows.length === 0) return;

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
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Zoom controls — left side, vertically centered */}
      <div
        style={{
          position: "absolute",
          left: 16,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 50,
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

        {/* Spacer */}
        <div style={{ height: 8 }} />

        {/* Map style buttons */}
        {(Object.keys(MAP_TILE_PROVIDERS) as MapStyle[]).map((key) => {
          const provider = MAP_TILE_PROVIDERS[key];
          const isActive = mapStyle === key;
          return (
            <button
              key={key}
              onClick={() => onMapStyleChange?.(key)}
              title={provider.label}
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border: isActive
                  ? "2px solid rgba(0,200,255,0.9)"
                  : "1px solid rgba(255,255,255,0.2)",
                background: isActive
                  ? "rgba(0,120,200,0.5)"
                  : "rgba(10,15,30,0.85)",
                color: "#fff",
                fontSize: 15,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                backdropFilter: "blur(6px)",
                transition: "all 0.2s",
              }}
            >
              {provider.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default GlobeViewer;
