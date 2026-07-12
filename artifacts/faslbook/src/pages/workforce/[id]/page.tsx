import { useEffect, useState } from "react";
import { useParams } from "wouter";
import {
  collection, query, where, onSnapshot,
  addDoc, doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { addTransaction } from "@/lib/firebase/transactions";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import { ChevronLeft, ChevronRight, Loader2, X, Phone, MapPin, Calendar, DollarSign, User, Printer } from "lucide-react";
import { notifyOfflineSave } from "@/lib/offlineSync";

import type { Employee, EmployeeType, SalaryType } from "@/pages/workforce/page";

const GREEN = "#1B5E20";

const TYPE_COLORS: Record<EmployeeType, string> = {
  worker: "#1565C0", manager: "#6A1B9A", driver: "#00695C",
  helper: "#E65100", security: "#C62828", mechanic: "#4E342E", custom: "#33691E",
};

const TYPE_LABELS: Record<EmployeeType, string> = {
  worker: "Worker", manager: "Manager", driver: "Driver",
  helper: "Helper", security: "Security", mechanic: "Mechanic", custom: "Custom",
};

const SALARY_LABELS: Record<SalaryType, string> = {
  daily: "Daily", monthly: "Monthly", contract: "Contract",
};

function typeLabel(emp: Employee) {
  return emp.employeeType === "custom" && emp.customTypeName ? emp.customTypeName : TYPE_LABELS[emp.employeeType];
}

interface AttRecord {
  id: string; workerId: string; date: string;
  status: "present" | "halfDay" | "absent";
}
interface Payment {
  id: string; amount: number; month: number; year: number; createdAt: any;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtDate(str: string) {
  if (!str) return "—";
  const p = str.split("-");
  if (p.length !== 3) return str;
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
}

const initials = (name: string) =>
  (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

export default function WorkforceProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [loading, setLoading] = useState(true);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payCropCycleId, setPayCropCycleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "employees", id)).then((snap) => {
      if (snap.exists()) setEmployee({ id: snap.id, ...snap.data() } as Employee);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !orgId) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), where("workerId", "==", id), where("organizationId", "==", orgId)),
      (snap) => setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttRecord)))
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "workerPayments"), where("workerId", "==", id), where("organizationId", "==", orgId)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)))
    ));
    return () => unsubs.forEach((u) => u());
  }, [id, orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeCropCycles(orgId, setCropCycles);
  }, [orgId]);

  useEffect(() => {
    if (cropCycles.length === 0) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setPayCropCycleId((prev) => (prev ? prev : active.id));
  }, [cropCycles]);

  // ── Monthly stats ────────────────────────────────────────────
  const monthAttendance = attendance.filter((a) => {
    const [y, m] = a.date.split("-").map(Number);
    return y === calYear && m - 1 === calMonth;
  });
  const presentDays = monthAttendance.filter((a) => a.status === "present").length;
  const halfDays = monthAttendance.filter((a) => a.status === "halfDay").length;
  const absentDays = monthAttendance.filter((a) => a.status === "absent").length;

  const earned = (() => {
    if (!employee) return 0;
    if (employee.salaryType === "daily") {
      return presentDays * (employee.salary || 0) + halfDays * (employee.salary || 0) * 0.5;
    }
    if (employee.salaryType === "monthly") {
      return (employee.salary || 0) - absentDays * ((employee.salary || 0) / 30);
    }
    return employee.salary || 0;
  })();

  const monthPayments = payments.filter((p) => p.month === calMonth && p.year === calYear);
  const paidThisMonth = monthPayments.reduce((s, p) => s + p.amount, 0);
  const pending = Math.max(0, earned - paidThisMonth);

  // ── Calendar ─────────────────────────────────────────────────
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const attByDate: Record<string, string> = {};
  monthAttendance.forEach((a) => { attByDate[Number(a.date.split("-")[2])] = a.status; });

  const dayColor = (status?: string) => {
    if (!status) return { bg: "#F5F5F5", color: "#9E9E9E" };
    if (status === "present") return { bg: "#E8F5E9", color: GREEN };
    if (status === "halfDay") return { bg: "#FFF3E0", color: "#E65100" };
    return { bg: "#FFEBEE", color: "#C62828" };
  };

  const prevMonth = () => { if (calMonth === 0) { setCalYear(calYear-1); setCalMonth(11); } else setCalMonth(calMonth-1); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(calYear+1); setCalMonth(0); } else setCalMonth(calMonth+1); };

  const handlePay = async () => {
    if (!payAmount || isNaN(Number(payAmount))) { setPayError("Enter valid amount"); return; }
    if (!payCropCycleId) { setPayError("Please select a crop cycle"); return; }
    const isOnline = navigator.onLine;
    try {
      setSaving(true); setPayError("");
      const amount = Number(payAmount);
      const cropCycle = cropCycles.find((c) => c.id === payCropCycleId);
      const paymentPayload = {
        workerId: id, workerName: employee?.name,
        amount, month: calMonth, year: calYear,
        notes: payNote, organizationId: orgId,
        paidBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const txPayload = {
        organizationId: orgId as string,
        cropCycleId: payCropCycleId, cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "", seasonName: cropCycle?.seasonName || "",
        type: "expense" as const, category: "workerPayment",
        categoryLabel: "Employee Payment", amount,
        date: new Date().toISOString().split("T")[0],
        description: `Payment to ${employee?.name}`, notes: `Payment to ${employee?.name}`,
      };
      const resetForm = () => {
        setShowPay(false); setPayAmount(""); setPayNote("");
        setPayCropCycleId((cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "");
      };
      if (!isOnline) {
        addDoc(collection(db, "workerPayments"), paymentPayload).catch(console.error);
        addTransaction(txPayload, "Employee Payment").catch(console.error);
        resetForm(); setSaving(false); return;
      }
      await addDoc(collection(db, "workerPayments"), paymentPayload);
      await addTransaction(txPayload);
      resetForm();
    } catch { setPayError("Failed to record payment."); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: GREEN }} />
    </div>
  );

  if (!employee) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Employee not found</p>
    </div>
  );

  const empColor = TYPE_COLORS[employee.employeeType] || GREEN;

  if (showPay) return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: GREEN }}>
        <button onClick={() => setShowPay(false)} className="text-white mr-3"><X size={24} /></button>
        <div>
          <h1 className="text-white text-xl font-bold">Record Payment</h1>
          <p className="text-green-200 text-xs">{employee.name}</p>
        </div>
      </div>
      <div className="px-6 pt-6 pb-10">
        {payError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{payError}</div>}
        {pending > 0 && (
          <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: "#FFF3E0" }}>
            <p className="text-orange-800 text-xs font-medium">Pending for {MONTHS[calMonth]}</p>
            <p className="text-orange-700 font-bold text-xl">{fmt(pending)}</p>
          </div>
        )}
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Amount *</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <span className="text-gray-400 mr-2 font-medium">Rs.</span>
            <input type="number" placeholder={String(Math.round(pending))} value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
          <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <select value={payCropCycleId} onChange={(e) => setPayCropCycleId(e.target.value)}
              className="w-full outline-none text-gray-800 text-base bg-transparent">
              <option value="">— Select crop cycle —</option>
              {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.crop})</option>)}
            </select>
          </div>
        </div>
        <div className="mb-8">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
          <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
            <textarea value={payNote} onChange={(e) => setPayNote(e.target.value)}
              placeholder="Optional..." rows={2}
              className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
          </div>
        </div>
        <button onClick={handlePay} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: GREEN }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Record Payment"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div style={{ backgroundColor: empColor }} className="px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.back()} className="text-white active:scale-95"><ChevronLeft size={24} /></button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">{employee.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white">
                {typeLabel(employee)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: employee.status === "active" ? "#E8F5E9" : "#F3F4F6", color: employee.status === "active" ? GREEN : "#9CA3AF" }}>
                {employee.status === "active" ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <button
            onClick={() => window.location.href = `/workforce/${id}/print`}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
            <Printer size={17} color="white" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl bg-white/20">
            {initials(employee.name)}
          </div>
          <div className="flex flex-col gap-0.5">
            {employee.phone && <p className="text-white/90 text-sm">📞 {employee.phone}</p>}
            <p className="text-white/90 text-sm">
              {employee.salaryType === "daily"
                ? `Rs. ${(employee.salary || 0).toLocaleString("en-PK")} / day`
                : employee.salaryType === "monthly"
                ? `Rs. ${(employee.salary || 0).toLocaleString("en-PK")} / month`
                : `Rs. ${(employee.salary || 0).toLocaleString("en-PK")} (contract)`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">

        {/* Personal Information */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Personal Information</p>
          <div className="flex flex-col gap-2.5">
            {employee.phone && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E3F2FD" }}>
                  <Phone size={14} color="#1565C0" />
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] font-medium uppercase">Phone</p>
                  <p className="text-gray-800 text-sm font-semibold">{employee.phone}</p>
                </div>
              </div>
            )}
            {employee.address && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
                  <MapPin size={14} color={GREEN} />
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] font-medium uppercase">Address</p>
                  <p className="text-gray-800 text-sm font-semibold">{employee.address}</p>
                </div>
              </div>
            )}
            {employee.emergencyContact && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFEBEE" }}>
                  <Phone size={14} color="#C62828" />
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] font-medium uppercase">Emergency Contact</p>
                  <p className="text-gray-800 text-sm font-semibold">{employee.emergencyContact}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Employment Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F8F9FA" }}>
              <p className="text-gray-400 text-[10px] font-medium uppercase mb-1">Employee Type</p>
              <p className="text-gray-800 text-sm font-bold">{typeLabel(employee)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F8F9FA" }}>
              <p className="text-gray-400 text-[10px] font-medium uppercase mb-1">Salary Type</p>
              <p className="text-gray-800 text-sm font-bold">{SALARY_LABELS[employee.salaryType]}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F8F9FA" }}>
              <p className="text-gray-400 text-[10px] font-medium uppercase mb-1">
                {employee.salaryType === "daily" ? "Daily Wage" : employee.salaryType === "monthly" ? "Monthly Salary" : "Contract Amount"}
              </p>
              <p className="text-gray-800 text-sm font-bold">Rs. {(employee.salary || 0).toLocaleString("en-PK")}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F8F9FA" }}>
              <p className="text-gray-400 text-[10px] font-medium uppercase mb-1">Join Date</p>
              <p className="text-gray-800 text-sm font-bold">{fmtDate(employee.joinDate) || "—"}</p>
            </div>
          </div>
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
          <button onClick={prevMonth} className="active:scale-95"><ChevronLeft size={20} color={GREEN} /></button>
          <p className="font-bold text-gray-800">{MONTHS[calMonth]} {calYear}</p>
          <button onClick={nextMonth} className="active:scale-95"><ChevronRight size={20} color={GREEN} /></button>
        </div>

        {/* Attendance Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Attendance Summary</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#E8F5E9" }}>
              <p className="text-green-600 text-xs mb-0.5">Present</p>
              <p className="text-green-700 font-bold text-xl">{presentDays}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FFF3E0" }}>
              <p className="text-orange-600 text-xs mb-0.5">Half Day</p>
              <p className="text-orange-700 font-bold text-xl">{halfDays}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FFEBEE" }}>
              <p className="text-red-600 text-xs mb-0.5">Absent</p>
              <p className="text-red-700 font-bold text-xl">{absentDays}</p>
            </div>
          </div>

          {/* Attendance calendar */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <p key={i} className="text-center text-xs text-gray-400 font-medium py-1">{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const { bg, color } = dayColor(attByDate[day]);
              return (
                <div key={day} className="aspect-square flex items-center justify-center rounded-xl text-xs font-semibold"
                  style={{ backgroundColor: bg, color }}>
                  {day}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {[
              { label: "Present", color: GREEN, bg: "#E8F5E9" },
              { label: "Half Day", color: "#E65100", bg: "#FFF3E0" },
              { label: "Absent", color: "#C62828", bg: "#FFEBEE" },
              { label: "No Record", color: "#9E9E9E", bg: "#F5F5F5" },
            ].map(({ label, color, bg }) => (
              <div key={label} className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-md" style={{ backgroundColor: bg }} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Salary Information */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Salary Information — {MONTHS[calMonth]}</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Earned</p>
              <p className="font-bold text-gray-800 text-lg">{fmt(earned)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs">Paid</p>
              <p className="font-bold text-lg" style={{ color: GREEN }}>{fmt(paidThisMonth)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Pending</p>
              <p className="font-bold text-lg" style={{ color: pending > 0 ? "#C62828" : GREEN }}>{fmt(pending)}</p>
            </div>
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-800 mb-3">Payment History</p>
            <div className="flex flex-col gap-2">
              {payments.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 text-sm font-medium">{MONTHS[p.month]} {p.year}</p>
                    <p className="text-gray-400 text-xs">
                      {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString("en-PK") : "—"}
                    </p>
                  </div>
                  <p className="font-bold text-sm" style={{ color: GREEN }}>{fmt(p.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {employee.notes && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-800 mb-2">Notes</p>
            <p className="text-gray-600 text-sm leading-relaxed">{employee.notes}</p>
          </div>
        )}
      </div>

      {/* Pay button */}
      <div className="fixed bottom-20 left-0 right-0 px-4">
        <button onClick={() => { setPayAmount(String(Math.round(pending))); setShowPay(true); }}
          className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: GREEN }}>
          {pending > 0 ? `Pay Now · ${fmt(pending)}` : "Record Payment"}
        </button>
      </div>
    </div>
  );
}
