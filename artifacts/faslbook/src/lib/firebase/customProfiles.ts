/**
 * Custom Profiles — the catch-all Profile type for any person/business that
 * doesn't fit Farmer, Dealer, or Labour Contractor (e.g. Landlord, Investor,
 * Transporter). Each custom profile gets its own Khata inside the Khata Hub,
 * driven by `transactions` docs tagged with `customProfileId`.
 */
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";

export interface CustomProfile {
  id: string;
  organizationId: string;
  type: "custom";
  name: string;
  customLabel: string;   // user-chosen label, e.g. "Landlord", "Investor"
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: any;
  edited?: boolean;
}

export function subscribeCustomProfiles(
  orgId: string,
  cb: (profiles: CustomProfile[]) => void,
) {
  const q = query(collection(db, "customProfiles"), where("organizationId", "==", orgId));
  return onSnapshot(q, (snap) =>
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CustomProfile))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  );
}

export async function addCustomProfile(
  data: Pick<CustomProfile, "name" | "customLabel" | "phone" | "address" | "notes" | "organizationId">,
): Promise<string> {
  const ref = await addDoc(collection(db, "customProfiles"), {
    ...data,
    type: "custom",
    isActive: true,
    createdBy: auth.currentUser?.uid || "",
    createdAt: serverTimestamp(),
    syncStatus: navigator.onLine ? "synced" : "pending",
  });
  return ref.id;
}

export async function updateCustomProfile(
  id: string,
  data: Partial<CustomProfile>,
): Promise<void> {
  await updateDoc(doc(db, "customProfiles", id), {
    ...data,
    edited: true,
    editedAt: serverTimestamp(),
    editedBy: auth.currentUser?.uid || null,
  });
}

export async function deleteCustomProfile(id: string): Promise<void> {
  await deleteDoc(doc(db, "customProfiles", id));
}
