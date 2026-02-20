"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  uploadImportFile,
  executeImport,
  fetchImportJobs,
  fetchImportJobDetail,
  fetchImportSchemas,
  fetchImportStats,
  fetchImportConnectors,
  type ImportPreview,
  type ImportJob,
  type ImportJobDetail,
  type ImportSchema,
  type TableStats,
  type ConnectorInfo,
} from "@/lib/api";

// ─── Formatters ───

function fmtNum(v: number): string {
  return v.toLocaleString();
}

function statusColor(s: string): string {
  switch (s) {
    case "completed": return "text-green-400";
    case "importing": case "validating": return "text-cyan-400";
    case "pending": return "text-yellow-400";
    case "failed": return "text-red-400";
    default: return "text-gray-400";
  }
}

function statusBg(s: string): string {
  switch (s) {
    case "completed": return "bg-green-500/20 border-green-500/40";
    case "failed": return "bg-red-500/20 border-red-500/40";
    case "importing": case "validating": return "bg-cyan-500/20 border-cyan-500/40";
    default: return "bg-gray-500/20 border-gray-500/40";
  }
}

// ─── Tab: Upload ───

function UploadTab() {
  const [targetTable, setTargetTable] = useState("trade_flows");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState("append");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setResult(null);
    setPreview(null);
    setUploading(true);
    try {
      const prev = await uploadImportFile(file, targetTable);
      setPreview(prev);
      setMapping(prev.auto_mapping || {});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setUploading(false);
    }
  }, [targetTable]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleExecute = async () => {
    if (!preview?.temp_file) return;
    setExecuting(true);
    setError("");
    try {
      const res = await executeImport(
        preview.temp_file,
        targetTable,
        mapping,
        importMode,
        yearFilter ? parseInt(yearFilter) : undefined,
      );
      setResult(res);
      setPreview(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Target table selector */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase">Target Table</label>
        <select
          value={targetTable}
          onChange={(e) => { setTargetTable(e.target.value); setPreview(null); }}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white mt-1"
        >
          <option value="trade_flows">Trade Flows</option>
          <option value="countries">Countries</option>
          <option value="ports">Ports</option>
          <option value="shipping_density">Shipping Density</option>
        </select>
      </div>

      {/* Drop zone */}
      {!preview && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-cyan-400 bg-cyan-500/10"
              : "border-gray-600 hover:border-gray-500"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-400 border-t-transparent" />
              <span className="text-cyan-400 text-sm">Parsing file...</span>
            </div>
          ) : (
            <>
              <p className="text-gray-400 text-sm">📁 Drop CSV / Excel file here</p>
              <p className="text-gray-500 text-[10px] mt-1">or click to browse · max 50 MB</p>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-300">📄 {preview.filename}</span>
              <span className="text-gray-500">{fmtNum(preview.total_rows)} rows</span>
            </div>

            {/* Missing required columns warning */}
            {preview.missing_required && preview.missing_required.length > 0 && (
              <div className="bg-yellow-500/20 border border-yellow-500/40 rounded p-2 text-xs text-yellow-300 mb-2">
                ⚠️ Missing required: {preview.missing_required.join(", ")}
              </div>
            )}

            {/* Column mapping */}
            <p className="text-[10px] text-gray-500 uppercase mb-1">Column Mapping</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {preview.file_columns.map((fc) => (
                <div key={fc} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-28 truncate" title={fc}>{fc}</span>
                  <span className="text-gray-600">→</span>
                  <select
                    value={mapping[fc] || ""}
                    onChange={(e) => setMapping({ ...mapping, [fc]: e.target.value })}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white"
                  >
                    <option value="">— skip —</option>
                    {Object.keys(preview.schema || {}).map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview rows */}
          {preview.preview_rows && preview.preview_rows.length > 0 && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
              <p className="text-[10px] text-gray-500 uppercase mb-1">
                Preview (first {preview.preview_rows.length} rows)
              </p>
              <div className="overflow-x-auto">
                <table className="text-[10px] text-gray-300 w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      {preview.file_columns.slice(0, 6).map((c) => (
                        <th key={c} className="text-left px-1 py-0.5 text-gray-500">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview_rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        {preview.file_columns.slice(0, 6).map((c) => (
                          <td key={c} className="px-1 py-0.5 truncate max-w-[80px]">
                            {String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import options */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 uppercase">Mode</label>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white mt-0.5"
              >
                <option value="append">Append (add to existing)</option>
                <option value="replace">Replace (delete &amp; re-insert)</option>
              </select>
            </div>
            {importMode === "replace" && (
              <div className="w-20">
                <label className="text-[10px] text-gray-500 uppercase">Year</label>
                <input
                  type="number"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  placeholder="All"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white mt-0.5"
                />
              </div>
            )}
          </div>

          {/* Execute button */}
          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white text-xs
                         px-4 py-2 rounded font-medium transition-colors"
            >
              {executing ? "Importing..." : `Import ${fmtNum(preview.total_rows)} rows`}
            </button>
            <button
              onClick={() => { setPreview(null); setResult(null); }}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded p-3 border text-xs ${
          result.status === "completed"
            ? "bg-green-500/20 border-green-500/40 text-green-300"
            : "bg-red-500/20 border-red-500/40 text-red-300"
        }`}>
          <p className="font-medium mb-1">
            {result.status === "completed" ? "✅ Import Complete" : "❌ Import Failed"}
          </p>
          {typeof result.imported_rows === "number" && (
            <p>Imported: {fmtNum(result.imported_rows as number)} rows</p>
          )}
          {typeof result.skipped_rows === "number" && (result.skipped_rows as number) > 0 && (
            <p>Skipped: {fmtNum(result.skipped_rows as number)} rows</p>
          )}
          {typeof result.error_rows === "number" && (result.error_rows as number) > 0 && (
            <p>Errors: {fmtNum(result.error_rows as number)} rows</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: History ───

function HistoryTab() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selected, setSelected] = useState<ImportJobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchImportJobs(20)
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const viewDetail = async (id: number) => {
    try {
      const detail = await fetchImportJobDetail(id);
      setSelected(detail);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!jobs.length) return <EmptyState msg="No import history yet." />;

  return (
    <div className="space-y-2">
      {selected && (
        <div className="bg-gray-800/50 rounded p-3 border border-gray-700/50 space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-gray-300 font-medium">
              Job #{selected.id} — {selected.source_name}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-400 hover:text-white text-xs"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span className="text-gray-500">Status:</span>
            <span className={statusColor(selected.status)}>{selected.status}</span>
            <span className="text-gray-500">Table:</span>
            <span className="text-gray-300">{selected.target_table}</span>
            <span className="text-gray-500">Mode:</span>
            <span className="text-gray-300">{selected.import_mode}</span>
            <span className="text-gray-500">Total:</span>
            <span className="text-gray-300">{fmtNum(selected.total_rows)}</span>
            <span className="text-gray-500">Imported:</span>
            <span className="text-green-400">{fmtNum(selected.imported_rows)}</span>
            <span className="text-gray-500">Errors:</span>
            <span className="text-red-400">{fmtNum(selected.error_rows)}</span>
          </div>
          {selected.error_log && selected.error_log.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase mt-1">Errors (first 10)</p>
              {selected.error_log.slice(0, 10).map((err, i) => (
                <div key={i} className="text-[10px] text-red-300 py-0.5">
                  Row {err.row}: {err.field} — {err.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {jobs.map((j) => (
        <button
          key={j.id}
          onClick={() => viewDetail(j.id)}
          className={`w-full text-left rounded p-2 border text-xs transition-colors ${statusBg(j.status)} hover:bg-gray-700/30`}
        >
          <div className="flex justify-between">
            <span className="text-gray-200 truncate">{j.source_name}</span>
            <span className={statusColor(j.status)}>{j.status}</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
            <span>{j.target_table} · {j.import_mode}</span>
            <span>{fmtNum(j.imported_rows)}/{fmtNum(j.total_rows)} rows</span>
          </div>
          {j.created_at && (
            <div className="text-[10px] text-gray-600 mt-0.5">
              {new Date(j.created_at).toLocaleDateString()} {new Date(j.created_at).toLocaleTimeString()}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Tab: Data Stats ───

function StatsTab() {
  const [stats, setStats] = useState<Record<string, TableStats> | null>(null);
  const [schemas, setSchemas] = useState<Record<string, ImportSchema> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchImportStats(), fetchImportSchemas()])
      .then(([s, sc]) => { setStats(s); setSchemas(sc); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <EmptyState msg="No stats available." />;

  return (
    <div className="space-y-2">
      {Object.entries(stats).map(([table, info]) => (
        <div key={table} className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-200 font-medium">{table}</span>
            <span className="text-sm text-cyan-300 font-mono">{fmtNum(info.row_count)}</span>
          </div>
          {info.year_range && (
            <p className="text-[10px] text-gray-500">
              Years: {info.year_range.min} — {info.year_range.max}
            </p>
          )}
          {schemas?.[table] && (
            <div className="mt-1">
              <p className="text-[10px] text-gray-500">
                Columns: {Object.keys(schemas[table].columns).length}
                {" · "}Required: {schemas[table].required_columns.join(", ")}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Connectors ───

function ConnectorsTab() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchImportConnectors()
      .then(setConnectors)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-1">Available external data sources</p>
      {connectors.map((c) => (
        <div key={c.id} className="bg-gray-800/50 rounded p-3 border border-gray-700/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-200 font-medium">{c.name}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{c.description}</p>
            </div>
            {c.requires_api_key && (
              <span className="text-[10px] text-yellow-400 bg-yellow-500/20 px-1.5 py-0.5 rounded">
                API key
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            Target: <span className="text-gray-300">{c.target_table}</span>
          </div>
          {c.indicators && (
            <div className="mt-1 text-[10px] text-gray-500">
              Indicators: {c.indicators.map(([code, field]: [string, string]) => (
                <span key={code} className="inline-block bg-gray-700/50 rounded px-1 py-0.5 mr-1 mt-0.5 text-gray-400">
                  {field}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Shared ───

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent" />
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <p className="text-center text-gray-500 text-xs py-6">{msg}</p>;
}

// ─── Main Panel ───

const TABS = ["Upload", "History", "Stats", "Connectors"] as const;
type TabName = (typeof TABS)[number];

interface Props {
  onClose: () => void;
}

export default function ImportPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabName>("Upload");

  return (
    <div className="absolute top-16 right-4 w-[440px] max-h-[calc(100vh-5rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          📁 Data Import
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-2 transition-colors ${
              activeTab === tab
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-gray-700">
        {activeTab === "Upload" && <UploadTab />}
        {activeTab === "History" && <HistoryTab />}
        {activeTab === "Stats" && <StatsTab />}
        {activeTab === "Connectors" && <ConnectorsTab />}
      </div>
    </div>
  );
}
