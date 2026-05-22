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
} from "cesium";

import type { AirportData } from "@/lib/api";
import { MAJOR_AIRPORTS } from "@/lib/airports";

interface AirportsLayerProps {
  viewer: Viewer;
  enabled: boolean;
  airports: AirportData[];
}

/**
 * Renders airport markers as violet points with IATA-code labels and
 * a translucent glow ring around major hubs (>50M pax/year).
 *
 * Falls back to MAJOR_AIRPORTS (hardcoded list) when no API data is
 * passed. Entities tagged `airport_<iata>` and `airport_glow_<iata>`.
 */
export function AirportsLayer({ viewer, enabled, airports }: AirportsLayerProps) {
  useEffect(() => {
    viewer.entities.suspendEvents();

    const toRemove = viewer.entities.values.filter(
      (e) => e.name?.startsWith("airport_")
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    if (!enabled) { viewer.entities.resumeEvents(); return; }

    // Use API data if available, fall back to hardcoded list
    const useApiData = airports.length > 0;
    const airportsList = useApiData
      ? airports.map((a) => ({
          iata: a.iata || "?",
          name: a.name,
          city: a.city || "",
          country: a.country_iso,
          lat: a.lat,
          lon: a.lon,
          pax: a.pax_annual || 0,
          elevation_ft: a.elevation_ft,
          icao: a.icao,
          runways: a.runways,
          airport_type: a.airport_type,
        }))
      : MAJOR_AIRPORTS.map((a) => ({
          ...a,
          elevation_ft: undefined as number | undefined,
          icao: undefined as string | undefined,
          runways: undefined as number | undefined,
          airport_type: undefined as string | undefined,
        }));

    const airportColor = Color.fromCssColorString("#d8b4fe"); // bright violet
    const airportColorFaded = airportColor.withAlpha(0.35);

    airportsList.forEach((apt) => {
      const pax = apt.pax || 0;
      const size = Math.min(8 + Math.log10(Math.max(pax, 1)) * 3, 18);

      // Airport point
      viewer.entities.add({
        name: `airport_${apt.iata}`,
        position: Cartesian3.fromDegrees(apt.lon, apt.lat),
        point: {
          pixelSize: size,
          color: airportColor,
          outlineColor: Color.WHITE.withAlpha(0.7),
          outlineWidth: 1.5,
          scaleByDistance: new NearFarScalar(5e5, 1.4, 2e7, 0.6),
          translucencyByDistance: new NearFarScalar(1e5, 1, 3e7, 0.5),
        },
        label: {
          text: apt.iata,
          font: "bold 11px 'Segoe UI', sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("rgba(0,0,0,0.7)"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pixelOffset: new Cartesian3(8, -8, 0) as any,
          scaleByDistance: new NearFarScalar(5e5, 1, 1.5e7, 0.35),
          translucencyByDistance: new NearFarScalar(5e5, 1, 2e7, 0.4),
        },
        description: `
          <h3>✈ ${apt.name} (${apt.iata})</h3>
          <p>${apt.city}, ${apt.country}</p>
          ${pax > 0 ? `<p>≈ ${pax.toFixed(1)}M passengers/year</p>` : ""}
          ${apt.icao ? `<p>ICAO: ${apt.icao}</p>` : ""}
          ${apt.elevation_ft != null ? `<p>Elevation: ${apt.elevation_ft.toLocaleString()} ft</p>` : ""}
          ${apt.runways ? `<p>Runways: ${apt.runways}</p>` : ""}
          ${apt.airport_type ? `<p>Type: ${apt.airport_type.replace("_", " ")}</p>` : ""}
        `,
      });

      // Glow ring around major hubs (pax > 50M)
      if (pax > 50) {
        viewer.entities.add({
          name: `airport_glow_${apt.iata}`,
          position: Cartesian3.fromDegrees(apt.lon, apt.lat),
          ellipse: {
            semiMajorAxis: 18000 + pax * 200,
            semiMinorAxis: 18000 + pax * 200,
            height: 0,
            material: airportColorFaded,
            outline: false,
          },
        });
      }
    });

    viewer.entities.resumeEvents();
  }, [viewer, enabled, airports]);

  return null;
}
