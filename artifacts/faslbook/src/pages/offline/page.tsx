import { useState, useEffect } from "react";
import { WifiOff, Download, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { downloadOfflineData, hasOfflineCache, getOfflineCacheInfo, type DownloadProgress } from "@/lib/offlineCache";
import { formatLastSynced } from "@/lib/hooks/useSyncStatus";

export default function OfflinePage() {
  const { organization } = useAuthStore();
  const orgId = organization?.id ?? null;

  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");
  const [hasCache, setHasCache] = useState(() => hasOfflineCache(orgId));

  useEffect(() => {
    setHasCache(hasOfflineCache(orgId));
  }, [orgId]);

  const handleRetry = async () => {
    setRetrying(true);
    await new Promise((r) => setTimeout(r, 1200));
    if (navigator.onLine) {
      window.location.reload();
    } else {
      setRetrying(false);
    }
  };

  const handleDownload = async () => {
    if (!orgId) {
      setError("No farm selected yet — log in while online first.");
      return;
    }
    if (!navigator.onLine) {
      setError("Still offline — connect to the internet to download data.");
      return;
    }
    setError("");
    setDownloading(true);
    setDownloaded(false);
    try {
      await downloadOfflineData(orgId, setProgress);
      setHasCache(true);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to download data.");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const cacheInfo = getOfflineCacheInfo();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: "#FFEBEE" }}
      >
        <WifiOff size={44} color="#C62828" />
      </div>

      <h1 className="text-2xl font-bold text-gray-800 mb-2">You're Offline</h1>
      <p className="text-gray-500 text-sm mb-1">No internet connection detected.</p>

      {hasCache ? (
        <p className="text-green-700 text-sm font-medium mb-2">
          ✓ Saved data is available — you can continue working.
        </p>
      ) : (
        <p className="text-red-600 text-sm font-medium mb-2">
          No saved data found. Download data first to use offline.
        </p>
      )}

      {hasCache && cacheInfo && (
        <p className="text-gray-400 text-xs mb-6">
          Last downloaded {formatLastSynced(cacheInfo.downloadedAt)} · {cacheInfo.documents} records
        </p>
      )}
      {!hasCache && <div className="mb-6" />}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl mb-4 max-w-xs">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform disabled:opacity-70"
          style={{ backgroundColor: "#1B5E20" }}
        >
          {retrying ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              Checking connection…
            </>
          ) : (
            <>
              <RefreshCw size={20} />
              Try Again
            </>
          )}
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading || !navigator.onLine}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-base active:scale-95 transition-transform border-2 disabled:opacity-60"
          style={{ borderColor: "#1565C0", color: "#1565C0", backgroundColor: "#E3F2FD" }}
        >
          {downloading ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              {progress ? `Downloading (${progress.done}/${progress.total})…` : "Downloading…"}
            </>
          ) : downloaded ? (
            <>
              <CheckCircle2 size={20} color="#1B5E20" />
              <span style={{ color: "#1B5E20" }}>Data Downloaded!</span>
            </>
          ) : (
            <>
              <Download size={20} />
              {hasCache ? "Re-download Data" : "Download Data for Offline"}
            </>
          )}
        </button>
      </div>

      <div className="mt-10 px-4 py-4 rounded-2xl max-w-xs w-full" style={{ backgroundColor: "#FFF8E1" }}>
        <p className="text-amber-700 text-xs text-center">
          💡 <strong>Tip:</strong> Download your farm data while connected so it stays available offline. Any changes you make offline sync automatically once you reconnect.
        </p>
      </div>
    </div>
  );
}
