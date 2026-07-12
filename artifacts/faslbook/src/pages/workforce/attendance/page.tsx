import { useEffect, useState, useCallback } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, getDocs, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { ChevronLeft, ChevronRight, Loader2, History, CheckCheck, X, Calendar } from "lucide-react";

import type { Employee, EmployeeType } from "@/pages/workforce/page";

const GREEN = "#1B5E20";

const TYPE_COLORS: Record<EmployeeType, string> = {
  worker: "#1565C0", manager: "#6A1B9A", driver: "#00695C",
  helper: "#E65100", security: "#C62828", mechanic: "#4E342E", custom: "#33691E",
};

const TYPE_LABELS: Record<EmployeeType, string> = {
  worker: "Worker", manager: "Manager", driver: "Driver",
  helper: "Helper", security: "Security", mechanic: "Mechanic", custom: "Custom",
};

function typeLabel(emp: Employee) {
  return emp.employeeType === "custom" && emp.customTypeName ? emp.customTypeName : TYPE_LABELS[emp.employeeType];
}

type AttStatus = "present" | "halfDay" | "absent" | null;

interface AttRow {
  employeeId: string;
  employeeName: string;
  employee: Employee;
  status: AttStatus;
  existingDocId?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function fmtDate(d: Date) {
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function toDateStr(d: Date) { return d.toISOString().split("T")[0]; }

export default function WorkforceAttendancePage() {
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [date, setDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isFuture = date > today;

  const activeEmployees = employees.filter((e) => e.status === "active");

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "employees"), where("organizationId", "==", orgId)),
      (snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId]);

  const loadAttendance = useCallback(async (d: Date, emps: Employee[]) => {
    if (!orgId || emps.length === 0) return;
    const ds = toDateStr(d);
    const snap = await getDocs(
      query(collection(db, "attendance"), where("organizationId", "==", orgId), where("date", "==", ds))
    );
    const existing: Record<string, { status: AttStatus; docId: string }> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      existing[data.workerId] = { status: data.status as AttStatus, docId: docSnap.id };
    });
    setRows(emps.map((emp) => ({
      employeeId: emp.id, employeeName: emp.name, employee: emp,
      status: existing[emp.id]?.status ?? null,
      existingDocId: existing[emp.id]?.docId,
    })));
  }, [orgId]);

  useEffect(() => {
    if (activeEmployees.length > 0) loadAttendance(date, activeEmployees);
  }, [date, employees]);

  const setStatus = (empId: string, status: AttStatus) => {
    setRows((prev) => prev.map((r) =>
      r.employeeId === empId ? { ...r, status: r.status === status ? null : status } : r
    ));
  };

  const markAll = (status: "present" | "absent") => {
    if (isFuture) return;
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  };

  const clearAll = () => setRows((prev) => prev.map((r) => ({ ...r, status: null })));

  const handleSave = async () => {
    if (isFuture) return;
    const ds = toDateStr(date);
    const toSave = rows.filter((r) => r.status !== null);
    if (toSave.length === 0) { setToast("No attendance marked"); setTimeout(() => setToast(""), 2000); return; }
    try {
      setSaving(true);
      for (const row of toSave) {
        const payload = {
          workerId: row.employeeId, workerName: row.employeeName,
          date: ds, status: row.status,
          organizationId: orgId, markedBy: auth.currentUser?.uid || "",
          updatedAt: serverTimestamp(), syncStatus: "synced",
          source: "workforce",
        };
        if (row.existingDocId) {
          await updateDoc(doc(db, "attendance", row.existingDocId), payload);
        } else {
          const ref = await addDoc(collection(db, "attendance"), { ...payload, createdAt: serverTimestamp() });
          setRows((prev) => prev.map((r) => r.employeeId === row.employeeId ? { ...r, existingDocId: ref.id } : r));
        }
      }
      await addDoc(collection(db, "activityLogs"), {
        organizationId: orgId, userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "WORKFORCE_ATTENDANCE_MARKED",
        description: `Workforce attendance marked for ${ds} — ${toSave.length} employees`,
        createdAt: serverTimestamp(), syncStatus: "synced",
      });
      if (!navigator.onLine) notifyOfflineSave("Attendance");
      setToast(`✓ Attendance saved for ${toSave.length} employee${toSave.length !== 1 ? "s" : ""}`);
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      console.error(e);
      setToast("Failed to save. Try again.");
      setTimeout(() => setToast(""), 2500);
    } finally { setSaving(false); }
  };

  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); };
  const nextDay = () => {
    const d = new Date(date); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0);
    if (d <= today) setDate(d);
  };

  const present = rows.filter((r) => r.status === "present").length;
  const halfDay = rows.filter((r) => r.status === "halfDay").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const unmarked = rows.filter((r) => r.status === null).length;

  const labourCost = rows.reduce((sum, r) => {
    if (r.employee.salaryType !== "daily") return sum;
    const rate = r.employee.salary || 0;
    if (r.status === "present") return sum + rate;
    if (r.status === "halfDay") return sum + rate * 0.5;
    return sum;
  }, 0);

  const btnStyle = (status: AttStatus, target: "present" | "halfDay" | "absent") => {
    const selected = status === target;
    const colors = {
      present: { solid: GREEN, soft: "#E8F5E9" },
      halfDay: { solid: "#E65100", soft: "#FFF3E0" },
      absent:  { solid: "#C62828", soft: "#FFEBEE" },
    };
    const c = colors[target];
    const labels = { present: "P", halfDay: "H", absent: "A" };
    return {
      style: {
        width: 44, height: 44, borderRadius: 12,
        border: `2px solid ${selected ? c.solid : "#E5E7EB"}`,
        backgroundColor: selected ? c.solid : "white",
        color: selected ? "white" : "#9CA3AF",
        fontWeight: 700, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
      },
      label: labels[target],
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* Header */}
      <div style={{ backgroundColor: GREEN }} className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-white active:scale-95">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-white text-xl font-bold">Mark Attendance</h1>
              <p className="text-green-200 text-xs">{activeEmployees.length} active employees</p>
            </div>
          </div>
          <button onClick={() => window.location.href = "/workforce/attendance/history"}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <History size={14} /> History
          </button>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
          <button onClick={prevDay} className="text-white active:scale-95 p-1"><ChevronLeft size={20} /></button>
          <button onClick={() => setShowDatePicker((v) => !v)} className="flex items-center gap-2 text-white font-semibold text-sm">
            {fmtDate(date)} <Calendar size={14} className="opacity-70" />
          </button>
          <button onClick={nextDay} disabled={isFuture} className="p-1 transition-transform"
            style={{ color: isFuture ? "rgba(255,255,255,0.3)" : "white" }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {showDatePicker && (
          <div className="mt-2">
            <input type="date" max={toDateStr(today)} value={toDateStr(date)}
              onChange={(e) => { if (e.target.value) { setDate(new Date(e.target.value + "T00:00:00")); setShowDatePicker(false); } }}
              className="w-full rounded-xl px-4 py-2 text-gray-800 text-sm font-medium outline-none border-0" />
          </div>
        )}

        {isFuture && <p className="text-center text-yellow-200 text-xs mt-2">Cannot mark attendance for future dates</p>}

        {/* Quick actions */}
        {activeEmployees.length > 0 && !loading && !isFuture && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => markAll("present")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{ backgroundColor: "#E8F5E9", color: GREEN }}>
              <CheckCheck size={14} /> All Present
            </button>
            <button onClick={() => markAll("absent")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}>
              <X size={14} /> All Absent
            </button>
            <button onClick={clearAll}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {activeEmployees.length > 0 && !loading && (
        <div className="mx-4 mt-3 bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            {[
              { label: "Present", value: present, color: GREEN },
              { label: "Half", value: halfDay, color: "#E65100" },
              { label: "Absent", value: absent, color: "#C62828" },
              { label: "Unmarked", value: unmarked, color: "#9CA3AF" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-500">{label}</span>
                <span className="font-bold text-sm" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
          {labourCost > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Daily Wage Cost Today</span>
              <span className="font-bold text-sm" style={{ color: GREEN }}>
                Rs. {Math.round(labourCost).toLocaleString("en-PK")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Employee rows */}
      <div className="px-4 pt-3 flex flex-col gap-2">
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: GREEN }} />
          </div>
        ) : activeEmployees.length === 0 ? (
          <div className="text-center pt-16">
            <p className="text-gray-500 font-medium">No active employees found</p>
            <p className="text-gray-400 text-sm mt-1">Add employees in the Workforce tab first</p>
          </div>
        ) : (
          rows.map((row) => {
            const empColor = TYPE_COLORS[row.employee.employeeType] || GREEN;
            const tLabel = typeLabel(row.employee);
            const ini = row.employeeName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
            return (
              <div key={row.employeeId} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: empColor }}>
                  {ini}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{row.employeeName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                      {tLabel}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {row.employee.salaryType === "daily"
                        ? `Rs. ${(row.employee.salary || 0).toLocaleString("en-PK")}/day`
                        : row.employee.salaryType === "monthly"
                        ? `Rs. ${(row.employee.salary || 0).toLocaleString("en-PK")}/mo`
                        : "Contract"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(["present", "halfDay", "absent"] as const).map((target) => {
                    const { style, label } = btnStyle(row.status, target);
                    return (
                      <button key={target} style={style} disabled={isFuture}
                        onClick={() => setStatus(row.employeeId, target)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Save button */}
      {activeEmployees.length > 0 && !loading && (
        <div className="fixed bottom-20 left-0 right-0 px-4">
          <button onClick={handleSave} disabled={saving || isFuture}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: GREEN }}>
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Attendance"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-4 right-4 z-50 px-5 py-4 rounded-2xl shadow-xl text-white text-sm font-semibold text-center"
          style={{ backgroundColor: toast.startsWith("✓") ? GREEN : "#C62828" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
