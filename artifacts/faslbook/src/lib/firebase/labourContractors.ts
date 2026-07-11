/**
 * Labour Contractor (Jamadar) module.
 * Tracks contractors who bring harvest teams, harvest job records,
 * and links every payment to the central transactions collection.
 */
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";

// ── Contractor ─────────────────────────────────────────────────
export interface LabourContractor {
  id: string;
  name: string;
  phone?: string;
  teamSize: number;
  notes?: string;
  organizationId: string;
  createdBy: string;
  createdAt: any;
  syncStatus: string;
  edited?: boolean;
}

// ── Harvest Record ────────────────────────────────────────────
export type HarvestPaymentType   = "perAcre" | "perMaund" | "fixed";
export type HarvestPaymentStatus = "pending" | "partial" | "paid";

export interface HarvestLabourRecord {
  id: string;
  contractorId: string;
  contractorName: string;
  cropCycleId: string;
  cropCycleName: string;
  parcelId: string;
  parcelName: string;
  harvestDate: string;            // yyyy-mm-dd
  paymentType: HarvestPaymentType;
  rate: number;
  quantity?: number;              // acres or maunds; omit for fixed
  totalAmount: number;
  advancePaid: number;
  remainingBalance: number;       // totalAmount − advancePaid (auto-calculated)
  paymentStatus: HarvestPaymentStatus;
  notes?: string;
  transactionId?: string;         // linked expense transaction id
  organizationId: string;
  createdBy: string;
  createdAt: any;
  syncStatus: string;
  edited?: boolean;
}

// ── Subscriptions ─────────────────────────────────────────────
export function subscribeLabourContractors(
  orgId: string,
  cb: (contractors: LabourContractor[]) => void,
) {
  const q = query(
    collection(db, "labourContractors"),
    where("organizationId", "==", orgId),
  );
  return onSnapshot(q, (snap) =>
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LabourContractor))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  );
}

export function subscribeHarvestRecords(
  orgId: string,
  cb: (records: HarvestLabourRecord[]) => void,
) {
  const q = query(
    collection(db, "harvestLabourRecords"),
    where("organizationId", "==", orgId),
  );
  return onSnapshot(q, (snap) =>
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as HarvestLabourRecord))
        .sort((a, b) => (b.harvestDate > a.harvestDate ? 1 : -1)),
    ),
  );
}

// ── CRUD — Contractors ────────────────────────────────────────
export async function addLabourContractor(
  data: Pick<LabourContractor, "name" | "phone" | "teamSize" | "notes" | "organizationId">,
): Promise<string> {
  const ref = await addDoc(collection(db, "labourContractors"), {
    ...data,
    createdBy: auth.currentUser?.uid || "",
    createdAt: serverTimestamp(),
    syncStatus: navigator.onLine ? "synced" : "pending",
  });
  return ref.id;
}

export async function updateLabourContractor(
  id: string,
  data: Partial<LabourContractor>,
): Promise<void> {
  await updateDoc(doc(db, "labourContractors", id), {
    ...data,
    edited: true,
    editedAt: serverTimestamp(),
    editedBy: auth.currentUser?.uid || null,
  });
}

export async function deleteLabourContractor(id: string): Promise<void> {
  await deleteDoc(doc(db, "labourContractors", id));
}

// ── CRUD — Harvest Records ────────────────────────────────────
export async function addHarvestRecord(
  data: Omit<HarvestLabourRecord, "id" | "createdAt" | "createdBy" | "syncStatus" | "edited">,
): Promise<string> {
  const ref = await addDoc(collection(db, "harvestLabourRecords"), {
    ...data,
    createdBy: auth.currentUser?.uid || "",
    createdAt: serverTimestamp(),
    syncStatus: navigator.onLine ? "synced" : "pending",
  });
  return ref.id;
}

export async function updateHarvestRecord(
  id: string,
  data: Partial<HarvestLabourRecord>,
): Promise<void> {
  await updateDoc(doc(db, "harvestLabourRecords", id), {
    ...data,
    edited: true,
    editedAt: serverTimestamp(),
    editedBy: auth.currentUser?.uid || null,
  });
}

export async function deleteHarvestRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, "harvestLabourRecords", id));
}
