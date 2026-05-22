// Google Earth hybrid tiles — satellite + borders + roads + labels
export const GOOGLE_EARTH_TILES = {
  url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  subdomains: ["0", "1", "2", "3"],
  credit: "© Google",
  maxZoom: 21,
};
