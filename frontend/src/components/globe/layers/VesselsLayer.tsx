"use client";

import { useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Cartesian2,
  Color,
  ArcType,
  NearFarScalar,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
} from "cesium";

import type { VesselPosition, PortData } from "@/lib/api";

interface VesselsLayerProps {
  viewer: Viewer;
  vesselsEnabled: boolean;
  portsEnabled: boolean;
  vessels: VesselPosition[];
  ports: PortData[];
}

/**
 * Renders live vessel positions + a port-proximity overlay.
 *
 * Vessels:
 *   Type-colored points with name labels; vessels moving >0.5 kn get a
 *   short heading indicator polyline. Entities tagged `vessel_<i>` and
 *   `vessel_hdg_<i>`.
 *
 * Port-vessel proximity (active only when BOTH layers are on):
 *   Highlights ships within 50 km of any port. Each affected port gets
 *   a translucent ring, a "N 🚢" count badge, and thin connecting lines
 *   to each nearby vessel. Entities tagged `prox_ring_<id>`,
 *   `prox_count_<id>`, `prox_line_<id>_<i>`.
 */
export function VesselsLayer({
  viewer,
  vesselsEnabled,
  portsEnabled,
  vessels,
  ports,
}: VesselsLayerProps) {
  // ── Vessel markers ──
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("vessel_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!vesselsEnabled || vessels.length === 0) { viewer.entities.resumeEvents(); return; }

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
  }, [viewer, vesselsEnabled, vessels]);

  // ── Port-vessel proximity overlay ──
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("prox_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    // Only show when both layers are active and have data
    if (!portsEnabled || !vesselsEnabled || ports.length === 0 || vessels.length === 0) {
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
  }, [viewer, vesselsEnabled, portsEnabled, vessels, ports]);

  return null;
}
