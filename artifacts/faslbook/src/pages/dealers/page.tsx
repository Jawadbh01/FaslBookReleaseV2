

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import {
  Plus, X, Loader2, Phone, MapPin,
  Handshake, CreditCard,
  ArrowDownLeft, ArrowUpRight, Check, Printer,
  ChevronDown, ChevronUp, Pencil,
} from "lucide-react";
import { useLocation } from "wouter";

interface Dealer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  organizationId: string;
  createdAt: any;
}

// Dealer Due = Purchases − Payments, derived live from `transactions`
// (type dealerPurchase/dealerPayment) — dealer docs hold no running totals.
interface DealerTx {
  id: string;
  dealerId: string;
  dealerName: string;
  type: "dealerPurchase" | "dealerPayment";
  description: string;
  amount: number;
  paymentType: "cash" | "credit";
  date: string;
  notes: string;
  edited?: boolean;
  editedAt?: any;
  createdAt: any;
}

const fmtTxDate = (d: any) => {
  try {
    const dt = d?.toDate ? d.toDate() : new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
};

export default function DealersPage() {
  const { organization, role } = useAuthStore();
  
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editTxSaved, setEditTxSaved] = useState(false);

  const [dForm, setDForm] = useState({
    name: "", phone: "", address: "", notes: "",
  });

  const [txForm, setTxForm] = useState({
    type: "purchase" as "purchase" | "payment",
    items: "",
    amount: "",
    paymentType: "credit" as "cash" | "credit",
    date: new Date().toISOString().split("T")[0],
    cropCycleId: "",
    notes: "",
  });

  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [dealerTxns, setDealerTxns] = useState<DealerTx[]>([]);
  const [expandedDealer, setExpandedDealer] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<DealerTx | null>(null);
  const [editForm, setEditForm] = useState({
    items: "", amount: "", paymentType: "credit" as "cash" | "credit",
    date: new Date().toISOString().split("T")[0], notes: "",
  });

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "transactions"), where("organizationId", "==", orgId), where("type", "in", ["dealerPurchase", "dealerPayment"])),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DealerTx));
        setDealerTxns(data);
      }
    );
    return () => unsub();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Dealer))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setDealers(data);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeCropCycles(orgId, setCropCycles);
  }, [orgId]);

  useEffect(() => {
    if (cropCycles.length === 0 || txForm.cropCycleId) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setTxForm((f) => ({ ...f, cropCycleId: active.id }));
  }, [cropCycles]);

  const dealerTotals = (dealerId: string) => {
    const txns = dealerTxns.filter((t) => t.dealerId === dealerId);
    const totalPurchased = txns.filter((t) => t.type === "dealerPurchase").reduce((s, t) => s + (t.amount || 0), 0);
    const totalPaid = txns.filter((t) => t.type === "dealerPayment").reduce((s, t) => s + (t.amount || 0), 0);
    return { totalPurchased, totalPaid };
  };

  const totalOutstanding = dealers.reduce((sum, d) => {
    const { totalPurchased, totalPaid } = dealerTotals(d.id);
    return sum + (totalPurchased - totalPaid);
  }, 0);

  const handleSaveDealer = async () => {
    if (!dForm.name) { setError("Dealer name is required"); return; }
    const isOnline = navigator.onLine;
    try {
      setSaving(true);
      setError("");
      const payload = {
        name: dForm.name.trim(),
        phone: dForm.phone.trim(),
        address: dForm.address.trim(),
        notes: dForm.notes.trim(),
        organizationId: orgId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      if (!isOnline) {
        addDoc(collection(db, "dealers"), payload).catch(console.error);
        notifyOfflineSave("Dealer");
        setShowAdd(false);
        setDForm({ name: "", phone: "", address: "", notes: "" });
        setSaving(false);
        return;
      }
      await addDoc(collection(db, "dealers"), payload);
      setShowAdd(false);
      setDForm({ name: "", phone: "", address: "", notes: "" });
    } catch {
      setError("Failed to save dealer.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTx = async () => {
    if (!txForm.amount || isNaN(Number(txForm.amount))) {
      setError("Please enter a valid amount");
      return;
    }
    if (txForm.type === "purchase" && !txForm.items) {
      setError("Please enter items purchased");
      return;
    }
    if (!txForm.cropCycleId) {
      setError("Please select a crop cycle");
      return;
    }
    if (!selectedDealer) return;

    const isOnline = navigator.onLine;
    try {
      setSaving(true);
      setError("");
      const amount = Number(txForm.amount);
      const cropCycle = cropCycles.find((c) => c.id === txForm.cropCycleId);
      const txPayload = {
        organizationId: orgId,
        cropCycleId: txForm.cropCycleId,
        cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "",
        seasonName: cropCycle?.seasonName || "",
        type: txForm.type === "purchase" ? "dealerPurchase" : "dealerPayment",
        dealerId: selectedDealer.id,
        dealerName: selectedDealer.name,
        amount,
        date: txForm.date,
        description: txForm.type === "purchase"
          ? (txForm.items || `Purchase from ${selectedDealer.name}`)
          : `Payment to ${selectedDealer.name}`,
        paymentType: txForm.paymentType,
        notes: txForm.notes,
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const logPayload = {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: txForm.type === "purchase" ? "DEALER_PURCHASE" : "DEALER_PAYMENT",
        description: txForm.type === "purchase"
          ? `Purchased Rs. ${amount} from ${selectedDealer.name}`
          : `Paid Rs. ${amount} to ${selectedDealer.name}`,
        recordId: selectedDealer.id,
        recordType: "dealers",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const resetTxForm = () => setTxForm({
        type: "purchase",
        items: "",
        amount: "",
        paymentType: "credit",
        date: new Date().toISOString().split("T")[0],
        cropCycleId: (cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "",
        notes: "",
      });

      if (!isOnline) {
        // Offline: fire-and-forget — Firestore queues locally, toast confirms save
        addDoc(collection(db, "transactions"), txPayload).catch(console.error);
        addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
        notifyOfflineSave(txForm.type === "purchase" ? "Purchase" : "Payment");
        setShowTx(false);
        setSelectedDealer(null);
        resetTxForm();
        setSaving(false);
        return;
      }

      // Online: await normally
      await addDoc(collection(db, "transactions"), txPayload);
      addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
      setShowTx(false);
      setSelectedDealer(null);
      resetTxForm();
    } catch (err) {
      console.error(err);
      setError("Failed to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  const openEditTx = (tx: DealerTx) => {
    setEditingTx(tx);
    setEditForm({
      items: tx.description || "",
      amount: String(tx.amount || ""),
      paymentType: tx.paymentType || "credit",
      date: tx.date || new Date().toISOString().split("T")[0],
      notes: tx.notes || "",
    });
  };

  const handleSaveEditTx = async () => {
    if (!editingTx) return;
    if (!editForm.amount || isNaN(Number(editForm.amount))) {
      setError("Please enter a valid amount");
      return;
    }
    const isOnline = navigator.onLine;
    try {
      setSaving(true);
      setError("");
      const newAmount = Number(editForm.amount);
      const oldAmount = editingTx.amount || 0;
      const updatePayload = {
        description: editingTx.type === "dealerPurchase" ? editForm.items : editingTx.description,
        amount: newAmount,
        paymentType: editForm.paymentType,
        date: editForm.date,
        notes: editForm.notes,
        edited: true,
        editedAt: serverTimestamp(),
      };
      const logPayload = {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "DEALER_TX_EDITED",
        description: `Edited ${editingTx.type} of Rs. ${oldAmount} → Rs. ${newAmount} for ${editingTx.dealerName}`,
        recordId: editingTx.id,
        recordType: "transactions",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        updateDoc(doc(db, "transactions", editingTx.id), updatePayload).catch(console.error);
        addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
        notifyOfflineSave("Transaction Edit");
        setEditTxSaved(true);
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "transactions", editingTx.id), updatePayload);
      addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
      setEditTxSaved(true);
    } catch (err) {
      console.error(err);
      setError("Failed to update transaction.");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

  // ── Add Dealer Form ────────────────────────────────────────
  if (showAdd) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowAdd(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Dealer</h1>
            <p className="text-green-200 text-xs">Add supplier or vendor</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}
          {[
            { label: "Dealer Name *", key: "name", placeholder: "e.g. Al-Rahman Traders", icon: Handshake },
            { label: "Phone Number", key: "phone", placeholder: "03XX-XXXXXXX", icon: Phone },
            { label: "Address", key: "address", placeholder: "Shop/area address", icon: MapPin },
          ].map(({ label, key, placeholder, icon: Icon }) => (
            <div key={key} className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">{label}</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Icon size={20} color="#9E9E9E" className="mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder={placeholder}
                  value={(dForm as any)[key]}
                  onChange={(e) => setDForm({ ...dForm, [key]: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
            </div>
          ))}
          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea
                placeholder="Any notes about this dealer..."
                value={dForm.notes}
                onChange={(e) => setDForm({ ...dForm, notes: e.target.value })}
                rows={3}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>
          <button
            onClick={handleSaveDealer}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Dealer"}
          </button>
        </div>
      </div>
    );
  }

  // ── Transaction Form ───────────────────────────────────────
  if (showTx && selectedDealer) {
    const { totalPurchased: selPurchased, totalPaid: selPaid } = dealerTotals(selectedDealer.id);
    const outstanding = selPurchased - selPaid;
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowTx(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">
              {txForm.type === "purchase" ? "New Purchase" : "Add Payment"}
            </h1>
            <p className="text-green-200 text-xs">{selectedDealer.name}</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          {outstanding > 0 && (
            <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: "#FFF3E0" }}>
              <p className="text-orange-800 text-xs font-medium">Outstanding Balance</p>
              <p className="text-orange-700 font-bold text-lg">{fmt(outstanding)}</p>
            </div>
          )}

          <div className="mb-5">
            <label className="text-gray-600 text-sm font-medium mb-3 block">Transaction Type</label>
            <div className="flex gap-3">
              {[
                { val: "purchase", label: "Purchase", icon: ArrowDownLeft, color: "#C62828", bg: "#FFEBEE" },
                { val: "payment", label: "Payment", icon: ArrowUpRight, color: "#1B5E20", bg: "#E8F5E9" },
              ].map(({ val, label, icon: Icon, color, bg }) => (
                <button
                  key={val}
                  onClick={() => setTxForm({ ...txForm, type: val as any })}
                  className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all"
                  style={{
                    borderColor: txForm.type === val ? color : "#E5E7EB",
                    backgroundColor: txForm.type === val ? bg : "white",
                  }}
                >
                  <Icon size={18} color={txForm.type === val ? color : "#9CA3AF"} />
                  <span className="font-semibold text-sm" style={{ color: txForm.type === val ? color : "#6B7280" }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {txForm.type === "purchase" && (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Items Purchased *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <input
                  type="text"
                  placeholder="e.g. DAP Fertilizer 10 Bags"
                  value={txForm.items}
                  onChange={(e) => setTxForm({ ...txForm, items: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.) *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <span className="text-gray-400 mr-2 font-medium">Rs.</span>
              <input
                type="number"
                placeholder="0"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          {txForm.type === "purchase" && (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-3 block">Payment Type</label>
              <div className="flex gap-3">
                {[
                  { val: "cash", label: "Cash" },
                  { val: "credit", label: "Credit" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => setTxForm({ ...txForm, paymentType: val as any })}
                    className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all"
                    style={{
                      borderColor: txForm.paymentType === val ? "#1B5E20" : "#E5E7EB",
                      backgroundColor: txForm.paymentType === val ? "#E8F5E9" : "white",
                    }}
                  >
                    {txForm.paymentType === val && <Check size={14} color="#1B5E20" />}
                    <span className="font-semibold text-sm" style={{
                      color: txForm.paymentType === val ? "#1B5E20" : "#6B7280"
                    }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700 bg-white">
              <select
                value={txForm.cropCycleId}
                onChange={(e) => setTxForm({ ...txForm, cropCycleId: e.target.value })}
                className="w-full outline-none text-gray-800 text-base bg-transparent"
              >
                <option value="">— Select crop cycle —</option>
                {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
              </select>
            </div>
          </div>

          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea
                placeholder="Optional notes..."
                value={txForm.notes}
                onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                rows={2}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSaveTx}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: txForm.type === "purchase" ? "#C62828" : "#1B5E20" }}
          >
            {saving
              ? <Loader2 size={22} className="animate-spin" />
              : txForm.type === "purchase" ? "Save Purchase" : "Save Payment"
            }
          </button>
        </div>
      </div>
    );
  }

  // ── Main List ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-white text-xl font-bold">Dealers</h1>
            <p className="text-green-200 text-xs">
              {dealers.length} dealer{dealers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.href = "/reports/print?type=dealer"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Printer size={14} />
              Print
            </button>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Plus size={22} color="white" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {totalOutstanding > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs mb-1">Total Outstanding Balance</p>
              <p className="font-bold text-xl" style={{ color: "#C62828" }}>
                {fmt(totalOutstanding)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFEBEE" }}>
              <CreditCard size={24} color="#C62828" />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : dealers.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <Handshake size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No dealers yet</p>
            <p className="text-gray-400 text-sm mb-6">Add your suppliers and vendors</p>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} />
                Add First Dealer
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dealers.map((dealer) => {
              const { totalPurchased, totalPaid } = dealerTotals(dealer.id);
              const outstanding = totalPurchased - totalPaid;
              const hasBalance = outstanding > 0;
              return (
                <div key={dealer.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                        <Handshake size={22} color="#1B5E20" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">{dealer.name}</p>
                        {dealer.phone && (
                          <p className="text-gray-500 text-xs">{dealer.phone}</p>
                        )}
                      </div>
                    </div>
                    {hasBalance && (
                      <div className="px-3 py-1 rounded-full" style={{ backgroundColor: "#FFEBEE" }}>
                        <span className="text-xs font-bold" style={{ color: "#C62828" }}>
                          {fmt(outstanding)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-xl p-2" style={{ backgroundColor: "#F5F5F5" }}>
                      <p className="text-gray-400 text-xs mb-0.5">Total Purchased</p>
                      <p className="text-gray-800 font-bold text-sm">{fmt(totalPurchased)}</p>
                    </div>
                    <div className="rounded-xl p-2" style={{ backgroundColor: "#F5F5F5" }}>
                      <p className="text-gray-400 text-xs mb-0.5">Total Paid</p>
                      <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(totalPaid)}</p>
                    </div>
                  </div>

                  {totalPurchased > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Paid</span>
                        <span>{Math.round((totalPaid / (totalPurchased || 1)) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (totalPaid / (totalPurchased || 1)) * 100)}%`,
                            backgroundColor: "#1B5E20",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {canEdit && (
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setTxForm({ ...txForm, type: "purchase" });
                          setShowTx(true);
                        }}
                        className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        style={{ backgroundColor: "#1B5E20" }}
                      >
                        <ArrowDownLeft size={14} />
                        Add Purchase
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setTxForm({ ...txForm, type: "payment" });
                          setShowTx(true);
                        }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        style={{ borderColor: "#1B5E20", color: "#1B5E20" }}
                      >
                        <ArrowUpRight size={14} />
                        Add Payment
                      </button>
                    </div>
                  )}

                  {(() => {
                    const txns = dealerTxns
                      .filter((t) => t.dealerId === dealer.id)
                      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
                    if (txns.length === 0) return null;
                    const isExpanded = expandedDealer === dealer.id;
                    return (
                      <div className="border-t border-gray-100 pt-2">
                        <button
                          onClick={() => setExpandedDealer(isExpanded ? null : dealer.id)}
                          className="w-full flex items-center justify-between py-1"
                        >
                          <span className="text-xs font-semibold text-gray-500">
                            {txns.length} transaction{txns.length !== 1 ? "s" : ""}
                          </span>
                          {isExpanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
                        </button>
                        {isExpanded && (
                          <div className="flex flex-col gap-1.5 mt-1">
                            {txns.map((tx) => (
                              <div key={tx.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: "#F9FAFB" }}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: tx.type === "dealerPurchase" ? "#FFEBEE" : "#E8F5E9" }}>
                                  {tx.type === "dealerPurchase"
                                    ? <ArrowDownLeft size={13} color="#C62828" />
                                    : <ArrowUpRight size={13} color="#1B5E20" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">
                                    {tx.type === "dealerPurchase" ? (tx.description || "Purchase") : "Payment"}
                                    {tx.edited && <span className="text-gray-400 font-normal italic"> (edited)</span>}
                                  </p>
                                  <p className="text-[10px] text-gray-400">{fmtTxDate(tx.date)}</p>
                                </div>
                                <p className="text-xs font-bold shrink-0" style={{ color: tx.type === "dealerPurchase" ? "#C62828" : "#1B5E20" }}>
                                  {tx.type === "dealerPurchase" ? "+" : "−"}{fmt(tx.amount)}
                                </p>
                                {canEdit && (
                                  <button onClick={() => openEditTx(tx)} className="p-1.5 rounded-full active:scale-95 transition-transform shrink-0">
                                    <Pencil size={13} color="#6B7280" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canEdit && dealers.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <Plus size={26} color="white" />
        </button>
      )}

      {/* ── Edit Transaction Modal ─────────────────────────────── */}
      {editingTx && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => { setEditingTx(null); setEditTxSaved(false); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {editTxSaved ? "Saved" : `Edit ${editingTx.type === "dealerPurchase" ? "Purchase" : "Payment"}`}
                </h2>
                <p className="text-gray-400 text-xs">{editingTx.dealerName}</p>
              </div>
              <button onClick={() => { setEditingTx(null); setEditTxSaved(false); }}><X size={22} color="#9CA3AF" /></button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
            )}

            {editTxSaved ? (
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                  <Check size={36} color="#1B5E20" />
                </div>
                <p className="text-gray-800 font-bold text-base mb-1">Changes saved</p>
                <p className="text-gray-400 text-sm">This {editingTx.type} has been updated.</p>
              </div>
            ) : (
            <>
            {editingTx.type === "dealerPurchase" && (
              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Items Purchased</label>
                <input
                  type="text"
                  value={editForm.items}
                  onChange={(e) => setEditForm({ ...editForm, items: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.)</label>
              <input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
              />
            </div>

            {editingTx.type === "dealerPurchase" && (
              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-3 block">Payment Type</label>
                <div className="flex gap-3">
                  {[{ val: "cash", label: "Cash" }, { val: "credit", label: "Credit" }].map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => setEditForm({ ...editForm, paymentType: val as any })}
                      className="flex-1 py-2.5 rounded-2xl border-2 flex items-center justify-center gap-2"
                      style={{
                        borderColor: editForm.paymentType === val ? "#1B5E20" : "#E5E7EB",
                        backgroundColor: editForm.paymentType === val ? "#E8F5E9" : "white",
                      }}
                    >
                      {editForm.paymentType === val && <Check size={14} color="#1B5E20" />}
                      <span className="font-semibold text-sm" style={{ color: editForm.paymentType === val ? "#1B5E20" : "#6B7280" }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
              />
            </div>

            <div className="mb-2">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700"
              />
            </div>
            </>
            )}

            {/* Action button lives inside the scrollable area (not a sticky
                sibling) so it is always reachable by scrolling — even when
                the on-screen keyboard shrinks the visible viewport on mobile,
                which `dvh`-based max-heights alone can't account for. */}
            <div className="pt-4 mt-2 border-t border-gray-100">
              {editTxSaved ? (
                <button
                  onClick={() => { setEditingTx(null); setEditTxSaved(false); }}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                  style={{ backgroundColor: "#1B5E20" }}
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={handleSaveEditTx}
                  disabled={saving}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                  style={{ backgroundColor: "#1B5E20" }}
                >
                  {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Changes"}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
