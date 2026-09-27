/**
 * Crop Cycle model — replaces "Season" as the primary organizing unit for
 * every transaction. A Crop Cycle can optionally reference a Season (kept
 * for backward compatibility / historical grouping), but the org can have
 * multiple Active crop cycles at once (e.g. Wheat 2026 and Cotton 2026
 * running in parallel). Every module that used to key off `seasonId`
 * (Khata, Dealers, Loans, Overview, Reports) now keys off `cropCycleId`,
 * with `seasonId` auto-filled from the chosen crop cycle but left editable.
 */
import {
  collection, query, where, onSnapshot, orderBy,
  addDoc, updateDoc, doc, serverTimestamp, getDocs, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export type CropCycleStatus = "Active" | "Completed";

export interface CropCycle {
  id: string;
  organizationId: string;
  name: string;
  crop: string;
  seasonId?: string;
  seasonName?: string;
  startDate: string; // yyyy-mm-dd
  endDate: string;   // yyyy-mm-dd
  status: CropCycleStatus;
  createdAt?: any;
  updatedAt?: any;
}

export async function getCropCycle(orgId: string, id: string): Promise<CropCycle | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, "cropCycles", id));
  if (!snap.exists()) return null;
  const cropCycle = { id: snap.id, ...snap.data() } as CropCycle;
  return cropCycle.organizationId === orgId ? cropCycle : null;
}

export function subscribeCropCycles(orgId: string, cb: (cropCycles: CropCycle[]) => void) {
  const q = query(collection(db, "cropCycles"), where("organizationId", "==", orgId));
  return onSnapshot(q, (snap) => {
    const cycles = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CropCycle))
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    cb(cycles);
  });
}

export async function createCropCycle(input: {
  organizationId: string; name: string; crop: string;
  seasonId?: string; seasonName?: string;
  startDate: string; endDate: string; status?: CropCycleStatus;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "cropCycles"), {
    organizationId: input.organizationId,
    name: input.name.trim(),
    crop: input.crop.trim(),
    seasonId: input.seasonId || "",
    seasonName: input.seasonName || "",
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status || "Active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    syncStatus: "synced",
  });
  return docRef.id;
}

export async function updateCropCycle(
  id: string,
  patch: Partial<Pick<CropCycle, "name" | "crop" | "seasonId" | "seasonName" | "startDate" | "endDate" | "status">>
) {
  await updateDoc(doc(db, "cropCycles", id), { ...patch, updatedAt: serverTimestamp() });
}

/**
 * Returns every Active crop cycle for the org — used by transaction forms
 * (a farmer can be logging expenses against any of several concurrently
 * running crop cycles) and by the Overview "Current Crop Cycle" filter.
 */
export async function getActiveCropCycles(orgId: string): Promise<CropCycle[]> {
  const snap = await getDocs(query(collection(db, "cropCycles"), where("organizationId", "==", orgId), where("status", "==", "Active")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CropCycle))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
}

/**
 * Returns the single "current" crop cycle used as the default selection in
 * forms and as the Overview dashboard's default filter: the Active cycle
 * whose date range contains today, falling back to the most recently
 * started Active cycle, then the newest cycle of any status.
 */
export async function getCurrentCropCycle(orgId: string): Promise<CropCycle | null> {
  const snap = await getDocs(query(collection(db, "cropCycles"), where("organizationId", "==", orgId)));
  const cycles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CropCycle));
  if (cycles.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];
  const active = cycles.filter((c) => c.status === "Active");
  const withinRange = active.find((c) => c.startDate <= today && (c.endDate || "9999-12-31") >= today);
  if (withinRange) return withinRange;
  if (active.length > 0) {
    return active.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  }
  return cycles.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
}

/**
 * Ensures every org has at least one crop cycle, mirroring the old
 * ensureDefaultSeason fallback so "every transaction requires a crop cycle"
 * never blocks a first-time user before they set one up manually.
 */
export async function ensureDefaultCropCycle(orgId: string): Promise<CropCycle> {
  const existing = await getCurrentCropCycle(orgId);
  if (existing) return existing;

  const now = new Date();
  const year = now.getFullYear();
  const name = `Crop Cycle ${year}`;
  const id = await createCropCycle({
    organizationId: orgId,
    name,
    crop: "General",
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    status: "Active",
  });
  return {
    id, organizationId: orgId, name, crop: "General",
    startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: "Active",
  };
}
