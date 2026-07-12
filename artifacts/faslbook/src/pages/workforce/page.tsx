import { useEffect, useState, useMemo } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import {
  Plus, X, Loader2, Phone, ClipboardList,
  ChevronRight, User, Search, Printer, Pencil, Trash2,
  Users, AlertTriangle, Filter, Calendar, DollarSign,
  MapPin, ShieldCheck, Wrench, Car, HardHat, ChevronDown,
} from "lucide-react";

const GREEN = "#1B5E20";

export type EmployeeType = "worker" | "manager" | "driver" | "helper" | "security" | "mechanic" | "custom";
export type SalaryType = "daily" | "monthly" | "contract";

export interface Employee {
  id: string;
  name: string;
  phone: string;
  employeeType: EmployeeType;
  customTypeName?: string;
  joinDate: string;
  salaryType: SalaryType;
  salary: number;
  status: "active" | "inactive";
  address?: string;
  emergencyContact?: string;
  notes?: string;
  organizationId: string;
  createdAt: any;
  updatedAt?: any;
}

interface AttendanceRecord {
  workerId: string;
  date: string;
  status: "present" | "halfDay" | "absent";
}

type ModalMode = "add" | "edit" | "delete" | null;

const TYPE_COLORS: Record<EmployeeType, { bg: string; color: string; darkBg: string }> = {
  worker:   { bg: "#E3F2FD", color: "#1565C0", darkBg: "#1565C0" },
  manager:  { bg: "#F3E5F5", color: "#6A1B9A", darkBg: "#6A1B9A" },
  driver:   { bg: "#E0F2F1", color: "#00695C", darkBg: "#00695C" },
  helper:   { bg: "#FFF3E0", color: "#E65100", darkBg: "#E65100" },
  security: { bg: "#FFEBEE", color: "#C62828", darkBg: "#C62828" },
  mechanic: { bg: "#EFEBE9", color: "#4E342E", darkBg: "#4E342E" },
  custom:   { bg: "#F1F8E9", color: "#33691E", darkBg: "#33691E" },
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

const initials = (name: string) =>
  (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

const EMPTY_FORM = {
  name: "", phone: "", employeeType: "worker" as EmployeeType, customTypeName: "",
  joinDate: new Date().toISOString().split("T")[0],
  salaryType: "daily" as SalaryType, salary: "",
  status: "active" as "active" | "inactive",
  address: "", emergencyContact: "", notes: "",
};

export default function WorkforcePage() {
  const { organization, role } = useAuthStore();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAtt, setTodayAtt] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EmployeeType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "employees"), where("organizationId", "==", orgId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee));
        setEmployees(all.sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), where("organizationId", "==", orgId), where("date", "==", todayStr)),
      (snap) => setTodayAtt(snap.docs.map((d) => d.data() as AttendanceRecord))
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  const closeModal = () => { setModal(null); setEditTarget(null); setError(""); };

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setModal("add"); };
  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setForm({
      name: emp.name, phone: emp.phone, employeeType: emp.employeeType,
      customTypeName: emp.customTypeName || "", joinDate: emp.joinDate || "",
      salaryType: emp.salaryType, salary: String(emp.salary || ""),
      status: emp.status, address: emp.address || "",
      emergencyContact: emp.emergencyContact || "", notes: emp.notes || "",
    });
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Full name is required"); return; }
    if (!form.salary || isNaN(Number(form.salary))) { setError("Enter a valid salary/wage"); return; }
    if (form.employeeType === "custom" && !form.customTypeName.trim()) {
      setError("Enter a custom employee type name"); return;
    }
    try {
      setSaving(true); setError("");
      const payload: any = {
        name: form.name.trim(), phone: form.phone.trim(),
        employeeType: form.employeeType, customTypeName: form.customTypeName.trim(),
        joinDate: form.joinDate, salaryType: form.salaryType,
        salary: Number(form.salary), status: form.status,
        address: form.address.trim(), emergencyContact: form.emergencyContact.trim(),
        notes: form.notes.trim(), organizationId: orgId, syncStatus: "synced",
      };
      if (modal === "edit" && editTarget) {
        await updateDoc(doc(db, "employees", editTarget.id), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "employees"), { ...payload, createdAt: serverTimestamp() });
      }
      if (!navigator.onLine) notifyOfflineSave("Employee");
      closeModal();
    } catch { setError("Failed to save. Try again."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editTarget) return;
    try { setSaving(true); await deleteDoc(doc(db, "employees", editTarget.id)); closeModal(); }
    catch { setError("Failed to delete."); setSaving(false); }
  };

  // ── Stats ────────────────────────────────────────────────────
  const totalCount = employees.length;
  const activeCount = employees.filter((e) => e.status === "active").length;
  const inactiveCount = employees.filter((e) => e.status === "inactive").length;
  const employeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const presentToday = todayAtt.filter((a) => employeeIds.has(a.workerId) && a.status === "present").length;
  const absentToday = todayAtt.filter((a) => employeeIds.has(a.workerId) && a.status === "absent").length;

  // ── Filtered list ─────────────────────────────────────────────
  const displayed = employees.filter((emp) => {
    if (filterType !== "all" && emp.employeeType !== filterType) return false;
    if (filterStatus !== "all" && emp.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return emp.name.toLowerCase().includes(q) || emp.phone.includes(q) || typeLabel(emp).toLowerCase().includes(q);
    }
    return true;
  });

  const getAttBadge = (empId: string) => {
    const rec = todayAtt.find((a) => a.workerId === empId);
    if (!rec) return null;
    if (rec.status === "present") return { label: "P", color: GREEN, bg: "#E8F5E9" };
    if (rec.status === "halfDay") return { label: "H", color: "#E65100", bg: "#FFF3E0" };
    return { label: "A", color: "#C62828", bg: "#FFEBEE" };
  };

  const fmtSalary = (emp: Employee) => {
    const s = (emp.salary || 0).toLocaleString("en-PK");
    if (emp.salaryType === "daily") return `Rs. ${s}/day`;
    if (emp.salaryType === "monthly") return `Rs. ${s}/mo`;
    return `Rs. ${s} (contract)`;
  };

  const isModal = modal === "add" || modal === "edit";

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-28">
        {/* Header */}
        <div style={{ backgroundColor: GREEN }} className="px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white text-xl font-bold">Workforce</h1>
              <p className="text-green-200 text-xs">
                {activeCount} active · {inactiveCount} inactive
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.href = "/reports/print?type=workforce"}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                <Printer size={16} color="white" />
              </button>
              <button
                onClick={() => window.location.href = "/workforce/attendance"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                <ClipboardList size={15} /> Attendance
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {[
              { label: "Total", value: totalCount, bg: "rgba(255,255,255,0.18)", color: "white" },
              { label: "Present", value: presentToday, bg: "#E8F5E9", color: GREEN },
              { label: "Absent", value: absentToday, bg: "#FFEBEE", color: "#C62828" },
              { label: "Active", value: activeCount, bg: "rgba(255,255,255,0.18)", color: "white" },
              { label: "Inactive", value: inactiveCount, bg: "rgba(0,0,0,0.12)", color: "rgba(255,255,255,0.7)" },
            ].map(({ label, value, bg, color }) => (
              <div key={label} className="rounded-xl px-1 py-2 text-center" style={{ backgroundColor: bg }}>
                <p className="font-bold text-lg leading-none" style={{ color }}>{value}</p>
                <p className="text-[9px] mt-0.5 font-medium" style={{ color: color === "white" ? "rgba(255,255,255,0.7)" : color }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Search + filter bar */}
          <div className="pb-3 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <Search size={15} color="rgba(255,255,255,0.7)" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees…"
                className="flex-1 bg-transparent outline-none text-white placeholder-white/60 text-sm"
              />
              {search && <button onClick={() => setSearch("")}><X size={14} color="rgba(255,255,255,0.7)" /></button>}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 active:scale-95"
              style={{ backgroundColor: showFilters ? "white" : "rgba(255,255,255,0.18)" }}>
              <Filter size={16} color={showFilters ? GREEN : "white"} />
            </button>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className="flex gap-2 pb-3">
              <div className="flex-1 relative">
                <select
                  value={filterType} onChange={(e) => setFilterType(e.target.value as any)}
                  className="w-full appearance-none bg-white text-gray-800 text-xs font-semibold rounded-xl px-3 py-2.5 pr-7 outline-none">
                  <option value="all">All Types</option>
                  {(Object.keys(TYPE_LABELS) as EmployeeType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <div className="flex-1 relative">
                <select
                  value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full appearance-none bg-white text-gray-800 text-xs font-semibold rounded-xl px-3 py-2.5 pr-7 outline-none">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-4">
          {loading ? (
            <div className="flex justify-center pt-16">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: GREEN }} />
            </div>
          ) : (
            <>
    

              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-12 text-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <Users size={36} color={GREEN} />
                  </div>
                  {employees.length === 0 ? (
                    <>
                      <p className="text-gray-600 font-semibold mb-1">No employees yet</p>
                      <p className="text-gray-400 text-sm">Tap "Add Employee" to get started</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600 font-semibold mb-1">No results</p>
                      <p className="text-gray-400 text-sm">Try a different search or filter</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayed.map((emp) => {
                    const tc = TYPE_COLORS[emp.employeeType];
                    const attBadge = getAttBadge(emp.id);
                    const isInactive = emp.status === "inactive";
                    return (
                      <div key={emp.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm"
                        style={{ opacity: isInactive ? 0.72 : 1 }}>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: tc.darkBg }}>
                            {initials(emp.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-800">{emp.name}</p>
                              {attBadge && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ color: attBadge.color, backgroundColor: attBadge.bg }}>
                                  {attBadge.label}
                                </span>
                              )}
                              {isInactive && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ color: "#9CA3AF", backgroundColor: "#F3F4F6" }}>
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: tc.bg, color: tc.color }}>
                                {typeLabel(emp)}
                              </span>
                              <span className="text-gray-400 text-xs">{fmtSalary(emp)}</span>
                            </div>
                            {emp.phone && (
                              <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                                <Phone size={11} /> {emp.phone}
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEdit(emp)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#F5F5F5" }}>
                                <Pencil size={14} color="#616161" />
                              </button>
                              <button onClick={() => { setEditTarget(emp); setModal("delete"); }}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#FFEBEE" }}>
                                <Trash2 size={14} color="#C62828" />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => window.location.href = `/workforce/${emp.id}`}
                          className="mt-3 w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: "#F5F5F5", color: "#616161" }}>
                          View Profile <ChevronRight size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── FAB ── */}
      {canEdit && (
        <button
          onClick={openAdd}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40"
          style={{ backgroundColor: GREEN }}>
          <Plus size={26} color="white" />
        </button>
      )}

      {/* ── Add / Edit Employee Modal ── */}
      {isModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto">
          <div className="flex items-center px-4 pt-12 pb-5 shrink-0" style={{ backgroundColor: GREEN }}>
            <button onClick={closeModal} className="text-white mr-3 active:scale-95"><X size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">{modal === "edit" ? "Edit Employee" : "Add Employee"}</h1>
              <p className="text-green-200 text-xs">Internal farm employee</p>
            </div>
          </div>
          <div className="px-6 pt-6 pb-12">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>}

            {/* Full Name */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Full Name *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <User size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <input type="text" placeholder="Employee's full name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Phone */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Phone Number</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Phone size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <input type="tel" placeholder="03XX-XXXXXXX" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Employee Type */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Employee Type *</label>
              <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <select value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value as EmployeeType })}
                  className="w-full outline-none text-gray-800 text-base bg-transparent">
                  {(Object.keys(TYPE_LABELS) as EmployeeType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Type Name */}
            {form.employeeType === "custom" && (
              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Custom Type Name *</label>
                <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                  <input type="text" placeholder="e.g. Gardener, Cook…" value={form.customTypeName}
                    onChange={(e) => setForm({ ...form, customTypeName: e.target.value })}
                    className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
                </div>
              </div>
            )}

            {/* Join Date */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Join Date</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Calendar size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <input type="date" value={form.joinDate}
                  onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Salary Type */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Salary Type *</label>
              <div className="grid grid-cols-3 gap-2">
                {(["daily", "monthly", "contract"] as SalaryType[]).map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, salaryType: t })}
                    className="py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all border-2"
                    style={{
                      backgroundColor: form.salaryType === t ? GREEN : "white",
                      color: form.salaryType === t ? "white" : "#616161",
                      borderColor: form.salaryType === t ? GREEN : "#E5E7EB",
                    }}>
                    {SALARY_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Salary Amount */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">
                {form.salaryType === "daily" ? "Daily Wage *" : form.salaryType === "monthly" ? "Monthly Salary *" : "Contract Amount *"}
              </label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <DollarSign size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <span className="text-gray-400 mr-2 font-medium">Rs.</span>
                <input type="number" placeholder="0" value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Status */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {(["active", "inactive"] as const).map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, status: s })}
                    className="py-3 rounded-xl text-sm font-semibold active:scale-95 transition-all border-2 capitalize"
                    style={{
                      backgroundColor: form.status === s ? (s === "active" ? GREEN : "#C62828") : "white",
                      color: form.status === s ? "white" : "#616161",
                      borderColor: form.status === s ? (s === "active" ? GREEN : "#C62828") : "#E5E7EB",
                    }}>
                    {s === "active" ? "Active" : "Inactive"}
                  </button>
                ))}
              </div>
            </div>

            {/* Address (optional) */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Address (Optional)</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <MapPin size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <input type="text" placeholder="Home address" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Emergency Contact (optional) */}
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Emergency Contact (Optional)</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Phone size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <input type="tel" placeholder="Emergency phone number" value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-8">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
              <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <textarea placeholder="Any notes…" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
              style={{ backgroundColor: GREEN }}>
              {saving ? <Loader2 size={22} className="animate-spin" /> : (modal === "edit" ? "Save Changes" : "Add Employee")}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {modal === "delete" && editTarget && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FFEBEE" }}>
                <AlertTriangle size={24} color="#C62828" />
              </div>
              <div>
                <p className="font-bold text-gray-800">Delete Employee?</p>
                <p className="text-gray-400 text-sm">{editTarget.name}</p>
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-6">This will permanently delete the employee record. Attendance records are not deleted.</p>
            {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3.5 rounded-2xl border-2 font-bold text-sm" style={{ borderColor: "#E5E7EB", color: "#616161" }}>Cancel</button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95"
                style={{ backgroundColor: "#C62828" }}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
