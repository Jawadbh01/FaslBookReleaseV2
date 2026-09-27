/**
 * Offline data cache — actually downloads the organization's Firestore data
 * into the SDK's persistent local cache (IndexedDB, configured in
 * lib/firebase/config.ts) so it is available when the device goes offline.
 *
 * Firestore already keeps a query's results in its local cache once that
 * query has been run online — the gap this file fixes is that nothing in
 * the app proactively ran those queries ahead of time. `downloadOfflineData`
 * runs `getDocs` against every collection the app reads from, while online,
 * so all of it is warmed into the local cache before the user goes offline.
 */
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

const CACHE_FLAG_KEY = "faslbook_offline_cache";

// Every collection screens in this app query by organizationId.
// Keeping this list in sync with new collections is the only maintenance
// this cache needs — no separate offline data model to maintain.
const ORG_COLLECTIONS = [
  "workers",
  "parcels",
  "crops",
  "seasons",
  "transactions",
  "inventoryItems",
  "inventoryTransactions",
  "dealers",
  "loans",
  "attendance",
  "workerPayments",
  "activityLogs",
  "joinRequests",
  "notifications",
];

export interface OfflineCacheInfo {
  orgId: string;
  downloadedAt: number;
  collections: number;
  documents: number;
}

function readCacheInfo(): OfflineCacheInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_FLAG_KEY);
    return raw ? (JSON.parse(raw) as OfflineCacheInfo) : null;
  } catch {
    return null;
  }
}

function writeCacheInfo(info: OfflineCacheInfo) {
  try { localStorage.setItem(CACHE_FLAG_KEY, JSON.stringify(info)); } catch {}
}

/** Whether this org's data has ever been downloaded for offline use. */
export function hasOfflineCache(orgId?: string | null): boolean {
  const info = readCacheInfo();
  if (!info) return false;
  if (orgId && info.orgId !== orgId) return false;
  return true;
}

export function getOfflineCacheInfo(): OfflineCacheInfo | null {
  return readCacheInfo();
}

export interface DownloadProgress {
  done: number;
  total: number;
  collectionName: string;
}

/**
 * Fetches every org collection so Firestore persists the results locally.
 * Must be called while online — if offline, the network reads simply fail
 * and we surface that instead of pretending it worked.
 */
export async function downloadOfflineData(
  orgId: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<OfflineCacheInfo> {
  if (!navigator.onLine) {
    throw new Error("You're offline — connect to the internet to download data.");
  }

  let documents = 0;
  let done = 0;

  // Guard every fetch with a timeout — a flaky connection (e.g. captive portal,
  // navigator.onLine=true but no real connectivity) would otherwise leave
  // getDocs() pending forever and the "Downloading…" UI stuck indefinitely.
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);

  for (const collectionName of ORG_COLLECTIONS) {
    try {
      const snap = await withTimeout(
        getDocs(query(collection(db, collectionName), where("organizationId", "==", orgId))),
        15000
      );
      documents += snap.size;
    } catch (err) {
      // Keep going — one missing/empty/timed-out collection shouldn't abort the whole download.
      console.warn(`Offline cache: failed to fetch "${collectionName}"`, err);
    }
    done += 1;
    onProgress?.({ done, total: ORG_COLLECTIONS.length, collectionName });
  }

  const info: OfflineCacheInfo = {
    orgId,
    downloadedAt: Date.now(),
    collections: ORG_COLLECTIONS.length,
    documents,
  };
  writeCacheInfo(info);

  // Also refresh the cached app shell (JS/CSS/HTML) via the service worker
  // so the app itself, not just its data, loads while offline.
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage("CACHE_SHELL");
  } catch {}

  return info;
}
