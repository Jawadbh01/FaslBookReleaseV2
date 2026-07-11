/**
 * Unified Khata (Accounts) Hub
 * Five Khata types in one place — Farmer, Owner, Labour Contractor, Dealer, Custom.
 * A dropdown selector at the top controls which ledger is shown, and deep links
 * (?view=X&id=Y) from Profiles jump straight to a specific person's ledger.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection, query, where, onSnapshot,
  updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useLocation, useSearch } from "wouter";
import {
  subscribeTransactions, addTransaction, updateTransaction, deleteTransaction, type Transaction,
} from "@/lib/firebase/transactions";
import {
  subscribeLabourContractors,
  subscribeHarvestRecords,
  type LabourContractor,
  type HarvestLabourRecord,
  type HarvestPaymentStatus,
} from "@/lib/firebase/labourContractors";
import {
  subscribeCustomProfiles, addCustomProfile, type CustomProfile,
} from "@/lib/firebase/customProfiles";
import {
  BookOpen, ChevronRight, Loader2, Plus,
  TrendingUp, TrendingDown, Wallet, Scale,
  Users, ArrowUpRight, ArrowDownRight,
  ChevronLeft, Wheat, ChevronDown, Handshake, Tag,
  X, Pencil, Trash2, AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";

// ── Helpers ───────────────────────────────────────────────────
const fmt    = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]}`;
};
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const todayStr = () => new Date().toISOString().split("T")[0];

type KhataView = "farmer" | "owner" | "labour" | "dealer" | "custom";

const STATUS_CONFIG: Record<HarvestPaymentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#E65100", bg: "#FFF3E0" },
  partial: { label: "Partial", color: "#1565C0", bg: "#E3F2FD" },
  paid:    { label: "Paid",    color: "#1B5E20", bg: "#E8F5E9" },
};

const VIEW_CONFIG: Record<KhataView, { label: string; urdu: string; icon: any; color: string; bg: string }> = {
  farmer: { label: "Farmer Khata",             urdu: "کسان خاتہ",       icon: Users,     color: "#1B5E20", bg: "#E8F5E9" },
  owner:  { label: "Owner Khata",              urdu: "مالک خاتہ",       icon: Scale,     color: "#1565C0", bg: "#E3F2FD" },
  labour: { label: "Labour Contractor Khata",  urdu: "مزدور خاتہ",      icon: Wheat,     color: "#6A1B9A", bg: "#F3E5F5" },
  dealer: { label: "Dealer Khata",             urdu: "ڈیلر خاتہ",       icon: Handshake, color: "#EF6C00", bg: "#FFF3E0" },
  custom: { label: "Custom Khata",             urdu: "خصوصی خاتہ",      icon: Tag,       color: "#AD1457", bg: "#FCE4EC" },
};

// ── Helper: credit/debit display ──────────────────────────────
const CREDIT_TYPES = ["income", "loanTaken", "dealerPayment"];
function isCredit(type: string) { return CREDIT_TYPES.includes(type); }

function txnEmoji(type: string, category?: string): string {
  if (category === "harvestLabour") return "🌾";
  if (type === "income") return "💰";
  if (type === "expense") return "📋";
  if (type === "dealerPurchase") return "🏪";
  if (type === "dealerPayment")  return "💳";
  if (type === "loanTaken")      return "🤝";
  if (type === "loanRepayment")  return "↩️";
  return "💰";
}

// ── Expense categories for owner khata ───────────────────────
const EXPENSE_EMOJI: Record<string, string> = {
  fuel:"⛽", tractor:"🔧", machinery:"🚜", irrigation:"💧", land_prep:"🌾",
  labour:"👷", seeds:"🌱", fertilizer:"🧪", pesticide:"🪣", transport:"🚛",
  utilities:"💡", other:"💰",
};

interface OwnerExpense {
  id: string; category: string; categoryLabel: string; amount: number;
  date: string; paymentMethod: string; vendor: string; description: string;
  organizationId: string; edited?: boolean;
}

interface RawDealer {
  id: string; name: string; phone?: string; businessName?: string; organizationId: string;
}

export default function KhataPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── View ──────────────────────────────────────────────────
  const [view, setView]             = useState<KhataView>("farmer");
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [focusId, setFocusId]       = useState<string | null>(null);

  // deep link support: /khata?view=dealer&id=abc123
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const v = params.get("view");
    const id = params.get("id");
    if (v && (v in VIEW_CONFIG)) setView(v as KhataView);
    if (id) setFocusId(id);
  }, [searchStr]);

  // ── Month picker (Farmer Khata) ───────────────────────────
  const now = new Date();
  const [viewMonth, setViewMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const prevMonth = () => setViewMonth((m) => m.month === 0  ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  const nextMonth = () => setViewMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0  } : { year: m.year, month: m.month + 1 });

  // ── Data ──────────────────────────────────────────────────
  const [allTxns,       setAllTxns]       = useState<Transaction[]>([]);
  const [ownerExpenses, setOwnerExpenses] = useState<OwnerExpense[]>([]);
  const [contractors,   setContractors]   = useState<LabourContractor[]>([]);
  const [harvestRecs,   setHarvestRecs]   = useState<HarvestLabourRecord[]>([]);
  const [dealers,       setDealers]       = useState<RawDealer[]>([]);
  const [customs,       setCustoms]       = useState<CustomProfile[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeTransactions(orgId, (t) => { setAllTxns(t); setLoading(false); }));

    unsubs.push(onSnapshot(
      query(collection(db, "ownerExpenses"), where("organizationId", "==", orgId)),
      (snap) => setOwnerExpenses(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as OwnerExpense))
          .sort((a, b) => (b.date > a.date ? 1 : -1))
      )
    ));

    unsubs.push(subscribeLabourContractors(orgId, setContractors));
    unsubs.push(subscribeHarvestRecords(orgId, setHarvestRecs));

    unsubs.push(onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => setDealers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawDealer)))
    ));

    unsubs.push(subscribeCustomProfiles(orgId, setCustoms));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Farmer Khata derived ──────────────────────────────────
  const monthTxns = allTxns.filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date + "T00:00:00");
    return d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month
      && (!focusId || view !== "farmer" || t.farmerId === focusId);
  }).sort((a, b) => (b.date > a.date ? 1 : -1));

  const farmerCredit  = monthTxns.filter((t) => isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
  const farmerDebit   = monthTxns.filter((t) => !isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
  const farmerBalance = farmerCredit - farmerDebit;

  // ── Owner Khata derived ───────────────────────────────────
  const thirtyDaysAgo  = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();
  const ownerIncomeTxns   = allTxns.filter((t) => t.type === "income" && t.date >= thirtyDaysAgo && t.date <= todayStr());
  const ownerExpFiltered  = ownerExpenses.filter((e) => e.date >= thirtyDaysAgo && e.date <= todayStr());
  const ownerTotalIncome  = ownerIncomeTxns.reduce((s, t) => s + t.amount, 0);
  const ownerTotalExpense = ownerExpFiltered.reduce((s, e) => s + e.amount, 0);
  const ownerNetProfit    = ownerTotalIncome - ownerTotalExpense;

  // ── Labour Contractor derived ─────────────────────────────
  const contractorStats = contractors.map((c) => {
    const recs = harvestRecs.filter((r) => r.contractorId === c.id);
    return {
      ...c,
      totalJobs:    recs.length,
      totalAmount:  recs.reduce((s, r) => s + r.totalAmount, 0),
      totalPaid:    recs.reduce((s, r) => s + r.advancePaid, 0),
      totalPending: recs.reduce((s, r) => s + r.remainingBalance, 0),
    };
  });
  const totalLabourExpense = harvestRecs.reduce((s, r) => s + r.totalAmount, 0);
  const totalLabourPaid    = harvestRecs.reduce((s, r) => s + r.advancePaid, 0);
  const totalLabourPending = harvestRecs.reduce((s, r) => s + r.remainingBalance, 0);
  const recentHarvestRecs  = (focusId ? harvestRecs.filter((r) => r.contractorId === focusId) : harvestRecs)
    .slice().sort((a, b) => (b.harvestDate > a.harvestDate ? 1 : -1)).slice(0, 10);

  // ── Dealer Khata derived ──────────────────────────────────
  const dealerTxns = allTxns.filter((t) => t.type === "dealerPurchase" || t.type === "dealerPayment");
  const dealerStats = dealers.map((d) => {
    const txs = dealerTxns.filter((t) => t.dealerId === d.id);
    const purchased = txs.filter((t) => t.type === "dealerPurchase").reduce((s, t) => s + t.amount, 0);
    const paid      = txs.filter((t) => t.type === "dealerPayment").reduce((s, t) => s + t.amount, 0);
    return { ...d, purchased, paid, outstanding: purchased - paid };
  });
  const totalDealerPurchased = dealerStats.reduce((s, d) => s + d.purchased, 0);
  const totalDealerPaid      = dealerStats.reduce((s, d) => s + d.paid, 0);
  const totalDealerDue       = totalDealerPurchased - totalDealerPaid;
  const focusedDealer = focusId ? dealerStats.find((d) => d.id === focusId) : null;
  const focusedDealerTxns = focusId ? dealerTxns.filter((t) => t.dealerId === focusId).sort((a, b) => (b.date > a.date ? 1 : -1)) : [];

  // ── Custom Khata derived ──────────────────────────────────
  const customTxns = allTxns.filter((t) => !!t.customProfileId);
  const customStats = customs.map((c) => {
    const txs = customTxns.filter((t) => t.customProfileId === c.id);
    const credit = txs.filter((t) => isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
    const debit  = txs.filter((t) => !isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
    return { ...c, credit, debit, balance: credit - debit };
  });
  const focusedCustom = focusId ? customStats.find((c) => c.id === focusId) : null;
  const focusedCustomTxns = focusId ? customTxns.filter((t) => t.customProfileId === focusId).sort((a, b) => (b.date > a.date ? 1 : -1)) : [];

  const vc = VIEW_CONFIG[view];
  const switchView = (key: KhataView) => { setView(key); setFocusId(null); setShowViewMenu(false); navigate(`/khata?view=${key}`); };

  // ═══════════════════ Inline entry edit modal (Farmer / Custom / Owner) ═══════════════════
  const [editEntry, setEditEntry] = useState<{ kind: "transaction" | "ownerExpense"; data: any } | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", date: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editDelConfirm, setEditDelConfirm] = useState(false);

  const openEditEntry = (kind: "transaction" | "ownerExpense", data: any) => {
    setEditEntry({ kind, data });
    setEditForm({ amount: String(data.amount || ""), date: data.date || "", notes: data.notes || data.description || "" });
    setEditDelConfirm(false);
  };
  const closeEditEntry = () => { setEditEntry(null); setEditDelConfirm(false); };

  const saveEditEntry = async () => {
    if (!editEntry || !editForm.amount || Number(editForm.amount) <= 0) return;
    setEditSaving(true);
    try {
      if (editEntry.kind === "transaction") {
        await updateTransaction(editEntry.data.id, {
          amount: Number(editForm.amount), date: editForm.date, notes: editForm.notes,
        });
      } else {
        await updateDoc(doc(db, "ownerExpenses", editEntry.data.id), {
          amount: Number(editForm.amount), date: editForm.date, description: editForm.notes,
          edited: true, editedAt: serverTimestamp(), editedBy: auth.currentUser?.uid || null,
        });
      }
      closeEditEntry();
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const deleteEditEntry = async () => {
    if (!editEntry) return;
    setEditSaving(true);
    try {
      if (editEntry.kind === "transaction") await deleteTransaction(editEntry.data.id);
      else await deleteDoc(doc(db, "ownerExpenses", editEntry.data.id));
      closeEditEntry();
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  // ═══════════════════ Custom Khata: create + add entry ═══════════════════
  const [newKhataModal, setNewKhataModal] = useState(false);
  const [newKhataForm, setNewKhataForm] = useState({ name: "", customLabel: "", phone: "" });
  const [newKhataSaving, setNewKhataSaving] = useState(false);

  const createCustomKhata = async () => {
    if (!newKhataForm.name.trim() || !newKhataForm.customLabel.trim() || !orgId) return;
    setNewKhataSaving(true);
    try {
      const id = await addCustomProfile({
        name: newKhataForm.name.trim(), customLabel: newKhataForm.customLabel.trim(),
        phone: newKhataForm.phone.trim(), organizationId: orgId,
      } as any);
      setNewKhataModal(false);
      setNewKhataForm({ name: "", customLabel: "", phone: "" });
      navigate(`/khata?view=custom&id=${id}`);
    } catch (e) { console.error(e); }
    finally { setNewKhataSaving(false); }
  };

  const [addEntryModal, setAddEntryModal] = useState(false);
  const [addEntryForm, setAddEntryForm] = useState({ direction: "debit" as "credit" | "debit", amount: "", date: todayStr(), notes: "" });
  const [addEntrySaving, setAddEntrySaving] = useState(false);

  const submitCustomEntry = async () => {
    if (!addEntryForm.amount || Number(addEntryForm.amount) <= 0 || !focusedCustom || !orgId) return;
    setAddEntrySaving(true);
    try {
      await addTransaction({
        organizationId: orgId,
        type: addEntryForm.direction === "credit" ? "income" : "expense",
        amount: Number(addEntryForm.amount),
        date: addEntryForm.date,
        category: "custom",
        categoryLabel: focusedCustom.customLabel,
        customProfileId: focusedCustom.id,
        customProfileName: focusedCustom.name,
        notes: addEntryForm.notes,
      } as any);
      setAddEntryModal(false);
      setAddEntryForm({ direction: "debit", amount: "", date: todayStr(), notes: "" });
    } catch (e) { console.error(e); }
    finally { setAddEntrySaving(false); }
  };

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <BookOpen size={20} color="white" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold leading-tight">Khata</h1>
              <p className="text-green-200 text-xs">خاتہ / Accounts</p>
            </div>
          </div>
          {view !== "dealer" && view !== "custom" && (
            <button onClick={() => navigate(view === "farmer" ? "/ledger" : view === "owner" ? "/owner-expenses" : "/labour-contractors")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
              Full View <ChevronRight size={13} />
            </button>
          )}
        </div>

        {/* View Selector */}
        <div className="relative">
          <button
            onClick={() => setShowViewMenu((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
            <div className="flex items-center gap-2.5">
              <vc.icon size={18} color="white" />
              <div className="text-left">
                <p className="text-white font-bold text-sm leading-tight">{vc.label}</p>
                <p className="text-green-200 text-xs">{vc.urdu}</p>
              </div>
            </div>
            <ChevronDown size={18} color="rgba(255,255,255,0.7)" className={`transition-transform ${showViewMenu ? "rotate-180" : ""}`} />
          </button>

          {showViewMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowViewMenu(false)} />
              <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                {(Object.entries(VIEW_CONFIG) as [KhataView, typeof VIEW_CONFIG[KhataView]][]).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button key={key}
                      onClick={() => switchView(key)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 active:scale-[0.98] transition-transform"
                      style={{ backgroundColor: view === key ? cfg.bg : "white" }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: cfg.bg }}>
                        <Icon size={17} color={cfg.color} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-gray-800 font-bold text-sm leading-tight">{cfg.label}</p>
                        <p className="text-gray-400 text-xs">{cfg.urdu}</p>
                      </div>
                      {view === key && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: "#1B5E20" }} /></div>
      ) : (
        <div className="px-4 pt-4">

          {/* ══════════════════════ FARMER KHATA ══════════════════════ */}
          {view === "farmer" && (
            <>
              {/* Month picker */}
              <div className="bg-white rounded-2xl px-4 py-3 shadow-md mb-4">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
                    <ChevronLeft size={18} color="#374151" />
                  </button>
                  <div className="text-center">
                    <p className="font-bold text-gray-800 text-base">{MONTHS_LONG[viewMonth.month]} {viewMonth.year}</p>
                    <p className="text-gray-400 text-xs">{monthTxns.length} transactions{focusId ? " · filtered" : ""}</p>
                  </div>
                  <button onClick={nextMonth} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
                    <ChevronRight size={18} color="#374151" />
                  </button>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#E8F5E9" }}>
                    <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#1B5E20" }}>Income</p>
                    <p className="text-xs font-bold leading-tight" style={{ color: "#1B5E20" }}>Rs. {Math.round(farmerCredit).toLocaleString("en-PK")}</p>
                  </div>
                  <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#FFEBEE" }}>
                    <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#C62828" }}>Expense</p>
                    <p className="text-xs font-bold leading-tight" style={{ color: "#C62828" }}>Rs. {Math.round(farmerDebit).toLocaleString("en-PK")}</p>
                  </div>
                  <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: farmerBalance >= 0 ? "#E3F2FD" : "#FFEBEE" }}>
                    <p className="text-[10px] font-semibold mb-0.5" style={{ color: farmerBalance >= 0 ? "#1565C0" : "#C62828" }}>Balance</p>
                    <p className="text-xs font-bold leading-tight" style={{ color: farmerBalance >= 0 ? "#1565C0" : "#C62828" }}>
                      {farmerBalance < 0 ? "−" : ""}Rs. {Math.abs(Math.round(farmerBalance)).toLocaleString("en-PK")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick add buttons */}
              <div className="flex gap-2 mb-4">
                <Link href="/ledger?form=income"
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
                  style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                  <ArrowUpRight size={16} /> Add Income
                </Link>
                <Link href="/ledger?form=expense"
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
                  style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}>
                  <ArrowDownRight size={16} /> Add Expense
                </Link>
              </div>

              {/* Transactions list */}
              {monthTxns.length === 0 ? (
                <div className="text-center py-14 bg-white rounded-2xl shadow-sm">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-gray-500 text-sm">No transactions this month</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {monthTxns.map((t) => {
                    const credit = isCredit(t.type);
                    return (
                      <button key={t.id} onClick={() => canEdit && openEditEntry("transaction", t)}
                        className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left active:scale-[0.99] transition-transform">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: credit ? "#E8F5E9" : "#FFEBEE" }}>
                          {txnEmoji(t.type, t.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 font-semibold text-sm leading-tight truncate">
                            {t.categoryLabel || t.description || t.type}
                          </p>
                          <p className="text-gray-400 text-xs mt-0.5 truncate">
                            {[t.farmerName, t.parcelName, t.contractorName, fmtDate(t.date)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <p className="font-bold text-sm shrink-0" style={{ color: credit ? "#1B5E20" : "#C62828" }}>
                          {credit ? "+" : "−"}{fmt(t.amount)}
                        </p>
                        {canEdit && <Pencil size={13} color="#D1D5DB" className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <Link href="/ledger"
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform block">
                Open Full Ledger <ChevronRight size={14} />
              </Link>
            </>
          )}

          {/* ══════════════════════ OWNER / FARM KHATA ══════════════════════ */}
          {view === "owner" && (
            <>
              {/* Summary */}
              <div className="bg-white rounded-2xl p-4 shadow-md mb-4">
                <p className="font-bold text-gray-700 text-sm mb-3">Last 30 Days</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Income",   value: ownerTotalIncome,   icon: TrendingUp,   color: "#1B5E20", bg: "#E8F5E9" },
                    { label: "Total Expenses",  value: ownerTotalExpense,  icon: TrendingDown, color: "#C62828", bg: "#FFEBEE" },
                    { label: "Net Profit",      value: ownerNetProfit,     icon: Wallet,       color: ownerNetProfit >= 0 ? "#1565C0" : "#C62828", bg: ownerNetProfit >= 0 ? "#E3F2FD" : "#FFEBEE" },
                    { label: "Balance",         value: ownerNetProfit,     icon: Scale,        color: ownerNetProfit >= 0 ? "#558B2F" : "#E65100", bg: ownerNetProfit >= 0 ? "#F1F8E9" : "#FFF3E0" },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="rounded-xl p-3" style={{ backgroundColor: bg }}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium" style={{ color }}>{label}</p>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
                          <Icon size={12} color={color} />
                        </div>
                      </div>
                      <p className="font-bold text-sm leading-tight" style={{ color }}>
                        {value < 0 ? "−" : ""}{fmt(Math.abs(value))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent expenses */}
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-700 text-sm">Recent Expenses</p>
                <Link href="/owner-expenses" className="text-xs font-semibold" style={{ color: "#1B5E20" }}>View All</Link>
              </div>

              {ownerExpFiltered.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
                  <p className="text-3xl mb-2">🚜</p>
                  <p className="text-gray-400 text-sm">No expenses in last 30 days</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ownerExpFiltered.slice(0, 8).map((e) => (
                    <button key={e.id} onClick={() => canEdit && openEditEntry("ownerExpense", e)}
                      className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left active:scale-[0.99] transition-transform">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: "#FFEBEE" }}>
                        {EXPENSE_EMOJI[e.category] || "💰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 font-semibold text-sm leading-tight">{e.categoryLabel}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{e.vendor ? `${e.vendor} · ` : ""}{fmtDate(e.date)}</p>
                      </div>
                      <p className="font-bold text-sm shrink-0" style={{ color: "#C62828" }}>−{fmt(e.amount)}</p>
                      {canEdit && <Pencil size={13} color="#D1D5DB" className="shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              <Link href="/owner-expenses"
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform block">
                Open Full Owner Khata <ChevronRight size={14} />
              </Link>
            </>
          )}

          {/* ══════════════════════ LABOUR CONTRACTOR KHATA ══════════════════════ */}
          {view === "labour" && (
            <>
              {/* Summary */}
              <div className="bg-white rounded-2xl p-4 shadow-md mb-4">
                <p className="font-bold text-gray-700 text-sm mb-3">All Time Summary</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Total Cost",   value: totalLabourExpense, color: "#6A1B9A", bg: "#F3E5F5" },
                    { label: "Paid",         value: totalLabourPaid,    color: "#1B5E20", bg: "#E8F5E9" },
                    { label: "Pending",      value: totalLabourPending, color: "#E65100", bg: "#FFF3E0" },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: bg }}>
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color }}>{label}</p>
                      <p className="text-xs font-bold leading-tight" style={{ color }}>Rs. {Math.round(value).toLocaleString("en-PK")}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contractor balances */}
              {contractorStats.length > 0 && (
                <>
                  <p className="font-bold text-gray-700 text-sm mb-2">Contractor Balances</p>
                  <div className="space-y-2 mb-4">
                    {contractorStats.map((c) => (
                      <button key={c.id} onClick={() => navigate(`/labour-contractors/${c.id}`)}
                        className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform text-left">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#F3E5F5" }}>
                          <Users size={20} color="#6A1B9A" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 font-bold text-sm leading-tight">{c.name}</p>
                          <p className="text-gray-400 text-xs">{c.teamSize} workers · {c.totalJobs} jobs</p>
                        </div>
                        <div className="text-right shrink-0">
                          {c.totalPending > 0 ? (
                            <>
                              <p className="text-xs text-gray-400">Due</p>
                              <p className="font-bold text-sm" style={{ color: "#E65100" }}>{fmt(c.totalPending)}</p>
                            </>
                          ) : (
                            <p className="text-xs font-bold" style={{ color: "#1B5E20" }}>Settled ✓</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Recent harvest records */}
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-700 text-sm">Recent Records</p>
                <Link href="/labour-contractors" className="text-xs font-semibold" style={{ color: "#6A1B9A" }}>View All</Link>
              </div>

              {recentHarvestRecs.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
                  <p className="text-3xl mb-2">🌾</p>
                  <p className="text-gray-400 text-sm">No harvest records yet</p>
                  <Link href="/labour-contractors"
                    className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                    style={{ backgroundColor: "#6A1B9A" }}>
                    <Plus size={15} /> Add Record
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentHarvestRecs.map((r) => {
                    const sc = STATUS_CONFIG[r.paymentStatus];
                    return (
                      <button key={r.id} onClick={() => navigate("/labour-contractors")}
                        className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: "#FFF8E1" }}>
                          🌾
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 font-semibold text-sm leading-tight truncate">{r.contractorName}</p>
                          <p className="text-gray-400 text-xs mt-0.5 truncate">{r.parcelName} · {fmtDate(r.harvestDate)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmt(r.totalAmount)}</p>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                            style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <Link href="/labour-contractors"
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform block">
                Open Full View <ChevronRight size={14} />
              </Link>
            </>
          )}

          {/* ══════════════════════ DEALER KHATA ══════════════════════ */}
          {view === "dealer" && (
            <>
              {focusedDealer ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => navigate("/khata?view=dealer")} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white shadow-sm">
                      <ChevronLeft size={16} color="#374151" />
                    </button>
                    <p className="font-bold text-gray-800">{focusedDealer.businessName || focusedDealer.name}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Purchased</p>
                      <p className="text-xs font-bold" style={{ color: "#EF6C00" }}>{fmt(focusedDealer.purchased)}</p>
                    </div>
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Paid</p>
                      <p className="text-xs font-bold" style={{ color: "#1B5E20" }}>{fmt(focusedDealer.paid)}</p>
                    </div>
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Due</p>
                      <p className="text-xs font-bold" style={{ color: focusedDealer.outstanding > 0 ? "#C62828" : "#1B5E20" }}>{fmt(focusedDealer.outstanding)}</p>
                    </div>
                  </div>
                  <p className="font-bold text-gray-700 text-sm mb-2">Recent Entries</p>
                  {focusedDealerTxns.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl shadow-sm"><p className="text-gray-400 text-sm">No entries yet</p></div>
                  ) : (
                    <div className="space-y-2 mb-4">
                      {focusedDealerTxns.slice(0, 15).map((t) => (
                        <div key={t.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: t.type === "dealerPayment" ? "#E8F5E9" : "#FFF3E0" }}>
                            {t.type === "dealerPayment" ? "💳" : "🏪"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-800 font-semibold text-sm truncate">{t.categoryLabel || t.description || t.type}</p>
                            <p className="text-gray-400 text-xs">{fmtDate(t.date)}</p>
                          </div>
                          <p className="font-bold text-sm shrink-0" style={{ color: t.type === "dealerPayment" ? "#1B5E20" : "#C62828" }}>
                            {t.type === "dealerPayment" ? "+" : "−"}{fmt(t.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-white rounded-2xl p-4 shadow-md mb-4">
                    <p className="font-bold text-gray-700 text-sm mb-3">All Time Summary</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Purchased", value: totalDealerPurchased, color: "#EF6C00", bg: "#FFF3E0" },
                        { label: "Paid",      value: totalDealerPaid,      color: "#1B5E20", bg: "#E8F5E9" },
                        { label: "Due",       value: totalDealerDue,       color: "#C62828", bg: "#FFEBEE" },
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: bg }}>
                          <p className="text-[10px] font-semibold mb-0.5" style={{ color }}>{label}</p>
                          <p className="text-xs font-bold leading-tight" style={{ color }}>Rs. {Math.round(value).toLocaleString("en-PK")}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="font-bold text-gray-700 text-sm mb-2">Dealer Balances</p>
                  {dealerStats.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl shadow-sm"><p className="text-3xl mb-2">🏪</p><p className="text-gray-400 text-sm">No dealers yet</p></div>
                  ) : (
                    <div className="space-y-2">
                      {dealerStats.map((d) => (
                        <button key={d.id} onClick={() => navigate(`/khata?view=dealer&id=${d.id}`)}
                          className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform text-left">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFF3E0" }}>
                            <Handshake size={20} color="#EF6C00" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-800 font-bold text-sm leading-tight">{d.businessName || d.name}</p>
                            <p className="text-gray-400 text-xs">{d.name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {d.outstanding > 0 ? (
                              <><p className="text-xs text-gray-400">Due</p><p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmt(d.outstanding)}</p></>
                            ) : (
                              <p className="text-xs font-bold" style={{ color: "#1B5E20" }}>Settled ✓</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <Link href="/dealers"
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform block">
                Open Full View (Add/Edit Entries) <ChevronRight size={14} />
              </Link>
            </>
          )}

          {/* ══════════════════════ CUSTOM KHATA ══════════════════════ */}
          {view === "custom" && (
            <>
              {focusedCustom ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => navigate("/khata?view=custom")} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white shadow-sm">
                      <ChevronLeft size={16} color="#374151" />
                    </button>
                    <div>
                      <p className="font-bold text-gray-800">{focusedCustom.name}</p>
                      <p className="text-gray-400 text-xs">{focusedCustom.customLabel}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Credit</p>
                      <p className="text-xs font-bold" style={{ color: "#1B5E20" }}>{fmt(focusedCustom.credit)}</p>
                    </div>
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Debit</p>
                      <p className="text-xs font-bold" style={{ color: "#C62828" }}>{fmt(focusedCustom.debit)}</p>
                    </div>
                    <div className="rounded-xl p-2.5 text-center bg-white shadow-sm">
                      <p className="text-[10px] font-semibold mb-0.5 text-gray-400">Balance</p>
                      <p className="text-xs font-bold" style={{ color: focusedCustom.balance >= 0 ? "#1565C0" : "#C62828" }}>
                        {focusedCustom.balance < 0 ? "−" : ""}{fmt(Math.abs(focusedCustom.balance))}
                      </p>
                    </div>
                  </div>

                  {canEdit && (
                    <button onClick={() => setAddEntryModal(true)}
                      className="w-full mb-4 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform"
                      style={{ backgroundColor: "#AD1457" }}>
                      <Plus size={16} /> Add Entry
                    </button>
                  )}

                  <p className="font-bold text-gray-700 text-sm mb-2">Recent Entries</p>
                  {focusedCustomTxns.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl shadow-sm"><p className="text-gray-400 text-sm">No entries yet</p></div>
                  ) : (
                    <div className="space-y-2">
                      {focusedCustomTxns.slice(0, 20).map((t) => {
                        const credit = isCredit(t.type);
                        return (
                          <button key={t.id} onClick={() => canEdit && openEditEntry("transaction", t)}
                            className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left active:scale-[0.99] transition-transform">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: credit ? "#E8F5E9" : "#FFEBEE" }}>
                              {credit ? "💰" : "📋"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-800 font-semibold text-sm truncate">{t.notes || t.categoryLabel || "Entry"}</p>
                              <p className="text-gray-400 text-xs">{fmtDate(t.date)}</p>
                            </div>
                            <p className="font-bold text-sm shrink-0" style={{ color: credit ? "#1B5E20" : "#C62828" }}>
                              {credit ? "+" : "−"}{fmt(t.amount)}
                            </p>
                            {canEdit && <Pencil size={13} color="#D1D5DB" className="shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {canEdit && (
                    <button onClick={() => setNewKhataModal(true)}
                      className="w-full mb-4 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform"
                      style={{ backgroundColor: "#AD1457" }}>
                      <Plus size={16} /> New Custom Khata
                    </button>
                  )}
                  <p className="font-bold text-gray-700 text-sm mb-2">Custom Khatas</p>
                  {customStats.length === 0 ? (
                    <div className="text-center py-14 bg-white rounded-2xl shadow-sm">
                      <p className="text-4xl mb-3">🏷️</p>
                      <p className="text-gray-500 text-sm">No custom khatas yet</p>
                      <p className="text-gray-400 text-xs mt-1">e.g. Landlord, Investor, Transporter</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customStats.map((c) => (
                        <button key={c.id} onClick={() => navigate(`/khata?view=custom&id=${c.id}`)}
                          className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform text-left">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#FCE4EC" }}>
                            <Tag size={20} color="#AD1457" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-800 font-bold text-sm leading-tight">{c.name}</p>
                            <p className="text-gray-400 text-xs">{c.customLabel}</p>
                          </div>
                          <p className="font-bold text-sm shrink-0" style={{ color: c.balance >= 0 ? "#1565C0" : "#C62828" }}>
                            {c.balance < 0 ? "−" : ""}{fmt(Math.abs(c.balance))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      )}

      {/* FAB */}
      {view !== "dealer" && view !== "custom" && (
        <button
          onClick={() => navigate(view === "farmer" ? "/ledger?form=expense" : view === "owner" ? "/owner-expenses" : "/labour-contractors")}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40"
          style={{ backgroundColor: VIEW_CONFIG[view].color }}>
          <Plus size={26} color="white" />
        </button>
      )}

      {/* ── Inline Entry Edit Modal ── */}
      {editEntry && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeEditEntry}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Entry</h2>
              <button onClick={closeEditEntry}><X size={22} color="#9CA3AF" /></button>
            </div>

            {editDelConfirm ? (
              <div className="flex flex-col items-center text-center py-2">
                <AlertTriangle size={28} color="#C62828" className="mb-2" />
                <p className="text-gray-700 font-semibold mb-1">Delete this entry?</p>
                <p className="text-gray-400 text-sm mb-5">This can't be undone.</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setEditDelConfirm(false)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                  <button onClick={deleteEditEntry} disabled={editSaving} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm" style={{ backgroundColor: "#C62828" }}>
                    {editSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className="text-gray-600 text-sm font-medium mb-2 block">Amount</label>
                <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                <div className="flex gap-2">
                  <button onClick={() => setEditDelConfirm(true)}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-red-100 shrink-0">
                    <Trash2 size={16} color="#C62828" />
                  </button>
                  <button onClick={saveEditEntry} disabled={editSaving}
                    className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: "#1B5E20" }}>
                    {editSaving ? <Loader2 size={18} className="animate-spin" /> : "Save Changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── New Custom Khata Modal ── */}
      {newKhataModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setNewKhataModal(false)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">New Custom Khata</h2>
              <button onClick={() => setNewKhataModal(false)}><X size={22} color="#9CA3AF" /></button>
            </div>
            <label className="text-gray-600 text-sm font-medium mb-2 block">Name *</label>
            <input value={newKhataForm.name} onChange={(e) => setNewKhataForm({ ...newKhataForm, name: e.target.value })}
              placeholder="e.g. Ahmad Khan" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-pink-700" />
            <label className="text-gray-600 text-sm font-medium mb-2 block">Custom Label *</label>
            <input value={newKhataForm.customLabel} onChange={(e) => setNewKhataForm({ ...newKhataForm, customLabel: e.target.value })}
              placeholder="e.g. Landlord, Investor, Transporter" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-pink-700" />
            <label className="text-gray-600 text-sm font-medium mb-2 block">Phone</label>
            <input value={newKhataForm.phone} onChange={(e) => setNewKhataForm({ ...newKhataForm, phone: e.target.value })}
              placeholder="03XX-XXXXXXX" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-pink-700" />
            <button onClick={createCustomKhata} disabled={newKhataSaving}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "#AD1457" }}>
              {newKhataSaving ? <Loader2 size={20} className="animate-spin" /> : "Create Khata"}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add Custom Entry Modal ── */}
      {addEntryModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setAddEntryModal(false)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Add Entry</h2>
              <button onClick={() => setAddEntryModal(false)}><X size={22} color="#9CA3AF" /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setAddEntryForm({ ...addEntryForm, direction: "credit" })}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2"
                style={{ backgroundColor: addEntryForm.direction === "credit" ? "#E8F5E9" : "white", borderColor: addEntryForm.direction === "credit" ? "#1B5E20" : "#E5E7EB", color: addEntryForm.direction === "credit" ? "#1B5E20" : "#6B7280" }}>
                Credit (Received)
              </button>
              <button onClick={() => setAddEntryForm({ ...addEntryForm, direction: "debit" })}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2"
                style={{ backgroundColor: addEntryForm.direction === "debit" ? "#FFEBEE" : "white", borderColor: addEntryForm.direction === "debit" ? "#C62828" : "#E5E7EB", color: addEntryForm.direction === "debit" ? "#C62828" : "#6B7280" }}>
                Debit (Given)
              </button>
            </div>
            <label className="text-gray-600 text-sm font-medium mb-2 block">Amount *</label>
            <input type="number" value={addEntryForm.amount} onChange={(e) => setAddEntryForm({ ...addEntryForm, amount: e.target.value })}
              placeholder="0" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-pink-700" />
            <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
            <input type="date" value={addEntryForm.date} onChange={(e) => setAddEntryForm({ ...addEntryForm, date: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-pink-700" />
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <textarea value={addEntryForm.notes} onChange={(e) => setAddEntryForm({ ...addEntryForm, notes: e.target.value })} rows={2}
              placeholder="What is this for?" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base resize-none focus:border-pink-700" />
            <button onClick={submitCustomEntry} disabled={addEntrySaving}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "#AD1457" }}>
              {addEntrySaving ? <Loader2 size={20} className="animate-spin" /> : "Add Entry"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
