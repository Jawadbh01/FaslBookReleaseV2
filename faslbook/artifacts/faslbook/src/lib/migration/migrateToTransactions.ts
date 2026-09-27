/**
 * One-time, per-organization migration that copies existing money-movement
 * data (ledgerEntries income/expense/loan/dealer entries) into the new
 * unified `transactions` collection so no historical data is lost when the
 * app switches to the single-Transaction architecture. Idempotent: gated by
 * `organizations/{orgId}.transactionsMigrated`, and safe to re-run (it
 * re-checks the flag before writing).
 */
import {
  collection, query, where, getDocs, doc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ensureDefaultSeason } from "@/lib/firebase/seasons";
import type { TransactionType } from "@/lib/firebase/transactions";

function mapLedgerEntryType(data: any): TransactionType | null {
  const type = data.type;
  if (type === "credit") return "income";
  if (type === "debit") return "expense";
  if (type === "loan") return "loanTaken";
  if (type === "loanPayment") return "loanRepayment";
  if (type === "dealerCredit") return "dealerPurchase";
  if (type === "dealerPayment") return "dealerPayment";
  return null;
}

export async function migrateOrgToTransactions(orgId: string): Promise<void> {
  const orgRef = doc(db, "organizations", orgId);
  const orgSnap = await getDocs(query(collection(db, "organizations"), where("__name__", "==", orgId)));
  const orgData = orgSnap.docs[0]?.data();
  if (orgData?.transactionsMigrated) return;

  // Extra safety net: if transactions already exist for this org, don't
  // duplicate them even if the flag write previously failed partway through.
  const existingTxns = await getDocs(query(collection(db, "transactions"), where("organizationId", "==", orgId), where("migrated", "==", true)));
  if (!existingTxns.empty) {
    await updateDoc(orgRef, { transactionsMigrated: true });
    return;
  }

  const season = await ensureDefaultSeason(orgId);

  const ledgerSnap = await getDocs(query(collection(db, "ledgerEntries"), where("organizationId", "==", orgId)));

  const rows: any[] = [];
  ledgerSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const type = mapLedgerEntryType(data);
    if (!type) return;

    let date = data.date;
    if (!date && data.createdAt?.toDate) date = data.createdAt.toDate().toISOString().split("T")[0];
    if (!date) date = new Date().toISOString().split("T")[0];

    rows.push({
      organizationId: orgId,
      seasonId: season.id,
      type,
      amount: Number(data.amount) || 0,
      date,
      description: data.description || data.categoryLabel || data.category || "",
      category: data.category || "",
      categoryLabel: data.categoryLabel || "",
      cropId: data.cropId || "",
      parcelId: data.parcelId || "",
      parcelName: data.parcelName || "",
      dealerId: data.dealerId || (data.sourceType === "dealer" ? data.sourceId || "" : ""),
      dealerName: data.dealerName || "",
      loanId: data.sourceType === "loan" ? data.sourceId || "" : "",
      farmerId: data.farmerId || "",
      farmerName: data.farmerName || "",
      notes: data.notes || "",
      receiptUrl: data.receiptUrl || "",
      proofUrl: data.proofUrl || "",
      createdBy: data.createdBy || "",
      createdAt: data.createdAt || null,
      migrated: true,
      syncStatus: "synced",
    });
  });

  // Batch writes (Firestore caps a batch at 500 ops).
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = rows.slice(i, i + 400);
    chunk.forEach((row) => {
      const newDocRef = doc(collection(db, "transactions"));
      batch.set(newDocRef, row);
    });
    await batch.commit();
  }

  await updateDoc(orgRef, { transactionsMigrated: true, transactionsMigratedAt: new Date().toISOString() });
}
