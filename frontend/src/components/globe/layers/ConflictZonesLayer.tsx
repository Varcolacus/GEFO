"use client";

import { useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
} from "cesium";

import type { ConflictZone } from "@/lib/api";

interface ConflictZonesLayerProps {
  viewer: Viewer;
  zones: ConflictZone[];
}

/**
 * Renders geopolitical conflict zones as colored ellipses with severity-based
 * colors (red/orange/yellow/gray) and labeled icons by zone type.
 *
 * Each zone produces one entity tagged `conflict_<zone.id>`.
 */
export function ConflictZonesLayer({ viewer, zones }: ConflictZonesLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("conflict_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!zones || zones.length === 0) { viewer.entities.resumeEvents(); return; }

    zones.forEach((zone) => {
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
  }, [viewer, zones]);

  return null;
}
