

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "wouter";
import {
  collection, query, where, onSnapshot,
  doc, getDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { addTransaction } from "@/lib/firebase/transactions";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import {
  ChevronLeft, MapPin, Package, BarChart2, Receipt, TrendingUp, TrendingDown,
  Plus, X, Loader2, CheckCircle,
} from "lucide-react";

interface FarmerUser {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  photoURL?: string;
  role: string;
  status?: string;
  organizationId: string;
}

interface WorkerFarmerDoc {
  id: string;
  name?: string;
  phone?: string;
  notes?: string;
  assignedParcel?: string;
  organizationId?: string;
}

interface Parcel {
  id: string;
  name: string;
  acres?: number;
  assignedFarmer?: string;
}

interface Crop {
  id: string;
  cropName: string;
  status: string;
  parcelId: string;
  parcelName?: string;
  assignedFarmer?: string;
  harvestDate?: string;
  totalYield?: number;
  yieldUnit?: string;
}

interface InvTx {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  toFarmerId?: string;
  date: any;
}

interface LedgerEntry {
  id: string;
  type: "income" | "expense";
  category: string;
  categoryLabel?: string;
  amount: number;
  date: string;
  parcelId?: string;
  parcelName?: string;
  farmerId?: string;
  notes?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function todayStr() { return new Date().toISOString().split("T")[0]; }

const incomeTypes: Record<string, { label: string; emoji: string }> = {
  cropSale:  { label: "Crop Sale",  emoji: "🌾" },
  rent:      { label: "Rent",       emoji: "🏠" },
  livestock: { label: "Livestock",  emoji: "🐄" },
  other:     { label: "Other",      emoji: "💰" },
};

const expenseCategories: Record<string, { label: string; emoji: string }> = {
  fertilizer: { label: "Fertilizer", emoji: "🧪" },
  seed:       { label: "Seed",       emoji: "🌱" },
  pesticide:  { label: "Pesticide",  emoji: "⚡" },
  fuel:       { label: "Fuel",       emoji: "⛽" },
  labour:     { label: "Labour",     emoji: "👷" },
  machinery:  { label: "Machinery",  emoji: "🔧" },
  other:      { label: "Other",      emoji: "📋" },
};

const statusBg: Record<string, { bg: string; color: string; label: string }> = {
  growing:   { bg: "#E8F5E9", color: "#1B5E20", label: "Growing" },
  harvested: { bg: "#E3F2FD", color: "#1565C0", label: "Harvested" },
  planned:   { bg: "#F3E5F5", color: "#6A1B9A", label: "Planned" },
  closed:    { bg: "#F5F5F5", color: "#757575", label: "Closed" },
};

export default function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>();
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [farmer, setFarmer] = useState<FarmerUser | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [invTxs, setInvTxs] = useState<InvTx[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add Income / Expense (saved directly to ledgerEntries, tagged with
  // this farmer's id so it shows up in this farmer's Khata immediately) ──
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"credit" | "debit">("credit");
  const [addForm, setAddForm] = useState({
    category: "cropSale", amount: "", date: todayStr(), parcelId: "", cropCycleId: "", notes: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addSaved, setAddSaved] = useState(false);
  const [addError, setAddError] = useState("");
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);

  const openAddForm = (type: "credit" | "debit") => {
    setAddType(type);
    setAddForm({
      category: type === "credit" ? "cropSale" : "fertilizer",
      amount: "", date: todayStr(),
      parcelId: parcels[0]?.id || "",
      cropCycleId: (cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "",
      notes: "",
    });
    setAddError(""); setAddSaved(false); setAddOpen(true);
  };

  const closeAddForm = () => { setAddOpen(false); setAddSaved(false); };

  const handleSaveEntry = async () => {
    if (!addForm.amount || Number(addForm.amount) <= 0) { setAddError("Enter a valid amount"); return; }
    if (!addForm.date) { setAddError("Select a date"); return; }
    if (!addForm.cropCycleId) { setAddError("Please select a crop cycle"); return; }
    if (!orgId || !farmer) { setAddError("Missing organization or farmer info"); return; }
    const cfg = addType === "credit" ? incomeTypes[addForm.category] : expenseCategories[addForm.category];
    const parcel = parcels.find((p) => p.id === addForm.parcelId);
    const cropCycle = cropCycles.find((c) => c.id === addForm.cropCycleId);
    try {
      setAddSaving(true); setAddError("");
      await addTransaction({
        organizationId: orgId,
        cropCycleId: addForm.cropCycleId,
        cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "",
        seasonName: cropCycle?.seasonName || "",
        type: addType === "credit" ? "income" : "expense",
        category: addForm.category,
        categoryLabel: cfg?.label || addForm.category,
        amount: Number(addForm.amount),
        date: addForm.date,
        description: addForm.notes || cfg?.label || addForm.category,
        parcelId: addForm.parcelId || "",
        parcelName: parcel?.name || "",
        farmerId: farmer.id,
        farmerName: farmer.displayName,
        notes: addForm.notes,
      });
      addDoc(collection(db, "activityLogs"), {
        organizationId: orgId, userId: auth.currentUser?.uid || "", userName: auth.currentUser?.displayName || "",
        action: addType === "credit" ? "INCOME_ADDED" : "EXPENSE_ADDED",
        description: `${cfg?.label || addForm.category} ${addType === "credit" ? "income" : "expense"} for ${farmer.displayName}: Rs. ${Number(addForm.amount).toLocaleString("en-PK")}`,
        createdAt: serverTimestamp(), syncStatus: "synced",
      }).catch(console.error);
      setAddSaving(false);
      setAddSaved(true);
    } catch (e) {
      console.error(e);
      setAddError("Failed to save. Try again.");
      setAddSaving(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    // Farmers are manual records in the `workers` collection (workerType: "farmer"),
    // not authenticated `users` — farmers cannot log in. Looking them up in `users`
    // always returned "not found".
    getDoc(doc(db, "workers", id)).then((snap) => {
      if (snap.exists()) {
        const w = snap.data() as WorkerFarmerDoc;
        setFarmer({
          id: snap.id,
          displayName: w.name || "Unnamed",
          email: "",
          phone: w.phone || "",
          role: "farmer",
          organizationId: w.organizationId || "",
        });
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId), where("assignedFarmer", "==", id)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "crops"), where("organizationId", "==", orgId), where("assignedFarmer", "==", id)),
      (snap) => setCrops(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Crop)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryTransactions"), where("organizationId", "==", orgId), where("toFarmerId", "==", id)),
      (snap) => setInvTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvTx)))
    ));

    return () => unsubs.forEach((u) => u());
  }, [id, orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeCropCycles(orgId, setCropCycles);
  }, [orgId]);

  // Most legacy ledger entries have no direct farmer link — they're tied to
  // parcels via parcelId, so once we know which parcels are assigned to this
  // farmer we pull the ledger entries recorded against those parcels. Entries
  // added from this page (Add Income/Expense below) also stamp a `farmerId`
  // directly, so we merge both sources and dedupe by entry id.
  const [parcelLedger, setParcelLedger] = useState<LedgerEntry[]>([]);
  const [farmerLedger, setFarmerLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (!orgId || parcels.length === 0) {
      setParcelLedger([]);
      return;
    }
    const parcelIds = parcels.map((p) => p.id).slice(0, 30);
    const unsub = onSnapshot(
      query(
        collection(db, "transactions"),
        where("organizationId", "==", orgId),
        where("parcelId", "in", parcelIds)
      ),
      (snap) => setParcelLedger(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LedgerEntry))
          .filter((e) => e.type === "income" || e.type === "expense")
      )
    );
    return () => unsub();
  }, [orgId, parcels]);

  useEffect(() => {
    if (!orgId || !id) { setFarmerLedger([]); return; }
    const unsub = onSnapshot(
      query(
        collection(db, "transactions"),
        where("organizationId", "==", orgId),
        where("farmerId", "==", id)
      ),
      (snap) => setFarmerLedger(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LedgerEntry))
          .filter((e) => e.type === "income" || e.type === "expense")
      )
    );
    return () => unsub();
  }, [orgId, id]);

  useEffect(() => {
    const byId = new Map<string, LedgerEntry>();
    [...parcelLedger, ...farmerLedger].forEach((e) => byId.set(e.id, e));
    setLedgerEntries(Array.from(byId.values()));
  }, [parcelLedger, farmerLedger]);

  const activeCrops = crops.filter((c) => c.status !== "harvested" && c.status !== "closed");
  const harvestedCrops = crops.filter((c) => c.status === "harvested");

  const sortedLedger = [...ledgerEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalCredit = ledgerEntries.filter((e) => e.type === "income").reduce((s, e) => s + (e.amount || 0), 0);
  const totalDebit = ledgerEntries.filter((e) => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const fmtRs = (n: number) => "Rs. " + n.toLocaleString("en-PK");

  const ini = farmer?.displayName?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  const fmtDate = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
    </div>
  );

  if (!farmer) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Farmer not found</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.back()} className="text-white active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">{farmer.displayName || "Unnamed"}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white bg-opacity-20 text-white">Farmer</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>Active</span>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            {ini}
          </div>
          <div>
            {farmer.email && <p className="text-green-100 text-sm">✉️ {farmer.email}</p>}
            {farmer.phone && <p className="text-green-100 text-sm">📞 {farmer.phone}</p>}
            <p className="text-green-200 text-xs mt-0.5">
              {parcels.length} parcel{parcels.length !== 1 ? "s" : ""} · {ledgerEntries.length} khata entr{ledgerEntries.length !== 1 ? "ies" : "y"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Assigned Parcels */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} color="#1B5E20" />
            <p className="font-bold text-gray-800">Assigned Parcels</p>
          </div>
          {parcels.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-3">No parcels assigned</p>
          ) : (
            <div className="flex flex-col gap-2">
              {parcels.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-gray-800 font-medium text-sm">{p.name}</p>
                  {p.acres && <p className="text-gray-400 text-xs">{p.acres} acres</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Khata */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt size={16} color="#1B5E20" />
              <p className="font-bold text-gray-800">Khata</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAddForm("credit")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}
              >
                <Plus size={13} /> Income
              </button>
              <button
                onClick={() => openAddForm("debit")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}
              >
                <Plus size={13} /> Expense
              </button>
            </div>
          </div>

          {ledgerEntries.length > 0 && (
            <div className="flex gap-3 mb-3">
              <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} color="#1B5E20" />
                  <p className="text-xs font-medium" style={{ color: "#1B5E20" }}>Income</p>
                </div>
                <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmtRs(totalCredit)}</p>
              </div>
              <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown size={14} color="#C62828" />
                  <p className="text-xs font-medium" style={{ color: "#C62828" }}>Expense</p>
                </div>
                <p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmtRs(totalDebit)}</p>
              </div>
            </div>
          )}

          {sortedLedger.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-3">No khata entries for this farmer yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedLedger.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{e.categoryLabel || e.category}</p>
                    <p className="text-gray-400 text-xs">{e.parcelName || "—"} · {e.date}</p>
                  </div>
                  <p className="font-semibold text-sm" style={{ color: e.type === "income" ? "#1B5E20" : "#C62828" }}>
                    {e.type === "income" ? "+" : "-"}{fmtRs(e.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock Received */}
        {invTxs.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} color="#E65100" />
              <p className="font-bold text-gray-800">Stock Received</p>
            </div>
            <div className="flex flex-col gap-2">
              {invTxs.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{tx.itemName}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(tx.date)}</p>
                  </div>
                  <p className="text-gray-600 font-semibold text-sm">{tx.quantity} {tx.unit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Harvest History */}
        {harvestedCrops.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={16} color="#1565C0" />
              <p className="font-bold text-gray-800">Harvest History</p>
            </div>
            <div className="flex flex-col gap-2">
              {harvestedCrops.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{c.cropName}</p>
                    {c.harvestDate && <p className="text-gray-400 text-xs">{c.harvestDate}</p>}
                  </div>
                  {c.totalYield && (
                    <p className="text-gray-600 font-semibold text-sm">{c.totalYield} {c.yieldUnit || "kg"}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Income / Expense modal */}
      {addOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeAddForm}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-800">
                  {addSaved ? "Saved" : addType === "credit" ? "Add Income" : "Add Expense"}
                </h2>
                <button onClick={closeAddForm}><X size={22} color="#9CA3AF" /></button>
              </div>

              {addSaved ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <CheckCircle size={36} color="#1B5E20" />
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">
                    {addType === "credit" ? "Income" : "Expense"} added to {farmer?.displayName}'s Khata
                  </p>
                  <p className="text-gray-400 text-sm">
                    {addType === "credit" ? "+" : "−"}Rs. {Number(addForm.amount).toLocaleString("en-PK")}
                  </p>
                </div>
              ) : (
                <>
                  {addError && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{addError}</div>
                  )}

                  <label className="text-gray-600 text-sm font-medium mb-2 block">
                    {addType === "credit" ? "Income Type" : "Category"}
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {Object.entries(addType === "credit" ? incomeTypes : expenseCategories).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setAddForm({ ...addForm, category: key })}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-2xl border-2 transition-all active:scale-95"
                        style={{
                          borderColor: addForm.category === key ? "#1B5E20" : "#E5E7EB",
                          backgroundColor: addForm.category === key ? "#E8F5E9" : "white",
                        }}
                      >
                        <span className="text-xl">{cfg.emoji}</span>
                        <span className="text-[10px] font-semibold leading-tight text-center" style={{ color: addForm.category === key ? "#1B5E20" : "#6B7280" }}>
                          {cfg.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5,000"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700"
                  />

                  <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700"
                  />

                  {parcels.length > 0 && (
                    <>
                      <label className="text-gray-600 text-sm font-medium mb-2 block">Parcel (Optional)</label>
                      <select
                        value={addForm.parcelId}
                        onChange={(e) => setAddForm({ ...addForm, parcelId: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base bg-white focus:border-green-700"
                      >
                        <option value="">— No parcel —</option>
                        {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </>
                  )}

                  <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
                  <select
                    value={addForm.cropCycleId}
                    onChange={(e) => setAddForm({ ...addForm, cropCycleId: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base bg-white focus:border-green-700"
                  >
                    <option value="">— Select crop cycle —</option>
                    {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
                  </select>

                  <label className="text-gray-600 text-sm font-medium mb-2 block">Notes (Optional)</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    rows={2}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-2 outline-none text-gray-800 text-base resize-none focus:border-green-700"
                  />
                </>
              )}

              {/* Action button lives inside the scrollable area (not a sticky
                  sibling) so it's always reachable by scrolling — even when
                  the on-screen keyboard shrinks the visible viewport on mobile. */}
              <div className="pt-4 mt-2 border-t border-gray-100">
                {addSaved ? (
                  <button
                    onClick={closeAddForm}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}
                  >
                    Done
                  </button>
                ) : (
                  <button
                    onClick={handleSaveEntry}
                    disabled={addSaving}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ backgroundColor: addType === "credit" ? "#1B5E20" : "#C62828" }}
                  >
                    {addSaving ? <Loader2 size={22} className="animate-spin" /> : `Save ${addType === "credit" ? "Income" : "Expense"}`}
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
