/**
 * Compute 3D arc positions above the globe surface.
 * Creates a smooth parabolic arc between two geographic points.
 *
 * Returns a flat [lon, lat, height, lon, lat, height, ...] array suitable
 * for Cesium.Cartesian3.fromDegreesArrayHeights().
 */
export function computeArcPositions(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  segments: number = 40,
  heightScale: number = 0.15
): number[] {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;

  // Choose the shorter longitude path (handles antimeridian crossing)
  let dLonDeg = lon2 - lon1;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;

  const dLon = dLonDeg * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const distMeters = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6_371_000;
  const maxHeight = Math.min(distMeters * heightScale, 4_000_000); // cap at 4000km

  const points: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let lon = lon1 + dLonDeg * t;
    // Normalize longitude to [-180, 180]
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    const lat = lat1 + (lat2 - lat1) * t;
    const height = maxHeight * 4 * t * (1 - t); // parabolic
    points.push(lon, lat, height);
  }
  return points;
}
