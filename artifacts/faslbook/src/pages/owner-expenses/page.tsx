import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { subscribeTransactions, type Transaction } from "@/lib/firebase/transactions";
import {
  Plus, Loader2, Camera, X,
  Trash2, Pencil, CheckCircle, Receipt,
  TrendingUp, TrendingDown, Wallet, Scale,
  ChevronRight, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { auth } from "@/lib/firebase/auth";
import { createNotification } from "@/lib/notifications/createNotification";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────
interface OwnerExpense {
  id: string;
  category: string;
  categoryLabel: string;
  amount: number;
  date: string;
  paymentMethod: string;
  vendor: string;
  description: string;
  receiptUrl?: string;
  organizationId: string;
  createdBy: string;
  createdAt: any;
  syncStatus: string;
  edited?: boolean;
}

// ── Farm Expense Categories ───────────────────────────────────
const CATEGORIES: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  fuel:       { label: "Fuel & Diesel",      emoji: "⛽", color: "#E65100", bg: "#FFF3E0" },
  tractor:    { label: "Tractor Repair",     emoji: "🔧", color: "#37474F", bg: "#ECEFF1" },
  machinery:  { label: "Machinery",          emoji: "🚜", color: "#1565C0", bg: "#E3F2FD" },
  irrigation: { label: "Irrigation",         emoji: "💧", color: "#0277BD", bg: "#E1F5FE" },
  land_prep:  { label: "Land Preparation",   emoji: "🌾", color: "#558B2F", bg: "#F1F8E9" },
  labour:     { label: "Labour / Wages",     emoji: "👷", color: "#4E342E", bg: "#EFEBE9" },
  seeds:      { label: "Seeds & Saplings",   emoji: "🌱", color: "#2E7D32", bg: "#E8F5E9" },
  fertilizer: { label: "Fertilizer / DAP",   emoji: "🧪", color: "#6A1B9A", bg: "#F3E5F5" },
  pesticide:  { label: "Pesticide / Spray",  emoji: "🪣", color: "#00695C", bg: "#E0F2F1" },
  transport:  { label: "Transport",          emoji: "🚛", color: "#283593", bg: "#E8EAF6" },
  utilities:  { label: "Utilities / Bills",  emoji: "💡", color: "#F57F17", bg: "#FFFDE7" },
  other:      { label: "Other",              emoji: "💰", color: "#37474F", bg: "#ECEFF1" },
};

const PAYMENT_METHODS: Record<string, string> = {
  cash:     "Cash",
  bank:     "Bank Transfer",
  cheque:   "Cheque",
  jazzcash: "JazzCash/EasyPaisa",
};

// ── Date filter helpers ───────────────────────────────────────
type DateFilterKey = "today" | "last7" | "last30" | "last90" | "last180" | "thisYear" | "custom";

const DATE_FILTER_OPTIONS: { key: DateFilterKey; label: string }[] = [
  { key: "today",    label: "Today" },
  { key: "last7",    label: "Last 7 Days" },
  { key: "last30",   label: "Last 30 Days" },
  { key: "last90",   label: "Last 3 Months" },
  { key: "last180",  label: "Last 6 Months" },
  { key: "thisYear", label: "This Year" },
  { key: "custom",   label: "Custom Range" },
];

function getDateRange(filter: DateFilterKey, customFrom: string, customTo: string): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const sub = (days: number) => {
    const d = new Date(today); d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };
  switch (filter) {
    case "today":    return { start: todayStr, end: todayStr };
    case "last7":    return { start: sub(6), end: todayStr };
    case "last30":   return { start: sub(29), end: todayStr };
    case "last90":   return { start: sub(89), end: todayStr };
    case "last180":  return { start: sub(179), end: todayStr };
    case "thisYear": return { start: `${today.getFullYear()}-01-01`, end: todayStr };
    case "custom":   return { start: customFrom || sub(29), end: customTo || todayStr };
  }
}

function applyDateFilter<T extends { date: string }>(items: T[], filter: DateFilterKey, customFrom: string, customTo: string): T[] {
  const { start, end } = getDateRange(filter, customFrom, customTo);
  return items.filter((i) => i.date >= start && i.date <= end);
}

// ── Utilities ────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
};

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.4);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function ReceiptModal({ url, onClose }: { url: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white"><X size={28} /></button>
        <img src={url} className="w-full rounded-2xl" alt="receipt" />
      </div>
    </div>,
    document.body
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function FarmKhataPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── Active tab ────────────────────────────────────────────
  const [tab, setTab] = useState<"income" | "expenses">("income");

  // ── Date filter ───────────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("last30");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(todayStr());

  // ── Data ──────────────────────────────────────────────────
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses]   = useState<OwnerExpense[]>([]);
  const [dealers, setDealers]     = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]     = useState(true);

  // ── Expense add form ─────────────────────────────────────
  const [view, setView]           = useState<"list" | "add">("list");
  const blankForm = () => ({
    category: "fuel", amount: "", date: todayStr(),
    paymentMethod: "cash", vendor: "", description: "",
  });
  const [form, setForm]           = useState(blankForm());
  const [receiptFile, setReceiptFile]   = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess]     = useState(false);

  // ── Expense detail/edit modal ─────────────────────────────
  const [selected, setSelected]   = useState<OwnerExpense | null>(null);
  const [editMode, setEditMode]   = useState(false);
  const [editForm, setEditForm]   = useState({ amount: "", date: "", vendor: "", description: "", paymentMethod: "cash" });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);

  // ── Firestore listeners ───────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeTransactions(orgId, (txns) => {
      setAllTransactions(txns);
      setLoading(false);
    }));

    unsubs.push(onSnapshot(
      query(collection(db, "ownerExpenses"), where("organizationId", "==", orgId)),
      (snap) => {
        setExpenses(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as OwnerExpense))
            .sort((a, b) => (b.date > a.date ? 1 : -1))
        );
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => setDealers(
        snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Filtered data ─────────────────────────────────────────
  const incomeTransactions = allTransactions.filter((t) => t.type === "income");
  const filteredIncome  = applyDateFilter(incomeTransactions, dateFilter, customFrom, customTo);
  const filteredExpenses = applyDateFilter(expenses, dateFilter, customFrom, customTo);

  const totalIncome   = filteredIncome.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit     = totalIncome - totalExpenses;
  const balance       = netProfit;

  const filterLabel = DATE_FILTER_OPTIONS.find((o) => o.key === dateFilter)?.label ?? "Last 30 Days";

  // ── Expense add ───────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.amount || Number(form.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    if (!form.date) { setFormError("Select a date"); return; }
    const isOnline = navigator.onLine;
    setSaving(true); setFormError("");
    try {
      const cfg = CATEGORIES[form.category];
      const payload = {
        organizationId: orgId,
        category: form.category,
        categoryLabel: cfg.label,
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod,
        vendor: form.vendor.trim(),
        description: form.description.trim(),
        receiptUrl: "",
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      if (!isOnline) {
        addDoc(collection(db, "ownerExpenses"), payload).catch(console.error);
        notifyOfflineSave("Farm Expense");
        setSuccess(true); setSaving(false);
        return;
      }
      const docRef = await addDoc(collection(db, "ownerExpenses"), payload);
      if (receiptFile) {
        uploadReceipt(receiptFile, docRef.id)
          .then((url) => updateDoc(doc(db, "ownerExpenses", docRef.id), { receiptUrl: url }))
          .catch(console.error);
      }
      if (orgId) {
        createNotification({
          organizationId: orgId,
          title: "Farm Expense Added 🚜",
          description: `${cfg.label}: −${new Intl.NumberFormat("en-PK").format(Number(form.amount))} PKR${form.vendor ? ` · ${form.vendor}` : ""}${form.description ? ` — ${form.description}` : ""}`,
          type: "farm",
        }).catch(console.error);
      }
      setSuccess(true); setSaving(false);
    } catch (e) {
      console.error(e);
      setFormError("Failed to save. Try again.");
      setSaving(false);
    }
  };

  async function uploadReceipt(file: File, id: string): Promise<string> {
    const blob = await compressImage(file);
    const r = ref(storage, `owner-receipts/${orgId}/${id}_receipt.jpg`);
    await uploadBytes(r, blob);
    return getDownloadURL(r);
  }

  const handleEditSave = async () => {
    if (!editForm.amount || Number(editForm.amount) <= 0 || !selected) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "ownerExpenses", selected.id), {
        amount: Number(editForm.amount),
        date: editForm.date,
        vendor: editForm.vendor,
        description: editForm.description,
        paymentMethod: editForm.paymentMethod,
        edited: true,
        editedAt: serverTimestamp(),
        editedBy: auth.currentUser?.uid || null,
      });
      setEditSaved(true);
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "ownerExpenses", selected.id));
      setSelected(null); setDelConfirm(false);
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
  };

  const resetForm = () => {
    setForm(blankForm());
    setReceiptFile(null); setReceiptPreview(""); setFormError(""); setSuccess(false);
  };

  const closeModal = () => { setSelected(null); setEditMode(false); setEditSaved(false); setDelConfirm(false); };

  // ═══ SUCCESS SCREEN ═══
  if (success) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: "#E8F5E9" }}>
        <CheckCircle size={52} color="#1B5E20" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Expense Saved! ✅</h1>
      <p className="text-gray-500 text-sm mb-2">
        {CATEGORIES[form.category]?.emoji} {CATEGORIES[form.category]?.label}
      </p>
      <p className="text-2xl font-bold mb-10" style={{ color: "#C62828" }}>−{fmt(Number(form.amount))}</p>
      <button onClick={() => { resetForm(); setView("list"); setTab("expenses"); }}
        className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
        style={{ backgroundColor: "#1B5E20" }}>
        Back to Farm Khata
      </button>
    </div>
  );

  // ═══ ADD EXPENSE FORM ═══
  if (view === "add") return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={() => { resetForm(); setView("list"); }} className="text-white mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h1 className="text-white text-xl font-bold">Add Farm Expense</h1>
          <p className="text-green-200 text-xs mt-0.5">Owner-paid farm costs</p>
        </div>
      </div>

      <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>
        )}

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3 block">Expense Type</label>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {Object.entries(CATEGORIES).map(([key, cfg]) => (
            <button key={key} onClick={() => setForm({ ...form, category: key })}
              className="flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border-2 transition-all active:scale-95"
              style={{
                borderColor: form.category === key ? cfg.color : "#E5E7EB",
                backgroundColor: form.category === key ? cfg.bg : "white",
              }}>
              <span className="text-2xl">{cfg.emoji}</span>
              <span className="text-[9px] font-bold text-center leading-tight"
                style={{ color: form.category === key ? cfg.color : "#6B7280" }}>
                {cfg.label}
              </span>
            </button>
          ))}
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Amount (Rs.)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 focus-within:border-green-700 bg-white">
          <input type="number" inputMode="numeric" placeholder="e.g. 15,000" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full outline-none text-gray-800 text-xl font-semibold bg-transparent" />
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Date</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white flex items-center">
          <input type="date" value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden" />
          <span className="text-gray-400 text-sm">
            {form.date ? new Date(form.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : ""}
          </span>
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Vendor / Dealer (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            <option value="">— No vendor —</option>
            {dealers.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Payment Method</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Notes (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3 mb-5 bg-white">
          <textarea placeholder="e.g. Engine oil change, 50L diesel for pump…"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Receipt / Bill Photo (Optional)</label>
        <input type="file" accept="image/*" id="farmReceiptInput" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setReceiptFile(file); setReceiptPreview(URL.createObjectURL(file)); }
        }} />
        <label htmlFor="farmReceiptInput"
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden mb-8 block"
          style={{ backgroundColor: "#FAFAFA" }}>
          {receiptPreview
            ? <img src={receiptPreview} className="w-full h-full object-cover" alt="receipt" />
            : <><Camera size={28} color="#9E9E9E" /><p className="text-gray-500 text-sm mt-2">Tap to upload bill/receipt</p><p className="text-gray-400 text-xs">Auto-compressed</p></>
          }
        </label>

        <button onClick={handleAdd} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Expense"}
        </button>
      </div>
    </div>
  );

  // ═══ MAIN LIST ═══
  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {receiptViewUrl && <ReceiptModal url={receiptViewUrl} onClose={() => setReceiptViewUrl(null)} />}

      {/* ── Expense Detail / Edit Modal ── */}
      {selected && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: CATEGORIES[selected.category]?.bg || "#F5F5F5" }}>
                    {CATEGORIES[selected.category]?.emoji || "💰"}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-800">
                      {editMode ? "Edit Expense" : selected.categoryLabel}
                    </h2>
                    {selected.edited && !editMode && <p className="text-gray-400 text-xs italic">Edited</p>}
                  </div>
                </div>
                <button onClick={closeModal}><X size={22} color="#9CA3AF" /></button>
              </div>

              {delConfirm ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#FFEBEE" }}>
                    <Trash2 size={28} color="#C62828" />
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">Delete this expense?</p>
                  <p className="text-gray-500 text-sm mb-6">This cannot be undone.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setDelConfirm(false)}
                      className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm">Cancel</button>
                    <button onClick={handleDelete} disabled={deleting}
                      className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: "#C62828" }}>
                      {deleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                    </button>
                  </div>
                </div>

              ) : editSaved ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <CheckCircle size={36} color="#1B5E20" />
                  </div>
                  <p className="text-gray-800 font-bold text-base">Changes saved</p>
                </div>

              ) : !editMode ? (
                <>
                  <div className="space-y-0 mb-6">
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Amount</span>
                      <span className="font-bold text-lg" style={{ color: "#C62828" }}>−{fmt(selected.amount)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Date</span>
                      <span className="text-gray-800 text-sm font-medium">{fmtDate(selected.date)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Payment</span>
                      <span className="text-gray-800 text-sm font-medium">{PAYMENT_METHODS[selected.paymentMethod] || selected.paymentMethod}</span>
                    </div>
                    {selected.vendor && (
                      <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                        <span className="text-gray-500 text-sm">Vendor</span>
                        <span className="text-gray-800 text-sm font-medium">{selected.vendor}</span>
                      </div>
                    )}
                    {selected.description && (
                      <div className="py-2.5">
                        <span className="text-gray-500 text-sm block mb-1">Notes</span>
                        <span className="text-gray-700 text-sm leading-relaxed">{selected.description}</span>
                      </div>
                    )}
                  </div>
                  {selected.receiptUrl && (
                    <button onClick={() => setReceiptViewUrl(selected.receiptUrl!)}
                      className="w-full mb-3 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm flex items-center justify-center gap-2">
                      <Receipt size={16} /> View Receipt
                    </button>
                  )}
                </>

              ) : (
                <>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.)</label>
                    <input type="number" inputMode="numeric" value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
                    <input type="date" value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Vendor / Dealer</label>
                    <select value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700 bg-white">
                      <option value="">— No vendor —</option>
                      {dealers.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Payment Method</label>
                    <select value={editForm.paymentMethod} onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700 bg-white">
                      {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
                    <textarea value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                  </div>
                </>
              )}

              <div className="pt-4 mt-2 border-t border-gray-100 flex gap-3">
                {editSaved || delConfirm ? (
                  <button onClick={closeModal}
                    className="flex-1 py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>Done</button>
                ) : !editMode && canEdit ? (
                  <>
                    <button onClick={() => setDelConfirm(true)}
                      className="py-4 px-5 rounded-2xl border-2 border-red-200 text-red-600 font-bold text-base active:scale-95 transition-transform flex items-center justify-center">
                      <Trash2 size={18} />
                    </button>
                    <button onClick={() => {
                        setEditForm({
                          amount: String(selected.amount),
                          date: selected.date,
                          vendor: selected.vendor || "",
                          description: selected.description || "",
                          paymentMethod: selected.paymentMethod || "cash",
                        });
                        setEditMode(true);
                      }}
                      className="flex-1 py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2"
                      style={{ backgroundColor: "#1B5E20" }}>
                      <Pencil size={16} /> Edit
                    </button>
                  </>
                ) : editMode ? (
                  <button onClick={handleEditSave} disabled={editSaving}
                    className="flex-1 py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    {editSaving ? <Loader2 size={22} className="animate-spin" /> : "Save Changes"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-0" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-2xl font-bold">Farm Khata</h1>
            <p className="text-green-200 text-xs mt-0.5">Income & expenses overview</p>
          </div>
          <button
            onClick={() => window.location.href = "/reports/print?type=owner"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
            🖨 Print
          </button>
        </div>

        {/* Tabs */}
        <div className="flex">
          {([
            { key: "income" as const,   label: "Income",   icon: <ArrowUpRight size={13} /> },
            { key: "expenses" as const, label: "Expenses", icon: <ArrowDownRight size={13} /> },
          ]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
              style={{
                color: tab === key ? "white" : "rgba(255,255,255,0.55)",
                borderBottom: tab === key ? "3px solid white" : "3px solid transparent",
              }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">

        {/* ── Dashboard Cards + Filter ── */}
        <div className="bg-white rounded-2xl p-4 shadow-md mb-4">
          {/* Filter row */}
          <div className="flex items-center justify-between mb-3 relative">
            <p className="font-bold text-gray-800 text-sm">Summary</p>
            <button
              onClick={() => setShowFilterMenu((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium max-w-[160px]"
              style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}
            >
              <span className="truncate">{filterLabel}</span>
              <ChevronRight size={12} className={`shrink-0 transition-transform ${showFilterMenu ? "-rotate-90" : "rotate-90"}`} color="#1B5E20" />
            </button>

            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
                <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 py-2 min-w-[180px]">
                  {DATE_FILTER_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setDateFilter(key); setShowFilterMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm"
                      style={{
                        color: dateFilter === key ? "#1B5E20" : "#374151",
                        fontWeight: dateFilter === key ? 700 : 400,
                        backgroundColor: dateFilter === key ? "#E8F5E9" : "transparent",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Custom date range inputs */}
          {dateFilter === "custom" && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <p className="text-gray-400 text-xs mb-1">From</p>
                <input type="date" value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-700" />
              </div>
              <div className="flex-1">
                <p className="text-gray-400 text-xs mb-1">To</p>
                <input type="date" value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-700" />
              </div>
            </div>
          )}

          {/* 4 stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: "#1B5E20" }}>Total Income</p>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#1B5E2022" }}>
                  <TrendingUp size={14} color="#1B5E20" />
                </div>
              </div>
              <p className="font-bold text-base leading-tight" style={{ color: "#1B5E20" }}>{fmt(totalIncome)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: "#C62828" }}>Total Expenses</p>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#C6282822" }}>
                  <TrendingDown size={14} color="#C62828" />
                </div>
              </div>
              <p className="font-bold text-base leading-tight" style={{ color: "#C62828" }}>{fmt(totalExpenses)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: netProfit >= 0 ? "#E3F2FD" : "#FFEBEE" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: netProfit >= 0 ? "#1565C0" : "#C62828" }}>Net Profit</p>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: (netProfit >= 0 ? "#1565C0" : "#C62828") + "22" }}>
                  <Wallet size={14} color={netProfit >= 0 ? "#1565C0" : "#C62828"} />
                </div>
              </div>
              <p className="font-bold text-base leading-tight" style={{ color: netProfit >= 0 ? "#1565C0" : "#C62828" }}>
                {netProfit >= 0 ? "" : "−"}{fmt(Math.abs(netProfit))}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: balance >= 0 ? "#F1F8E9" : "#FFF3E0" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium" style={{ color: balance >= 0 ? "#558B2F" : "#E65100" }}>Balance</p>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: (balance >= 0 ? "#558B2F" : "#E65100") + "22" }}>
                  <Scale size={14} color={balance >= 0 ? "#558B2F" : "#E65100"} />
                </div>
              </div>
              <p className="font-bold text-base leading-tight" style={{ color: balance >= 0 ? "#558B2F" : "#E65100" }}>
                {balance >= 0 ? "" : "−"}{fmt(Math.abs(balance))}
              </p>
            </div>
          </div>
        </div>

        {/* ── Income Tab ── */}
        {tab === "income" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-xs">
                {filteredIncome.length} record{filteredIncome.length !== 1 ? "s" : ""}
              </p>
              {canEdit && (
                <button
                  onClick={() => navigate("/ledger?form=income")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
                  style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                  <Plus size={14} /> Add Income
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin" style={{ color: "#1B5E20" }} /></div>
            ) : filteredIncome.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">💰</p>
                <p className="text-gray-500 text-sm">No income in this period</p>
                <p className="text-gray-400 text-xs mt-1">Tap "Add Income" to record farm income</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...filteredIncome].sort((a, b) => (b.date > a.date ? 1 : -1)).map((t) => (
                  <div key={t.id} className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                      <ArrowUpRight size={20} color="#1B5E20" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 font-semibold text-sm leading-tight">
                        {t.categoryLabel || t.category || t.description || "Income"}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5 truncate">
                        {t.farmerName ? `${t.farmerName} · ` : ""}
                        {t.parcelName ? `${t.parcelName} · ` : ""}
                        {fmtDate(t.date)}
                      </p>
                      {t.cropCycleName && (
                        <p className="text-gray-400 text-xs truncate">{t.cropCycleName}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>+{fmt(t.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Expenses Tab ── */}
        {tab === "expenses" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-xs">
                {filteredExpenses.length} record{filteredExpenses.length !== 1 ? "s" : ""}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin" style={{ color: "#1B5E20" }} /></div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🚜</p>
                <p className="text-gray-500 text-sm">No expenses in this period</p>
                <p className="text-gray-400 text-xs mt-1">Tap + to record fuel, repairs, and other farm costs</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredExpenses.map((e) => {
                  const cfg = CATEGORIES[e.category];
                  return (
                    <button key={e.id} onClick={() => setSelected(e)}
                      className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform text-left">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: cfg?.bg || "#F5F5F5" }}>
                        {cfg?.emoji || "💰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 font-semibold text-sm leading-tight">{e.categoryLabel}</p>
                        <p className="text-gray-400 text-xs mt-0.5 truncate">
                          {e.vendor ? `${e.vendor} · ` : ""}{fmtDate(e.date)}
                        </p>
                        {e.description && <p className="text-gray-400 text-xs truncate">{e.description}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm" style={{ color: "#C62828" }}>−{fmt(e.amount)}</p>
                        <p className="text-gray-400 text-[10px] mt-0.5">{PAYMENT_METHODS[e.paymentMethod] || e.paymentMethod}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB — only on expenses tab */}
      {canEdit && tab === "expenses" && (
        <button onClick={() => setView("add")}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40"
          style={{ backgroundColor: "#1B5E20" }}>
          <Plus size={26} color="white" />
        </button>
      )}
    </div>
  );
}
