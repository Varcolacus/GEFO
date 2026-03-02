import type { NextConfig } from "next";
import CopyPlugin from "copy-webpack-plugin";
import webpack from "webpack";
import path from "path";

const cesiumSource = path.resolve(__dirname, "node_modules/cesium/Build/Cesium");
const cesiumDest = path.resolve(__dirname, "public/cesium");

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            { from: path.join(cesiumSource, "Workers"), to: path.join(cesiumDest, "Workers") },
            { from: path.join(cesiumSource, "ThirdParty"), to: path.join(cesiumDest, "ThirdParty") },
            { from: path.join(cesiumSource, "Assets"), to: path.join(cesiumDest, "Assets") },
            { from: path.join(cesiumSource, "Widgets"), to: path.join(cesiumDest, "Widgets") },
          ],
        }),
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify("/cesium"),
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  env: {
    CESIUM_BASE_URL: "/cesium",
  },
};

export default nextConfig;
