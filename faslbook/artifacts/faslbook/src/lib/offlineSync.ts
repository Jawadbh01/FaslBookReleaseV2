/**
 * Offline sync tracking — lightweight localStorage counter that knows
 * how many writes have been queued while offline. Firebase handles the
 * actual queuing and network sync; this module tracks the count so the
 * UI can tell the user "3 records pending sync" and then "All synced!"
 */

const PENDING_KEY  = "faslbook_pending_writes";
const OFFLINE_SAVE_EVENT = "faslbook:offline-save";
const SYNC_COMPLETE_EVENT = "faslbook:sync-complete";

// ── Pending count ──────────────────────────────────────────────

export function getPendingCount(): number {
  try { return parseInt(localStorage.getItem(PENDING_KEY) || "0", 10) || 0; } catch { return 0; }
}

export function incrementPending(by = 1) {
  try {
    const next = getPendingCount() + by;
    localStorage.setItem(PENDING_KEY, String(next));
    window.dispatchEvent(new CustomEvent("faslbook:pending-changed", { detail: next }));
  } catch {}
}

export function clearPending() {
  try {
    const old = getPendingCount();
    localStorage.setItem(PENDING_KEY, "0");
    if (old > 0) {
      window.dispatchEvent(new CustomEvent("faslbook:pending-changed", { detail: 0 }));
      window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT, { detail: { count: old } }));
    }
  } catch {}
}

// ── Toast events ───────────────────────────────────────────────

export interface OfflineSavePayload {
  label?: string;
  count?: number;
}

/**
 * Fire this after every write that happened while the device was offline.
 * The OfflineSaveToast component listens for this event and shows feedback.
 */
export function notifyOfflineSave(label?: string) {
  incrementPending();
  window.dispatchEvent(
    new CustomEvent<OfflineSavePayload>(OFFLINE_SAVE_EVENT, {
      detail: { label: label || "Record", count: getPendingCount() },
    })
  );
}

/**
 * Wraps any async save function and automatically shows the right feedback:
 * - Online  → "Saved" (no extra toast needed, form closes normally)
 * - Offline → fires notifyOfflineSave so global toast appears
 *
 * Returns { online: boolean } so the caller can choose to close the form
 * or show its own success state.
 */
export async function offlineSave<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; online: boolean }> {
  const online = navigator.onLine;
  const result = await fn(); // Firebase queues automatically if offline
  if (!online) notifyOfflineSave(label);
  return { result, online };
}

// ── Event helpers for listeners ─────────────────────────────────

export { OFFLINE_SAVE_EVENT, SYNC_COMPLETE_EVENT };
