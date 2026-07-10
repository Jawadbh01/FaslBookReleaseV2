

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, increment,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { runFarmerTransferWorkflow } from "@/lib/workflows/farmerTransferWorkflow";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import { categoryConfig } from "./_categoryConfig";
import {
  ArrowLeft, Plus, X, ArrowDownToLine, ArrowUpFromLine,
  Users, Loader2, CheckCircle, Package, Layers, Printer,
} from "lucide-react";
import { useLocation } from "wouter";
import { createNotification } from "@/lib/notifications/createNotification";

// ── Types ──────────────────────────────────────────────────────
interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  pricePerUnit: number;
  organizationId: string;
  createdAt: any;
  updatedAt: any;
}

interface Farmer { id: string; name: string; }
interface Transaction { id: string; type: "in" | "out"; quantity: number; createdAt: any; }

const categories = ["all", ...Object.keys(categoryConfig)];
const units = ["Maund", "KG", "Ton", "Quintal", "Bag", "Litre", "Piece", "Other"];
const stockInSources  = ["Purchase", "Adjustment", "Transfer"];
const stockOutReasons = ["Sale", "Consumption", "Damage", "Loss"];

type View = "list" | "addItem" | "stockIn" | "stockOut" | "transfer";

// category emoji map for visual icons on cards
const catEmoji: Record<string, string> = {
  seed: "🌾", fertilizer: "🧪", pesticide: "⚡",
  fuel: "⛽", cropStock: "🏠", machineryParts: "🔧", other: "📦",
};

export default function GodownPage() {
  const { organization, role } = useAuthStore();
  
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [farmers, setFarmers]   = useState<Farmer[]>([]);
  const [txns, setTxns]         = useState<Transaction[]>([]);
  const [filter, setFilter]     = useState("all");
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<View>("list");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [successMsg, setSuccessMsg] = useState({ title: "", sub: "" });
  const [formError, setFormError]   = useState("");

  const [itemForm, setItemForm] = useState({ name: "", category: "seed", unit: "Maund", initialStock: "", pricePerUnit: "" });
  const [inForm,  setInForm]    = useState({ quantity: "", source: "Purchase", notes: "" });
  const [outForm, setOutForm]   = useState({ quantity: "", reason: "Sale", notes: "" });
  const [txForm,  setTxForm]    = useState({ farmerId: "", quantity: "", cropCycleId: "", notes: "" });
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);

  // ── Listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryItems"), where("organizationId", "==", orgId)),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryTransactions"), where("organizationId", "==", orgId)),
      (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "users"), where("organizationId", "==", orgId), where("role", "==", "farmer")),
      (snap) => setFarmers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Farmer)))
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeCropCycles(orgId, setCropCycles);
  }, [orgId]);

  useEffect(() => {
    if (cropCycles.length === 0) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setTxForm((f) => (f.cropCycleId ? f : { ...f, cropCycleId: active.id }));
  }, [cropCycles]);

  // ── Derived stats ──────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthlyIn  = txns.filter((t) => t.type === "in"  && (t.createdAt?.toMillis?.() ?? 0) >= monthStart)
                         .reduce((s, t) => s + (t.quantity || 0), 0);
  const monthlyOut = txns.filter((t) => t.type === "out" && (t.createdAt?.toMillis?.() ?? 0) >= monthStart)
                         .reduce((s, t) => s + (t.quantity || 0), 0);
  const totalValue = items.reduce((s, i) => s + i.currentStock * (i.pricePerUnit || 0), 0);
  const filtered   = filter === "all" ? items : items.filter((i) => i.category === filter);

  const fmtPKR = (n: number) =>
    n >= 1000 ? `Rs. ${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `Rs. ${n}`;

  const resetAll = () => {
    setItemForm({ name: "", category: "seed", unit: "Maund", initialStock: "", pricePerUnit: "" });
    setInForm({ quantity: "", source: "Purchase", notes: "" });
    setOutForm({ quantity: "", reason: "Sale", notes: "" });
    setTxForm({ farmerId: "", quantity: "", cropCycleId: (cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "", notes: "" });
    setFormError(""); setSuccess(false); setSelected(null);
  };
  const goBack = () => { setView("list"); resetAll(); };

  // ── Add Item ───────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!itemForm.name.trim()) { setFormError("Enter item name"); return; }
    try {
      setSaving(true); setFormError("");
      const ref = await addDoc(collection(db, "inventoryItems"), {
        name: itemForm.name.trim(), category: itemForm.category, unit: itemForm.unit,
        currentStock: Number(itemForm.initialStock) || 0,
        pricePerUnit: Number(itemForm.pricePerUnit) || 0,
        organizationId: orgId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        syncStatus: navigator.onLine ? "synced" : "pending",
      });
      if (Number(itemForm.initialStock) > 0) {
        await addDoc(collection(db, "inventoryTransactions"), {
          organizationId: orgId, itemId: ref.id, itemName: itemForm.name.trim(),
          type: "in", source: "Adjustment", quantity: Number(itemForm.initialStock),
          unit: itemForm.unit, notes: "Opening stock",
          createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp(),
          syncStatus: navigator.onLine ? "synced" : "pending",
        });
      }
      if (!navigator.onLine) {
        notifyOfflineSave("Inventory Item");
      } else if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "New Item Added to Godown",
          description: `${itemForm.name.trim()} added${Number(itemForm.initialStock) > 0 ? ` with opening stock of ${itemForm.initialStock} ${itemForm.unit}` : ""}`,
          type: "inventory",
        }).catch(console.error);
      }
      goBack();
    } catch { setFormError("Failed to add item. Try again."); }
    finally { setSaving(false); }
  };

  // ── Stock In ───────────────────────────────────────────────
  const handleStockIn = async () => {
    if (!inForm.quantity || Number(inForm.quantity) <= 0) { setFormError("Enter a valid quantity"); return; }
    if (!selected) return;
    try {
      setSaving(true); setFormError("");
      await updateDoc(doc(db, "inventoryItems", selected.id), {
        currentStock: increment(Number(inForm.quantity)), updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "inventoryTransactions"), {
        organizationId: orgId, itemId: selected.id, itemName: selected.name,
        type: "in", source: inForm.source, quantity: Number(inForm.quantity),
        unit: selected.unit, notes: inForm.notes,
        createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp(),
        syncStatus: navigator.onLine ? "synced" : "pending",
      });
      if (!navigator.onLine) {
        notifyOfflineSave("Stock In");
      } else if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "Godown Stock In 📦",
          description: `+${inForm.quantity} ${selected.unit} of ${selected.name} (${inForm.source})${inForm.notes ? ` — ${inForm.notes}` : ""}`,
          type: "inventory",
        }).catch(console.error);
      }
      setSuccessMsg({ title: "Stock Added! ✅", sub: `+${inForm.quantity} ${selected.unit} added to ${selected.name}` });
      setSuccess(true);
    } catch { setFormError("Failed to update stock. Try again."); }
    finally { setSaving(false); }
  };

  // ── Stock Out ──────────────────────────────────────────────
  const handleStockOut = async () => {
    if (!outForm.quantity || Number(outForm.quantity) <= 0) { setFormError("Enter a valid quantity"); return; }
    if (!selected) return;
    if (Number(outForm.quantity) > selected.currentStock) {
      setFormError(`Only ${selected.currentStock} ${selected.unit} available`); return;
    }
    try {
      setSaving(true); setFormError("");
      await updateDoc(doc(db, "inventoryItems", selected.id), {
        currentStock: increment(-Number(outForm.quantity)), updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "inventoryTransactions"), {
        organizationId: orgId, itemId: selected.id, itemName: selected.name,
        type: "out", source: outForm.reason, quantity: Number(outForm.quantity),
        unit: selected.unit, notes: outForm.notes,
        createdBy: auth.currentUser?.uid || "", createdAt: serverTimestamp(),
        syncStatus: navigator.onLine ? "synced" : "pending",
      });
      if (!navigator.onLine) {
        notifyOfflineSave("Stock Out");
      } else if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "Godown Stock Out 📤",
          description: `−${outForm.quantity} ${selected.unit} of ${selected.name} (${outForm.reason})${outForm.notes ? ` — ${outForm.notes}` : ""}`,
          type: "inventory",
        }).catch(console.error);
      }
      setSuccessMsg({ title: "Stock Out Done! 📤", sub: `−${outForm.quantity} ${selected.unit} of ${selected.name} (${outForm.reason})` });
      setSuccess(true);
    } catch { setFormError("Failed. Try again."); }
    finally { setSaving(false); }
  };

  // ── Farmer Transfer ────────────────────────────────────────
  const handleTransfer = async () => {
    if (!txForm.farmerId) { setFormError("Select a farmer"); return; }
    if (!txForm.quantity || Number(txForm.quantity) <= 0) { setFormError("Enter a valid quantity"); return; }
    if (!txForm.cropCycleId) { setFormError("Please select a crop cycle"); return; }
    if (!selected) return;
    if (Number(txForm.quantity) > selected.currentStock) {
      setFormError(`Only ${selected.currentStock} ${selected.unit} available`); return;
    }
    const farmer = farmers.find((f) => f.id === txForm.farmerId);
    try {
      setSaving(true); setFormError("");
      await runFarmerTransferWorkflow({
        itemId: selected.id, itemName: selected.name, unit: selected.unit,
        quantity: Number(txForm.quantity), farmerId: txForm.farmerId,
        farmerName: farmer?.name || "", organizationId: orgId!, notes: txForm.notes,
        pricePerUnit: selected.pricePerUnit || 0,
        cropCycleId: txForm.cropCycleId,
      });
      if (navigator.onLine && orgId) {
        createNotification({
          organizationId: orgId,
          title: "Stock Transferred to Farmer 🚜",
          description: `${txForm.quantity} ${selected.unit} of ${selected.name} → ${farmer?.name || "farmer"}${txForm.notes ? ` — ${txForm.notes}` : ""}`,
          type: "inventory",
        }).catch(console.error);
      }
      setSuccessMsg({ title: "Transfer Done! 📦", sub: `${txForm.quantity} ${selected.unit} → ${farmer?.name}` });
      setSuccess(true);
    } catch { setFormError("Transfer failed. Try again."); }
    finally { setSaving(false); }
  };

  // ══════════════════════════════════════════════════════════
  // ── SUCCESS SCREEN ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════════
  if (success) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: "#E8F5E9" }}>
        <CheckCircle size={52} color="#1B5E20" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{successMsg.title}</h1>
      <p className="text-gray-500 text-sm mb-10">{successMsg.sub}</p>
      <button onClick={goBack}
        className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
        style={{ backgroundColor: "#1B5E20" }}>
        Back to Godown
      </button>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ── ADD ITEM FORM ──────────────────────────────────════════
  // ══════════════════════════════════════════════════════════
  if (view === "addItem") return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><X size={24} /></button>
        <div>
          <h1 className="text-white text-xl font-bold">Add Item</h1>
          <p className="text-green-200 text-xs">New Godown Item</p>
        </div>
      </div>
      <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
        {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>}

        <label className="text-gray-600 text-sm font-medium mb-2 block">Item Name *</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 focus-within:border-green-700">
          <Package size={20} color="#9E9E9E" className="mr-3 shrink-0" />
          <input type="text" placeholder="e.g. DAP Fertilizer" value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Category</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {Object.entries(categoryConfig).map(([key, cfg]) => (
            <button key={key} onClick={() => setItemForm({ ...itemForm, category: key })}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all"
              style={{
                borderColor: itemForm.category === key ? cfg.color : "#E5E7EB",
                backgroundColor: itemForm.category === key ? cfg.bg : "white",
                color: itemForm.category === key ? cfg.color : "#6B7280",
              }}>
              <cfg.Icon size={16} />{cfg.label}
            </button>
          ))}
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Unit</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 focus-within:border-green-700">
          <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent">
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div>
            <label className="text-gray-600 text-sm font-medium mb-2 block">Opening Stock</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <input type="number" placeholder="0" value={itemForm.initialStock}
                onChange={(e) => setItemForm({ ...itemForm, initialStock: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>
          <div>
            <label className="text-gray-600 text-sm font-medium mb-2 block">Price / Unit (Rs)</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <input type="number" placeholder="0" value={itemForm.pricePerUnit}
                onChange={(e) => setItemForm({ ...itemForm, pricePerUnit: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>
        </div>

        <button onClick={handleAddItem} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Add to Godown 📦"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ── STOCK IN FORM ──────────────────────────────════════════
  // ══════════════════════════════════════════════════════════
  if (view === "stockIn" && selected) return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">Stock In</h1>
          <p className="text-green-200 text-xs">{selected.name} • Current: {selected.currentStock} {selected.unit}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
          <ArrowDownToLine size={20} color="white" />
        </div>
      </div>
      <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
        {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>}

        <label className="text-gray-600 text-sm font-medium mb-3 block">Source</label>
        <div className="flex gap-2 mb-5">
          {stockInSources.map((s) => (
            <button key={s} onClick={() => setInForm({ ...inForm, source: s })}
              className="flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all"
              style={{
                borderColor: inForm.source === s ? "#1B5E20" : "#E5E7EB",
                backgroundColor: inForm.source === s ? "#E8F5E9" : "white",
                color: inForm.source === s ? "#1B5E20" : "#6B7280",
              }}>{s}</button>
          ))}
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Quantity ({selected.unit}) *</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-5 focus-within:border-green-700">
          <ArrowDownToLine size={20} color="#9E9E9E" className="mr-3 shrink-0" />
          <input type="number" placeholder="e.g. 100" value={inForm.quantity}
            onChange={(e) => setInForm({ ...inForm, quantity: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          <span className="text-gray-400 text-sm">{selected.unit}</span>
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Notes (Optional)</label>
        <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 mb-8 focus-within:border-green-700">
          <textarea placeholder="Supplier name, bill number etc..." value={inForm.notes}
            onChange={(e) => setInForm({ ...inForm, notes: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <button onClick={handleStockIn} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Add Stock ✅"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ── STOCK OUT FORM ─────────────────────────────════════════
  // ══════════════════════════════════════════════════════════
  if (view === "stockOut" && selected) return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#B71C1C" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">Stock Out</h1>
          <p className="text-red-200 text-xs">{selected.name} • Available: {selected.currentStock} {selected.unit}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
          <ArrowUpFromLine size={20} color="white" />
        </div>
      </div>
      <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
        {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>}

        <label className="text-gray-600 text-sm font-medium mb-3 block">Reason</label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {stockOutReasons.map((r) => (
            <button key={r} onClick={() => setOutForm({ ...outForm, reason: r })}
              className="py-3 rounded-xl border-2 font-medium text-sm transition-all"
              style={{
                borderColor: outForm.reason === r ? "#B71C1C" : "#E5E7EB",
                backgroundColor: outForm.reason === r ? "#FFEBEE" : "white",
                color: outForm.reason === r ? "#B71C1C" : "#6B7280",
              }}>{r}</button>
          ))}
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Quantity ({selected.unit}) *</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-5 focus-within:border-red-700">
          <ArrowUpFromLine size={20} color="#9E9E9E" className="mr-3 shrink-0" />
          <input type="number" placeholder={`Max: ${selected.currentStock}`} value={outForm.quantity}
            onChange={(e) => setOutForm({ ...outForm, quantity: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          <span className="text-gray-400 text-sm">{selected.unit}</span>
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Notes (Optional)</label>
        <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 mb-8 focus-within:border-red-700">
          <textarea placeholder="Buyer name, bill number etc..." value={outForm.notes}
            onChange={(e) => setOutForm({ ...outForm, notes: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <button onClick={handleStockOut} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#B71C1C" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Confirm Stock Out 📤"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ── FARMER TRANSFER FORM ───────────────────════════════════
  // ══════════════════════════════════════════════════════════
  if (view === "transfer" && selected) return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <div>
          <h1 className="text-white text-xl font-bold">Transfer to Farmer</h1>
          <p className="text-green-200 text-xs">{selected.name} • Available: {selected.currentStock} {selected.unit}</p>
        </div>
      </div>
      <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
        {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>}

        <div className="rounded-2xl p-4 mb-5 flex items-center gap-3" style={{ backgroundColor: "#E8F5E9" }}>
          <Package size={22} color="#1B5E20" />
          <div>
            <p className="text-green-800 font-semibold text-sm">Godown → Farmer Stock</p>
            <p className="text-green-700 text-xs">Stock moves automatically with full history</p>
          </div>
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Select Farmer *</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 focus-within:border-green-700">
          <Users size={20} color="#9E9E9E" className="mr-3 shrink-0" />
          <select value={txForm.farmerId} onChange={(e) => setTxForm({ ...txForm, farmerId: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent">
            <option value="">Select farmer</option>
            {farmers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        {farmers.length === 0 && <p className="text-gray-400 text-xs mb-4 ml-2">No farmers in your organization yet.</p>}

        <label className="text-gray-600 text-sm font-medium mb-2 block">Quantity ({selected.unit}) *</label>
        <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 focus-within:border-green-700">
          <ArrowUpFromLine size={20} color="#9E9E9E" className="mr-3 shrink-0" />
          <input type="number" placeholder={`Max: ${selected.currentStock}`} value={txForm.quantity}
            onChange={(e) => setTxForm({ ...txForm, quantity: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          <span className="text-gray-400 text-sm">{selected.unit}</span>
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
        <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 focus-within:border-green-700 bg-white">
          <select value={txForm.cropCycleId} onChange={(e) => setTxForm({ ...txForm, cropCycleId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select crop cycle —</option>
            {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
          </select>
        </div>

        <label className="text-gray-600 text-sm font-medium mb-2 block">Notes (Optional)</label>
        <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 mb-8 focus-within:border-green-700">
          <textarea placeholder="Reason, crop name, parcel etc..." value={txForm.notes}
            onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <button onClick={handleTransfer} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Transfer Stock 📦"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ── MAIN LIST ──────────────────────────────════════════════
  // ══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* ── Green header ── */}
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-white text-2xl font-bold">Godown</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.href = "/reports/print?type=godown"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Printer size={14} />
              Print
            </button>
            {canEdit && (
              <button onClick={() => setView("addItem")}
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <Plus size={22} color="white" />
              </button>
            )}
          </div>
        </div>

        {/* Total inventory value card */}
        <div className="rounded-2xl p-4 mb-4 flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
          <div>
            <p className="text-green-200 text-xs font-medium mb-1">Total Inventory Value</p>
            <p className="text-white text-3xl font-bold">
              {totalValue >= 1000
                ? `Rs. ${(totalValue / 1000).toFixed(totalValue % 1000 === 0 ? 0 : 0)}k`
                : `Rs. ${totalValue.toLocaleString()}`}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <Layers size={26} color="white" />
          </div>
        </div>

        {/* Stock In / Stock Out this month */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl p-3" style={{ backgroundColor: "#2E7D32" }}>
            <p className="text-green-200 text-xs font-medium mb-1">Stock In</p>
            <p className="text-white text-lg font-bold">{monthlyIn.toLocaleString()} units</p>
            <p className="text-green-300 text-xs">This Month</p>
          </div>
          <div className="rounded-2xl p-3" style={{ backgroundColor: "#B71C1C" }}>
            <p className="text-red-200 text-xs font-medium mb-1">Stock Out</p>
            <p className="text-white text-lg font-bold">{monthlyOut.toLocaleString()} units</p>
            <p className="text-red-300 text-xs">This Month</p>
          </div>
        </div>

        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {categories.map((c) => {
            const cc = categoryConfig[c];
            const isActive = filter === c;
            return (
              <button key={c} onClick={() => setFilter(c)}
                className="px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                style={{
                  backgroundColor: isActive ? "white" : "rgba(255,255,255,0.2)",
                  color: isActive ? (cc?.color || "#1B5E20") : "white",
                }}>
                {c === "all" ? "All" : cc?.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Item cards ── */}
      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="text-6xl mb-4">📦</div>
            <p className="text-gray-600 font-semibold mb-2">
              {filter === "all" ? "Godown is empty" : `No ${categoryConfig[filter]?.label} items`}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {filter === "all" ? "Add your first item to get started" : "Try a different category"}
            </p>
            {canEdit && filter === "all" && (
              <button onClick={() => setView("addItem")}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}>
                <Plus size={18} />Add First Item
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((item) => {
              const cc = categoryConfig[item.category] || categoryConfig.other;
              const emoji = catEmoji[item.category] || "📦";
              const isLow = item.currentStock <= 10;
              return (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  {/* Top row: icon + info + category badge */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* Emoji icon */}
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-3xl"
                      style={{ backgroundColor: cc.bg }}>
                      {emoji}
                    </div>
                    {/* Name + stock */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-gray-800 text-base leading-tight">{item.name}</p>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                          style={{ backgroundColor: cc.bg, color: cc.color }}>
                          {cc.label}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">Current Stock</p>
                      <p className="font-bold text-2xl leading-tight" style={{ color: isLow ? "#B71C1C" : "#1B1B1B" }}>
                        {item.currentStock} <span className="text-sm font-medium text-gray-400">{item.unit}</span>
                      </p>
                      {isLow && <p className="text-red-500 text-xs font-semibold">⚠ Low Stock</p>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {canEdit && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                      <button
                        onClick={() => { setSelected(item); setView("stockIn"); }}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        style={{ backgroundColor: "#1B5E20" }}>
                        <ArrowDownToLine size={15} />Stock In
                      </button>
                      <button
                        onClick={() => { setSelected(item); setView("stockOut"); }}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        style={{ backgroundColor: "#B71C1C" }}>
                        <ArrowUpFromLine size={15} />Stock Out
                      </button>
                      </div>
                      <button
                        onClick={() => { setSelected(item); setView("transfer"); }}
                        className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform border-2"
                        style={{ borderColor: "#1B5E20", color: "#1B5E20", backgroundColor: "white" }}>
                        <Users size={15} />Transfer to Farmer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {canEdit && items.length > 0 && (
        <button onClick={() => setView("addItem")}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          <Plus size={26} color="white" />
        </button>
      )}
    </div>
  );
}
