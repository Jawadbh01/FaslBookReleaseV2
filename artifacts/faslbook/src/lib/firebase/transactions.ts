/**
 * Central Transaction model — the single source of truth for every money
 * movement in the app (Income, Expense, Dealer Purchase/Payment, Loan
 * Taken/Repayment, and reserved "Inventory" for future cash-linked stock
 * events). Khata, Dealer Dues, Loan Dues, Expenses, Income, Reports, and the
 * Overview dashboard all read from this one collection instead of keeping
 * their own duplicated ledgers/running totals.
 */
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { notifyOfflineSave } from "@/lib/offlineSync";

export type TransactionType =
  | "income"
  | "expense"
  | "dealerPurchase"
  | "dealerPayment"
  | "loanTaken"
  | "loanRepayment"
  | "inventory";

export interface Transaction {
  id: string;
  organizationId: string;
  seasonId?: string;
  seasonName?: string;
  cropCycleId?: string;
  cropCycleName?: string;
  type: TransactionType;
  amount: number;
  date: string; // yyyy-mm-dd
  description: string;
  category?: string;
  categoryLabel?: string;
  cropId?: string;
  parcelId?: string;
  parcelName?: string;
  dealerId?: string;
  dealerName?: string;
  loanId?: string;
  loanName?: string;
  farmerId?: string;
  farmerName?: string;
  notes?: string;
  receiptUrl?: string;
  proofUrl?: string;
  paymentType?: "cash" | "credit";
  createdBy?: string;
  createdByName?: string;
  createdAt?: any;
  editedAt?: any;
}

export function subscribeTransactions(orgId: string, cb: (txns: Transaction[]) => void) {
  const q = query(collection(db, "transactions"), where("organizationId", "==", orgId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
  });
}

export async function addTransaction(
  input: Omit<Transaction, "id" | "createdAt" | "createdBy" | "createdByName">,
  toastLabel?: string
): Promise<string> {
  const online = navigator.onLine;
  const payload = {
    ...input,
    createdBy: auth.currentUser?.uid || "",
    createdByName: auth.currentUser?.displayName || "",
    createdAt: serverTimestamp(),
    syncStatus: online ? "synced" : "pending",
  };

  if (!online) {
    // Offline: fire-and-forget — Firestore queues the write locally, never hangs
    addDoc(collection(db, "transactions"), payload).catch(console.error);
    const typeLabels: Record<string, string> = {
      income: "Income", expense: "Expense",
      dealerPurchase: "Purchase", dealerPayment: "Payment",
      loanTaken: "Loan", loanRepayment: "Repayment", inventory: "Inventory",
    };
    notifyOfflineSave(toastLabel || typeLabels[input.type] || "Transaction");
    return ""; // ID not available offline — callers must not rely on it when offline
  }

  const docRef = await addDoc(collection(db, "transactions"), payload);
  return docRef.id;
}

/** Sum helper shared by every module that derives a running total from transactions. */
export function sumByType(txns: Transaction[], types: TransactionType[]): number {
  return txns
    .filter((t) => types.includes(t.type))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export function filterByDateRange(txns: Transaction[], start?: string, end?: string): Transaction[] {
  return txns.filter((t) => {
    if (!t.date) return false;
    if (start && t.date < start) return false;
    if (end && t.date > end) return false;
    return true;
  });
}

/** Filters shared by Reports/Dashboard so every screen slices transactions the same way. */
export function filterByCropCycle(txns: Transaction[], cropCycleId?: string): Transaction[] {
  if (!cropCycleId) return txns;
  return txns.filter((t) => t.cropCycleId === cropCycleId);
}

export function filterBySeason(txns: Transaction[], seasonId?: string): Transaction[] {
  if (!seasonId) return txns;
  return txns.filter((t) => t.seasonId === seasonId);
}

export function filterByFarmer(txns: Transaction[], farmerId?: string): Transaction[] {
  if (!farmerId) return txns;
  return txns.filter((t) => t.farmerId === farmerId);
}

export function filterByParcel(txns: Transaction[], parcelId?: string): Transaction[] {
  if (!parcelId) return txns;
  return txns.filter((t) => t.parcelId === parcelId);
}
