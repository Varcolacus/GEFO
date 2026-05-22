import type { ImageryLayer, Viewer } from "cesium";

/**
 * Find an imagery layer previously tagged with `_overlayTag === tag`.
 * Returns null if not found.
 *
 * Tags are attached imperatively after `addImageryProvider` because Cesium
 * has no built-in concept of named imagery layers.
 */
export function findOverlayLayer(viewer: Viewer, tag: string): ImageryLayer | null {
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((layer as any)._overlayTag === tag) return layer;
  }
  return null;
}
