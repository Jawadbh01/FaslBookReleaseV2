import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  subscribeTransactions, filterByCropCycle, sumByType, type Transaction,
} from "@/lib/firebase/transactions";
import type { CropCycle } from "@/lib/firebase/cropCycles";
import {
  ChevronLeft, TrendingUp, TrendingDown, Wallet, Package,
  MapPin, BookOpen, FileText, Sprout, Loader2,
} from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
};

type TabKey = "overview" | "parcels" | "income" | "expenses" | "profit" | "inventory" | "khata" | "reports";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "parcels", label: "Parcels" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "profit", label: "Profit" },
  { key: "inventory", label: "Inventory" },
  { key: "khata", label: "Khata" },
  { key: "reports", label: "Reports" },
];

export default function CropCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [cycle, setCycle] = useState<CropCycle | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [parcelsById, setParcelsById] = useState<Record<string, any>>({});
  const [inventoryTxns, setInventoryTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "cropCycles", id), (snap) => {
      if (snap.exists()) setCycle({ id: snap.id, ...snap.data() } as CropCycle);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!orgId) return;
    const unsub = subscribeTransactions(orgId, setTxns);
    return unsub;
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const snap = await getDocs(query(collection(db, "parcels"), where("organizationId", "==", orgId)));
      const map: Record<string, any> = {};
      snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
      setParcelsById(map);
    })();
    const unsubInv = onSnapshot(
      query(collection(db, "inventoryTransactions"), where("organizationId", "==", orgId)),
      (snap) => setInventoryTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsubInv;
  }, [orgId]);

  const cycleTxns = useMemo(() => filterByCropCycle(txns, id), [txns, id]);
  const income = sumByType(cycleTxns, ["income"]);
  const expense = sumByType(cycleTxns, ["expense"]);
  const profit = income - expense;
  const dealerPurchases = sumByType(cycleTxns, ["dealerPurchase"]);
  const dealerPayments = sumByType(cycleTxns, ["dealerPayment"]);
  const dealerDues = dealerPurchases - dealerPayments;
  const loanTaken = sumByType(cycleTxns, ["loanTaken"]);
  const loanRepaid = sumByType(cycleTxns, ["loanRepayment"]);
  const loanDues = loanTaken - loanRepaid;

  const cycleInventoryTxns = useMemo(
    () => inventoryTxns.filter((t) => t.cropCycleId === id),
    [inventoryTxns, id]
  );
  const inventoryValue = cycleInventoryTxns.reduce((sum, t) => {
    const qty = Number(t.quantity) || 0;
    const price = Number(t.unitPrice) || 0;
    if (t.type === "purchase" || t.type === "in") return sum + qty * price;
    if (t.type === "sale" || t.type === "out") return sum - qty * price;
    return sum;
  }, 0);

  const parcelIds = useMemo(
    () => Array.from(new Set(cycleTxns.map((t) => t.parcelId).filter(Boolean))) as string[],
    [cycleTxns]
  );

  const khataFarmers = useMemo(() => {
    const names = new Set(cycleTxns.map((t) => t.farmerName).filter(Boolean));
    return Array.from(names) as string[];
  }, [cycleTxns]);

  const incomeTxns = cycleTxns.filter((t) => t.type === "income").sort((a, b) => b.date.localeCompare(a.date));
  const expenseTxns = cycleTxns.filter((t) => t.type === "expense").sort((a, b) => b.date.localeCompare(a.date));

  if (loading) {
    return (
      <div className="flex justify-center pt-24">
        <Loader2 size={32} className="animate-spin" color="#1B5E20" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex flex-col items-center justify-center pt-24 px-6 text-center">
        <p className="text-gray-500">Crop cycle not found.</p>
        <button onClick={() => navigate("/seasons")} className="mt-4 text-green-700 font-semibold">Back to Crop Cycles</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-10 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate("/seasons")} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10">
            <ChevronLeft size={24} color="white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">{cycle.name}</h1>
            <p className="text-green-200 text-xs">
              {cycle.crop}{cycle.seasonName ? ` • ${cycle.seasonName}` : ""} • {fmtDate(cycle.startDate)} – {fmtDate(cycle.endDate)}
            </p>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
          >
            {cycle.status}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2 sticky top-0 bg-gray-50 z-10 border-b border-gray-100">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors"
              style={{
                backgroundColor: tab === t.key ? "#1B5E20" : "white",
                color: tab === t.key ? "white" : "#6B7280",
                border: tab === t.key ? "none" : "1px solid #E5E7EB",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {tab === "overview" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={TrendingUp} label="Income" value={fmt(income)} bg="#E8F5E9" color="#1B5E20" />
              <StatCard icon={TrendingDown} label="Expenses" value={fmt(expense)} bg="#FFEBEE" color="#C62828" />
              <StatCard icon={Wallet} label="Profit" value={fmt(profit)} bg={profit >= 0 ? "#E3F2FD" : "#FFEBEE"} color={profit >= 0 ? "#1565C0" : "#C62828"} />
              <StatCard icon={Package} label="Inventory Value" value={fmt(inventoryValue)} bg="#FFF3E0" color="#E65100" />
              <StatCard icon={Wallet} label="Dealer Dues" value={fmt(dealerDues)} bg="#F3E5F5" color="#6A1B9A" />
              <StatCard icon={Wallet} label="Loan Dues" value={fmt(loanDues)} bg="#E0F2F1" color="#00695C" />
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Details</p>
              <Row label="Crop" value={cycle.crop} />
              <Row label="Season" value={cycle.seasonName || "—"} />
              <Row label="Start Date" value={fmtDate(cycle.startDate)} />
              <Row label="End Date" value={fmtDate(cycle.endDate)} />
              <Row label="Status" value={cycle.status} />
              <Row label="Transactions" value={String(cycleTxns.length)} />
            </div>
          </div>
        )}

        {tab === "parcels" && (
          <div className="flex flex-col gap-2">
            {parcelIds.length === 0 ? (
              <EmptyState icon={MapPin} text="No parcels linked to this crop cycle yet" />
            ) : (
              parcelIds.map((pid) => {
                const p = parcelsById[pid];
                const pTxns = cycleTxns.filter((t) => t.parcelId === pid);
                const pIncome = sumByType(pTxns, ["income"]);
                const pExpense = sumByType(pTxns, ["expense"]);
                return (
                  <div key={pid} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="font-bold text-gray-800 text-sm">{p?.name || "Unnamed Parcel"}</p>
                    <p className="text-gray-400 text-xs mb-2">{p?.area ? `${p.area} acres` : ""}</p>
                    <div className="flex gap-4 text-xs">
                      <span style={{ color: "#1B5E20" }}>Income: {fmt(pIncome)}</span>
                      <span style={{ color: "#C62828" }}>Expense: {fmt(pExpense)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "income" && (
          <TxnList txns={incomeTxns} color="#1B5E20" emptyIcon={TrendingUp} emptyText="No income recorded for this crop cycle" />
        )}

        {tab === "expenses" && (
          <TxnList txns={expenseTxns} color="#C62828" emptyIcon={TrendingDown} emptyText="No expenses recorded for this crop cycle" />
        )}

        {tab === "profit" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Total Income</span>
              <span className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(income)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Total Expenses</span>
              <span className="font-bold text-sm" style={{ color: "#C62828" }}>{fmt(expense)}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-gray-800 font-bold text-base">Net Profit</span>
              <span className="font-extrabold text-base" style={{ color: profit >= 0 ? "#1565C0" : "#C62828" }}>{fmt(profit)}</span>
            </div>
          </div>
        )}

        {tab === "inventory" && (
          <div className="flex flex-col gap-2">
            {cycleInventoryTxns.length === 0 ? (
              <EmptyState icon={Package} text="No inventory movement for this crop cycle" />
            ) : (
              <>
                <div className="bg-white rounded-2xl p-4 shadow-sm mb-1">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Inventory Value</p>
                  <p className="font-extrabold text-lg" style={{ color: "#E65100" }}>{fmt(inventoryValue)}</p>
                </div>
                {cycleInventoryTxns
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                  .map((t) => (
                    <div key={t.id} className="bg-white rounded-2xl p-3 shadow-sm flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{t.itemName || t.name || "Item"}</p>
                        <p className="text-gray-400 text-xs">{fmtDate(t.date)} • {t.type}</p>
                      </div>
                      <p className="font-bold text-sm text-gray-700">{t.quantity} {t.unit || ""}</p>
                    </div>
                  ))}
              </>
            )}
          </div>
        )}

        {tab === "khata" && (
          <div className="flex flex-col gap-2">
            {khataFarmers.length === 0 ? (
              <EmptyState icon={BookOpen} text="No khata entries for this crop cycle" />
            ) : (
              khataFarmers.map((name) => {
                const fTxns = cycleTxns.filter((t) => t.farmerName === name);
                const fIncome = sumByType(fTxns, ["income"]);
                const fExpense = sumByType(fTxns, ["expense"]);
                return (
                  <div key={name} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="font-bold text-gray-800 text-sm mb-1">{name}</p>
                    <div className="flex gap-4 text-xs">
                      <span style={{ color: "#1B5E20" }}>Credit: {fmt(fIncome)}</span>
                      <span style={{ color: "#C62828" }}>Debit: {fmt(fExpense)}</span>
                      <span className="text-gray-500">Balance: {fmt(fIncome - fExpense)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(`/reports/print?type=cropCycle&cropCycleId=${cycle.id}`)}
              className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4 active:scale-95 transition-transform"
              style={{ border: "2px solid #1B5E20" }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#1B5E20" }}>
                <FileText size={22} color="white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-sm text-gray-900">Print Crop Cycle Report</p>
                <p className="text-xs text-gray-500 mt-0.5">A4-ready summary for {cycle.name}</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, bg, color }: { icon: any; label: string; value: string; bg: string; color: string }) {
  return (
    <div className="rounded-2xl p-3 shadow-sm" style={{ backgroundColor: bg }}>
      <Icon size={16} color={color} className="mb-1" />
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="font-bold text-sm" style={{ color }}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center pt-14 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#F5F5F5" }}>
        <Icon size={28} color="#9CA3AF" />
      </div>
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}

function TxnList({ txns, color, emptyIcon, emptyText }: { txns: Transaction[]; color: string; emptyIcon: any; emptyText: string }) {
  if (txns.length === 0) return <EmptyState icon={emptyIcon} text={emptyText} />;
  return (
    <div className="flex flex-col gap-2">
      {txns.map((t) => (
        <div key={t.id} className="bg-white rounded-2xl p-3 shadow-sm flex justify-between items-center">
          <div>
            <p className="font-semibold text-sm text-gray-800">{t.categoryLabel || t.category || t.description}</p>
            <p className="text-gray-400 text-xs">{fmtDate(t.date)}{t.farmerName ? ` • ${t.farmerName}` : ""}{t.parcelName ? ` • ${t.parcelName}` : ""}</p>
          </div>
          <p className="font-bold text-sm" style={{ color }}>{fmt(t.amount)}</p>
        </div>
      ))}
    </div>
  );
}
