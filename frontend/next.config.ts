import type { NextConfig } from "next";
import CopyPlugin from "copy-webpack-plugin";
import webpack from "webpack";
import path from "path";

const cesiumSource = "node_modules/cesium/Build/Cesium";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            {
              from: path.join(cesiumSource, "Workers"),
              to: "../public/cesium/Workers",
            },
            {
              from: path.join(cesiumSource, "ThirdParty"),
              to: "../public/cesium/ThirdParty",
            },
            {
              from: path.join(cesiumSource, "Assets"),
              to: "../public/cesium/Assets",
            },
            {
              from: path.join(cesiumSource, "Widgets"),
              to: "../public/cesium/Widgets",
            },
          ],
        }),
        // Define CESIUM_BASE_URL as a global so CesiumJS resolves assets to /cesium/
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
