"use client";

import { useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  NearFarScalar,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  UrlTemplateImageryProvider,
} from "cesium";

import type { PortData } from "@/lib/api";
import { findOverlayLayer } from "../lib/overlay-utils";

interface PortsLayerProps {
  viewer: Viewer;
  enabled: boolean;
  ports: PortData[];
  category: string;
}

/**
 * Renders the Ports layer as TWO things:
 *
 * 1. OpenSeaMap nautical-features tile overlay (imagery layer tagged
 *    `seaPorts`), toggled by `enabled`. Thousands of nautical marks.
 *
 * 2. Database ports as 3D pillars with color-coded points, name labels,
 *    and outer glow rings. Filtered by `category` ("all" or a specific
 *    port_type). Entities tagged `port_<id>`, `port_pillar_<id>`,
 *    `port_glow_<id>`.
 */
export function PortsLayer({ viewer, enabled, ports, category }: PortsLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("port_") || e.name?.startsWith("port_glow_") || e.name?.startsWith("port_pillar_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    // ── OpenSeaMap tile overlay (thousands of nautical features) ──
    const existingSeaPorts = findOverlayLayer(viewer, "seaPorts");
    if (enabled && !existingSeaPorts) {
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
    } else if (!enabled && existingSeaPorts) {
      viewer.imageryLayers.remove(existingSeaPorts, false);
    }

    if (!enabled || ports.length === 0) { viewer.entities.resumeEvents(); return; }

    // ── Database ports (3D pillars & info) ──
    const filteredPorts = category === "all" ? ports : ports.filter(p => p.port_type === category);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [viewer, enabled, ports, category]);

  return null;
}
