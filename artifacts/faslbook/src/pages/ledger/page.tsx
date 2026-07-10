

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, updateDoc, doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "@/lib/firebase/config";
import { compressImage } from "@/lib/utils/compressImage";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { ensureDefaultCropCycle, subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import type { TransactionType } from "@/lib/firebase/transactions";
import {
  ArrowLeft, Plus, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, Loader2, CheckCircle,
  MapPin, Camera, X, Receipt, Printer, Search,
} from "lucide-react";
import { useLocation } from "wouter";
import { createNotification } from "@/lib/notifications/createNotification";

// Maps the unified Transaction.type into the credit/debit convention this
// screen (and its totals) already use — same convention the old
// ledgerEntries direction fields used, so Khata math/behaviour is unchanged.
const CREDIT_TYPES: TransactionType[] = ["income", "loanTaken", "dealerPayment"];
function txnToCreditDebit(type: TransactionType): "credit" | "debit" {
  return CREDIT_TYPES.includes(type) ? "credit" : "debit";
}

// ── Types ──────────────────────────────────────────────────────
interface LedgerEntry {
  id: string;
  type: "credit" | "debit";
  category: string;
  categoryLabel?: string;
  amount: number;
  date: string;
  parcelId: string;
  parcelName: string;
  dealerId?: string;
  dealerName?: string;
  notes: string;
  receiptUrl?: string;
  proofUrl?: string;
  organizationId: string;
  createdAt: any;
}
interface Parcel   { id: string; name: string; }
interface Dealer   { id: string; name: string; }
interface FarmerOpt { id: string; name: string; }
interface Location { lat: number; lng: number; address: string; }

// ── Config ─────────────────────────────────────────────────────
const incomeTypes: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  cropSale:  { label: "Crop Sale",  color: "#1B5E20", bg: "#E8F5E9", emoji: "🌾" },
  rent:      { label: "Rent",       color: "#1565C0", bg: "#E3F2FD", emoji: "🏠" },
  livestock: { label: "Livestock",  color: "#00695C", bg: "#E0F2F1", emoji: "🐄" },
  other:     { label: "Other",      color: "#757575", bg: "#F5F5F5", emoji: "💰" },
};

const expenseCategories: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  fertilizer: { label: "Fertilizer", color: "#1565C0", bg: "#E3F2FD", emoji: "🧪" },
  seed:        { label: "Seed",       color: "#1B5E20", bg: "#E8F5E9", emoji: "🌱" },
  pesticide:   { label: "Pesticide",  color: "#B71C1C", bg: "#FFEBEE", emoji: "⚡" },
  fuel:        { label: "Fuel",       color: "#E65100", bg: "#FFF3E0", emoji: "⛽" },
  labour:      { label: "Labour",     color: "#4527A0", bg: "#EDE7F6", emoji: "👷" },
  machinery:   { label: "Machinery",  color: "#00695C", bg: "#E0F2F1", emoji: "🔧" },
  other:       { label: "Other",      color: "#757575", bg: "#F5F5F5", emoji: "📋" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type View = "list" | "addIncome" | "addExpense";

function todayStr() { return new Date().toISOString().split("T")[0]; }
function fmtPKR(n: number) { return `Rs. ${n.toLocaleString("en-PK")}`; }
function fmtDate(str: string) {
  if (!str) return "";
  const d = new Date(str + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ── Location hook ──────────────────────────────────────────────
function useLocationDetector() {
  const [location, setLocation]   = useState<Location | null>(null);
  const [detecting, setDetecting] = useState(false);

  const detect = () => {
    if (!navigator.geolocation) { alert("Location not supported on this device"); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          setLocation({ lat: latitude, lng: longitude, address: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` });
        } catch {
          setLocation({ lat: latitude, lng: longitude, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` });
        }
        setDetecting(false);
      },
      () => { alert("Could not detect location. Please enable location permission."); setDetecting(false); },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const reset = () => setLocation(null);
  return { location, setLocation, detecting, detect, reset };
}

// ── Receipt viewer modal ───────────────────────────────────────
function ReceiptModal({ url, onClose }: { url: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
        >
          <X size={20} color="white" />
        </button>
        <img src={url} alt="Receipt" className="w-full rounded-2xl object-contain max-h-[70vh]" />
      </div>
    </div>,
    document.body
  );
}

export default function LedgerPage() {
  const { organization, role } = useAuthStore();
  const searchParams = new URLSearchParams(window.location.search);
  const [, navigate] = useLocation();
  const orgId   = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── Data ───────────────────────────────────────────────────
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [farmers, setFarmers] = useState<FarmerOpt[]>([]);
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI ─────────────────────────────────────────────────────
  const now = new Date();
  const [viewMonth, setViewMonth]     = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [view, setView]               = useState<View>("list");
  const [saving, setSaving]           = useState(false);
  const [success, setSuccess]         = useState(false);
  const [successMsg, setSuccessMsg]   = useState({ title: "", sub: "" });
  const [formError, setFormError]     = useState("");
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ amount: "", date: "", notes: "", description: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // ── Auto-open form from query param ───────────────────────
  useEffect(() => {
    const form = searchParams.get("form");
    if (form === "income")  setView("addIncome");
    if (form === "expense") setView("addExpense");
  }, [searchParams]);

  // ── Income form ────────────────────────────────────────────
  const [incomeForm, setIncomeForm] = useState({
    type: "cropSale", amount: "", date: todayStr(), parcelId: "", farmerId: "", cropCycleId: "", seasonId: "", notes: "",
  });
  const [incomeProofFile, setIncomeProofFile]       = useState<File | null>(null);
  const [incomeProofPreview, setIncomeProofPreview] = useState("");
  const incomeLocation = useLocationDetector();

  // ── Expense form ───────────────────────────────────────────
  const [expenseForm, setExpenseForm] = useState({
    category: "fertilizer", amount: "", date: todayStr(), parcelId: "", dealerId: "", farmerId: "", cropCycleId: "", seasonId: "", notes: "", description: "",
  });
  const [receiptFile, setReceiptFile]       = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const expenseLocation = useLocationDetector();

  // ── Listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(
      query(collection(db, "transactions"), where("organizationId", "==", orgId)),
      (snap) => {
        setEntries(snap.docs.map((d) => {
          const data = d.data() as any;
          return { id: d.id, ...data, type: txnToCreditDebit(data.type) } as LedgerEntry;
        }));
        setLoading(false);
      }
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name })))
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => setDealers(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name })))
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "workers"), where("organizationId", "==", orgId), where("workerType", "==", "farmer")),
      (snap) => setFarmers(
        snap.docs
          .map((d) => ({ id: d.id, name: (d.data() as any).name || "Unnamed" }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    ));
    unsubs.push(subscribeCropCycles(orgId, setCropCycles));
    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // Default every new form to the current crop cycle so the field isn't
  // blank on first open; still fully editable before saving.
  useEffect(() => {
    if (cropCycles.length === 0) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setIncomeForm((f) => f.cropCycleId ? f : { ...f, cropCycleId: active.id, seasonId: active.seasonId || "" });
    setExpenseForm((f) => f.cropCycleId ? f : { ...f, cropCycleId: active.id, seasonId: active.seasonId || "" });
  }, [cropCycles]);

  const onIncomeCropCycleChange = (id: string) => {
    const c = cropCycles.find((cc) => cc.id === id);
    setIncomeForm((f) => ({ ...f, cropCycleId: id, seasonId: c?.seasonId || "" }));
  };
  const onExpenseCropCycleChange = (id: string) => {
    const c = cropCycles.find((cc) => cc.id === id);
    setExpenseForm((f) => ({ ...f, cropCycleId: id, seasonId: c?.seasonId || "" }));
  };

  // ── Derived stats ──────────────────────────────────────────
  const monthEntries = entries.filter((e) => {
    if (!e.date) return false;
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month;
  }).sort((a, b) => (b.date > a.date ? 1 : -1));

  const filteredEntries = search.trim()
    ? monthEntries.filter((e) => {
        const q = search.toLowerCase();
        const cfg = e.type === "credit" ? incomeTypes[e.category] : expenseCategories[e.category];
        const label = e.categoryLabel || cfg?.label || e.category;
        return (
          label.toLowerCase().includes(q) ||
          (e.dealerName || "").toLowerCase().includes(q) ||
          (e.parcelName || "").toLowerCase().includes(q) ||
          (e.notes || "").toLowerCase().includes(q)
        );
      })
    : monthEntries;

  const totalCredit = monthEntries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const totalDebit  = monthEntries.filter((e) => e.type === "debit").reduce((s, e) => s + e.amount, 0);
  const netBalance  = totalCredit - totalDebit;

  const prevMonth = () => setViewMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  const nextMonth = () => setViewMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

  const resetForms = () => {
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setIncomeForm({ type: "cropSale", amount: "", date: todayStr(), parcelId: "", farmerId: "", cropCycleId: active?.id || "", seasonId: active?.seasonId || "", notes: "" });
    setIncomeProofFile(null); setIncomeProofPreview(""); incomeLocation.reset();
    setExpenseForm({ category: "fertilizer", amount: "", date: todayStr(), parcelId: "", dealerId: "", farmerId: "", cropCycleId: active?.id || "", seasonId: active?.seasonId || "", notes: "", description: "" });
    setReceiptFile(null); setReceiptPreview(""); expenseLocation.reset();
    setFormError(""); setSuccess(false);
  };
  const goBack = () => { setView("list"); resetForms(); };

  // ── Upload helper (compress → storage, background) ─────────
  async function uploadPhoto(file: File, path: string): Promise<string> {
    const compressed = await compressImage(file, { maxWidth: 500, quality: 0.3 });
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, compressed);
    return getDownloadURL(storageRef);
  }

  // ── Add Income ─────────────────────────────────────────────
  const handleAddIncome = async () => {
    if (!incomeForm.amount || Number(incomeForm.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    if (!incomeForm.date) { setFormError("Select a date"); return; }
    if (!incomeForm.farmerId) { setFormError("Select a farmer"); return; }
    if (!incomeForm.parcelId) { setFormError("Select a parcel"); return; }
    if (!incomeForm.cropCycleId) { setFormError("Select a crop cycle"); return; }
    const parcel = parcels.find((p) => p.id === incomeForm.parcelId);
    const farmer = farmers.find((f) => f.id === incomeForm.farmerId);
    const cropCycle = cropCycles.find((c) => c.id === incomeForm.cropCycleId);
    const isOnline = navigator.onLine;
    setSaving(true); setFormError("");
    try {
      const payload = {
        organizationId: orgId, type: "income",
        cropCycleId: incomeForm.cropCycleId, cropCycleName: cropCycle?.name || "",
        seasonId: incomeForm.seasonId || "", seasonName: cropCycle?.seasonName || "",
        category: incomeForm.type,
        categoryLabel: incomeTypes[incomeForm.type]?.label || incomeForm.type,
        amount: Number(incomeForm.amount), date: incomeForm.date,
        description: incomeTypes[incomeForm.type]?.label || incomeForm.type,
        parcelId: incomeForm.parcelId, parcelName: parcel?.name || "",
        farmerId: incomeForm.farmerId, farmerName: farmer?.name || "",
        notes: incomeForm.notes, proofUrl: "",
        location: incomeLocation.location || null,
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        // Offline: Firestore queues the write locally — never await, show success immediately
        addDoc(collection(db, "transactions"), payload).catch(console.error);
        addDoc(collection(db, "activityLogs"), {
          organizationId: orgId, userId: auth.currentUser?.uid || "", userName: auth.currentUser?.displayName || "",
          action: "INCOME_ADDED", description: `${incomeTypes[incomeForm.type]?.label} income: ${fmtPKR(Number(incomeForm.amount))}`,
          createdAt: serverTimestamp(), syncStatus: "pending",
        }).catch(console.error);
        notifyOfflineSave("Income");
        setSuccessMsg({ title: "Saved Offline 📶", sub: `+${fmtPKR(Number(incomeForm.amount))} (${incomeTypes[incomeForm.type]?.label}) · will sync when connected` });
        setSuccess(true);
        setSaving(false);
        return;
      }

      // Online: await the write normally
      const docRef = await addDoc(collection(db, "transactions"), payload);

      setSuccessMsg({ title: "Income Saved! ✅", sub: `+${fmtPKR(Number(incomeForm.amount))} (${incomeTypes[incomeForm.type]?.label})` });
      setSuccess(true);
      setSaving(false);

      // Upload proof in background (skip when offline — Storage has no offline queue)
      if (incomeProofFile) {
        uploadPhoto(incomeProofFile, `proofs/${orgId}/${docRef.id}_proof.jpg`)
          .then((url) => {
            import("firebase/firestore").then(({ doc: fsDoc, updateDoc }) => {
              updateDoc(fsDoc(db, "transactions", docRef.id), { proofUrl: url }).catch(console.error);
            });
          })
          .catch(console.error);
      }

      addDoc(collection(db, "activityLogs"), {
        organizationId: orgId, userId: auth.currentUser?.uid || "", userName: auth.currentUser?.displayName || "",
        action: "INCOME_ADDED", description: `${incomeTypes[incomeForm.type]?.label} income: ${fmtPKR(Number(incomeForm.amount))}`,
        createdAt: serverTimestamp(), syncStatus: "synced",
      }).catch(console.error);

      if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "Income Recorded 💰",
          description: `${incomeTypes[incomeForm.type]?.label}: +${fmtPKR(Number(incomeForm.amount))}${parcel ? ` · ${parcel.name}` : ""}${farmer ? ` · ${farmer.name}` : ""}`,
          type: "finance",
        }).catch(console.error);
      }

    } catch (e) { console.error(e); setFormError("Failed to save. Try again."); setSaving(false); }
  };

  // ── Add Expense ────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    if (!expenseForm.date) { setFormError("Select a date"); return; }
    if (!expenseForm.farmerId) { setFormError("Select a farmer"); return; }
    if (!expenseForm.parcelId) { setFormError("Select a parcel"); return; }
    if (!expenseForm.cropCycleId) { setFormError("Select a crop cycle"); return; }
    const parcel = parcels.find((p) => p.id === expenseForm.parcelId);
    const dealer = dealers.find((d) => d.id === expenseForm.dealerId);
    const farmer = farmers.find((f) => f.id === expenseForm.farmerId);
    const cropCycle = cropCycles.find((c) => c.id === expenseForm.cropCycleId);
    const isOnline = navigator.onLine;
    setSaving(true); setFormError("");
    try {
      const payload = {
        organizationId: orgId, type: "expense",
        cropCycleId: expenseForm.cropCycleId, cropCycleName: cropCycle?.name || "",
        seasonId: expenseForm.seasonId || "", seasonName: cropCycle?.seasonName || "",
        category: expenseForm.category,
        categoryLabel: expenseCategories[expenseForm.category]?.label || expenseForm.category,
        amount: Number(expenseForm.amount), date: expenseForm.date,
        description: expenseForm.description || expenseCategories[expenseForm.category]?.label || expenseForm.category,
        parcelId: expenseForm.parcelId, parcelName: parcel?.name || "",
        dealerId: expenseForm.dealerId || "", dealerName: dealer?.name || "",
        farmerId: expenseForm.farmerId, farmerName: farmer?.name || "",
        notes: expenseForm.notes,
        receiptUrl: "",
        location: expenseLocation.location || null,
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        // Offline: Firestore queues the write locally — never await, show success immediately
        addDoc(collection(db, "transactions"), payload).catch(console.error);
        addDoc(collection(db, "activityLogs"), {
          organizationId: orgId, userId: auth.currentUser?.uid || "", userName: auth.currentUser?.displayName || "",
          action: "EXPENSE_ADDED", description: `${expenseCategories[expenseForm.category]?.label} expense: ${fmtPKR(Number(expenseForm.amount))}`,
          createdAt: serverTimestamp(), syncStatus: "pending",
        }).catch(console.error);
        notifyOfflineSave("Expense");
        setSuccessMsg({ title: "Saved Offline 📶", sub: `−${fmtPKR(Number(expenseForm.amount))} (${expenseCategories[expenseForm.category]?.label}) · will sync when connected` });
        setSuccess(true);
        setSaving(false);
        return;
      }

      // Online: await the write normally
      const docRef = await addDoc(collection(db, "transactions"), payload);

      setSuccessMsg({ title: "Expense Saved! ✅", sub: `−${fmtPKR(Number(expenseForm.amount))} (${expenseCategories[expenseForm.category]?.label})` });
      setSuccess(true);
      setSaving(false);

      // Upload receipt in background (skip when offline — Storage has no offline queue)
      if (receiptFile) {
        uploadPhoto(receiptFile, `receipts/${orgId}/${docRef.id}_receipt.jpg`)
          .then((url) => {
            import("firebase/firestore").then(({ doc: fsDoc, updateDoc }) => {
              updateDoc(fsDoc(db, "transactions", docRef.id), { receiptUrl: url }).catch(console.error);
            });
          })
          .catch(console.error);
      }

      addDoc(collection(db, "activityLogs"), {
        organizationId: orgId, userId: auth.currentUser?.uid || "", userName: auth.currentUser?.displayName || "",
        action: "EXPENSE_ADDED", description: `${expenseCategories[expenseForm.category]?.label} expense: ${fmtPKR(Number(expenseForm.amount))}`,
        createdAt: serverTimestamp(), syncStatus: "synced",
      }).catch(console.error);

      if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "Expense Recorded 🧾",
          description: `${expenseCategories[expenseForm.category]?.label}: −${fmtPKR(Number(expenseForm.amount))}${dealer ? ` · ${dealer.name}` : ""}${parcel ? ` · ${parcel.name}` : ""}`,
          type: "finance",
        }).catch(console.error);
      }

    } catch (e) { console.error(e); setFormError("Failed to save. Try again."); setSaving(false); }
  };

  // ══════════════════════════════════════════════════════════
  // SUCCESS
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
        Back to Khata
      </button>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ADD INCOME FORM
  // ══════════════════════════════════════════════════════════
  if (view === "addIncome") return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-white text-xl font-bold">Add Income</h1>
      </div>

      <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>
        )}

        {/* Income Type */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3 block">Income Type</label>
        <div className="grid grid-cols-4 gap-3 mb-5">
          {Object.entries(incomeTypes).map(([key, cfg]) => (
            <button key={key} onClick={() => setIncomeForm({ ...incomeForm, type: key })}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all active:scale-95"
              style={{ borderColor: incomeForm.type === key ? cfg.color : "#E5E7EB", backgroundColor: incomeForm.type === key ? cfg.bg : "white" }}>
              <span className="text-2xl">{cfg.emoji}</span>
              <span className="text-xs font-semibold leading-tight text-center" style={{ color: incomeForm.type === key ? cfg.color : "#6B7280" }}>{cfg.label}</span>
            </button>
          ))}
        </div>

        {/* Amount */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Amount (Rs.)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 focus-within:border-green-700 bg-white">
          <input type="number" placeholder="e.g. 45,000" value={incomeForm.amount}
            onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
            className="w-full outline-none text-gray-800 text-xl font-semibold bg-transparent" />
        </div>

        {/* Date */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Date</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white flex items-center">
          <input type="date" value={incomeForm.date}
            onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden" />
          <span className="text-gray-400 text-sm">
            {incomeForm.date ? new Date(incomeForm.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : ""}
          </span>
        </div>

        {/* Crop Cycle — required, drives Season auto-fill */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Crop Cycle</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={incomeForm.cropCycleId} onChange={(e) => onIncomeCropCycleChange(e.target.value)}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select crop cycle —</option>
            {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
          </select>
        </div>

        {/* Season — auto-filled from crop cycle, editable */}
        {cropCycles.length > 0 && (
          <>
            <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Season (auto-filled, editable)</label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
              <input type="text" value={incomeForm.seasonId ? (cropCycles.find(c=>c.id===incomeForm.cropCycleId)?.seasonName || "") : ""}
                readOnly
                className="w-full outline-none text-gray-500 text-base bg-transparent" placeholder="No season linked" />
            </div>
          </>
        )}

        {/* Parcel */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Parcel</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={incomeForm.parcelId} onChange={(e) => setIncomeForm({ ...incomeForm, parcelId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select parcel —</option>
            {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Farmer — links this entry to a farmer's own Khata */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Farmer</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={incomeForm.farmerId} onChange={(e) => setIncomeForm({ ...incomeForm, farmerId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select farmer —</option>
            {farmers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        {/* Upload Proof */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Upload Proof</label>
        <input type="file" accept="image/*" id="incomeProofInput" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setIncomeProofFile(file); setIncomeProofPreview(URL.createObjectURL(file)); }
        }} />
        <label htmlFor="incomeProofInput"
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden mb-4 block"
          style={{ backgroundColor: "#FAFAFA" }}>
          {incomeProofPreview
            ? <img src={incomeProofPreview} className="w-full h-full object-cover" alt="proof" />
            : <><Camera size={28} color="#9E9E9E" /><p className="text-gray-500 text-sm mt-2">Tap to upload proof</p><p className="text-gray-400 text-xs">Auto-compressed on upload</p></>
          }
        </label>

        {/* Location */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Location (Optional)</label>
        <div className="flex gap-2 mb-1">
          <div className="flex-1 flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3">
            <MapPin size={18} color="#9E9E9E" className="mr-2 shrink-0" />
            <input type="text" placeholder="Location" value={incomeLocation.location?.address || ""}
              onChange={(e) => incomeLocation.setLocation(incomeLocation.location ? { ...incomeLocation.location, address: e.target.value } : null)}
              className="flex-1 outline-none text-gray-800 text-sm bg-transparent" />
          </div>
          <button onClick={incomeLocation.detect} disabled={incomeLocation.detecting}
            className="px-4 rounded-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            style={{ backgroundColor: "#E8F5E9" }}>
            {incomeLocation.detecting ? <Loader2 size={20} color="#1B5E20" className="animate-spin" /> : <MapPin size={20} color="#1B5E20" />}
          </button>
        </div>
        {incomeLocation.location && <p className="text-green-700 text-xs mb-4 ml-1">✅ Location detected</p>}
        {!incomeLocation.location && <div className="mb-4" />}

        {/* Notes */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Notes (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3 mb-8 bg-white">
          <textarea placeholder="Enter notes" value={incomeForm.notes}
            onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <button onClick={handleAddIncome} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Income"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // ADD EXPENSE FORM
  // ══════════════════════════════════════════════════════════
  if (view === "addExpense") return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-white text-xl font-bold">Add Expense</h1>
      </div>

      <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>
        )}

        {/* Category grid */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3 block">Category</label>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {Object.entries(expenseCategories).map(([key, cfg]) => (
            <button key={key} type="button" onClick={() => setExpenseForm({ ...expenseForm, category: key })}
              className="flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border-2 transition-all active:scale-95"
              style={{
                borderColor: expenseForm.category === key ? cfg.color : "#E5E7EB",
                backgroundColor: expenseForm.category === key ? cfg.bg : "white",
              }}>
              <span className="text-2xl">{cfg.emoji}</span>
              <span className="text-[9px] font-bold text-center leading-tight"
                style={{ color: expenseForm.category === key ? cfg.color : "#6B7280" }}>
                {cfg.label}
              </span>
            </button>
          ))}
        </div>

        {/* Amount */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Amount (Rs.)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 focus-within:border-green-700 bg-white">
          <input type="number" placeholder="e.g. 12,500" value={expenseForm.amount}
            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            className="w-full outline-none text-gray-800 text-xl font-semibold bg-transparent" />
        </div>

        {/* Date */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Date</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white flex items-center">
          <input type="date" value={expenseForm.date}
            onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden" />
          <span className="text-gray-400 text-sm">
            {expenseForm.date ? new Date(expenseForm.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : ""}
          </span>
        </div>

        {/* Crop Cycle — required, drives Season auto-fill */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Crop Cycle</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={expenseForm.cropCycleId} onChange={(e) => onExpenseCropCycleChange(e.target.value)}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select crop cycle —</option>
            {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
          </select>
        </div>

        {/* Season — auto-filled from crop cycle, editable */}
        {cropCycles.length > 0 && (
          <>
            <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Season (auto-filled, editable)</label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
              <input type="text" value={expenseForm.seasonId ? (cropCycles.find(c=>c.id===expenseForm.cropCycleId)?.seasonName || "") : ""}
                readOnly
                className="w-full outline-none text-gray-500 text-base bg-transparent" placeholder="No season linked" />
            </div>
          </>
        )}

        {/* Parcel */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Parcel</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={expenseForm.parcelId} onChange={(e) => setExpenseForm({ ...expenseForm, parcelId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select parcel —</option>
            {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Farmer — links this entry to a farmer's own Khata */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Farmer</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={expenseForm.farmerId} onChange={(e) => setExpenseForm({ ...expenseForm, farmerId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— Select farmer —</option>
            {farmers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        {/* Vendor */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Vendor</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={expenseForm.dealerId} onChange={(e) => setExpenseForm({ ...expenseForm, dealerId: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— No vendor —</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Upload Receipt */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Receipt Photo</label>
        <input type="file" accept="image/*" id="receiptInput" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setReceiptFile(file); setReceiptPreview(URL.createObjectURL(file)); }
        }} />
        <label htmlFor="receiptInput"
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden mb-4 block"
          style={{ backgroundColor: "#FAFAFA" }}>
          {receiptPreview
            ? <img src={receiptPreview} className="w-full h-full object-cover" alt="receipt" />
            : <><Camera size={28} color="#9E9E9E" /><p className="text-gray-500 text-sm mt-2">Tap to upload receipt</p><p className="text-gray-400 text-xs">Auto-compressed on upload</p></>
          }
        </label>

        {/* Location */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Location (Optional)</label>
        <div className="flex gap-2 mb-1">
          <div className="flex-1 flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3">
            <MapPin size={18} color="#9E9E9E" className="mr-2 shrink-0" />
            <input type="text" placeholder="Location" value={expenseLocation.location?.address || ""}
              onChange={(e) => expenseLocation.setLocation(expenseLocation.location ? { ...expenseLocation.location, address: e.target.value } : null)}
              className="flex-1 outline-none text-gray-800 text-sm bg-transparent" />
          </div>
          <button onClick={expenseLocation.detect} disabled={expenseLocation.detecting}
            className="px-4 rounded-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            style={{ backgroundColor: "#E8F5E9" }}>
            {expenseLocation.detecting ? <Loader2 size={20} color="#1B5E20" className="animate-spin" /> : <MapPin size={20} color="#1B5E20" />}
          </button>
        </div>
        {expenseLocation.location && <p className="text-green-700 text-xs mb-4 ml-1">✅ Location detected</p>}
        {!expenseLocation.location && <div className="mb-4" />}

        {/* Description */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Description (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3 mb-4 bg-white">
          <textarea placeholder="Brief description of this expense" value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            rows={2} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        {/* Notes */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Notes (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3 mb-8 bg-white">
          <textarea placeholder="Enter notes" value={expenseForm.notes}
            onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <button onClick={handleAddExpense} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Expense"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // MAIN LEDGER LIST
  // ══════════════════════════════════════════════════════════
  const monthLabel  = `${MONTHS[viewMonth.month]} ${viewMonth.year}`;
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const rangeLabel  = `01 ${MONTHS[viewMonth.month]} ${viewMonth.year}  –  ${daysInMonth} ${MONTHS[viewMonth.month]} ${viewMonth.year}`;

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* Receipt viewer modal */}
      {receiptViewUrl && (
        <ReceiptModal url={receiptViewUrl} onClose={() => setReceiptViewUrl(null)} />
      )}

      {/* Entry detail / edit modal */}
      {detailEntry && (() => {
        const isCredit = detailEntry.type === "credit";
        const cfg = isCredit ? incomeTypes[detailEntry.category] : expenseCategories[detailEntry.category];
        const label = detailEntry.categoryLabel || cfg?.label || detailEntry.category;
        const photoUrl = detailEntry.receiptUrl || detailEntry.proofUrl || "";

        const startEdit = () => {
          setEditForm({
            amount: String(detailEntry.amount),
            date: detailEntry.date,
            notes: detailEntry.notes || "",
            description: (detailEntry as any).description || "",
          });
          setEditMode(true);
        };

        const saveEdit = async () => {
          if (!editForm.amount || Number(editForm.amount) <= 0) return;
          setEditSaving(true);
          try {
            await updateDoc(doc(db, "transactions", detailEntry.id), {
              amount: Number(editForm.amount),
              date: editForm.date,
              notes: editForm.notes,
              description: editForm.description,
              edited: true,
              editedAt: serverTimestamp(),
              editedBy: auth.currentUser?.uid || null,
            });
            setEditMode(false);
            setEditSaved(true);
          } catch (e) {
            console.error(e);
          } finally {
            setEditSaving(false);
          }
        };

        return createPortal(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => { setDetailEntry(null); setEditMode(false); setEditSaved(false); }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{editMode ? "Edit Entry" : `${cfg?.emoji || (isCredit ? "💰" : "📋")} ${label}`}</h2>
                  {(detailEntry as any).edited && !editMode && <p className="text-gray-400 text-xs italic">Edited</p>}
                </div>
                <button onClick={() => { setDetailEntry(null); setEditMode(false); setEditSaved(false); }}><X size={22} color="#9CA3AF" /></button>
              </div>

              {editSaved ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <CheckCircle size={36} color="#1B5E20" />
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">Changes saved</p>
                  <p className="text-gray-400 text-sm">This entry has been updated.</p>
                </div>
              ) : !editMode ? (
                <>
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Amount</span>
                      <span className="font-bold text-base" style={{ color: isCredit ? "#1B5E20" : "#B71C1C" }}>
                        {isCredit ? "+" : "−"}{fmtPKR(detailEntry.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Type</span>
                      <span className="text-gray-800 text-sm font-medium">{isCredit ? "Credit" : "Debit"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Date</span>
                      <span className="text-gray-800 text-sm font-medium">{fmtDate(detailEntry.date)}</span>
                    </div>
                    {detailEntry.parcelName && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="text-gray-500 text-sm">Parcel</span>
                        <span className="text-gray-800 text-sm font-medium">{detailEntry.parcelName}</span>
                      </div>
                    )}
                    {detailEntry.dealerName && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="text-gray-500 text-sm">Dealer</span>
                        <span className="text-gray-800 text-sm font-medium">{detailEntry.dealerName}</span>
                      </div>
                    )}
                    {(detailEntry as any).description && (detailEntry as any).description !== (detailEntry.categoryLabel || detailEntry.category) && (
                      <div className="py-2 border-b border-gray-50">
                        <span className="text-gray-500 text-sm block mb-1">Description</span>
                        <span className="text-gray-800 text-sm">{(detailEntry as any).description}</span>
                      </div>
                    )}
                    {detailEntry.notes && (
                      <div className="py-2">
                        <span className="text-gray-500 text-sm block mb-1">Notes</span>
                        <span className="text-gray-800 text-sm">{detailEntry.notes}</span>
                      </div>
                    )}
                  </div>

                  {photoUrl && (
                    <button
                      onClick={() => setReceiptViewUrl(photoUrl)}
                      className="w-full mb-3 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <Receipt size={16} /> View Receipt
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.)</label>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700"
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
                {editSaved ? (
                  <button
                    onClick={() => { setDetailEntry(null); setEditMode(false); setEditSaved(false); }}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}
                  >
                    Done
                  </button>
                ) : !editMode ? (
                  canEdit && (
                    <button
                      onClick={startEdit}
                      className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}
                    >
                      Edit Entry
                    </button>
                  )
                ) : (
                  <button
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}
                  >
                    {editSaving ? <Loader2 size={22} className="animate-spin" /> : "Save Changes"}
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-2xl font-bold">Khata</h1>
            <p className="text-green-200 text-xs mt-0.5">Farm ledger · income & expenses</p>
          </div>
          <button
            onClick={() => window.location.href = "/reports/print?type=ledger"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
          >
            <Printer size={14} /> Print
          </button>
        </div>
        <div className="flex items-center gap-2 bg-white/15 rounded-2xl px-4 py-2.5">
          <Search size={16} color="rgba(255,255,255,0.7)" />
          <input type="text" placeholder="Search entries…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white placeholder-white/60 text-sm" />
        </div>
      </div>

      <div className="px-4 pt-4">

        {/* ── Account Summary card ── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Account Summary</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "#1B5E20" }}>Total Credit</p>
              <p className="text-lg font-bold" style={{ color: "#1B5E20" }}>{fmtPKR(totalCredit)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "#B71C1C" }}>Total Debit</p>
              <p className="text-lg font-bold" style={{ color: "#B71C1C" }}>{fmtPKR(totalDebit)}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 text-center">
            <p className="text-gray-500 text-xs font-medium mb-0.5">Net Balance</p>
            <p className="text-3xl font-bold" style={{ color: netBalance >= 0 ? "#1B1B1B" : "#B71C1C" }}>
              {fmtPKR(Math.abs(netBalance))}
              {netBalance < 0 && <span className="text-base ml-1 text-red-600">(deficit)</span>}
            </p>
          </div>
        </div>

        {/* ── Month selector ── */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-4 flex items-center justify-between">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg active:bg-gray-100">
            <ChevronLeft size={20} color="#6B7280" />
          </button>
          <div className="text-center">
            <p className="text-gray-700 text-sm font-semibold">{monthLabel}</p>
            <p className="text-gray-400 text-xs">{rangeLabel}</p>
          </div>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg active:bg-gray-100">
            <ChevronRight size={20} color="#6B7280" />
          </button>
        </div>

        {/* ── Transaction list ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-green-700" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="text-6xl mb-4">📒</div>
            <p className="text-gray-600 font-semibold mb-2">
              {search ? "No matching entries" : `No entries for ${monthLabel}`}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {search ? "Try a different search" : "Add income or expense to see them here"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => {
              const isCredit = entry.type === "credit";
              const cfg      = isCredit ? incomeTypes[entry.category] : expenseCategories[entry.category];
              const emoji    = cfg?.emoji || (isCredit ? "💰" : "📋");
              const label    = entry.categoryLabel || cfg?.label || entry.category;
              const photoUrl = entry.receiptUrl || entry.proofUrl || "";

              return (
                <div key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setDetailEntry(entry); setEditMode(false); }}
                  onKeyDown={(e) => e.key === "Enter" && (setDetailEntry(entry), setEditMode(false))}
                  className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform cursor-pointer select-none">

                  {/* Category icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: cfg?.bg || (isCredit ? "#E8F5E9" : "#FFEBEE") }}>
                    {emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 font-semibold text-sm leading-tight">
                      {label}
                      {(entry as any).edited && <span className="text-gray-400 font-normal italic text-xs"> (edited)</span>}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5 truncate">
                      {entry.dealerName ? `${entry.dealerName} · ` : ""}
                      {entry.parcelName ? `${entry.parcelName} · ` : ""}
                      {fmtDate(entry.date)}
                    </p>
                    {entry.notes ? <p className="text-gray-400 text-xs truncate">{entry.notes}</p> : null}
                  </div>

                  {/* Amount + receipt */}
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    <p className="font-bold text-base" style={{ color: isCredit ? "#1B5E20" : "#B71C1C" }}>
                      {isCredit ? "+" : "−"}{fmtPKR(entry.amount)}
                    </p>
                    {photoUrl && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setReceiptViewUrl(photoUrl); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setReceiptViewUrl(photoUrl); } }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg inline-flex items-center gap-0.5 cursor-pointer"
                        style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                        <Receipt size={10} /> Receipt
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FABs ── */}
      {canEdit && (
        <div className="fixed bottom-24 right-4 flex flex-col gap-3 items-end">
          <button onClick={() => setView("addExpense")}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg text-white text-sm font-bold active:scale-95 transition-transform"
            style={{ backgroundColor: "#B71C1C" }}>
            <Plus size={18} />Expense
          </button>
          <button onClick={() => setView("addIncome")}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg text-white text-sm font-bold active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}>
            <Plus size={18} />Income
          </button>
        </div>
      )}
    </div>
  );
}
