import {
  collection, doc, writeBatch,
  serverTimestamp, getDoc, increment,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { getCropCycle } from "@/lib/firebase/cropCycles";

interface FarmerTransferInput {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  farmerId: string;
  farmerName: string;
  organizationId: string;
  notes: string;
  pricePerUnit?: number;
  cropCycleId: string;
}

export async function runFarmerTransferWorkflow(input: FarmerTransferInput) {
  const cropCycle = await getCropCycle(input.organizationId, input.cropCycleId);
  const batch = writeBatch(db);
  const user = auth.currentUser;
  const now = serverTimestamp();

  // ── 1. Decrement godown stock ──────────────────────────────
  const itemRef = doc(db, "inventoryItems", input.itemId);
  batch.update(itemRef, {
    currentStock: increment(-input.quantity),
    updatedAt: now,
  });

  // ── 2. Inventory transaction (out) ────────────────────────
  const txRef = doc(collection(db, "inventoryTransactions"));
  batch.set(txRef, {
    id: txRef.id,
    organizationId: input.organizationId,
    itemId: input.itemId,
    itemName: input.itemName,
    type: "out",
    source: "farmerTransfer",
    quantity: input.quantity,
    unit: input.unit,
    relatedFarmerId: input.farmerId,
    relatedFarmerName: input.farmerName,
    notes: input.notes,
    createdBy: user?.uid || "",
    createdAt: now,
    syncStatus: "synced",
  });

  // ── 3. Upsert farmer stock ─────────────────────────────────
  const farmerStockId = `${input.farmerId}_${input.itemId}`;
  const farmerStockRef = doc(db, "farmerStock", farmerStockId);
  const farmerStockSnap = await getDoc(farmerStockRef);

  if (!farmerStockSnap.exists()) {
    batch.set(farmerStockRef, {
      id: farmerStockId,
      organizationId: input.organizationId,
      farmerId: input.farmerId,
      farmerName: input.farmerName,
      itemId: input.itemId,
      itemName: input.itemName,
      unit: input.unit,
      quantity: input.quantity,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
    });
  } else {
    batch.update(farmerStockRef, {
      quantity: increment(input.quantity),
      updatedAt: now,
      syncStatus: "synced",
    });
  }

  // ── 4. Transaction (expense) — only recorded when a price is set ──
  const amount = Math.round((input.pricePerUnit || 0) * input.quantity);
  const txnRef = doc(collection(db, "transactions"));
  if (amount > 0) {
    batch.set(txnRef, {
      id: txnRef.id,
      organizationId: input.organizationId,
      cropCycleId: input.cropCycleId,
      cropCycleName: cropCycle?.name || "",
      seasonId: cropCycle?.seasonId || "",
      seasonName: cropCycle?.seasonName || "",
      type: "expense",
      category: "stockTransfer",
      categoryLabel: "Godown Transfer",
      amount,
      date: new Date().toISOString().split("T")[0],
      farmerId: input.farmerId,
      farmerName: input.farmerName,
      notes: `Transferred ${input.quantity} ${input.unit} of ${input.itemName} to ${input.farmerName}`,
      description: `Transferred ${input.quantity} ${input.unit} of ${input.itemName} to ${input.farmerName}`,
      createdBy: user?.uid || "",
      createdByName: user?.displayName || "",
      createdAt: now,
      syncStatus: "synced",
    });
  }

  // ── 5. Activity log ────────────────────────────────────────
  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    id: logRef.id,
    organizationId: input.organizationId,
    userId: user?.uid || "",
    userName: user?.displayName || "",
    action: "FARMER_STOCK_TRANSFER",
    description: `Transferred ${input.quantity} ${input.unit} of ${input.itemName} to ${input.farmerName}`,
    recordId: txRef.id,
    recordType: "inventoryTransactions",
    createdAt: now,
    syncStatus: "synced",
  });

  await batch.commit();
  return { success: true, txId: txRef.id };
}
