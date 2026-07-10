/**
 * Season model — every transaction belongs to a season. This module owns
 * CRUD + the "current active season" concept so every page (Khata, Dealers,
 * Loans, Overview, Reports) resolves seasons the same way.
 */
import {
  collection, query, where, onSnapshot, orderBy,
  addDoc, updateDoc, doc, serverTimestamp, getDocs, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export type SeasonStatus = "Active" | "Completed";

export interface Season {
  id: string;
  organizationId: string;
  name: string;
  year: number;
  startDate: string; // yyyy-mm-dd
  endDate: string;   // yyyy-mm-dd
  status: SeasonStatus;
  createdAt?: any;
  updatedAt?: any;
}

export function subscribeSeasons(orgId: string, cb: (seasons: Season[]) => void) {
  const q = query(collection(db, "seasons"), where("organizationId", "==", orgId));
  return onSnapshot(q, (snap) => {
    const seasons = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Season))
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    cb(seasons);
  });
}

export async function createSeason(input: {
  organizationId: string; name: string; year: number;
  startDate: string; endDate: string; status?: SeasonStatus;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "seasons"), {
    organizationId: input.organizationId,
    name: input.name.trim(),
    year: input.year,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status || "Active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    syncStatus: "synced",
  });
  return docRef.id;
}

export async function updateSeason(
  id: string,
  patch: Partial<Pick<Season, "name" | "year" | "startDate" | "endDate" | "status">>
) {
  await updateDoc(doc(db, "seasons", id), { ...patch, updatedAt: serverTimestamp() });
}

/**
 * Returns the org's current Active season whose date range contains today,
 * falling back to the most recently created Active season, then the newest
 * season of any status. Used as the default seasonId when a form doesn't let
 * the user pick one, and as the "Current Season" filter option on Overview.
 */
export async function getActiveSeason(orgId: string): Promise<Season | null> {
  const snap = await getDocs(query(collection(db, "seasons"), where("organizationId", "==", orgId)));
  const seasons = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Season));
  if (seasons.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];
  const active = seasons.filter((s) => s.status === "Active");
  const withinRange = active.find((s) => s.startDate <= today && (s.endDate || "9999-12-31") >= today);
  if (withinRange) return withinRange;
  if (active.length > 0) {
    return active.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  }
  return seasons.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
}

/**
 * Ensures every org has at least one season. Called from the migration step
 * and from any "add transaction" flow that finds zero seasons — this keeps
 * the "every transaction must belong to a season" rule true from day one
 * without forcing the user through setup before they can record anything.
 */
export async function ensureDefaultSeason(orgId: string): Promise<Season> {
  const existing = await getActiveSeason(orgId);
  if (existing) return existing;

  const now = new Date();
  const year = now.getFullYear();
  const id = await createSeason({
    organizationId: orgId,
    name: `Season ${year}`,
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    status: "Active",
  });
  return {
    id, organizationId: orgId, name: `Season ${year}`, year,
    startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: "Active",
  };
}
