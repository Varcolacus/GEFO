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

// Disable Cesium Ion — uses CartoDB Dark Matter imagery + flat terrain
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
  const maxHeight = Math.min(distMeters * heightScale, 2_500_000); // cap at 2500km

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
      baseLayer: new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          subdomains: ["a", "b", "c", "d"],
          credit: "CartoDB Dark Matter",
          minimumLevel: 0,
          maximumLevel: 18,
        })
      ),
      terrainProvider: new EllipsoidTerrainProvider(),
    });

    // Deep-space background + dark globe base
    viewer.scene.backgroundColor = Color.fromCssColorString("#020209");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#080c14");
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.enableLighting = true;

    // ── Bloom post-processing for glowing arcs & markers ──
    viewer.scene.postProcessStages.bloom.enabled = true;
    viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false;
    viewer.scene.postProcessStages.bloom.uniforms.contrast = 128;
    viewer.scene.postProcessStages.bloom.uniforms.brightness = -0.2;
    viewer.scene.postProcessStages.bloom.uniforms.delta = 1.0;
    viewer.scene.postProcessStages.bloom.uniforms.sigma = 3.8;
    viewer.scene.postProcessStages.bloom.uniforms.stepSize = 5.0;

    // ── Atmosphere tuning ──
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.brightnessShift = 0.0;
      viewer.scene.skyAtmosphere.hueShift = 0.0;
      viewer.scene.skyAtmosphere.saturationShift = -0.1;
    }

    // Initial camera position
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(20, 20, 20000000),
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

  // ─── Fly to country when requested ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToCountry || !flyToCountry.centroid_lat || !flyToCountry.centroid_lon) return;

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToCountry.centroid_lon,
        flyToCountry.centroid_lat,
        4000000 // 4,000 km altitude for good country view
      ),
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

      const radius = 60000 + normalized * 280000;
      const extrudeHeight = 30000 + normalized * 600000; // 3D column height

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

  // ─── Render Trade Flow Lines ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("flow_") || e.name?.startsWith("flow_glow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.tradeFlows || tradeFlows.length === 0) return;

    const maxValue = Math.max(...tradeFlows.map((f) => f.total_value_usd));

    tradeFlows.forEach((flow, index) => {
      if (
        !flow.exporter_lat ||
        !flow.exporter_lon ||
        !flow.importer_lat ||
        !flow.importer_lon
      )
        return;

      // If a country is highlighted, only show flows involving that country
      const isHighlighted = highlightCountryIso
        ? flow.exporter_iso === highlightCountryIso || flow.importer_iso === highlightCountryIso
        : true;

      if (highlightCountryIso && !isHighlighted) return;

      const normalized = flow.total_value_usd / maxValue;
      const width = 2 + normalized * 8;
      const alpha = 0.5 + normalized * 0.45;

      // Color: exports from highlighted = cyan, imports to highlighted = amber
      let lineColor: string;
      let glowColor: string;
      if (highlightCountryIso) {
        if (flow.exporter_iso === highlightCountryIso) {
          lineColor = `rgba(0, 230, 255, ${alpha})`;
          glowColor = `rgba(0, 180, 255, ${alpha * 0.35})`;
        } else {
          lineColor = `rgba(255, 170, 30, ${alpha})`;
          glowColor = `rgba(255, 120, 0, ${alpha * 0.35})`;
        }
      } else {
        lineColor = `rgba(0, 210, 255, ${alpha})`;
        glowColor = `rgba(0, 150, 255, ${alpha * 0.35})`;
      }

      // 3D elevated arc positions
      const arcPoints = computeArcPositions(
        flow.exporter_lon, flow.exporter_lat,
        flow.importer_lon, flow.importer_lat,
        30, 0.12 + normalized * 0.08
      );

      // Main directional arrow arc
      viewer.entities.add({
        name: `flow_${index}`,
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
          width: width,
          material: new PolylineArrowMaterialProperty(
            Color.fromCssColorString(lineColor)
          ),
          arcType: ArcType.NONE,
        },
        description: `
          <h3>Trade Flow</h3>
          <p>${flow.exporter_iso} → ${flow.importer_iso}</p>
          <p>Value: $${(flow.total_value_usd / 1e9).toFixed(2)}B</p>
        `,
      });

      // Glow underlay for all visible flows
      if (normalized > 0.15) {
        viewer.entities.add({
          name: `flow_glow_${index}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
            width: width + 6,
            material: new PolylineGlowMaterialProperty({
              glowPower: 0.25 + normalized * 0.2,
              color: Color.fromCssColorString(glowColor),
            }),
            arcType: ArcType.NONE,
          },
        });
      }
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
        30, 0.18
      );

      // Magenta arc to distinguish from static trade flows
      viewer.entities.add({
        name: `live_arc_${i}`,
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
          width: width,
          material: new PolylineArrowMaterialProperty(
            Color.fromCssColorString("rgba(255, 60, 210, 0.85)")
          ),
          arcType: ArcType.NONE,
        },
      });

      // Bright glow underlay
      viewer.entities.add({
        name: `live_arc_glow_${i}`,
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(arcPoints),
          width: width + 8,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.45,
            color: Color.fromCssColorString("rgba(255, 60, 210, 0.25)"),
          }),
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
      (e) => e.name?.startsWith("port_") || e.name?.startsWith("port_glow_")
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

      // Inner bright point
      viewer.entities.add({
        name: `port_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat),
        point: {
          pixelSize: size,
          color: cesiumColor,
          outlineColor: Color.WHITE.withAlpha(0.6),
          outlineWidth: 1.5,
          heightReference: HeightReference.CLAMP_TO_GROUND,
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

      const radius = 50000 + normalized * 100000;

      viewer.entities.add({
        name: `density_${index}`,
        position: Cartesian3.fromDegrees(point.lon, point.lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: 0,
          material: Color.fromBytes(r, g, b, Math.round(alpha * 255)),
          heightReference: HeightReference.CLAMP_TO_GROUND,
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
          material: fillColor,
          outline: true,
          outlineColor: borderColor,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
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
        30, 0.14
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
});

export default GlobeViewer;
