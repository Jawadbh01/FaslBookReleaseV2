

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  collection, query, where, getDocs, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ChevronLeft, Loader2 } from "lucide-react";

interface AttRecord {
  id: string;
  workerId: string;
  workerName: string;
  date: string;
  status: "present" | "halfDay" | "absent";
  organizationId: string;
}

interface WorkerDoc {
  id: string;
  name: string;
  workerType: "daily" | "monthly";
  dailyRate?: number;
  monthlySalary?: number;
}

type Filter = "week" | "month" | "custom";

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  present:  { label: "Present",  bg: "#E8F5E9", color: "#1B5E20" },
  halfDay:  { label: "Half Day", bg: "#FFF3E0", color: "#E65100" },
  absent:   { label: "Absent",   bg: "#FFEBEE", color: "#C62828" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(str: string) {
  const [y, m, d] = str.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function weekStart(d: Date) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function AttendanceHistoryPage() {
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [records, setRecords] = useState<AttRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("month");
  const [selectedWorker, setSelectedWorker] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [attSnap, workerSnap] = await Promise.all([
          getDocs(query(
            collection(db, "attendance"),
            where("organizationId", "==", orgId),
            orderBy("date", "desc")
          )),
          getDocs(query(collection(db, "workers"), where("organizationId", "==", orgId))),
        ]);
        setRecords(attSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttRecord)));
        setWorkers(workerSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkerDoc)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgId]);

  const today = new Date();

  const filteredRecords = records.filter((r) => {
    const rDate = new Date(r.date);
    let inRange = true;
    if (filter === "week") {
      inRange = rDate >= weekStart(today) && rDate <= today;
    } else if (filter === "month") {
      inRange = rDate >= monthStart(today) && rDate <= today;
    } else if (filter === "custom" && customFrom && customTo) {
      inRange = r.date >= customFrom && r.date <= customTo;
    }
    const workerMatch = selectedWorker === "all" || r.workerId === selectedWorker;
    return inRange && workerMatch;
  });

  const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));

  const earnedForRecord = (r: AttRecord) => {
    const w = workerMap[r.workerId];
    if (!w || w.workerType !== "daily") return 0;
    const rate = w.dailyRate || 0;
    if (r.status === "present") return rate;
    if (r.status === "halfDay") return rate * 0.5;
    return 0;
  };

  const totalPresent = filteredRecords.filter((r) => r.status === "present").length;
  const totalHalf = filteredRecords.filter((r) => r.status === "halfDay").length;
  const totalAbsent = filteredRecords.filter((r) => r.status === "absent").length;
  const totalEarnings = filteredRecords.reduce((sum, r) => sum + earnedForRecord(r), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="text-white active:scale-95 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Attendance History</h1>
            <p className="text-green-200 text-xs">{filteredRecords.length} records</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Filter tabs */}
        <div className="flex gap-2">
          {([
            { key: "week", label: "This Week" },
            { key: "month", label: "This Month" },
            { key: "custom", label: "Custom" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{
                backgroundColor: filter === key ? "#1B5E20" : "white",
                color: filter === key ? "white" : "#6B7280",
                border: filter === key ? "none" : "1.5px solid #E5E7EB",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        {filter === "custom" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-gray-500 text-xs mb-1 block">From</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                max={today.toISOString().split("T")[0]}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-700" />
            </div>
            <div className="flex-1">
              <label className="text-gray-500 text-xs mb-1 block">To</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                max={today.toISOString().split("T")[0]}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-700" />
            </div>
          </div>
        )}

        {/* Worker filter */}
        <div className="bg-white rounded-2xl px-4 py-2 shadow-sm">
          <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}
            className="w-full outline-none text-gray-700 text-sm py-1 bg-transparent">
            <option value="all">All Workers</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Summary card */}
        {!loading && filteredRecords.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#E8F5E9" }}>
                <p className="text-xs font-medium" style={{ color: "#1B5E20" }}>Present</p>
                <p className="font-bold text-lg" style={{ color: "#1B5E20" }}>{totalPresent}</p>
              </div>
              <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#FFF3E0" }}>
                <p className="text-xs font-medium" style={{ color: "#E65100" }}>Half</p>
                <p className="font-bold text-lg" style={{ color: "#E65100" }}>{totalHalf}</p>
              </div>
              <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#FFEBEE" }}>
                <p className="text-xs font-medium" style={{ color: "#C62828" }}>Absent</p>
                <p className="font-bold text-lg" style={{ color: "#C62828" }}>{totalAbsent}</p>
              </div>
              <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#F3E5F5" }}>
                <p className="text-xs font-medium" style={{ color: "#6A1B9A" }}>Earnings</p>
                <p className="font-bold text-sm" style={{ color: "#6A1B9A" }}>
                  Rs. {Math.round(totalEarnings).toLocaleString("en-PK")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Records list */}
        {loading ? (
          <div className="flex justify-center pt-10">
            <Loader2 size={32} className="animate-spin" style={{ color: "#1B5E20" }} />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center pt-10">
            <p className="text-gray-500 font-medium">No records found</p>
            <p className="text-gray-400 text-sm mt-1">Try a different date range or worker filter</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredRecords.map((rec) => {
              const s = STATUS_LABELS[rec.status] || STATUS_LABELS.absent;
              const earned = earnedForRecord(rec);
              const ini = rec.workerName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
              const w = workerMap[rec.workerId];
              const isDaily = w?.workerType === "daily";
              return (
                <div key={rec.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: isDaily ? "#1565C0" : "#6A1B9A" }}>
                    {ini}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{rec.workerName}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(rec.date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ backgroundColor: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                    {earned > 0 && (
                      <span className="text-xs font-semibold" style={{ color: "#1B5E20" }}>
                        Rs. {Math.round(earned).toLocaleString("en-PK")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
