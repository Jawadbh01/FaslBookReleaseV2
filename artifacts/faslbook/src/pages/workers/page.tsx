import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import {
  Plus, X, Loader2, Phone, ClipboardList,
  ChevronRight, User, Wheat, CheckCircle, XCircle, Clock,
  MapPin, Printer, Pencil, Trash2, Users, AlertTriangle,
} from "lucide-react";

interface ManualFarmer {
  id: string;
  name: string;
  phone: string;
  workerType: "farmer";
  assignedParcel?: string;
  notes?: string;
  status: string;
  organizationId: string;
}

interface Worker {
  id: string;
  name: string;
  phone: string;
  workerType: "daily" | "monthly";
  dailyRate?: number;
  monthlySalary?: number;
  notes?: string;
  status: string;
  organizationId: string;
  createdAt: any;
}

interface Parcel { id: string; name: string; assignedFarmer?: string; }
interface JoinRequest {
  id: string; userId: string; userName: string; userEmail: string;
  role: string; organizationId: string; status: string; createdAt: any;
}
interface AttendanceRecord { workerId: string; date: string; status: "present" | "halfDay" | "absent"; }

type Tab = "farmers" | "workers" | "requests";
type ModalMode = "addFarmer" | "editFarmer" | "addWorker" | "editWorker" | "deleteFarmer" | "deleteWorker" | null;

const GREEN = "#1B5E20";

export default function WorkersPage() {
  const { organization, role } = useAuthStore();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [tab, setTab] = useState<Tab>("farmers");
  const [farmers, setFarmers]     = useState<ManualFarmer[]>([]);
  const [workers, setWorkers]     = useState<Worker[]>([]);
  const [parcels, setParcels]     = useState<Parcel[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [todayAtt, setTodayAtt]   = useState<AttendanceRecord[]>([]);
  const [loading, setLoading]     = useState(true);

  const [modal, setModal]         = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<ManualFarmer | Worker | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const [fForm, setFForm] = useState({ name: "", phone: "", assignedParcel: "", notes: "" });
  const [wForm, setWForm] = useState({ name: "", phone: "", workerType: "daily" as "daily" | "monthly", dailyRate: "", monthlySalary: "", notes: "" });

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "workers"), where("organizationId", "==", orgId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setFarmers(all.filter((w: any) => w.workerType === "farmer").sort((a: any, b: any) => a.name?.localeCompare(b.name)));
        setWorkers(all.filter((w: any) => w.workerType !== "farmer")
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "joinRequests"), where("organizationId", "==", orgId), where("status", "==", "pending")),
      (snap) => setJoinRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JoinRequest)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), where("organizationId", "==", orgId), where("date", "==", todayStr)),
      (snap) => setTodayAtt(snap.docs.map((d) => d.data() as AttendanceRecord))
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  const closeModal = () => { setModal(null); setEditTarget(null); setError(""); };

  const openAddFarmer = () => { setFForm({ name: "", phone: "", assignedParcel: "", notes: "" }); setModal("addFarmer"); };
  const openEditFarmer = (f: ManualFarmer) => {
    setEditTarget(f);
    setFForm({ name: f.name, phone: f.phone, assignedParcel: f.assignedParcel || "", notes: f.notes || "" });
    setModal("editFarmer");
  };
  const openAddWorker = () => { setWForm({ name: "", phone: "", workerType: "daily", dailyRate: "", monthlySalary: "", notes: "" }); setModal("addWorker"); };
  const openEditWorker = (w: Worker) => {
    setEditTarget(w);
    setWForm({ name: w.name, phone: w.phone, workerType: w.workerType, dailyRate: String(w.dailyRate || ""), monthlySalary: String(w.monthlySalary || ""), notes: w.notes || "" });
    setModal("editWorker");
  };

  const handleSaveFarmer = async () => {
    if (!fForm.name.trim()) { setError("Name is required"); return; }
    if (!fForm.phone.trim()) { setError("Phone number is required"); return; }
    try {
      setSaving(true); setError("");
      const payload = {
        name: fForm.name.trim(), phone: fForm.phone.trim(),
        workerType: "farmer", assignedParcel: fForm.assignedParcel,
        notes: fForm.notes.trim(), status: "active",
        organizationId: orgId, syncStatus: "synced",
      };
      if (modal === "editFarmer" && editTarget) {
        await updateDoc(doc(db, "workers", editTarget.id), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "workers"), { ...payload, createdAt: serverTimestamp() });
      }
      if (!navigator.onLine) notifyOfflineSave("Farmer");
      closeModal();
    } catch { setError("Failed to save. Try again."); }
    finally { setSaving(false); }
  };

  const handleSaveWorker = async () => {
    if (!wForm.name.trim()) { setError("Name is required"); return; }
    if (wForm.workerType === "daily" && !wForm.dailyRate) { setError("Enter daily rate"); return; }
    if (wForm.workerType === "monthly" && !wForm.monthlySalary) { setError("Enter monthly salary"); return; }
    try {
      setSaving(true); setError("");
      const payload = {
        name: wForm.name.trim(), phone: wForm.phone.trim(), workerType: wForm.workerType,
        dailyRate: wForm.workerType === "daily" ? Number(wForm.dailyRate) : 0,
        monthlySalary: wForm.workerType === "monthly" ? Number(wForm.monthlySalary) : 0,
        notes: wForm.notes.trim(), status: "active",
        organizationId: orgId, syncStatus: "synced",
      };
      if (modal === "editWorker" && editTarget) {
        await updateDoc(doc(db, "workers", editTarget.id), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "workers"), { ...payload, createdAt: serverTimestamp() });
      }
      if (!navigator.onLine) notifyOfflineSave("Worker");
      closeModal();
    } catch { setError("Failed to save. Try again."); }
    finally { setSaving(false); }
  };

  const handleDeleteFarmer = async () => {
    if (!editTarget) return;
    try { setSaving(true); await deleteDoc(doc(db, "workers", editTarget.id)); closeModal(); }
    catch { setError("Failed to delete."); setSaving(false); }
  };

  const handleDeleteWorker = async () => {
    if (!editTarget) return;
    try { setSaving(true); await deleteDoc(doc(db, "workers", editTarget.id)); closeModal(); }
    catch { setError("Failed to delete."); setSaving(false); }
  };

  const handleApprove = async (req: JoinRequest) => {
    setApprovingId(req.id);
    try {
      await updateDoc(doc(db, "joinRequests", req.id), { status: "approved" });
      await updateDoc(doc(db, "users", req.userId), { organizationId: req.organizationId, role: req.role, status: "active" });
    } catch {}
    finally { setApprovingId(null); }
  };

  const handleReject = async (req: JoinRequest) => {
    setRejectingId(req.id);
    try { await updateDoc(doc(db, "joinRequests", req.id), { status: "rejected" }); }
    catch {}
    finally { setRejectingId(null); }
  };

  const initials = (name: string) =>
    (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  const getAttDot = (wId: string) => {
    const rec = todayAtt.find((a) => a.workerId === wId);
    if (!rec) return "#9CA3AF";
    if (rec.status === "present") return GREEN;
    if (rec.status === "halfDay") return "#E65100";
    return "#C62828";
  };

  const getAttLabel = (wId: string) => {
    const rec = todayAtt.find((a) => a.workerId === wId);
    if (!rec) return null;
    if (rec.status === "present") return { label: "P", color: GREEN, bg: "#E8F5E9" };
    if (rec.status === "halfDay") return { label: "H", color: "#E65100", bg: "#FFF3E0" };
    return { label: "A", color: "#C62828", bg: "#FFEBEE" };
  };

  const timeAgo = (ts: any) => {
    if (!ts?.toDate) return "";
    const mins = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const pendingCount = joinRequests.length;

  // ── Farmer Form Modal ──────────────────────────────────────────
  const isFarmerModal = modal === "addFarmer" || modal === "editFarmer";
  const isWorkerModal = modal === "addWorker" || modal === "editWorker";

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <div style={{ backgroundColor: GREEN }} className="px-4 pt-12 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white text-xl font-bold">Our Team</h1>
              <p className="text-green-200 text-xs">
                {farmers.length} farmer{farmers.length !== 1 ? "s" : ""} · {workers.length} worker{workers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.href = "/reports/print?type=expense"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
                <Printer size={14} /> Print
              </button>
              <button
                onClick={() => window.location.href = "/workers/attendance"}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <ClipboardList size={15} /> Attendance
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex">
            {([
              { key: "farmers", label: "Farmers", icon: <Wheat size={13} /> },
              { key: "workers", label: "Workers", icon: <Users size={13} /> },
              { key: "requests", label: "Requests", icon: <Clock size={13} /> },
            ] as const).map(({ key, label, icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  color: tab === key ? "white" : "rgba(255,255,255,0.55)",
                  borderBottom: tab === key ? "3px solid white" : "3px solid transparent",
                }}>
                {icon} {label}
                {key === "requests" && pendingCount > 0 && (
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: "#C62828", color: "white" }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-4">
          {loading ? (
            <div className="flex justify-center pt-16">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: GREEN }} />
            </div>

          ) : tab === "farmers" ? (
            <>
              {canEdit && (
                <button onClick={openAddFarmer}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 font-semibold text-sm active:scale-95 transition-transform mb-3"
                  style={{ borderColor: GREEN, color: GREEN, borderStyle: "dashed" }}>
                  <Plus size={18} /> Add Farmer
                </button>
              )}
              {farmers.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-12 text-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <Wheat size={36} color={GREEN} />
                  </div>
                  <p className="text-gray-600 font-semibold mb-1">No farmers yet</p>
                  <p className="text-gray-400 text-sm">Tap "Add Farmer" to add one manually</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {farmers.map((farmer) => {
                    const farmerParcels = parcels.filter((p) => p.id === farmer.assignedParcel);
                    const attBadge = getAttLabel(farmer.id);
                    return (
                      <div key={farmer.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: GREEN }}>
                            {initials(farmer.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-800 truncate">{farmer.name}</p>
                              {attBadge && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ color: attBadge.color, backgroundColor: attBadge.bg }}>
                                  {attBadge.label}
                                </span>
                              )}
                            </div>
                            {farmer.phone && (
                              <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                                <Phone size={11} /> {farmer.phone}
                              </p>
                            )}
                            {farmerParcels.length > 0 && (
                              <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5">
                                <MapPin size={11} /> {farmerParcels.map((p) => p.name).join(", ")}
                              </p>
                            )}
                            {farmer.notes && (
                              <p className="text-gray-400 text-xs mt-0.5 truncate">{farmer.notes}</p>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEditFarmer(farmer)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#F5F5F5" }}>
                                <Pencil size={14} color="#616161" />
                              </button>
                              <button onClick={() => { setEditTarget(farmer); setModal("deleteFarmer"); }}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#FFEBEE" }}>
                                <Trash2 size={14} color="#C62828" />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => window.location.href = `/workers/farmer/${farmer.id}`}
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

          ) : tab === "workers" ? (
            <>
              {canEdit && (
                <button onClick={openAddWorker}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 font-semibold text-sm active:scale-95 transition-transform mb-3"
                  style={{ borderColor: "#1565C0", color: "#1565C0", borderStyle: "dashed" }}>
                  <Plus size={18} /> Add Worker
                </button>
              )}

              {/* Today's Labour Cost Summary */}
              {workers.length > 0 && (() => {
                const dailyCost = workers
                  .filter((w) => w.workerType === "daily")
                  .reduce((sum, w) => {
                    const att = todayAtt.find((a) => a.workerId === w.id);
                    if (att?.status === "present") return sum + (w.dailyRate || 0);
                    if (att?.status === "halfDay") return sum + (w.dailyRate || 0) * 0.5;
                    return sum;
                  }, 0);
                return dailyCost > 0 ? (
                  <div className="rounded-2xl px-4 py-3 mb-3" style={{ backgroundColor: "#E8F5E9" }}>
                    <p className="text-green-700 text-xs font-medium">Today's Labour Cost</p>
                    <p className="font-bold text-lg" style={{ color: GREEN }}>Rs. {Math.round(dailyCost).toLocaleString("en-PK")}</p>
                  </div>
                ) : null;
              })()}

              {workers.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-12 text-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E3F2FD" }}>
                    <Users size={36} color="#1565C0" />
                  </div>
                  <p className="text-gray-600 font-semibold mb-1">No workers yet</p>
                  <p className="text-gray-400 text-sm">Tap "Add Worker" to add daily or monthly workers</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {workers.map((worker) => {
                    const isDaily = worker.workerType === "daily";
                    const attBadge = getAttLabel(worker.id);
                    return (
                      <div key={worker.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: isDaily ? "#1565C0" : "#6A1B9A" }}>
                            {initials(worker.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-800 truncate">{worker.name}</p>
                              {attBadge && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ color: attBadge.color, backgroundColor: attBadge.bg }}>
                                  {attBadge.label}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: isDaily ? "#E3F2FD" : "#F3E5F5", color: isDaily ? "#1565C0" : "#6A1B9A" }}>
                                {isDaily ? "Daily" : "Monthly"}
                              </span>
                              <span className="text-gray-400 text-xs">
                                Rs. {isDaily ? `${(worker.dailyRate || 0).toLocaleString("en-PK")}/day` : `${(worker.monthlySalary || 0).toLocaleString("en-PK")}/mo`}
                              </span>
                            </div>
                            {worker.phone && (
                              <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                                <Phone size={11} /> {worker.phone}
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEditWorker(worker)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#F5F5F5" }}>
                                <Pencil size={14} color="#616161" />
                              </button>
                              <button onClick={() => { setEditTarget(worker); setModal("deleteWorker"); }}
                                className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                                style={{ backgroundColor: "#FFEBEE" }}>
                                <Trash2 size={14} color="#C62828" />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => window.location.href = `/workers/worker/${worker.id}`}
                          className="mt-3 w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: "#F5F5F5", color: "#616161" }}>
                          View Attendance & Payments <ChevronRight size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>

          ) : (
            // Requests tab
            joinRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#F3E5F5" }}>
                  <Clock size={36} color="#6A1B9A" />
                </div>
                <p className="text-gray-600 font-semibold mb-1">No pending requests</p>
                <p className="text-gray-400 text-sm">Join requests will appear here</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {joinRequests.map((req) => (
                  <div key={req.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ backgroundColor: req.role === "manager" ? "#1565C0" : "#6A1B9A" }}>
                        {initials(req.userName)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{req.userName || "Unknown"}</p>
                        <p className="text-gray-400 text-xs">{req.userEmail}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{ backgroundColor: req.role === "manager" ? "#E3F2FD" : "#F3E5F5", color: req.role === "manager" ? "#1565C0" : "#6A1B9A" }}>
                            {req.role}
                          </span>
                          <span className="text-gray-400 text-xs">{timeAgo(req.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(req)} disabled={approvingId === req.id}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
                        style={{ backgroundColor: GREEN }}>
                        {approvingId === req.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                        Approve
                      </button>
                      <button onClick={() => handleReject(req)} disabled={rejectingId === req.id}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60 border-2"
                        style={{ borderColor: "#C62828", color: "#C62828" }}>
                        {rejectingId === req.id ? <Loader2 size={16} className="animate-spin" color="#C62828" /> : <XCircle size={16} />}
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Farmer Add/Edit Modal ── */}
      {isFarmerModal && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "white" }}>
          <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: GREEN }}>
            <button onClick={closeModal} className="text-white mr-3 active:scale-95"><X size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">{modal === "editFarmer" ? "Edit Farmer" : "Add Farmer"}</h1>
              <p className="text-green-200 text-xs">Managed by landlord/manager</p>
            </div>
          </div>
          <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>}

            {[
              { label: "Full Name *", type: "text", placeholder: "Farmer's full name", value: fForm.name, key: "name", icon: <User size={18} color="#9E9E9E" /> },
              { label: "Phone Number *", type: "tel", placeholder: "03XX-XXXXXXX", value: fForm.phone, key: "phone", icon: <Phone size={18} color="#9E9E9E" /> },
            ].map(({ label, type, placeholder, value, key, icon }) => (
              <div key={key} className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">{label}</label>
                <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                  <span className="mr-3 shrink-0">{icon}</span>
                  <input type={type} placeholder={placeholder} value={value}
                    onChange={(e) => setFForm({ ...fForm, [key]: e.target.value })}
                    className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
                </div>
              </div>
            ))}

            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Assigned Parcel</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <MapPin size={18} color="#9E9E9E" className="mr-3 shrink-0" />
                <select value={fForm.assignedParcel} onChange={(e) => setFForm({ ...fForm, assignedParcel: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent">
                  <option value="">No parcel assigned</option>
                  {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-8">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
              <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
                <textarea placeholder="Any notes…" value={fForm.notes}
                  onChange={(e) => setFForm({ ...fForm, notes: e.target.value })}
                  rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
              </div>
            </div>

            <button onClick={handleSaveFarmer} disabled={saving}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
              style={{ backgroundColor: GREEN }}>
              {saving ? <Loader2 size={22} className="animate-spin" /> : (modal === "editFarmer" ? "Save Changes" : "Add Farmer")}
            </button>
          </div>
        </div>
      )}

      {/* ── Worker Add/Edit Modal ── */}
      {isWorkerModal && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "white" }}>
          <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1565C0" }}>
            <button onClick={closeModal} className="text-white mr-3 active:scale-95"><X size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">{modal === "editWorker" ? "Edit Worker" : "Add Worker"}</h1>
              <p className="text-blue-200 text-xs">Daily or monthly worker</p>
            </div>
          </div>
          <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>}

            {[
              { label: "Full Name *", type: "text", placeholder: "Full name", value: wForm.name, key: "name", icon: <User size={18} color="#9E9E9E" /> },
              { label: "Phone Number", type: "tel", placeholder: "03XX-XXXXXXX", value: wForm.phone, key: "phone", icon: <Phone size={18} color="#9E9E9E" /> },
            ].map(({ label, type, placeholder, value, key, icon }) => (
              <div key={key} className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">{label}</label>
                <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-700">
                  <span className="mr-3 shrink-0">{icon}</span>
                  <input type={type} placeholder={placeholder} value={value}
                    onChange={(e) => setWForm({ ...wForm, [key]: e.target.value })}
                    className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
                </div>
              </div>
            ))}

            <div className="mb-5">
              <label className="text-gray-600 text-sm font-medium mb-3 block">Worker Type</label>
              <div className="flex gap-3">
                {[{ val: "daily", label: "Daily Worker" }, { val: "monthly", label: "Monthly Salary" }].map(({ val, label }) => (
                  <button key={val} onClick={() => setWForm({ ...wForm, workerType: val as any })}
                    className="flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all active:scale-95"
                    style={{
                      borderColor: wForm.workerType === val ? "#1565C0" : "#E5E7EB",
                      backgroundColor: wForm.workerType === val ? "#E3F2FD" : "white",
                      color: wForm.workerType === val ? "#1565C0" : "#6B7280",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {wForm.workerType === "daily" ? (
              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Daily Rate (Rs.) *</label>
                <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-700">
                  <span className="text-gray-400 mr-2 font-medium">Rs.</span>
                  <input type="number" placeholder="0" value={wForm.dailyRate}
                    onChange={(e) => setWForm({ ...wForm, dailyRate: e.target.value })}
                    className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Monthly Salary (Rs.) *</label>
                <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-700">
                  <span className="text-gray-400 mr-2 font-medium">Rs.</span>
                  <input type="number" placeholder="0" value={wForm.monthlySalary}
                    onChange={(e) => setWForm({ ...wForm, monthlySalary: e.target.value })}
                    className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
                </div>
              </div>
            )}

            <div className="mb-8">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
              <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
                <textarea placeholder="Any notes…" value={wForm.notes}
                  onChange={(e) => setWForm({ ...wForm, notes: e.target.value })}
                  rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
              </div>
            </div>

            <button onClick={handleSaveWorker} disabled={saving}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
              style={{ backgroundColor: "#1565C0" }}>
              {saving ? <Loader2 size={22} className="animate-spin" /> : (modal === "editWorker" ? "Save Changes" : "Add Worker")}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {(modal === "deleteFarmer" || modal === "deleteWorker") && editTarget && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="w-full bg-white rounded-t-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFEBEE" }}>
                <AlertTriangle size={24} color="#C62828" />
              </div>
              <div>
                <p className="font-bold text-gray-800">Remove {modal === "deleteFarmer" ? "Farmer" : "Worker"}?</p>
                <p className="text-gray-500 text-sm">
                  "{(editTarget as any).name}" will be permanently removed.
                </p>
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3.5 rounded-2xl font-bold border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform">
                Cancel
              </button>
              <button onClick={modal === "deleteFarmer" ? handleDeleteFarmer : handleDeleteWorker} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                style={{ backgroundColor: "#C62828" }}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : <><Trash2 size={18} />Remove</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
