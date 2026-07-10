

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
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { notifyOfflineSave } from "@/lib/offlineSync";

interface Worker {
  id: string;
  name: string;
  phone: string;
  workerType: "daily" | "monthly";
  dailyRate?: number;
  monthlySalary?: number;
  status: string;
  notes?: string;
  organizationId: string;
  createdAt: any;
}

interface AttRecord {
  id: string;
  workerId: string;
  date: string;
  status: "present" | "halfDay" | "absent";
}

interface Payment {
  id: string;
  amount: number;
  month: number;
  year: number;
  createdAt: any;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [attendance, setAttendance] = useState<AttRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payCropCycleId, setPayCropCycleId] = useState("");
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "workers", id)).then((snap) => {
      if (snap.exists()) setWorker({ id: snap.id, ...snap.data() } as Worker);
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
    setPayCropCycleId((id) => (id ? id : active.id));
  }, [cropCycles]);

  // ── Monthly stats ────────────────────────────────────────────
  const monthAttendance = attendance.filter((a) => {
    const [y, m] = a.date.split("-").map(Number);
    return y === calYear && m - 1 === calMonth;
  });

  const presentDays = monthAttendance.filter((a) => a.status === "present").length;
  const halfDays = monthAttendance.filter((a) => a.status === "halfDay").length;
  const absentDays = monthAttendance.filter((a) => a.status === "absent").length;

  const rate = worker?.workerType === "daily" ? (worker.dailyRate || 0) : (worker?.monthlySalary || 0);
  const earned = worker?.workerType === "daily"
    ? presentDays * (worker?.dailyRate || 0) + halfDays * (worker?.dailyRate || 0) * 0.5
    : (worker?.monthlySalary || 0) - (absentDays * ((worker?.monthlySalary || 0) / 30));

  const monthPayments = payments.filter((p) => p.month === calMonth && p.year === calYear);
  const paidThisMonth = monthPayments.reduce((s, p) => s + p.amount, 0);
  const pending = Math.max(0, earned - paidThisMonth);

  // ── Calendar ─────────────────────────────────────────────────
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const attByDate: Record<string, string> = {};
  monthAttendance.forEach((a) => {
    const day = Number(a.date.split("-")[2]);
    attByDate[day] = a.status;
  });

  const dayColor = (status?: string) => {
    if (!status) return { bg: "#F5F5F5", color: "#9E9E9E" };
    if (status === "present") return { bg: "#E8F5E9", color: "#1B5E20" };
    if (status === "halfDay") return { bg: "#FFF3E0", color: "#E65100" };
    return { bg: "#FFEBEE", color: "#C62828" };
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  };

  const handlePay = async () => {
    if (!payAmount || isNaN(Number(payAmount))) { setPayError("Enter valid amount"); return; }
    if (!payCropCycleId) { setPayError("Please select a crop cycle"); return; }
    const isOnline = navigator.onLine;
    try {
      setSaving(true); setPayError("");
      const amount = Number(payAmount);
      const cropCycle = cropCycles.find((c) => c.id === payCropCycleId);
      const paymentPayload = {
        workerId: id,
        workerName: worker?.name,
        amount,
        month: calMonth,
        year: calYear,
        notes: payNote,
        organizationId: orgId,
        paidBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const txPayload = {
        organizationId: orgId as string,
        cropCycleId: payCropCycleId,
        cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "",
        seasonName: cropCycle?.seasonName || "",
        type: "expense" as const,
        category: "workerPayment",
        categoryLabel: "Worker Payment",
        amount,
        date: new Date().toISOString().split("T")[0],
        description: `Payment to ${worker?.name}`,
        notes: `Payment to ${worker?.name}`,
      };
      const logPayload = {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "WORKER_PAID",
        description: `Paid Rs. ${amount} to ${worker?.name}`,
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        // Offline: fire-and-forget — Firestore queues all writes locally
        // addTransaction handles notifyOfflineSave internally when offline, so don't call it again
        addDoc(collection(db, "workerPayments"), paymentPayload).catch(console.error);
        addTransaction(txPayload, "Worker Payment").catch(console.error);
        addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
        setShowPay(false);
        setPayAmount(""); setPayNote("");
        setPayCropCycleId((cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "");
        setSaving(false);
        return;
      }

      // Online: await normally
      await addDoc(collection(db, "workerPayments"), paymentPayload);
      await addTransaction(txPayload);
      addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
      setShowPay(false);
      setPayAmount(""); setPayNote("");
      setPayCropCycleId((cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "");
    } catch { setPayError("Failed to record payment."); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
  const ini = worker?.name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
    </div>
  );

  if (!worker) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Worker not found</p>
    </div>
  );

  // ── Pay form ─────────────────────────────────────────────────
  if (showPay) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => setShowPay(false)} className="text-white mr-3"><X size={24} /></button>
          <div>
            <h1 className="text-white text-xl font-bold">Pay Worker</h1>
            <p className="text-green-200 text-xs">{worker.name}</p>
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
            <label className="text-gray-600 text-sm font-medium mb-2 block">Payment Amount *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <span className="text-gray-400 mr-2 font-medium">Rs.</span>
              <input type="number" placeholder={String(Math.round(pending))} value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700 bg-white">
              <select
                value={payCropCycleId}
                onChange={(e) => setPayCropCycleId(e.target.value)}
                className="w-full outline-none text-gray-800 text-base bg-transparent"
              >
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
            style={{ backgroundColor: "#1B5E20" }}>
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Record Payment"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.back()} className="text-white active:scale-95"><ChevronLeft size={24} /></button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">{worker.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white bg-opacity-20 text-white">
                {worker.workerType === "daily" ? "Daily" : "Monthly"}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                Active
              </span>
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
            {worker.phone && <p className="text-green-100 text-sm">📞 {worker.phone}</p>}
            <p className="text-green-100 text-sm">
              {worker.workerType === "daily"
                ? `Rs. ${(worker.dailyRate || 0).toLocaleString("en-PK")} / day`
                : `Rs. ${(worker.monthlySalary || 0).toLocaleString("en-PK")} / month`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Month navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
          <button onClick={prevMonth} className="active:scale-95"><ChevronLeft size={20} color="#1B5E20" /></button>
          <p className="font-bold text-gray-800">{MONTHS[calMonth]} {calYear}</p>
          <button onClick={nextMonth} className="active:scale-95"><ChevronRight size={20} color="#1B5E20" /></button>
        </div>

        {/* Monthly summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Monthly Summary</p>
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
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-gray-400 text-xs">Earned</p>
              <p className="font-bold text-gray-800 text-lg">{fmt(earned)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Paid</p>
              <p className="font-bold text-lg" style={{ color: "#1B5E20" }}>{fmt(paidThisMonth)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Pending</p>
              <p className="font-bold text-lg" style={{ color: pending > 0 ? "#C62828" : "#1B5E20" }}>{fmt(pending)}</p>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Attendance Calendar</p>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <p key={i} className="text-center text-xs text-gray-400 font-medium py-1">{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const status = attByDate[day];
              const { bg, color } = dayColor(status);
              return (
                <div key={day}
                  className="aspect-square flex items-center justify-center rounded-xl text-xs font-semibold"
                  style={{ backgroundColor: bg, color }}>
                  {day}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {[
              { label: "Present", color: "#1B5E20", bg: "#E8F5E9" },
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

        {/* Recent payments */}
        {payments.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-800 mb-3">Payment History</p>
            <div className="flex flex-col gap-2">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 text-sm font-medium">{MONTHS[p.month]} {p.year}</p>
                    <p className="text-gray-400 text-xs">
                      {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString("en-PK") : "—"}
                    </p>
                  </div>
                  <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(p.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pay Now button */}
      <div className="fixed bottom-20 left-0 right-0 px-4">
        <button onClick={() => { setPayAmount(String(Math.round(pending))); setShowPay(true); }}
          className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {pending > 0 ? `Pay Now · ${fmt(pending)}` : "Record Payment"}
        </button>
      </div>
    </div>
  );
}
