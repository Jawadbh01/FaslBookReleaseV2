/**
 * One-time, per-organization migration from the old Season-first model to
 * Crop Cycle-first: every existing Season becomes a Crop Cycle (crop
 * defaulted to "General" since Seasons never tracked a crop), and every
 * transaction that pointed at a seasonId gets backfilled with the matching
 * cropCycleId/cropCycleName. Idempotent: gated by
 * `organizations/{orgId}.cropCyclesMigrated`, safe to re-run.
 */
import {
  collection, query, where, getDocs, doc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Season } from "@/lib/firebase/seasons";
import { createCropCycle, type CropCycle } from "@/lib/firebase/cropCycles";

export async function migrateSeasonsToCropCycles(orgId: string): Promise<void> {
  const orgRef = doc(db, "organizations", orgId);
  const orgSnap = await getDocs(query(collection(db, "organizations"), where("__name__", "==", orgId)));
  const orgData = orgSnap.docs[0]?.data();
  if (orgData?.cropCyclesMigrated) return;

  const seasonsSnap = await getDocs(query(collection(db, "seasons"), where("organizationId", "==", orgId)));
  const seasons = seasonsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Season));

  const existingCyclesSnap = await getDocs(query(collection(db, "cropCycles"), where("organizationId", "==", orgId)));
  const existingCycles = existingCyclesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CropCycle));
  const cycleBySeasonId = new Map<string, CropCycle>();
  existingCycles.forEach((c) => { if (c.seasonId) cycleBySeasonId.set(c.seasonId, c); });

  // Create a CropCycle for every Season that doesn't already have one.
  for (const season of seasons) {
    if (cycleBySeasonId.has(season.id)) continue;
    const newId = await createCropCycle({
      organizationId: orgId,
      name: season.name,
      crop: "General",
      seasonId: season.id,
      seasonName: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      status: season.status,
    });
    cycleBySeasonId.set(season.id, {
      id: newId, organizationId: orgId, name: season.name, crop: "General",
      seasonId: season.id, seasonName: season.name,
      startDate: season.startDate, endDate: season.endDate, status: season.status,
    });
  }

  // Backfill transactions that reference a seasonId but have no cropCycleId yet.
  const txnsSnap = await getDocs(query(collection(db, "transactions"), where("organizationId", "==", orgId)));
  const updates: { id: string; cropCycleId: string; cropCycleName: string }[] = [];
  txnsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.cropCycleId) return;
    if (!data.seasonId) return;
    const cycle = cycleBySeasonId.get(data.seasonId);
    if (!cycle) return;
    updates.push({ id: docSnap.id, cropCycleId: cycle.id, cropCycleName: cycle.name });
  });

  for (let i = 0; i < updates.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + 400);
    chunk.forEach((u) => {
      batch.update(doc(db, "transactions", u.id), { cropCycleId: u.cropCycleId, cropCycleName: u.cropCycleName });
    });
    await batch.commit();
  }

  await updateDoc(orgRef, { cropCyclesMigrated: true, cropCyclesMigratedAt: new Date().toISOString() });
}
