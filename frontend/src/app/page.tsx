"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import LayerControl from "@/components/LayerControl";
import InfoPanel from "@/components/InfoPanel";
import CountryDetailPanel from "@/components/CountryDetailPanel";
import TimeSlider from "@/components/TimeSlider";
import {
  fetchCountries,
  fetchTradeFlows,
  fetchPorts,
  fetchShippingDensity,
  type CountryMacro,
  type TradeFlowAggregated,
  type PortData,
  type ShippingDensityPoint,
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
  const [isLoadingYear, setIsLoadingYear] = useState(false);

  useEffect(() => {
    async function loadLiveData() {
      setIsLoadingYear(true);
      try {
        const [countriesData, flowsData, portsData, densityData] = await Promise.all([
          fetchCountries(),
          fetchTradeFlows(year),
          fetchPorts(),
          fetchShippingDensity(year),
        ]);

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
  }, [year]);

  const toggleLayer = useCallback(
    (layer: keyof typeof layers) => {
      setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    },
    []
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      <GlobeViewer
        countries={countries}
        tradeFlows={tradeFlows}
        ports={ports}
        shippingDensity={shippingDensity}
        layers={layers}
        indicator={indicator}
        onCountryClick={(country) => setSelectedCountry(country)}
      />

      <LayerControl
        layers={layers}
        onToggle={toggleLayer}
        indicator={indicator}
        onIndicatorChange={setIndicator}
      />

      <TimeSlider
        year={year}
        onYearChange={setYear}
        isLoading={isLoadingYear}
      />

      <div className="absolute bottom-4 right-4 z-50">
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

      <InfoPanel />

      {selectedCountry && (
        <CountryDetailPanel
          selectedCountry={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}
