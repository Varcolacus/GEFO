"use client";

// Set CESIUM_BASE_URL before any Cesium imports resolve assets
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CESIUM_BASE_URL = "/cesium";
}

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  ArcType,
  NearFarScalar,
  HeightReference,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  OpenStreetMapImageryProvider,
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
} from "@/lib/api";

// Disable Cesium Ion — uses OpenStreetMap imagery + flat terrain
Ion.defaultAccessToken = "";

interface GlobeViewerProps {
  countries: CountryMacro[];
  tradeFlows: TradeFlowAggregated[];
  ports: PortData[];
  shippingDensity: ShippingDensityPoint[];
  layers: {
    countries: boolean;
    tradeFlows: boolean;
    ports: boolean;
    shippingDensity: boolean;
  };
  indicator: string;
  onCountryClick?: (country: CountryMacro) => void;
}

export default function GlobeViewer({
  countries,
  tradeFlows,
  ports,
  shippingDensity,
  layers,
  indicator,
  onCountryClick,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

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
      skyBox: false,
      skyAtmosphere: undefined,
      creditContainer,
      baseLayer: new ImageryLayer(
        new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        })
      ),
      terrainProvider: new EllipsoidTerrainProvider(),
    });

    // Set dark background
    viewer.scene.backgroundColor = Color.fromCssColorString("#0a0a1a");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#1a1a2e");
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.enableLighting = false;

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
    const values = countries
      .map((c) => {
        switch (indicator) {
          case "gdp": return c.gdp;
          case "trade_balance": return c.trade_balance;
          case "current_account": return c.current_account;
          case "export_value": return c.export_value;
          default: return c.gdp;
        }
      })
      .filter((v): v is number => v != null && v !== 0);

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);

    countries.forEach((country) => {
      if (!country.centroid_lat || !country.centroid_lon) return;

      const rawValue = (() => {
        switch (indicator) {
          case "gdp": return country.gdp;
          case "trade_balance": return country.trade_balance;
          case "current_account": return country.current_account;
          case "export_value": return country.export_value;
          default: return country.gdp;
        }
      })();

      if (rawValue == null) return;

      // Normalize to 0-1
      let normalized: number;
      if (indicator === "trade_balance" || indicator === "current_account") {
        // Diverging: red for negative, green for positive
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        normalized = (rawValue + absMax) / (2 * absMax);
      } else {
        normalized = maxVal > minVal ? (rawValue - minVal) / (maxVal - minVal) : 0.5;
      }

      // Color interpolation
      let color: Color;
      if (indicator === "trade_balance" || indicator === "current_account") {
        color = Color.fromCssColorString(
          normalized < 0.5
            ? `rgba(${Math.round(220 - normalized * 200)}, ${Math.round(50 + normalized * 150)}, 50, 0.8)`
            : `rgba(50, ${Math.round(100 + normalized * 155)}, ${Math.round(50 + normalized * 100)}, 0.8)`
        );
      } else {
        const hue = normalized * 0.35; // 0 (red) to 0.35 (green)
        color = Color.fromHsl(hue, 0.8, 0.45 + normalized * 0.2, 0.85);
      }

      const radius = 80000 + normalized * 350000;

      const formattedValue =
        Math.abs(rawValue) >= 1e9
          ? `$${(rawValue / 1e9).toFixed(1)}B`
          : Math.abs(rawValue) >= 1e6
          ? `$${(rawValue / 1e6).toFixed(1)}M`
          : `$${rawValue.toFixed(0)}`;

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
          material: color,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: country.iso_code,
          font: "12px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian3(0, -15, 0) as any,
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
      (e) => e.name?.startsWith("flow_")
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

      const normalized = flow.total_value_usd / maxValue;
      const width = 1 + normalized * 6;
      const alpha = 0.3 + normalized * 0.5;

      viewer.entities.add({
        name: `flow_${index}`,
        polyline: {
          positions: Cartesian3.fromDegreesArray([
            flow.exporter_lon,
            flow.exporter_lat,
            flow.importer_lon,
            flow.importer_lat,
          ]),
          width: width,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Color.fromCssColorString(
              `rgba(0, 180, 255, ${alpha})`
            ),
          }),
          arcType: ArcType.GEODESIC,
        },
        description: `
          <h3>Trade Flow</h3>
          <p>${flow.exporter_iso} → ${flow.importer_iso}</p>
          <p>Value: $${(flow.total_value_usd / 1e9).toFixed(2)}B</p>
        `,
      });
    });
  }, [tradeFlows, layers.tradeFlows]);

  // ─── Render Port Markers ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("port_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!layers.ports || ports.length === 0) return;

    ports.forEach((port) => {
      const throughput = port.throughput_teu || port.throughput_tons || 0;
      const size = Math.min(12 + Math.log10(Math.max(throughput, 1)) * 3, 30);

      const colorMap: Record<string, string> = {
        container: "#00ff88",
        oil: "#ff6600",
        bulk: "#ffcc00",
        transit: "#cc66ff",
      };
      const color = colorMap[port.port_type || "container"] || "#00ff88";

      viewer.entities.add({
        name: `port_${port.id}`,
        position: Cartesian3.fromDegrees(port.lon, port.lat),
        point: {
          pixelSize: size,
          color: Color.fromCssColorString(color),
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e6, 1, 1e7, 0.5),
        },
        label: {
          text: port.name,
          font: "11px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
