import { useEffect, useState } from "react";
import { useParams } from "wouter";
import {
  collection, query, where, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, Loader2 } from "lucide-react";

import { PRINT_CSS } from "@/components/print/PrintLayout";
import WorkforceEmployeeReportTemplate from "@/pages/reports/print/WorkforceEmployeeReportTemplate";
import type { Employee } from "@/pages/workforce/page";

const GREEN = "#1B5E20";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface AttRecord {
  workerId: string; date: string;
  status: "present" | "halfDay" | "absent";
}
interface Payment {
  id: string; amount: number; month: number; year: number; createdAt?: any;
}

export default function WorkforceEmployeePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { organization, user } = useAuthStore();
  const orgId    = organization?.id ?? null;
  const orgName  = (organization as any)?.name ?? "My Farm";
  const printedBy = (user as any)?.displayName ?? (user as any)?.email ?? "Manager";

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());

  const [employee,   setEmployee]   = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttRecord[]>([]);
  const [payments,   setPayments]   = useState<Payment[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!id || !orgId) return;
    setLoading(true);
    Promise.all([
      getDoc(doc(db, "employees", id)),
      getDocs(query(collection(db, "attendance"), where("workerId", "==", id))),
      getDocs(query(collection(db, "workerPayments"), where("workerId", "==", id))),
    ]).then(([empSnap, attSnap, paySnap]) => {
      if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() } as Employee);
      setAttendance(attSnap.docs.map((d) => ({ ...d.data() } as AttRecord)));
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, orgId]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const isNextDisabled = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: GREEN }} />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Employee not found.</p>
      </div>
    );
  }

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* ═══ SCREEN UI ═══ */}
      <div className="no-print min-h-screen bg-gray-50 pb-24">

        {/* Header */}
        <div className="px-4 pt-10 pb-5" style={{ backgroundColor: GREEN }}>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.history.back()}
              className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-transform">
              <ArrowLeft size={20} color="white" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-xl leading-tight">{employee.name}</h1>
              <p className="text-green-300 text-xs">Employee Report</p>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <Printer size={15} /> Print
            </button>
          </div>

          {/* Month navigator */}
          <div className="flex items-center justify-between bg-white/15 rounded-2xl px-4 py-3">
            <button onClick={prevMonth} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <ChevronLeft size={18} color="white" />
            </button>
            <div className="text-center">
              <p className="text-white font-bold text-base">{MONTHS[month]}</p>
              <p className="text-green-200 text-xs">{year}</p>
            </div>
            <button onClick={nextMonth} disabled={isNextDisabled}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <ChevronRight size={18} color="white" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="px-4 py-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div style={{ transform: "scale(0.82)", transformOrigin: "top left", width: "122%", pointerEvents: "none" }}>
              <WorkforceEmployeeReportTemplate
                employee={employee}
                attendance={attendance}
                payments={payments}
                month={month}
                year={year}
                farmName={orgName}
                printedBy={printedBy}
              />
            </div>
          </div>
        </div>

        {/* Print button */}
        <div className="fixed bottom-6 left-0 right-0 px-4">
          <button
            onClick={handlePrint}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
            style={{ backgroundColor: GREEN }}>
            <Printer size={20} /> Print Report
          </button>
        </div>
      </div>

      {/* ═══ PRINT OUTPUT ═══ */}
      <div className="print-only">
        <WorkforceEmployeeReportTemplate
          employee={employee}
          attendance={attendance}
          payments={payments}
          month={month}
          year={year}
          farmName={orgName}
          printedBy={printedBy}
        />
      </div>
    </>
  );
}
