"use client";

import { useEffect } from "react";
import { Viewer, Cartesian3, Color } from "cesium";

import { SHIPPING_CORRIDORS } from "@/lib/shipping-corridors";

interface ShippingDensityLayerProps {
  viewer: Viewer;
  enabled: boolean;
}

/**
 * Renders shipping density corridors as colored polygons.
 * Heat color ramp: blue → cyan → yellow → orange → red, alpha 0.10..0.40.
 *
 * Data source: SHIPPING_CORRIDORS (frontend/src/lib/shipping-corridors.ts).
 * Entities are tagged `density_<index>` for tracking and cleanup.
 */
export function ShippingDensityLayer({ viewer, enabled }: ShippingDensityLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("density_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!enabled) { viewer.entities.resumeEvents(); return; }

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
  }, [viewer, enabled]);

  return null;
}
