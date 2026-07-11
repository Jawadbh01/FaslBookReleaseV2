import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRoute, useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";
import {
  subscribeLabourContractors,
  subscribeHarvestRecords,
  updateLabourContractor,
  deleteLabourContractor,
  type LabourContractor,
  type HarvestLabourRecord,
  type HarvestPaymentStatus,
} from "@/lib/firebase/labourContractors";
import {
  ArrowLeft, Users, Phone, Wheat, Loader2,
  CheckCircle, X, Trash2, Pencil,
  TrendingUp, TrendingDown, Wallet, Briefcase,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────
const fmt    = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  perAcre:  "Per Acre",
  perMaund: "Per Maund",
  fixed:    "Fixed Contract",
};

const STATUS_CONFIG: Record<HarvestPaymentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending",  color: "#E65100", bg: "#FFF3E0" },
  partial: { label: "Partial",  color: "#1565C0", bg: "#E3F2FD" },
  paid:    { label: "Paid",     color: "#1B5E20", bg: "#E8F5E9" },
};

export default function LabourContractorProfilePage() {
  const [, params] = useRoute("/labour-contractors/:id");
  const [, navigate] = useLocation();
  const { organization, role } = useAuthStore();
  const orgId   = organization?.id;
  const canEdit = role === "landlord" || role === "manager";
  const contractorId = params?.id ?? "";

  const [allContractors, setAllContractors] = useState<LabourContractor[]>([]);
  const [allRecords,     setAllRecords]     = useState<HarvestLabourRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Edit modal ─────────────────────────────────────────────
  const [editOpen,   setEditOpen]   = useState(false);
  const [editForm,   setEditForm]   = useState({ name: "", phone: "", teamSize: "1", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved,  setEditSaved]  = useState(false);
  const [editError,  setEditError]  = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const unsubs = [
      subscribeLabourContractors(orgId, (c) => { setAllContractors(c); setLoading(false); }),
      subscribeHarvestRecords(orgId, setAllRecords),
    ];
    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  const contractor = allContractors.find((c) => c.id === contractorId);
  const records    = allRecords.filter((r) => r.contractorId === contractorId)
    .sort((a, b) => (b.harvestDate > a.harvestDate ? 1 : -1));

  const totalJobs    = records.length;
  const totalAmount  = records.reduce((s, r) => s + r.totalAmount, 0);
  const totalPaid    = records.reduce((s, r) => s + r.advancePaid, 0);
  const totalPending = records.reduce((s, r) => s + r.remainingBalance, 0);
  const currentBalance = totalPending;

  const openEdit = () => {
    if (!contractor) return;
    setEditForm({ name: contractor.name, phone: contractor.phone || "", teamSize: String(contractor.teamSize), notes: contractor.notes || "" });
    setEditSaved(false); setEditError(""); setDelConfirm(false);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("Name required"); return; }
    setEditSaving(true); setEditError("");
    try {
      await updateLabourContractor(contractorId, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
        teamSize: parseInt(editForm.teamSize) || 1,
        notes: editForm.notes.trim() || undefined,
      });
      setEditSaved(true);
    } catch { setEditError("Failed to save."); }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteLabourContractor(contractorId);
      navigate("/labour-contractors");
    } catch { setEditError("Failed to delete."); }
    finally { setDeleting(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={32} className="animate-spin" style={{ color: "#1B5E20" }} />
    </div>
  );

  if (!contractor) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl mb-3">🔍</p>
      <p className="text-gray-500 text-sm">Contractor not found</p>
      <button onClick={() => navigate("/labour-contractors")} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#1B5E20" }}>Go Back</button>
    </div>
  );

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* ── Edit Modal ── */}
      {editOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setEditOpen(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-base">Edit Contractor</h2>
              <button onClick={() => setEditOpen(false)}><X size={20} color="#9CA3AF" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {editError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-xl">{editError}</div>}

              {editSaved ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <CheckCircle size={36} color="#1B5E20" />
                  </div>
                  <p className="text-gray-800 font-bold text-base">Changes saved!</p>
                  <button onClick={() => setEditOpen(false)} className="mt-5 w-full py-3.5 rounded-2xl text-white font-bold" style={{ backgroundColor: "#1B5E20" }}>Done</button>
                </div>
              ) : delConfirm ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#FFEBEE" }}>
                    <Trash2 size={24} color="#C62828" />
                  </div>
                  <p className="font-bold text-gray-800 mb-1">Delete {contractor.name}?</p>
                  <p className="text-gray-500 text-sm mb-4">This cannot be undone. Harvest records will remain.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setDelConfirm(false)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                    <button onClick={confirmDelete} disabled={deleting}
                      className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: "#C62828" }}>
                      {deleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Name</label>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Phone</label>
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} type="tel"
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Team Size</label>
                    <input value={editForm.teamSize} onChange={(e) => setEditForm({ ...editForm, teamSize: e.target.value })} type="number" min="1"
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Notes</label>
                    <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setDelConfirm(true)}
                      className="py-3.5 px-4 rounded-2xl border-2 border-red-200 text-red-600 font-bold active:scale-95 transition-transform flex items-center justify-center">
                      <Trash2 size={18} />
                    </button>
                    <button onClick={saveEdit} disabled={editSaving}
                      className="flex-1 py-3.5 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}>
                      {editSaving ? <Loader2 size={20} className="animate-spin" /> : "Save Changes"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/labour-contractors")} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <ArrowLeft size={20} color="white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold leading-tight">{contractor.name}</h1>
            <p className="text-green-200 text-xs">Labour Contractor</p>
          </div>
          {canEdit && (
            <button onClick={openEdit} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <Pencil size={17} color="white" />
            </button>
          )}
        </div>

        {/* Contractor info chips */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
            <Users size={13} color="white" />
            <span className="text-white text-xs font-medium">{contractor.teamSize} workers</span>
          </div>
          {contractor.phone && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <Phone size={13} color="white" />
              <span className="text-white text-xs font-medium">{contractor.phone}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: "Total Jobs",     value: String(totalJobs),      icon: Briefcase,   color: "#1565C0", bg: "#E3F2FD", isNum: false },
            { label: "Current Balance",value: fmt(currentBalance),    icon: Wallet,      color: currentBalance > 0 ? "#E65100" : "#1B5E20", bg: currentBalance > 0 ? "#FFF3E0" : "#E8F5E9", isNum: false },
            { label: "Total Paid",     value: fmt(totalPaid),         icon: TrendingDown, color: "#1B5E20", bg: "#E8F5E9", isNum: false },
            { label: "Total Pending",  value: fmt(totalPending),      icon: TrendingUp,  color: totalPending > 0 ? "#E65100" : "#1B5E20", bg: totalPending > 0 ? "#FFF3E0" : "#E8F5E9", isNum: false },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-gray-500 text-xs font-medium">{label}</p>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: bg }}>
                  <Icon size={14} color={color} />
                </div>
              </div>
              <p className="font-bold text-base leading-tight" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Notes ── */}
        {contractor.notes && (
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-4">
            <p className="text-gray-400 text-xs mb-1">Notes</p>
            <p className="text-gray-700 text-sm">{contractor.notes}</p>
          </div>
        )}

        {/* ── Harvest History ── */}
        <p className="font-bold text-gray-800 text-sm mb-3 mt-1">
          Harvest History ({totalJobs})
        </p>

        {records.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
            <p className="text-3xl mb-2">🌾</p>
            <p className="text-gray-500 text-sm">No harvest records yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const sc = STATUS_CONFIG[r.paymentStatus];
              return (
                <div key={r.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFF8E1" }}>
                      <Wheat size={18} color="#F9A825" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-800 text-sm leading-tight">{r.parcelName}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">{r.cropCycleName} · {fmtDate(r.harvestDate)}</p>
                      <p className="text-gray-400 text-xs">{PAYMENT_TYPE_LABELS[r.paymentType]}{r.quantity ? ` · ${r.quantity} ${r.paymentType === "perAcre" ? "Acres" : "Maunds"}` : ""}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="text-xs text-gray-400">Paid</p>
                          <p className="text-sm font-bold" style={{ color: "#1B5E20" }}>{fmt(r.advancePaid)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Total</p>
                          <p className="text-sm font-bold" style={{ color: "#C62828" }}>{fmt(r.totalAmount)}</p>
                        </div>
                      </div>
                      {r.remainingBalance > 0 && (
                        <div className="mt-2 px-3 py-1.5 rounded-xl text-center" style={{ backgroundColor: "#FFF3E0" }}>
                          <p className="text-xs font-bold" style={{ color: "#E65100" }}>Due: {fmt(r.remainingBalance)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {r.notes && <p className="text-gray-400 text-xs mt-2 ml-13 pl-13">{r.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
