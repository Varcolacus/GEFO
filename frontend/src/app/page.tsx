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
import type { GlobeViewerHandle } from "@/components/GlobeViewer";
import type { TradeMode } from "@/lib/trade-modes";
import {
  fetchCountries,
  fetchTradeFlows,
  fetchTradeFlowStats,
  fetchAvailableYears,
  fetchPorts,
  fetchShippingDensity,
  fetchConflictZones,
  fetchVessels,
  fetchAirports,
  fetchRailFreight,
  type CountryMacro,
  type TradeFlowAggregated,
  type TradeFlowStats,
  type YearRangeInfo,
  type PortData,
  type AirportData,
  type ShippingDensityPoint,
  type ConflictZone,
  type CommodityFlowEdge,
  type VesselPosition,
  type AircraftPosition,
  type RailFreightFlow,
  fetchAircraft,
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









export default function Home() {
  const [layers, setLayers] = useState({
    countries: false,
    tradeFlows: false,
    ports: false,
    shippingDensity: false,
    vessels: false,
    aircraft: false,
    railroads: false,
    airports: false,
  });
  const [indicator, setIndicator] = useState("gdp");
  const [tradeMode, setTradeMode] = useState<TradeMode>("balance");
  const [year, setYear] = useState<number | null>(null);
  const [yearRange, setYearRange] = useState<YearRangeInfo | null>(null);

  const [countries, setCountries] = useState<CountryMacro[]>([]);
  const [tradeFlows, setTradeFlows] = useState<TradeFlowAggregated[]>([]);
  const [tradeFlowStats, setTradeFlowStats] = useState<TradeFlowStats | null>(null);
  const [ports, setPorts] = useState<PortData[]>([]);
  const [airportsData, setAirportsData] = useState<AirportData[]>([]);
  const [shippingDensity, setShippingDensity] = useState<ShippingDensityPoint[]>([]);
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
  const [vessels, setVessels] = useState<VesselPosition[]>([]);

  const [aircraftList, setAircraftList] = useState<AircraftPosition[]>([]);
  const [railFreight, setRailFreight] = useState<RailFreightFlow[]>([]);
  const [commodityFlows, setCommodityFlows] = useState<CommodityFlowEdge[]>([]);
  const [conflictZones, setConflictZones] = useState<ConflictZone[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const globeRef = useRef<GlobeViewerHandle>(null);
  const { user, isAuthenticated } = useAuth();

  // ─── WebSocket live feed ───
  const { connectionState, events: liveEvents, clientId, clearEvents } = useWebSocket({
    channels: ["ports", "alerts", "geopolitical", "vessels", "aircraft"],
    enabled: true,
  });

  // Update vessel positions from WebSocket broadcasts
  useEffect(() => {
    const vesselEvent = liveEvents.find(
      (e) => e.type === "vessels" && e.event === "vessel_positions"
    );
    if (vesselEvent && Array.isArray(vesselEvent.vessels)) {
      setVessels(vesselEvent.vessels as VesselPosition[]);
    }
  }, [liveEvents]);

  // Update aircraft positions from WebSocket broadcasts
  useEffect(() => {
    const aircraftEvent = liveEvents.find(
      (e) => e.type === "aircraft" && e.event === "aircraft_positions"
    );
    if (aircraftEvent && Array.isArray(aircraftEvent.aircraft)) {
      setAircraftList(aircraftEvent.aircraft as AircraftPosition[]);
    }
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
      // On first load, fetch available years to determine the latest year
      if (year === null) {
        try {
          const yearsData = await fetchAvailableYears();
          if (yearsData) {
            setYearRange(yearsData);
            setYear(yearsData.max_year || new Date().getFullYear());
          } else {
            setYear(new Date().getFullYear());
          }
        } catch {
          setYear(new Date().getFullYear());
        }
        return; // will re-run with the resolved year
      }

      setIsLoadingYear(true);
      try {
        const [countriesData, flowsData, portsData, densityData, statsData, yearsData] = await Promise.all([
          fetchCountries(),
          fetchTradeFlows(year),
          fetchPorts(),
          fetchShippingDensity(year),
          fetchTradeFlowStats(year),
          fetchAvailableYears().catch(() => null),
        ]);

        // Fetch airports and conflict zones separately (non-blocking)
        fetchAirports().then((data) => { if (data.length > 0) setAirportsData(data); }).catch(() => {});
        fetchConflictZones().then(setConflictZones).catch(() => {});
        fetchVessels().then((snap) => {
          setVessels(snap.vessels);
        }).catch(() => {});
        fetchAircraft().then((snap) => {
          setAircraftList(snap.aircraft);
        }).catch(() => {});
        fetchRailFreight(year ?? 2000).then(setRailFreight).catch(() => {});

        setCountries(countriesData);
        setTradeFlows(flowsData);
        if (statsData) setTradeFlowStats(statsData);
        setPorts(portsData);
        setShippingDensity(densityData.data);
        if (yearsData) {
          setYearRange(yearsData);
        }
      } catch {
        console.log("Backend not available — no data to display");
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

  const toggleAllLayers = useCallback(
    (on: boolean) => {
      setLayers((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as (keyof typeof updated)[]) {
          updated[key] = on;
        }
        return updated;
      });
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
        commodityFlows={commodityFlows}
        vessels={vessels}
        aircraftList={aircraftList}
        airports={airportsData}
        railFreight={railFreight}
        layers={layers}
        indicator={indicator}
        year={year}
        onCountryClick={(country) => {
          setSelectedCountry(country);
          setFlyToCountry(country);
        }}
        flyToCountry={flyToCountry}
        flyToPosition={flyToPosition}
        highlightCountryIso={selectedCountry?.iso_code ?? null}
        tradeMode={tradeMode}
      />

      <SearchBar
        countries={countries}
        vessels={vessels}
        ports={ports}
        onSelectCountry={(country) => {
          setFlyToCountry(country);
          setSelectedCountry(country);
        }}
        onSelectVessel={(vessel) => {
          setFlyToPosition({ lon: vessel.lon, lat: vessel.lat, altitude: 50000 });
        }}
        onSelectPort={(port) => {
          setFlyToPosition({ lon: port.lon, lat: port.lat, altitude: 100000 });
        }}
      />

      {/* Toolbar: Compare & Screenshot */}
      <div className="absolute top-4 left-[22rem] right-[19rem] z-50 flex flex-wrap gap-2">
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
        onToggleAll={toggleAllLayers}
        indicator={indicator}
        onIndicatorChange={setIndicator}
        tradeMode={tradeMode}
        onTradeModeChange={setTradeMode}
      />

      {year !== null && (
        <TimeSlider
          year={year}
          onYearChange={setYear}
          minYear={yearRange?.min_year ?? year}
          maxYear={yearRange?.max_year ?? year}
          availableYears={yearRange?.years.map((y) => y.year)}
          isLoading={isLoadingYear}
        />
      )}

      {/* Global Stats Summary */}
      <div className="absolute bottom-20 left-12 z-50 bg-gray-900/80 backdrop-blur-sm
                      text-white rounded-lg border border-gray-700 px-4 py-3 w-64">
        <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2">
          Global Overview
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gray-400">Countries</span>
          <span className="text-right font-medium">{countries.length}</span>
          <span className="text-gray-400">Trade Flows</span>
          <span className="text-right font-medium">{tradeFlowStats ? tradeFlowStats.total_flows.toLocaleString() : tradeFlows.length}</span>
          <span className="text-gray-400">Ports</span>
          <span className="text-right font-medium">{ports.length}</span>
          <span className="text-gray-400">Total Trade</span>
          <span className="text-right font-medium text-cyan-400">
            ${tradeFlowStats ? (tradeFlowStats.total_value_usd / 1e12).toFixed(1) : (tradeFlows.reduce((s, f) => s + f.total_value_usd, 0) / 1e12).toFixed(1)}T
          </span>
          <span className="text-gray-400">Vessels</span>
          <span className="text-right font-medium text-sky-400">
            {vessels.length}
          </span>
          <span className="text-gray-400">Aircraft</span>
          <span className="text-right font-medium text-amber-400">
            {aircraftList.length} <span className="text-[9px] text-gray-500">(live)</span>
          </span>
        </div>


      </div>

      <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2">
        <ConnectionStatus
          state={connectionState}
          eventCount={liveEvents.length}
          clientId={clientId}
        />
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
          tradeMode={tradeMode}
          onTradeModeChange={setTradeMode}
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
