import {
  collection, doc, writeBatch,
  serverTimestamp, getDoc, addDoc,
  increment, setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { auth } from "@/lib/firebase/config";

interface HarvestInput {
  cropId: string;
  cropName: string;
  parcelId: string;
  parcelName: string;
  organizationId: string;
  quantity: number;
  unit: string;
  harvestDate: Date;
  notes: string;
}

export async function runHarvestWorkflow(input: HarvestInput) {
  const batch = writeBatch(db);
  const user = auth.currentUser;
  const now = serverTimestamp();

  // ── 1. Update crop status → harvested ─────────────────────
  const cropRef = doc(db, "crops", input.cropId);
  batch.update(cropRef, {
    status: "harvested",
    actualHarvest: input.harvestDate,
    harvestedQuantity: input.quantity,
    harvestUnit: input.unit,
    harvestNotes: input.notes,
    updatedAt: now,
  });

  // ── 2. Find or create inventory item ──────────────────────
  const itemId = `${input.organizationId}_${input.cropName.toLowerCase().replace(/\s+/g, "_")}`;
  const itemRef = doc(db, "inventoryItems", itemId);
  const itemSnap = await getDoc(itemRef);

  if (!itemSnap.exists()) {
    batch.set(itemRef, {
      id: itemId,
      organizationId: input.organizationId,
      name: input.cropName,
      category: "cropStock",
      unit: input.unit,
      currentStock: input.quantity,
      pricePerUnit: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
    });
  } else {
    batch.update(itemRef, {
      currentStock: increment(input.quantity),
      updatedAt: now,
    });
  }

  // ── 3. Create inventory transaction ───────────────────────
  const txRef = doc(collection(db, "inventoryTransactions"));
  batch.set(txRef, {
    id: txRef.id,
    organizationId: input.organizationId,
    itemId,
    itemName: input.cropName,
    type: "in",
    source: "harvest",
    quantity: input.quantity,
    unit: input.unit,
    relatedCropId: input.cropId,
    relatedParcelId: input.parcelId,
    notes: input.notes,
    createdBy: user?.uid || "",
    createdAt: now,
    syncStatus: "synced",
  });

  // ── 4. Activity log ────────────────────────────────────────
  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    id: logRef.id,
    organizationId: input.organizationId,
    userId: user?.uid || "",
    userName: user?.displayName || "",
    action: "HARVEST_RECORDED",
    description: `Harvested ${input.quantity} ${input.unit} of ${input.cropName} from ${input.parcelName}`,
    recordId: input.cropId,
    recordType: "crops",
    createdAt: now,
    syncStatus: "synced",
  });

  // ── Commit all at once ─────────────────────────────────────
  await batch.commit();

  return { success: true, itemId, txId: txRef.id };
}
