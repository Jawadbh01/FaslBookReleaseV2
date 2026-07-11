/**
 * Unified Khata (Accounts) Hub
 * Three Khata types in one place — Farmer Khata, Owner Khata, Labour Contractor Khata.
 * A dropdown selector at the top controls which ledger is shown.
 */
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";
import {
  subscribeTransactions, sumByType, type Transaction,
} from "@/lib/firebase/transactions";
import {
  subscribeLabourContractors,
  subscribeHarvestRecords,
  type LabourContractor,
  type HarvestLabourRecord,
  type HarvestPaymentStatus,
} from "@/lib/firebase/labourContractors";
import {
  BookOpen, ChevronRight, Loader2, Plus,
  TrendingUp, TrendingDown, Wallet, Scale,
  Users, ArrowUpRight, ArrowDownRight,
  ChevronLeft, Wheat, ChevronDown,
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

type KhataView = "farmer" | "owner" | "labour";

const STATUS_CONFIG: Record<HarvestPaymentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#E65100", bg: "#FFF3E0" },
  partial: { label: "Partial", color: "#1565C0", bg: "#E3F2FD" },
  paid:    { label: "Paid",    color: "#1B5E20", bg: "#E8F5E9" },
};

const VIEW_CONFIG: Record<KhataView, { label: string; urdu: string; icon: any; color: string; bg: string }> = {
  farmer: { label: "Farmer Khata",             urdu: "کسان خاتہ",       icon: Users,    color: "#1B5E20", bg: "#E8F5E9" },
  owner:  { label: "Owner Khata",              urdu: "مالک خاتہ",       icon: Scale,    color: "#1565C0", bg: "#E3F2FD" },
  labour: { label: "Labour Contractor Khata",  urdu: "مزدور خاتہ",      icon: Wheat,    color: "#6A1B9A", bg: "#F3E5F5" },
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
  organizationId: string;
}

export default function KhataPage() {
  const { organization } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;

  // ── View ──────────────────────────────────────────────────
  const [view, setView]             = useState<KhataView>("farmer");
  const [showViewMenu, setShowViewMenu] = useState(false);

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

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Farmer Khata derived ──────────────────────────────────
  const monthTxns = allTxns.filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date + "T00:00:00");
    return d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month;
  }).sort((a, b) => (b.date > a.date ? 1 : -1));

  const farmerCredit  = monthTxns.filter((t) => isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
  const farmerDebit   = monthTxns.filter((t) => !isCredit(t.type)).reduce((s, t) => s + t.amount, 0);
  const farmerBalance = farmerCredit - farmerDebit;

  // ── Owner Khata derived ───────────────────────────────────
  const todayStr       = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo  = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();
  const ownerIncomeTxns   = allTxns.filter((t) => t.type === "income" && t.date >= thirtyDaysAgo && t.date <= todayStr);
  const ownerExpFiltered  = ownerExpenses.filter((e) => e.date >= thirtyDaysAgo && e.date <= todayStr);
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
  const recentHarvestRecs  = [...harvestRecs].sort((a, b) => (b.harvestDate > a.harvestDate ? 1 : -1)).slice(0, 10);

  const vc = VIEW_CONFIG[view];

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
          <button onClick={() => navigate(view === "farmer" ? "/ledger" : view === "owner" ? "/owner-expenses" : "/labour-contractors")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
            Full View <ChevronRight size={13} />
          </button>
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
                      onClick={() => { setView(key); setShowViewMenu(false); }}
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
                    <p className="text-gray-400 text-xs">{monthTxns.length} transactions</p>
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
                      <div key={t.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
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
                      </div>
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

          {/* ══════════════════════ OWNER KHATA ══════════════════════ */}
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
                    <div key={e.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: "#FFEBEE" }}>
                        {EXPENSE_EMOJI[e.category] || "💰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 font-semibold text-sm leading-tight">{e.categoryLabel}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{e.vendor ? `${e.vendor} · ` : ""}{fmtDate(e.date)}</p>
                      </div>
                      <p className="font-bold text-sm shrink-0" style={{ color: "#C62828" }}>−{fmt(e.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/owner-expenses"
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform block">
                Open Full Farm Khata <ChevronRight size={14} />
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
                      <div key={r.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
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
                      </div>
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

        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => navigate(view === "farmer" ? "/ledger?form=expense" : view === "owner" ? "/owner-expenses" : "/labour-contractors")}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40"
        style={{ backgroundColor: VIEW_CONFIG[view].color }}>
        <Plus size={26} color="white" />
      </button>
    </div>
  );
}
