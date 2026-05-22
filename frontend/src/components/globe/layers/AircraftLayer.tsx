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

import type { AircraftPosition } from "@/lib/api";

interface AircraftLayerProps {
  viewer: Viewer;
  enabled: boolean;
  aircraft: AircraftPosition[];
}

/**
 * Renders live aircraft positions as colored points with callsign labels.
 * Moving aircraft (>10 kn) get a heading indicator line.
 *
 * Color scheme by category: heavy=red, large=orange, small=cyan, light=lime,
 * rotorcraft=violet, other=slate.
 *
 * Entities are tagged `aircraft_<i>` (point) and `aircraft_hdg_<i>` (heading).
 */
export function AircraftLayer({ viewer, enabled, aircraft }: AircraftLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("aircraft_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!enabled || aircraft.length === 0) { viewer.entities.resumeEvents(); return; }

    const catColors: Record<string, string> = {
      heavy:      "#ef4444",
      large:      "#f97316",
      small:      "#22d3ee",
      light:      "#84cc16",
      rotorcraft: "#a78bfa",
      other:      "#94a3b8",
    };

    aircraft.forEach((ac, i) => {
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
  }, [viewer, enabled, aircraft]);

  return null;
}
