"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import LayerControl from "@/components/LayerControl";
import CountryDetailPanel from "@/components/CountryDetailPanel";
import TimeSlider from "@/components/TimeSlider";
import SearchBar from "@/components/SearchBar";
import ComparePanel from "@/components/ComparePanel";
import IntelligencePanel from "@/components/IntelligencePanel";
import AuthModal from "@/components/AuthModal";
import AccountPanel from "@/components/AccountPanel";
import NotificationPanel from "@/components/NotificationPanel";
import AdminPanel from "@/components/AdminPanel";
import GeopoliticalPanel from "@/components/GeopoliticalPanel";
import LiveFeed from "@/components/LiveFeed";
import ConnectionStatus from "@/components/ConnectionStatus";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import ImportPanel from "@/components/ImportPanel";
import CommodityPanel from "@/components/CommodityPanel";
import DataSourcePanel from "@/components/DataSourcePanel";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/lib/auth-context";
import type { GlobeViewerHandle, MapStyle } from "@/components/GlobeViewer";
import {
  fetchCountries,
  fetchTradeFlows,
  fetchPorts,
  fetchShippingDensity,
  fetchConflictZones,
  type CountryMacro,
  type TradeFlowAggregated,
  type PortData,
  type ShippingDensityPoint,
  type ConflictZone,
  type CommodityFlowEdge,
} from "@/lib/api";

// Dynamic import for CesiumJS (no SSR)
const GlobeViewer = dynamic(() => import("@/components/GlobeViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Loading Globe...</p>
        <p className="text-gray-500 text-sm mt-2">
          Global Economic Flow Observatory
        </p>
      </div>
    </div>
  ),
});

// ─── Demo data for when backend is not running ───

const DEMO_COUNTRIES: CountryMacro[] = [
  { iso_code: "USA", name: "United States", centroid_lat: 39.8, centroid_lon: -98.5, gdp: 25460000000000, trade_balance: -948000000000, export_value: 2065000000000, import_value: 3013000000000, population: 331000000, current_account: -943800000000 },
  { iso_code: "CHN", name: "China", centroid_lat: 35.86, centroid_lon: 104.19, gdp: 17960000000000, trade_balance: 877000000000, export_value: 3593000000000, import_value: 2716000000000, population: 1412000000, current_account: 401800000000 },
  { iso_code: "DEU", name: "Germany", centroid_lat: 51.16, centroid_lon: 10.45, gdp: 4072000000000, trade_balance: 198000000000, export_value: 1655000000000, import_value: 1457000000000, population: 83200000, current_account: 274000000000 },
  { iso_code: "JPN", name: "Japan", centroid_lat: 36.20, centroid_lon: 138.25, gdp: 4231000000000, trade_balance: -157000000000, export_value: 756000000000, import_value: 913000000000, population: 125700000, current_account: 84300000000 },
  { iso_code: "GBR", name: "United Kingdom", centroid_lat: 55.37, centroid_lon: -3.44, gdp: 3070000000000, trade_balance: -263000000000, export_value: 468000000000, import_value: 731000000000, population: 67300000, current_account: -121000000000 },
  { iso_code: "FRA", name: "France", centroid_lat: 46.23, centroid_lon: 2.21, gdp: 2782000000000, trade_balance: -132000000000, export_value: 617000000000, import_value: 749000000000, population: 67750000, current_account: -56400000000 },
  { iso_code: "IND", name: "India", centroid_lat: 20.59, centroid_lon: 78.96, gdp: 3385000000000, trade_balance: -267000000000, export_value: 453000000000, import_value: 720000000000, population: 1408000000, current_account: -67500000000 },
  { iso_code: "BRA", name: "Brazil", centroid_lat: -14.23, centroid_lon: -51.92, gdp: 1920000000000, trade_balance: 62000000000, export_value: 334000000000, import_value: 272000000000, population: 214000000, current_account: -48000000000 },
  { iso_code: "KOR", name: "South Korea", centroid_lat: 35.91, centroid_lon: 127.77, gdp: 1665000000000, trade_balance: 29000000000, export_value: 644000000000, import_value: 615000000000, population: 51740000, current_account: 29800000000 },
  { iso_code: "RUS", name: "Russia", centroid_lat: 61.52, centroid_lon: 105.32, gdp: 1775000000000, trade_balance: 282000000000, export_value: 532000000000, import_value: 250000000000, population: 144000000, current_account: 233000000000 },
  { iso_code: "AUS", name: "Australia", centroid_lat: -25.27, centroid_lon: 133.78, gdp: 1675000000000, trade_balance: 103000000000, export_value: 405000000000, import_value: 302000000000, population: 25800000, current_account: 18600000000 },
  { iso_code: "SAU", name: "Saudi Arabia", centroid_lat: 23.89, centroid_lon: 45.08, gdp: 1108000000000, trade_balance: 221000000000, export_value: 410000000000, import_value: 189000000000, population: 36000000, current_account: 152000000000 },
  { iso_code: "SGP", name: "Singapore", centroid_lat: 1.35, centroid_lon: 103.82, gdp: 397000000000, trade_balance: 92000000000, export_value: 515000000000, import_value: 423000000000, population: 5640000, current_account: 85200000000 },
  { iso_code: "ARE", name: "UAE", centroid_lat: 23.42, centroid_lon: 53.85, gdp: 507000000000, trade_balance: 144000000000, export_value: 421000000000, import_value: 277000000000, population: 9890000, current_account: 50000000000 },
  { iso_code: "NGA", name: "Nigeria", centroid_lat: 9.08, centroid_lon: 8.68, gdp: 477000000000, trade_balance: 11000000000, export_value: 58000000000, import_value: 47000000000, population: 218000000, current_account: -3500000000 },
  { iso_code: "ZAF", name: "South Africa", centroid_lat: -30.56, centroid_lon: 22.94, gdp: 405000000000, trade_balance: 15000000000, export_value: 125000000000, import_value: 110000000000, population: 60000000, current_account: -2500000000 },
  { iso_code: "EGY", name: "Egypt", centroid_lat: 26.82, centroid_lon: 30.80, gdp: 404000000000, trade_balance: -44000000000, export_value: 43000000000, import_value: 87000000000, population: 104000000, current_account: -16400000000 },
  { iso_code: "MEX", name: "Mexico", centroid_lat: 23.63, centroid_lon: -102.55, gdp: 1322000000000, trade_balance: -15000000000, export_value: 578000000000, import_value: 593000000000, population: 128900000, current_account: -17000000000 },
  { iso_code: "IDN", name: "Indonesia", centroid_lat: -0.79, centroid_lon: 113.92, gdp: 1319000000000, trade_balance: 54000000000, export_value: 292000000000, import_value: 238000000000, population: 274000000, current_account: 13100000000 },
  { iso_code: "NLD", name: "Netherlands", centroid_lat: 52.13, centroid_lon: 5.29, gdp: 1009000000000, trade_balance: 97000000000, export_value: 836000000000, import_value: 739000000000, population: 17500000, current_account: 89600000000 },
  { iso_code: "TUR", name: "Turkey", centroid_lat: 38.96, centroid_lon: 35.24, gdp: 906000000000, trade_balance: -99000000000, export_value: 254000000000, import_value: 353000000000, population: 85000000, current_account: -48800000000 },
  { iso_code: "CAN", name: "Canada", centroid_lat: 56.13, centroid_lon: -106.35, gdp: 2140000000000, trade_balance: -13000000000, export_value: 594000000000, import_value: 607000000000, population: 38200000, current_account: -7600000000 },
  { iso_code: "NOR", name: "Norway", centroid_lat: 60.47, centroid_lon: 8.47, gdp: 579000000000, trade_balance: 152000000000, export_value: 252000000000, import_value: 100000000000, population: 5400000, current_account: 175000000000 },
  { iso_code: "CHE", name: "Switzerland", centroid_lat: 46.82, centroid_lon: 8.23, gdp: 818000000000, trade_balance: 55000000000, export_value: 380000000000, import_value: 325000000000, population: 8700000, current_account: 72000000000 },
];

const DEMO_TRADE_FLOWS: TradeFlowAggregated[] = [
  { exporter_iso: "CHN", importer_iso: "USA", total_value_usd: 536000000000, exporter_lat: 35.86, exporter_lon: 104.19, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "USA", importer_iso: "CHN", total_value_usd: 154000000000, exporter_lat: 39.8, exporter_lon: -98.5, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "DEU", importer_iso: "USA", total_value_usd: 142000000000, exporter_lat: 51.16, exporter_lon: 10.45, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "CHN", importer_iso: "JPN", total_value_usd: 166000000000, exporter_lat: 35.86, exporter_lon: 104.19, importer_lat: 36.20, importer_lon: 138.25 },
  { exporter_iso: "CHN", importer_iso: "KOR", total_value_usd: 163000000000, exporter_lat: 35.86, exporter_lon: 104.19, importer_lat: 35.91, importer_lon: 127.77 },
  { exporter_iso: "USA", importer_iso: "CAN", total_value_usd: 307000000000, exporter_lat: 39.8, exporter_lon: -98.5, importer_lat: 56.13, importer_lon: -106.35 },
  { exporter_iso: "CAN", importer_iso: "USA", total_value_usd: 375000000000, exporter_lat: 56.13, exporter_lon: -106.35, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "USA", importer_iso: "MEX", total_value_usd: 265000000000, exporter_lat: 39.8, exporter_lon: -98.5, importer_lat: 23.63, importer_lon: -102.55 },
  { exporter_iso: "MEX", importer_iso: "USA", total_value_usd: 382000000000, exporter_lat: 23.63, exporter_lon: -102.55, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "DEU", importer_iso: "CHN", total_value_usd: 107000000000, exporter_lat: 51.16, exporter_lon: 10.45, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "SAU", importer_iso: "CHN", total_value_usd: 87000000000, exporter_lat: 23.89, exporter_lon: 45.08, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "AUS", importer_iso: "CHN", total_value_usd: 145000000000, exporter_lat: -25.27, exporter_lon: 133.78, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "RUS", importer_iso: "CHN", total_value_usd: 114000000000, exporter_lat: 61.52, exporter_lon: 105.32, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "BRA", importer_iso: "CHN", total_value_usd: 89000000000, exporter_lat: -14.23, exporter_lon: -51.92, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "CHN", importer_iso: "DEU", total_value_usd: 112000000000, exporter_lat: 35.86, exporter_lon: 104.19, importer_lat: 51.16, importer_lon: 10.45 },
  { exporter_iso: "DEU", importer_iso: "FRA", total_value_usd: 89000000000, exporter_lat: 51.16, exporter_lon: 10.45, importer_lat: 46.23, importer_lon: 2.21 },
  { exporter_iso: "NLD", importer_iso: "DEU", total_value_usd: 114000000000, exporter_lat: 52.13, exporter_lon: 5.29, importer_lat: 51.16, importer_lon: 10.45 },
  { exporter_iso: "JPN", importer_iso: "USA", total_value_usd: 135000000000, exporter_lat: 36.20, exporter_lon: 138.25, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "KOR", importer_iso: "USA", total_value_usd: 84000000000, exporter_lat: 35.91, exporter_lon: 127.77, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "SGP", importer_iso: "CHN", total_value_usd: 62000000000, exporter_lat: 1.35, exporter_lon: 103.82, importer_lat: 35.86, importer_lon: 104.19 },
  { exporter_iso: "IND", importer_iso: "USA", total_value_usd: 76000000000, exporter_lat: 20.59, exporter_lon: 78.96, importer_lat: 39.8, importer_lon: -98.5 },
  { exporter_iso: "SAU", importer_iso: "IND", total_value_usd: 42000000000, exporter_lat: 23.89, exporter_lon: 45.08, importer_lat: 20.59, importer_lon: 78.96 },
  { exporter_iso: "SAU", importer_iso: "JPN", total_value_usd: 38000000000, exporter_lat: 23.89, exporter_lon: 45.08, importer_lat: 36.20, importer_lon: 138.25 },
  { exporter_iso: "NOR", importer_iso: "GBR", total_value_usd: 56000000000, exporter_lat: 60.47, exporter_lon: 8.47, importer_lat: 55.37, importer_lon: -3.44 },
  { exporter_iso: "NOR", importer_iso: "DEU", total_value_usd: 45000000000, exporter_lat: 60.47, exporter_lon: 8.47, importer_lat: 51.16, importer_lon: 10.45 },
];

const DEMO_PORTS: PortData[] = [
  { id: 1, name: "Shanghai", country_iso: "CHN", lat: 31.23, lon: 121.47, port_type: "container", throughput_teu: 47300000 },
  { id: 2, name: "Singapore", country_iso: "SGP", lat: 1.26, lon: 103.84, port_type: "container", throughput_teu: 37200000 },
  { id: 3, name: "Ningbo-Zhoushan", country_iso: "CHN", lat: 29.87, lon: 121.56, port_type: "container", throughput_teu: 33350000 },
  { id: 4, name: "Shenzhen", country_iso: "CHN", lat: 22.54, lon: 114.05, port_type: "container", throughput_teu: 28750000 },
  { id: 5, name: "Busan", country_iso: "KOR", lat: 35.10, lon: 129.04, port_type: "container", throughput_teu: 22070000 },
  { id: 6, name: "Rotterdam", country_iso: "NLD", lat: 51.95, lon: 4.13, port_type: "container", throughput_teu: 14820000 },
  { id: 7, name: "Dubai", country_iso: "ARE", lat: 25.01, lon: 55.06, port_type: "container", throughput_teu: 14110000 },
  { id: 8, name: "Antwerp", country_iso: "BEL", lat: 51.27, lon: 4.35, port_type: "container", throughput_teu: 13100000 },
  { id: 9, name: "Los Angeles", country_iso: "USA", lat: 33.74, lon: -118.26, port_type: "container", throughput_teu: 9900000 },
  { id: 10, name: "Hamburg", country_iso: "DEU", lat: 53.55, lon: 9.97, port_type: "container", throughput_teu: 8700000 },
  { id: 11, name: "Long Beach", country_iso: "USA", lat: 33.75, lon: -118.19, port_type: "container", throughput_teu: 7600000 },
  { id: 12, name: "New York", country_iso: "USA", lat: 40.68, lon: -74.04, port_type: "container", throughput_teu: 5200000 },
  { id: 13, name: "Santos", country_iso: "BRA", lat: -23.96, lon: -46.33, port_type: "container", throughput_teu: 4200000 },
  { id: 14, name: "Ras Tanura", country_iso: "SAU", lat: 26.64, lon: 50.17, port_type: "oil", throughput_tons: 300000000 },
  { id: 15, name: "Fujairah", country_iso: "ARE", lat: 25.12, lon: 56.36, port_type: "oil", throughput_tons: 200000000 },
  { id: 16, name: "Houston", country_iso: "USA", lat: 29.76, lon: -95.27, port_type: "oil", throughput_tons: 170000000 },
  { id: 17, name: "Port Hedland", country_iso: "AUS", lat: -20.31, lon: 118.58, port_type: "bulk", throughput_tons: 550000000 },
  { id: 18, name: "Richards Bay", country_iso: "ZAF", lat: -28.80, lon: 32.09, port_type: "bulk", throughput_tons: 90000000 },
  { id: 19, name: "Suez (Port Said)", country_iso: "EGY", lat: 31.26, lon: 32.30, port_type: "transit", throughput_teu: 3500000 },
  { id: 20, name: "Panama (Balboa)", country_iso: "PAN", lat: 8.96, lon: -79.57, port_type: "transit", throughput_teu: 2800000 },
];

const DEMO_SHIPPING: ShippingDensityPoint[] = [
  { lat: 1.5, lon: 103.5, density_value: 95, year: 2023, month: 1 },
  { lat: 2.0, lon: 102.5, density_value: 90, year: 2023, month: 1 },
  { lat: 3.0, lon: 101.0, density_value: 85, year: 2023, month: 1 },
  { lat: 4.5, lon: 100.0, density_value: 75, year: 2023, month: 1 },
  { lat: 10.0, lon: 110.0, density_value: 70, year: 2023, month: 1 },
  { lat: 15.0, lon: 115.0, density_value: 60, year: 2023, month: 1 },
  { lat: 20.0, lon: 118.0, density_value: 65, year: 2023, month: 1 },
  { lat: 30.0, lon: 32.5, density_value: 88, year: 2023, month: 1 },
  { lat: 28.0, lon: 33.5, density_value: 82, year: 2023, month: 1 },
  { lat: 14.0, lon: 43.0, density_value: 78, year: 2023, month: 1 },
  { lat: 26.5, lon: 56.0, density_value: 92, year: 2023, month: 1 },
  { lat: 25.5, lon: 55.0, density_value: 85, year: 2023, month: 1 },
  { lat: 50.5, lon: 1.0, density_value: 75, year: 2023, month: 1 },
  { lat: 51.0, lon: 2.0, density_value: 72, year: 2023, month: 1 },
  { lat: 9.5, lon: -80.0, density_value: 70, year: 2023, month: 1 },
  { lat: 30.0, lon: 125.0, density_value: 68, year: 2023, month: 1 },
  { lat: 33.0, lon: 128.0, density_value: 55, year: 2023, month: 1 },
  { lat: 36.0, lon: 14.0, density_value: 58, year: 2023, month: 1 },
  { lat: 37.5, lon: 5.0, density_value: 52, year: 2023, month: 1 },
  { lat: 12.0, lon: 45.0, density_value: 74, year: 2023, month: 1 },
  { lat: 53.5, lon: 4.0, density_value: 65, year: 2023, month: 1 },
  { lat: 5.0, lon: 75.0, density_value: 45, year: 2023, month: 1 },
  { lat: -5.0, lon: 60.0, density_value: 40, year: 2023, month: 1 },
  { lat: 38.0, lon: -74.0, density_value: 55, year: 2023, month: 1 },
  { lat: 32.0, lon: -80.0, density_value: 48, year: 2023, month: 1 },
  { lat: 34.0, lon: -119.0, density_value: 60, year: 2023, month: 1 },
  { lat: 34.5, lon: 136.0, density_value: 62, year: 2023, month: 1 },
  { lat: 57.0, lon: 20.0, density_value: 45, year: 2023, month: 1 },
  { lat: -34.0, lon: 18.5, density_value: 42, year: 2023, month: 1 },
  { lat: 34.0, lon: 129.0, density_value: 58, year: 2023, month: 1 },
];

export default function Home() {
  const [layers, setLayers] = useState({
    countries: true,
    tradeFlows: true,
    liveTrade: true,
    ports: true,
    shippingDensity: false,
  });
  const [indicator, setIndicator] = useState("gdp");
  const [year, setYear] = useState(2023);

  const [countries, setCountries] = useState<CountryMacro[]>(DEMO_COUNTRIES);
  const [tradeFlows, setTradeFlows] = useState<TradeFlowAggregated[]>(DEMO_TRADE_FLOWS);
  const [ports, setPorts] = useState<PortData[]>(DEMO_PORTS);
  const [shippingDensity, setShippingDensity] = useState<ShippingDensityPoint[]>(DEMO_SHIPPING);
  const [dataSource, setDataSource] = useState<"demo" | "live">("demo");
  const [selectedCountry, setSelectedCountry] = useState<CountryMacro | null>(null);
  const [flyToCountry, setFlyToCountry] = useState<CountryMacro | null>(null);
  const [flyToPosition, setFlyToPosition] = useState<{ lon: number; lat: number; altitude: number } | null>(null);
  const [isLoadingYear, setIsLoadingYear] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showGeopolitical, setShowGeopolitical] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCommodities, setShowCommodities] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [commodityFlows, setCommodityFlows] = useState<CommodityFlowEdge[]>([]);
  const [conflictZones, setConflictZones] = useState<ConflictZone[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const globeRef = useRef<GlobeViewerHandle>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [tradeFlowCount, setTradeFlowCount] = useState(1000);
  const { user, isAuthenticated } = useAuth();

  // ─── WebSocket live feed ───
  const { connectionState, events: liveEvents, clientId, clearEvents } = useWebSocket({
    channels: ["trade", "ports", "alerts", "geopolitical"],
    enabled: true,
  });

  // Derive live trade arcs from recent WS trade events
  const liveTradeArcs = useMemo(() => {
    return liveEvents
      .filter((e) => e.type === "trade" && e.event === "trade_flow")
      .slice(0, 8)
      .map((e) => ({
        exporter_iso: e.exporter_iso as string,
        importer_iso: e.importer_iso as string,
        total_value_usd: e.value_usd as number,
        exporter_lat: e.exporter_lat as number,
        exporter_lon: e.exporter_lon as number,
        importer_lat: e.importer_lat as number,
        importer_lon: e.importer_lon as number,
      }));
  }, [liveEvents]);

  // Poll alert count every 60s for authenticated users
  useEffect(() => {
    if (!isAuthenticated) { setAlertCount(0); return; }
    let cancelled = false;
    async function poll() {
      try {
        const { fetchAlertSummary } = await import("@/lib/api");
        const s = await fetchAlertSummary();
        if (!cancelled) setAlertCount(s.total_active);
      } catch { /* ignore */ }
    }
    poll();
    const iv = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAuthenticated]);

  useEffect(() => {
    async function loadLiveData() {
      setIsLoadingYear(true);
      try {
        const [countriesData, flowsData, portsData, densityData] = await Promise.all([
          fetchCountries(),
          fetchTradeFlows(year, tradeFlowCount),
          fetchPorts(),
          fetchShippingDensity(year),
        ]);

        // Fetch conflict zones separately (non-blocking)
        fetchConflictZones().then(setConflictZones).catch(() => {});

        if (countriesData.length > 0) setCountries(countriesData);
        if (flowsData.length > 0) setTradeFlows(flowsData);
        if (portsData.length > 0) setPorts(portsData);
        if (densityData.data.length > 0) setShippingDensity(densityData.data);
        setDataSource("live");
      } catch {
        console.log("Backend not available, using demo data");
        setDataSource("demo");
      } finally {
        setIsLoadingYear(false);
      }
    }

    loadLiveData();
  }, [year, tradeFlowCount]);

  const toggleLayer = useCallback(
    (layer: keyof typeof layers) => {
      setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    },
    []
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      <GlobeViewer
        ref={globeRef}
        countries={countries}
        tradeFlows={tradeFlows}
        ports={ports}
        shippingDensity={shippingDensity}
        conflictZones={showGeopolitical ? conflictZones : []}
        liveTradeArcs={liveTradeArcs}
        commodityFlows={commodityFlows}
        layers={layers}
        indicator={indicator}
        onCountryClick={(country) => {
          setSelectedCountry(country);
          setFlyToCountry(country);
        }}
        flyToCountry={flyToCountry}
        flyToPosition={flyToPosition}
        highlightCountryIso={selectedCountry?.iso_code ?? null}
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
      />

      <SearchBar
        countries={countries}
        onSelect={(country) => {
          setFlyToCountry(country);
          setSelectedCountry(country);
        }}
      />

      {/* Toolbar: Compare & Screenshot */}
      <div className="absolute top-4 left-[22rem] z-50 flex gap-2">
        <button
          onClick={() => setShowCompare((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showCompare
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          ⚖️ Compare
        </button>
        <button
          onClick={() => setShowIntelligence((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showIntelligence
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          🧠 Intelligence
        </button>
        <button
          onClick={() => setShowGeopolitical((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showGeopolitical
              ? "bg-red-500/20 text-red-300 border-red-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          ⚠️ Geopolitical
        </button>
        <button
          onClick={() => setShowLiveFeed((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showLiveFeed
              ? "bg-green-500/20 text-green-300 border-green-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          📡 Live Feed
        </button>
        <button
          onClick={() => setShowAnalytics((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showAnalytics
              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          📊 Analytics
        </button>
        <button
          onClick={() => setShowCommodities((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showCommodities
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          📦 Commodities
        </button>
        <button
          onClick={() => setShowDataSources((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
            showDataSources
              ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
              : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
          }`}
        >
          🏛️ Sources
        </button>
        {isAuthenticated && user?.is_admin && (
          <button
            onClick={() => setShowImport((v) => !v)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors backdrop-blur-sm ${
              showImport
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                : "bg-gray-900/80 text-gray-400 border-gray-700 hover:text-white"
            }`}
          >
            📥 Import
          </button>
        )}
        <button
          onClick={() => {
            const dataUrl = globeRef.current?.captureScreenshot();
            if (!dataUrl) return;
            const link = document.createElement("a");
            link.download = `GEFO_${year}_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = dataUrl;
            link.click();
          }}
          className="text-xs px-3 py-2 rounded-lg border bg-gray-900/80 text-gray-400
                     border-gray-700 hover:text-white transition-colors backdrop-blur-sm"
        >
          📷 Screenshot
        </button>

        {isAuthenticated ? (
          <>
            <button
              onClick={() => setShowNotifications(true)}
              className="relative text-xs px-3 py-2 rounded-lg border bg-gray-900/80 text-gray-400
                         border-gray-700 hover:text-white transition-colors backdrop-blur-sm"
            >
              🔔 Alerts
              {alertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold
                               w-4 h-4 rounded-full flex items-center justify-center">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowAccount(true)}
              className="text-xs px-3 py-2 rounded-lg border bg-cyan-600/80 text-white
                         border-cyan-500 hover:bg-cyan-500 transition-colors backdrop-blur-sm flex items-center gap-1"
            >
              👤 {user?.full_name || user?.email?.split("@")[0] || "Account"}
            </button>
            {user?.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="text-xs px-3 py-2 rounded-lg border bg-yellow-600/80 text-white
                           border-yellow-500 hover:bg-yellow-500 transition-colors backdrop-blur-sm"
              >
                🛡️ Admin
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="text-xs px-3 py-2 rounded-lg border bg-gray-900/80 text-cyan-400
                       border-cyan-700 hover:text-white hover:border-cyan-500 transition-colors backdrop-blur-sm"
          >
            🔑 Sign In
          </button>
        )}
      </div>

      {showCompare && (
        <ComparePanel
          countries={countries}
          onClose={() => setShowCompare(false)}
        />
      )}

      <LayerControl
        layers={layers}
        onToggle={toggleLayer}
        indicator={indicator}
        onIndicatorChange={setIndicator}
        onRegionClick={(lon, lat, altitude) =>
          setFlyToPosition({ lon, lat, altitude })
        }
      />

      <TimeSlider
        year={year}
        onYearChange={setYear}
        isLoading={isLoadingYear}
      />

      {/* Global Stats Summary */}
      <div className="absolute bottom-20 left-4 z-50 bg-gray-900/80 backdrop-blur-sm
                      text-white rounded-lg border border-gray-700 px-4 py-3 w-64">
        <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
          Global Overview
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gray-400">Countries</span>
          <span className="text-right font-medium">{countries.length}</span>
          <span className="text-gray-400">Trade Flows</span>
          <span className="text-right font-medium">{tradeFlows.length}</span>
          <span className="text-gray-400">Ports</span>
          <span className="text-right font-medium">{ports.length}</span>
          <span className="text-gray-400">Total Trade</span>
          <span className="text-right font-medium text-cyan-400">
            ${(tradeFlows.reduce((s, f) => s + f.total_value_usd, 0) / 1e12).toFixed(1)}T
          </span>
        </div>

        {/* Trade Density Slider */}
        <div className="mt-3 pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Trade Density</span>
            <span className="text-[10px] text-cyan-400 font-medium">{tradeFlowCount} flows</span>
          </div>
          <input
            type="range"
            min={50}
            max={10000}
            step={50}
            value={tradeFlowCount}
            onChange={(e) => setTradeFlowCount(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer
                       bg-gray-700 accent-cyan-500"
          />
          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
            <span>50</span>
            <span>5000</span>
            <span>10000</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2">
        <ConnectionStatus
          state={connectionState}
          eventCount={liveEvents.length}
          clientId={clientId}
        />
        <div
          className={`text-xs px-3 py-1 rounded-full ${
            dataSource === "live"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
          }`}
        >
          {dataSource === "live" ? "● Live Data" : "● Demo Data"}
        </div>
      </div>

      {showIntelligence && (
        <IntelligencePanel
          year={year}
          onClose={() => setShowIntelligence(false)}
        />
      )}

      {selectedCountry && (
        <CountryDetailPanel
          selectedCountry={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      {showAccount && (
        <AccountPanel onClose={() => setShowAccount(false)} />
      )}

      {showNotifications && (
        <NotificationPanel onClose={() => { setShowNotifications(false); setAlertCount(0); }} />
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {showGeopolitical && (
        <GeopoliticalPanel
          year={year}
          onClose={() => setShowGeopolitical(false)}
          onFlyTo={(lat, lon) => setFlyToPosition({ lon, lat, altitude: 3000000 })}
        />
      )}

      {showLiveFeed && (
        <LiveFeed
          events={liveEvents}
          connectionState={connectionState}
          onClose={() => setShowLiveFeed(false)}
          onClearEvents={clearEvents}
          onFlyTo={(lat, lon) => setFlyToPosition({ lon, lat, altitude: 4000000 })}
        />
      )}

      {showAnalytics && (
        <AnalyticsPanel
          year={year}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showImport && (
        <ImportPanel onClose={() => setShowImport(false)} />
      )}

      {showCommodities && (
        <CommodityPanel
          year={year}
          onClose={() => setShowCommodities(false)}
          onShowCommodityFlows={(flows) => setCommodityFlows(flows)}
        />
      )}

      {showDataSources && (
        <DataSourcePanel onClose={() => setShowDataSources(false)} />
      )}
    </div>
  );
}
