import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  BarChart2, User, Clock, Handshake,
  Warehouse, Map, FileSpreadsheet,
  Printer, MessageCircle, Calendar,
  TrendingUp, TrendingDown, ChevronRight, FileText,
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");

const REPORT_CARDS = [
  { key:"print",   title:"Print Reports",    description:"Professional A4 khata, parcel, stock & expense reports", Icon:Printer,         color:"#1B5E20", bg:"#E8F5E9",  href:"/reports/print" },
  { key:"farm",    title:"Farm Overview",    description:"Income, expenses & net profit summary",                   Icon:BarChart2,       color:"#1565C0", bg:"#E3F2FD",  href:"/reports/print?type=summary" },
  { key:"farmer",  title:"Farmer Report",    description:"Parcels, crops & harvest per farmer",                     Icon:User,            color:"#6A1B9A", bg:"#F3E5F5",  href:"/reports/print?type=ledger"  },
  { key:"worker",  title:"Worker Report",    description:"Attendance, earnings & payments",                         Icon:Clock,           color:"#E65100", bg:"#FFF3E0",  href:"/reports/print?type=summary" },
  { key:"dealer",  title:"Dealer Report",    description:"Purchases, payments & outstanding balance",               Icon:Handshake,       color:"#00695C", bg:"#E0F2F1",  href:"/reports/print?type=dealer" },
  { key:"godown",  title:"Godown Report",    description:"Stock levels, value & transactions",                      Icon:Warehouse,       color:"#4E342E", bg:"#EFEBE9",  href:"/reports/print?type=godown"  },
  { key:"parcel",  title:"Parcel Report",    description:"Crop history, expenses & profitability",                  Icon:Map,             color:"#C62828", bg:"#FFEBEE",  href:"/reports/print?type=parcel"  },
];

export default function ReportsPage() {
  const [, navigate] = useLocation();
  const organization = useAuthStore((s) => s.organization);
  const orgId        = organization?.id ?? null;

  const [totalIncome,  setTotalIncome]  = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [exporting,    setExporting]    = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db,"transactions"), where("organizationId","==",orgId)));
        let inc = 0, exp = 0;
        snap.forEach((d) => {
          const { type, amount } = d.data();
          if (type === "income") inc += Number(amount) || 0;
          else if (type === "expense") exp += Number(amount) || 0;
        });
        setTotalIncome(inc);
        setTotalExpense(exp);
      } catch {}
      setLoading(false);
    })();
  }, [orgId]);

  async function getExportData() {
    if (!orgId) return { columns: [] as string[], rows: [] as (string|number)[][] };
    const snap = await getDocs(query(collection(db,"transactions"), where("organizationId","==",orgId), where("type","in",["income","expense"])));
    const columns = ["Date","Type","Category","Amount (Rs)","Notes"];
    const rows: (string|number)[][] = snap.docs
      .map((d) => {
        const data = d.data();
        return [data.date??"", data.type==="income"?"Income":"Expense", data.categoryLabel??data.category??"", Number(data.amount)||0, data.notes??""];
      })
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    return { columns, rows };
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { columns, rows } = await getExportData();
      const { exportToPDF }   = await import("@/lib/exports/pdfExport");
      await exportToPDF("Farm Overview", rows, columns);
    } catch (e) { console.error(e); }
    setExporting(null);
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const { columns, rows } = await getExportData();
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      await exportToExcel("Farm Overview", rows, columns);
    } catch (e) { console.error(e); }
    setExporting(null);
  }

  async function handleWhatsApp() {
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    const net = totalIncome - totalExpense;
    shareViaWhatsApp("Farm Overview", `Total Income:  ${fmtPKR(totalIncome)}\nTotal Expense: ${fmtPKR(totalExpense)}\nNet Balance:   ${fmtPKR(net)}`);
  }

  const net = totalIncome - totalExpense;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="px-4 pt-10 pb-6" style={{ backgroundColor:"#1B5E20" }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-white font-bold text-2xl">Reports</h1>
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Calendar size={22} color="white" />
          </button>
        </div>
        <p className="text-green-300 text-sm">Farm performance &amp; analytics</p>

        {!loading && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label:"Income",  value:totalIncome,  Icon:TrendingUp,  clr:"#A5D6A7" },
              { label:"Expense", value:totalExpense, Icon:TrendingDown, clr:"#EF9A9A" },
              { label:"Net",     value:net,          Icon:BarChart2,   clr:net>=0?"#A5D6A7":"#EF9A9A" },
            ].map(({ label, value, Icon, clr }) => (
              <div key={label} className="bg-white/10 rounded-2xl p-3">
                <Icon size={14} color={clr} />
                <p className="text-xs text-green-300 mt-1">{label}</p>
                <p className="text-white font-bold text-xs leading-tight">{fmtPKR(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Print Reports hero card ── */}
      <div className="px-4 pt-5 pb-2">
        <button
          onClick={() => navigate("/reports/print")}
          className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4 active:scale-95 transition-transform"
          style={{ border:"2px solid #1B5E20" }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor:"#1B5E20" }}>
            <Printer size={26} color="white" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-base text-gray-900">Print Reports</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              Professional A4 reports — Farmer Khata, Parcel, Godown, Expenses, Sales, Farm Summary
            </p>
          </div>
          <ChevronRight size={18} color="#1B5E20" className="shrink-0" />
        </button>
      </div>

      {/* ── Other report cards ── */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Analytics &amp; Data</p>
        <div className="grid grid-cols-2 gap-3">
          {REPORT_CARDS.filter(c => c.key !== "print").map((card) => (
            <button
              key={card.key}
              onClick={() => navigate(card.href)}
              className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform flex flex-col gap-2"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ backgroundColor:card.bg }}>
                <card.Icon size={22} color={card.color} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-800 leading-tight">{card.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{card.description}</p>
              </div>
              <div className="flex justify-end">
                <ChevronRight size={14} color="#BDBDBD" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick export strip ── */}
      <div className="px-4 pt-2">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Export Overview Data
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handlePDF} disabled={!!exporting}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-xs active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor:"#FFEBEE", color:"#C62828" }}>
              <FileText size={15} />
              {exporting==="pdf" ? "…" : "PDF"}
            </button>
            <button onClick={handleExcel} disabled={!!exporting}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-xs active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor:"#E8F5E9", color:"#1B5E20" }}>
              <FileSpreadsheet size={15} />
              {exporting==="excel" ? "…" : "Excel"}
            </button>
            <button onClick={handleWhatsApp}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-xs active:scale-95 transition-all"
              style={{ backgroundColor:"#DCF8C6", color:"#1B5E20" }}>
              <MessageCircle size={15} />
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
