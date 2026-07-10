import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Printer, Loader2, ChevronDown } from "lucide-react";

import { PRINT_CSS } from "@/components/print/PrintLayout";
import FarmerLedgerTemplate  from "./FarmerLedgerTemplate";
import ParcelReportTemplate   from "./ParcelReportTemplate";
import GodownReportTemplate   from "./GodownReportTemplate";
import CropCycleReportTemplate from "./CropCycleReportTemplate";
import SalesReportTemplate    from "./SalesReportTemplate";
import FarmSummaryTemplate    from "./FarmSummaryTemplate";
import DealerReportTemplate   from "./DealerReportTemplate";
import WorkersReportTemplate  from "./WorkersReportTemplate";
import OwnerExpensesTemplate  from "./OwnerExpensesTemplate";

// ── Label maps ────────────────────────────────────────────────
const INCOME_LABELS: Record<string,string> = {
  cropSale:"Crop Sale",govtSubsidy:"Govt Subsidy",loanReceived:"Loan Received",
  rental:"Rental Income",livestock:"Livestock Sale",other:"Other Income",
};
const EXPENSE_LABELS: Record<string,string> = {
  seed:"Seeds",fertilizer:"Fertilizer",pesticide:"Pesticide",
  labor:"Labour",machinery:"Machinery",irrigation:"Irrigation",
  fuel:"Fuel",transport:"Transport",rent:"Land Rent",
  loan:"Loan Payment",maintenance:"Maintenance",other:"Other Expense",
};

function fmtDateDisplay(str: string) {
  if (!str) return "—";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = str.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
}

// ── Filter sub-components ─────────────────────────────────────
function Select({ value, onChange, children, disabled }: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 font-medium pr-8 focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50">
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-400 uppercase">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600/30" />
    </div>
  );
}

// ── Report definitions ────────────────────────────────────────
const REPORTS = [
  { key:"ledger",  label:"Farmer Khata",        icon:"📋", desc:"Full account statement for one farmer" },
  { key:"parcel",  label:"Parcel Report",        icon:"🌾", desc:"Crops, expenses and profit per parcel" },
  { key:"godown",  label:"Godown Register",      icon:"🏭", desc:"Warehouse inventory and stock movements" },
  { key:"cropCycle", label:"Crop Cycle Report",  icon:"🌱", desc:"Income, expenses & profit per crop cycle" },
  { key:"sales",   label:"Sales Report",         icon:"📈", desc:"Sales with payment status" },
  { key:"dealer",  label:"Dealer Report",        icon:"🤝", desc:"Purchases, payments & outstanding balance" },
  { key:"workers", label:"Workers Report",       icon:"👷", desc:"Attendance and wages for daily/monthly staff" },
  { key:"summary", label:"Farm Summary",         icon:"🏡", desc:"One-page executive overview" },
  { key:"owner",   label:"Farm Expenses",         icon:"🚜", desc:"Owner-paid farm costs by date range" },
];

// ── Single-field query helper (avoids composite index requirement) ───
async function getOrgDocs(collectionName: string, orgId: string) {
  const snap = await getDocs(query(collection(db, collectionName), where("organizationId","==",orgId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
}

// ── Page ──────────────────────────────────────────────────────
export default function PrintHubPage() {
  const [, navigate] = useLocation();
  const { organization, user } = useAuthStore();
  const orgId    = organization?.id ?? null;
  const orgName  = (organization as any)?.name ?? "My Farm";
  const printedBy = (user as any)?.displayName ?? (user as any)?.email ?? "Manager";

  // Read ?type= from URL and pre-select that report
  const urlType = new URLSearchParams(window.location.search).get("type") ?? "";
  const validKeys = REPORTS.map(r => r.key);
  const initialReport = validKeys.includes(urlType) ? urlType : "ledger";

  const [activeReport, setActiveReport] = useState(initialReport);
  const [loading,      setLoading]      = useState(false);
  const [generating,   setGenerating]   = useState(false);

  // Selects
  const [farmers, setFarmers] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [dealersList, setDealersList] = useState<any[]>([]);
  const [cropCyclesList, setCropCyclesList] = useState<any[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState("");
  const [selectedParcel, setSelectedParcel] = useState("");
  const [selectedDealer, setSelectedDealer] = useState("");
  const [selectedCropCycle, setSelectedCropCycle] = useState("");

  // Date range — default: last 3 months
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Report data
  const [ledgerEntries,  setLedgerEntries]  = useState<any[]>([]);
  const [parcelCrops,    setParcelCrops]    = useState<any[]>([]);
  const [parcelExpenses, setParcelExpenses] = useState<any[]>([]);
  const [parcelIncome,   setParcelIncome]   = useState<any[]>([]);
  const [godownItems,    setGodownItems]    = useState<any[]>([]);
  const [godownTxns,     setGodownTxns]     = useState<any[]>([]);
  const [reportCropCycles, setReportCropCycles] = useState<any[]>([]);
  const [cropCycleTxnsByCycle, setCropCycleTxnsByCycle] = useState<Record<string, any[]>>({});
  const [allSales,       setAllSales]       = useState<any[]>([]);
  const [dealerTxns,     setDealerTxns]     = useState<any[]>([]);
  const [summaryData,    setSummaryData]    = useState<any>(null);
  const [reportWorkers,  setReportWorkers]  = useState<any[]>([]);
  const [reportAttendance, setReportAttendance] = useState<any[]>([]);
  const [ownerExpenses, setOwnerExpenses]  = useState<any[]>([]);

  // ── Load farmers & parcels once ───────────────────────────────
  // NOTE: uses single-field query only (no workerType compound) to avoid
  // missing composite index errors that break the entire Firestore client.
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const [workers, pls, dls, cycles] = await Promise.all([
          getOrgDocs("workers", orgId),
          getOrgDocs("parcels", orgId),
          getOrgDocs("dealers", orgId),
          getOrgDocs("cropCycles", orgId),
        ]);
        // Filter farmers client-side — no composite index needed
        const fl = workers.filter(w => w.workerType === "farmer");
        const pl = pls.map(d => ({ id: d.id, name: d.name || "Unnamed" }));
        const cl = cycles.sort((a: any, b: any) => (b.startDate||"").localeCompare(a.startDate||""));
        setFarmers(fl);
        setParcels(pl);
        setDealersList(dls);
        setCropCyclesList(cl);
        if (fl.length) setSelectedFarmer(fl[0].id);
        if (pl.length) setSelectedParcel(pl[0].id);
      } catch (err) {
        console.error("PrintHub: failed to load farmers/parcels/dealers", err);
      }
      setLoading(false);
    })();
  }, [orgId]);

  // Load data when report/filters change
  useEffect(() => { if (orgId) loadData(); }, [activeReport, orgId, selectedFarmer, selectedParcel, selectedDealer, selectedCropCycle, dateFrom, dateTo]);

  async function loadData() {
    if (!orgId) return;
    setGenerating(true);
    try {
      switch (activeReport) {

        // ── Farmer Ledger ─────────────────────────────────────────
        case "ledger": {
          // Single-field query, filter client-side
          const CREDIT_TYPES = ["income", "loanTaken", "dealerPayment"];
          const all = (await getOrgDocs("transactions", orgId))
            .filter((r: any) => ["income","expense"].includes(r.type));
          const rows = all
            .map(r => {
              const type = CREDIT_TYPES.includes(r.type) ? "credit" : "debit" as "credit"|"debit";
              const cat  = r.category || "other";
              return {
                id: r.id, type, date: r.date||"",
                categoryLabel: r.categoryLabel || (type==="credit" ? INCOME_LABELS[cat]??cat : EXPENSE_LABELS[cat]??cat),
                description: r.notes || r.dealerName || r.parcelName || "",
                amount: Number(r.amount)||0,
                farmerId: r.farmerId || r.workerFarmerId || "",
              };
            })
            .filter(e => {
              if (selectedFarmer && e.farmerId !== selectedFarmer) return false;
              if (dateFrom && e.date && e.date < dateFrom) return false;
              if (dateTo   && e.date && e.date > dateTo)   return false;
              return true;
            })
            .sort((a,b) => a.date.localeCompare(b.date));
          setLedgerEntries(rows);
          break;
        }

        // ── Parcel Report — crops + transactions for that parcel ─
        case "parcel": {
          if (selectedParcel) {
            // Single-field queries only, filter parcelId client-side
            const [allCrops, allTxns] = await Promise.all([
              getOrgDocs("crops", orgId),
              getOrgDocs("transactions", orgId),
            ]);
            const cropsForParcel  = allCrops.filter((c:any) => c.parcelId === selectedParcel);
            const txnsForParcel = allTxns.filter((e:any) => e.parcelId === selectedParcel);
            setParcelCrops(cropsForParcel);
            setParcelExpenses(txnsForParcel.filter((e:any) => e.type === "expense"));
            setParcelIncome(txnsForParcel.filter((e:any)  => e.type === "income"));
          }
          break;
        }

        // ── Godown / Inventory ────────────────────────────────────
        case "godown": {
          const [items, txns] = await Promise.all([
            getOrgDocs("inventoryItems", orgId),
            getOrgDocs("inventoryTransactions", orgId),
          ]);
          setGodownItems(items);
          setGodownTxns(txns);
          break;
        }

        // ── Crop Cycle Report — income/expense transactions grouped by crop cycle ──
        // Single-field query only, filter cropCycleId/date client-side
        case "cropCycle": {
          const [cycles, all] = await Promise.all([
            getOrgDocs("cropCycles", orgId),
            getOrgDocs("transactions", orgId),
          ]);
          const allCycles = cycles.sort((a: any, b: any) => (b.startDate || "").localeCompare(a.startDate || ""));
          // If a specific cycle is selected filter to just that one; otherwise show all
          const filteredCycles = selectedCropCycle
            ? allCycles.filter((c: any) => c.id === selectedCropCycle)
            : allCycles;
          const byCycle: Record<string, any[]> = {};
          all
            .filter((r: any) => r.type === "income" || r.type === "expense")
            .forEach((r: any) => {
              if (!r.cropCycleId) return;
              if (selectedCropCycle && r.cropCycleId !== selectedCropCycle) return;
              const date = r.date ? (typeof r.date==="string" ? r.date : r.date.toDate?.()?.toISOString().split("T")[0]||"") : "";
              if ((dateFrom && date && date < dateFrom) || (dateTo && date && date > dateTo)) return;
              const cat = r.category || "other";
              const row = { id:r.id, date, type:r.type,
                categoryLabel: r.categoryLabel || (r.type==="income" ? INCOME_LABELS[cat]??cat : EXPENSE_LABELS[cat]??cat),
                category: cat,
                description: r.notes||r.dealerName||r.parcelName||"", amount:Number(r.amount)||0 };
              if (!byCycle[r.cropCycleId]) byCycle[r.cropCycleId] = [];
              byCycle[r.cropCycleId].push(row);
            });
          setReportCropCycles(filteredCycles);
          setCropCycleTxnsByCycle(byCycle);
          break;
        }

        // ── Sales / Income Report — transactions type=="income" ──
        // Single-field query only, filter type client-side
        case "sales": {
          const all = await getOrgDocs("transactions", orgId);
          const rows = all
            .filter(r => r.type === "income")
            .map(r => {
              const date = r.date ? (typeof r.date==="string" ? r.date : r.date.toDate?.()?.toISOString().split("T")[0]||"") : "";
              return { id:r.id, date,
                buyer:      r.dealerName || r.buyer || "",
                cropName:   r.categoryLabel || r.cropName || r.category || "",
                parcelName: r.parcelName || "",
                weightKg:   Number(r.weightKg)||0,
                ratePerKg:  Number(r.ratePerKg)||0,
                amount:     Number(r.amount)||0,
                paymentStatus: r.paymentStatus || "paid",
                notes:      r.notes||"" };
            })
            .filter(e => (!dateFrom||!e.date||e.date>=dateFrom) && (!dateTo||!e.date||e.date<=dateTo))
            .sort((a,b)=>a.date.localeCompare(b.date));
          setAllSales(rows);
          break;
        }

        // ── Dealer Report — transactions dealerPurchase/dealerPayment, optionally per dealer ──
        case "dealer": {
          const all = (await getOrgDocs("transactions", orgId))
            .filter((t: any) => t.type === "dealerPurchase" || t.type === "dealerPayment");
          const rows = all
            .filter(t => !selectedDealer || t.dealerId === selectedDealer)
            .map(t => {
              const date = t.date ? (typeof t.date === "string" ? t.date : t.date.toDate?.()?.toISOString().split("T")[0] || "") : "";
              return {
                id: t.id, date,
                dealerId: t.dealerId || "",
                dealerName: t.dealerName || "",
                type: t.type === "dealerPayment" ? "payment" : "purchase",
                items: t.description || "",
                paymentType: t.paymentType || "",
                amount: Number(t.amount) || 0,
                notes: t.notes || "",
              };
            })
            .filter(e => (!dateFrom || !e.date || e.date >= dateFrom) && (!dateTo || !e.date || e.date <= dateTo))
            .sort((a, b) => a.date.localeCompare(b.date));
          setDealerTxns(rows);
          break;
        }

        // ── Workers Report — staff list + attendance in date range ─
        case "workers": {
          const [allWorkers, allAttendance] = await Promise.all([
            getOrgDocs("workers", orgId),
            getOrgDocs("attendance", orgId),
          ]);
          const staff = allWorkers
            .filter((w: any) => w.workerType === "daily" || w.workerType === "monthly")
            .map((w: any) => ({
              id: w.id, name: w.name || "Unnamed", phone: w.phone || "",
              workerType: w.workerType, dailyRate: Number(w.dailyRate) || 0,
              monthlySalary: Number(w.monthlySalary) || 0,
            }));
          const attRows = allAttendance
            .map((a: any) => ({ workerId: a.workerId || "", date: a.date || "", status: a.status }))
            .filter((a: any) => (!dateFrom || !a.date || a.date >= dateFrom) && (!dateTo || !a.date || a.date <= dateTo));
          setReportWorkers(staff);
          setReportAttendance(attRows);
          break;
        }

        // ── Owner Expenses ────────────────────────────────────────
        case "owner": {
          const all = await getOrgDocs("ownerExpenses", orgId);
          const rows = all
            .map((e: any) => {
              const date = e.date ? (typeof e.date === "string" ? e.date : e.date.toDate?.()?.toISOString().split("T")[0] || "") : "";
              return {
                id: e.id, date,
                category: e.category || "other",
                categoryLabel: e.categoryLabel || "Other",
                amount: Number(e.amount) || 0,
                paymentMethod: e.paymentMethod || "cash",
                vendor: e.vendor || "",
                description: e.description || "",
              };
            })
            .filter((e: any) => (!dateFrom || !e.date || e.date >= dateFrom) && (!dateTo || !e.date || e.date <= dateTo))
            .sort((a: any, b: any) => a.date.localeCompare(b.date));
          setOwnerExpenses(rows);
          break;
        }

        // ── Farm Summary ──────────────────────────────────────────
        // Single-field queries only, filter workerType/type client-side
        case "summary": {
          const [allWorkers,parcelsD,cropsD,txnsD,invD] = await Promise.all([
            getOrgDocs("workers", orgId),
            getOrgDocs("parcels", orgId),
            getOrgDocs("crops", orgId),
            getOrgDocs("transactions", orgId),
            getOrgDocs("inventoryItems", orgId),
          ]);
          const farmerCount = allWorkers.filter((w:any) => w.workerType === "farmer").length;
          const expD  = txnsD.filter((e:any) => e.type === "expense");
          const incD  = txnsD.filter((e:any) => e.type === "income");

          const totalInc   = incD.reduce((s:number,d:any)=>s+(Number(d.amount)||0),0);
          const totalExp   = expD.reduce((s:number,d:any)=>s+(Number(d.amount)||0),0);
          const invVal     = invD.reduce((s:number,d:any)=>s+((d.currentStock||0)*(d.pricePerUnit||0)),0);
          const totalAcres = parcelsD.reduce((s:number,p:any)=>s+(Number(p.acres)||0),0);

          const expByCat: Record<string,number> = {};
          expD.forEach((e:any) => { const c=e.category||"other"; expByCat[c]=(expByCat[c]||0)+(Number(e.amount)||0); });

          const incByType: Record<string,number> = {};
          incD.forEach((e:any) => { const c=e.category||"other"; incByType[c]=(incByType[c]||0)+(Number(e.amount)||0); });

          const outstanding = totalInc - totalExp;

          const toDateStr = (v:any) => v ? (typeof v==="string" ? v : v.toDate?.()?.toISOString().split("T")[0]||"") : "";
          const activities = [
            ...expD.map((e:any) => ({ date:toDateStr(e.date), description:`Expense: ${e.categoryLabel||e.category||"Other"} — Rs.${(Number(e.amount)||0).toLocaleString("en-PK")}` })),
            ...incD.map((e:any) => ({ date:toDateStr(e.date), description:`Income: ${e.categoryLabel||e.category||"Other"} — Rs.${(Number(e.amount)||0).toLocaleString("en-PK")}` })),
          ].filter(a=>a.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(a=>({...a, date:fmtDateDisplay(a.date)}));

          setSummaryData({
            farmerCount, parcelCount:parcelsD.length,
            totalAcres,
            activeCrops:   cropsD.filter((c:any)=>c.status!=="harvested"&&c.status!=="closed").length,
            harvestedCrops:cropsD.filter((c:any)=>c.status==="harvested").length,
            totalIncome:totalInc, totalExpense:totalExp, invValue:invVal, outstanding,
            expByCat, incByType, activities,
          });
          break;
        }
      }
    } catch(err) { console.error("PrintHub loadData error:", err); }
    setGenerating(false);
  }

  const selectedParcelObj = parcels.find(p => p.id === selectedParcel);
  const selectedFarmerObj = farmers.find(f => f.id === selectedFarmer);

  function renderTemplate(forPrint = false) {
    const style = forPrint ? undefined : { transform:"scale(0.82)", transformOrigin:"top left", width:"122%", pointerEvents:"none" as const };
    const wrap = forPrint ? undefined : { overflow:"hidden", borderRadius:8 };

    const content = (() => {
      if (generating) return (
        <div style={{ padding:"48px 0", textAlign:"center", color:"#888", background:"white", borderRadius:8, minHeight:200 }}>
          <Loader2 size={22} className="animate-spin mx-auto mb-3" style={{ color:"#1B5E20" }} />
          <p style={{ fontSize:12 }}>Preparing report…</p>
        </div>
      );

      if (activeReport==="ledger") return (
        <FarmerLedgerTemplate farmerName={selectedFarmerObj?.name||"All Farmers"} farmerPhone={selectedFarmerObj?.phone} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} openingBalance={0} entries={ledgerEntries} />
      );
      if (activeReport==="parcel") return (
        <ParcelReportTemplate parcel={selectedParcelObj} crops={parcelCrops} expenses={parcelExpenses}
          incomeEntries={parcelIncome} farmName={orgName} printedBy={printedBy} />
      );
      if (activeReport==="godown") return (
        <GodownReportTemplate items={godownItems} transactions={godownTxns} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="cropCycle") return (
        <CropCycleReportTemplate cropCycles={reportCropCycles} transactionsByCycle={cropCycleTxnsByCycle} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="sales") return (
        <SalesReportTemplate sales={allSales} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="dealer") return (
        <DealerReportTemplate
          dealer={selectedDealer ? (dealersList.find(d => d.id === selectedDealer) || null) : null}
          dealers={dealersList} transactions={dealerTxns} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="workers") return (
        <WorkersReportTemplate workers={reportWorkers} attendance={reportAttendance} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="owner") return (
        <OwnerExpensesTemplate expenses={ownerExpenses} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="summary" && summaryData) return (
        <FarmSummaryTemplate farmName={orgName} printedBy={printedBy}
          farmerCount={summaryData.farmerCount} parcelCount={summaryData.parcelCount}
          totalAcres={summaryData.totalAcres} activeCrops={summaryData.activeCrops}
          harvestedCrops={summaryData.harvestedCrops} totalIncome={summaryData.totalIncome}
          totalExpense={summaryData.totalExpense} totalExpenseByCategory={summaryData.expByCat}
          totalIncomeByType={summaryData.incByType} outstandingBalance={summaryData.outstanding}
          inventoryValue={summaryData.invValue} recentActivities={summaryData.activities} />
      );
      return null;
    })();

    return <div style={wrap}><div style={style}>{content}</div></div>;
  }

  return (
    <>
      {/* ── Global CSS ───
          NOTE: all report styling (tables, headers, footers, page breaks) lives
          in PrintLayout.tsx — that is the single source of truth so every report
          template renders identically. This block only toggles screen vs print
          visibility of the two top-level containers below. */}
      <style>{PRINT_CSS}</style>

      {/* ═══ SCREEN UI (hidden on print) ═══ */}
      <div className="no-print min-h-screen bg-gray-50 pb-24">

        {/* Header */}
        <div className="px-4 pt-10 pb-5" style={{ backgroundColor:"#1B5E20" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/reports")}
              className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-transform">
              <ArrowLeft size={20} color="white" />
            </button>
            <div>
              <h1 className="text-white font-bold text-xl">Print Reports</h1>
              <p className="text-green-300 text-xs">Professional A4 accounting reports</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">

          {/* Report type grid */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Select Report Type</p>
            <div className="grid grid-cols-2 gap-2">
              {REPORTS.map(r => (
                <button key={r.key} onClick={() => setActiveReport(r.key)}
                  className="flex items-start gap-2.5 p-3 rounded-xl text-left active:scale-95 transition-all"
                  style={{
                    backgroundColor: activeReport===r.key ? "#E8F5E9" : "#F9FAFB",
                    border: activeReport===r.key ? "1.5px solid #1B5E20" : "1.5px solid transparent",
                  }}>
                  <span style={{ fontSize:18, lineHeight:1 }}>{r.icon}</span>
                  <div>
                    <p className="font-bold text-xs leading-tight" style={{ color:activeReport===r.key?"#1B5E20":"#374151" }}>{r.label}</p>
                    <p className="text-gray-400 text-[10px] mt-0.5 leading-snug">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Filters</p>

            {activeReport==="ledger" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Farmer</label>
                {loading ? (
                  <div className="flex items-center gap-2 py-2 px-3 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </div>
                ) : farmers.length === 0 ? (
                  <p className="text-xs text-orange-600 px-1 py-2">
                    No farmers added yet. Add farmers in the Team section first.
                  </p>
                ) : (
                  <Select value={selectedFarmer} onChange={setSelectedFarmer}>
                    <option value="">All Farmers</option>
                    {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                )}
              </div>
            )}

            {activeReport==="parcel" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Parcel</label>
                <Select value={selectedParcel} onChange={setSelectedParcel} disabled={loading||!parcels.length}>
                  {!parcels.length && <option value="">No parcels found</option>}
                  {parcels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            )}

            {activeReport==="dealer" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Dealer</label>
                <Select value={selectedDealer} onChange={setSelectedDealer} disabled={loading}>
                  <option value="">All Dealers</option>
                  {dealersList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </div>
            )}

            {activeReport==="cropCycle" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Crop Cycle</label>
                {loading ? (
                  <div className="flex items-center gap-2 py-2 px-3 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </div>
                ) : (
                  <Select value={selectedCropCycle} onChange={setSelectedCropCycle}>
                    <option value="">Overall (All Crop Cycles)</option>
                    {cropCyclesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.crop} ({c.status})</option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {["ledger","cropCycle","sales","godown","dealer","owner"].includes(activeReport) && (
              <div className="grid grid-cols-2 gap-3">
                <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
                <DateInput label="To"   value={dateTo}   onChange={setDateTo} />
              </div>
            )}

            {activeReport==="summary" && (
              <p className="text-xs text-gray-400 italic">Uses all data available for your farm.</p>
            )}

            <button onClick={() => window.print()} disabled={generating}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor:"#1B5E20" }}>
              {generating
                ? <><Loader2 size={16} className="animate-spin" /> Preparing…</>
                : <><Printer size={16} /> Print {REPORTS.find(r=>r.key===activeReport)?.label}</>
              }
            </button>
          </div>

          {/* Screen preview */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Preview</p>
            {renderTemplate(false)}
          </div>

        </div>
      </div>

      {/* ═══ PRINT-ONLY (shown only when window.print() fires) ═══ */}
      <div className="for-print">
        {renderTemplate(true)}
      </div>
    </>
  );
}
