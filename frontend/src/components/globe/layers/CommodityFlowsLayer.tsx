"use client";

import { useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  ArcType,
  PolylineArrowMaterialProperty,
  PolylineGlowMaterialProperty,
} from "cesium";

import type { CommodityFlowEdge } from "@/lib/api";
import { computeArcPositions } from "../lib/geometry";

interface CommodityFlowsLayerProps {
  viewer: Viewer;
  flows: CommodityFlowEdge[];
}

/**
 * Renders commodity flow edges as gold/amber arcs with a glow underlay.
 *
 * Each edge produces two entities tagged `commodity_flow_<i>` (arrow) and
 * `commodity_flow_glow_<i>` (glow), both cleaned up by the prefix filter.
 *
 * Visibility is implicit: passing an empty flows array clears the layer.
 */
export function CommodityFlowsLayer({ viewer, flows }: CommodityFlowsLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("commodity_flow_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (flows.length === 0) { viewer.entities.resumeEvents(); return; }

    flows.forEach((edge, i) => {
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

    viewer.entities.resumeEvents();
  }, [viewer, flows]);

  return null;
}
