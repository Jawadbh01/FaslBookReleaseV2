import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { addTransaction, updateTransaction, deleteTransaction } from "@/lib/firebase/transactions";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import {
  subscribeLabourContractors,
  subscribeHarvestRecords,
  addLabourContractor,
  updateLabourContractor,
  deleteLabourContractor,
  addHarvestRecord,
  updateHarvestRecord,
  deleteHarvestRecord,
  type LabourContractor,
  type HarvestLabourRecord,
  type HarvestPaymentType,
  type HarvestPaymentStatus,
} from "@/lib/firebase/labourContractors";
import {
  Plus, Search, X, Loader2, Trash2, Pencil,
  Users, ChevronRight, CheckCircle, Phone,
  Wheat, MapPin, Calendar, Filter,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]}`;
};

const PAYMENT_TYPE_LABELS: Record<HarvestPaymentType, string> = {
  perAcre:  "Per Acre",
  perMaund: "Per Maund",
  fixed:    "Fixed Contract",
};

const STATUS_CONFIG: Record<HarvestPaymentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending",  color: "#E65100", bg: "#FFF3E0" },
  partial: { label: "Partial",  color: "#1565C0", bg: "#E3F2FD" },
  paid:    { label: "Paid",     color: "#1B5E20", bg: "#E8F5E9" },
};

function calcTotal(paymentType: HarvestPaymentType, rate: number, quantity?: number): number {
  if (paymentType === "fixed") return rate;
  return rate * (quantity || 0);
}

function calcStatus(total: number, advance: number): HarvestPaymentStatus {
  if (advance <= 0) return "pending";
  if (advance >= total) return "paid";
  return "partial";
}

// ── Types ─────────────────────────────────────────────────────
interface Parcel { id: string; name: string; }

// ── Main Component ────────────────────────────────────────────
export default function LabourContractorsPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId   = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── Tab ────────────────────────────────────────────────────
  const [tab, setTab] = useState<"records" | "contractors">("records");

  // ── Data ───────────────────────────────────────────────────
  const [contractors, setContractors] = useState<LabourContractor[]>([]);
  const [records,     setRecords]     = useState<HarvestLabourRecord[]>([]);
  const [cropCycles,  setCropCycles]  = useState<CropCycle[]>([]);
  const [parcels,     setParcels]     = useState<Parcel[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── Filters ────────────────────────────────────────────────
  const [search,           setSearch]           = useState("");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterCropCycle,  setFilterCropCycle]  = useState("");
  const [filterParcel,     setFilterParcel]     = useState("");
  const [filterStatus,     setFilterStatus]     = useState<HarvestPaymentStatus | "">("");
  const [showFilters,      setShowFilters]       = useState(false);

  // ── Contractor form ────────────────────────────────────────
  const blankC = () => ({ name: "", phone: "", teamSize: "1", notes: "" });
  const [contractorModal, setContractorModal] = useState<"add" | "edit" | null>(null);
  const [cForm,   setCForm]   = useState(blankC());
  const [cTarget, setCTarget] = useState<LabourContractor | null>(null);
  const [cSaving, setCSaving] = useState(false);
  const [cError,  setCError]  = useState("");
  const [cDelConfirm, setCDelConfirm] = useState(false);
  const [cDeleting,   setCDeleting]   = useState(false);

  // ── Record form ────────────────────────────────────────────
  const blankR = () => ({
    contractorId: "", cropCycleId: "", parcelId: "",
    harvestDate: todayStr(),
    paymentType: "perAcre" as HarvestPaymentType,
    rate: "", quantity: "", advancePaid: "",
    notes: "",
  });
  const [recordModal,  setRecordModal]  = useState<"add" | "edit" | null>(null);
  const [rForm,    setRForm]    = useState(blankR());
  const [rTarget,  setRTarget]  = useState<HarvestLabourRecord | null>(null);
  const [rSaving,  setRSaving]  = useState(false);
  const [rError,   setRError]   = useState("");
  const [rSuccess, setRSuccess] = useState(false);
  const [rDelConfirm, setRDelConfirm] = useState(false);
  const [rDeleting,   setRDeleting]   = useState(false);

  // ── Selected record detail ─────────────────────────────────
  const [selectedRecord, setSelectedRecord] = useState<HarvestLabourRecord | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeLabourContractors(orgId, (c) => { setContractors(c); setLoading(false); }));
    unsubs.push(subscribeHarvestRecords(orgId, setRecords));
    unsubs.push(subscribeCropCycles(orgId, setCropCycles));
    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })).sort((a, b) => a.name.localeCompare(b.name)))
    ));
    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Auto-set active crop cycle ─────────────────────────────
  useEffect(() => {
    if (!cropCycles.length || rForm.cropCycleId) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    if (active) setRForm((f) => ({ ...f, cropCycleId: active.id }));
  }, [cropCycles]);

  // ── Derived total ──────────────────────────────────────────
  const rate     = Number(rForm.rate)     || 0;
  const qty      = Number(rForm.quantity) || 0;
  const advance  = Number(rForm.advancePaid) || 0;
  const total    = calcTotal(rForm.paymentType, rate, qty);
  const remaining = Math.max(0, total - advance);

  // ── Filtered records ───────────────────────────────────────
  const filteredRecords = records.filter((r) => {
    if (filterContractor && r.contractorId !== filterContractor) return false;
    if (filterCropCycle  && r.cropCycleId  !== filterCropCycle)  return false;
    if (filterParcel     && r.parcelId     !== filterParcel)     return false;
    if (filterStatus     && r.paymentStatus !== filterStatus)    return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.contractorName.toLowerCase().includes(q) ||
        r.parcelName.toLowerCase().includes(q) ||
        r.cropCycleName.toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasFilters = !!(filterContractor || filterCropCycle || filterParcel || filterStatus);

  // ── Contractor summaries ───────────────────────────────────
  const contractorStats = contractors.map((c) => {
    const cRecords = records.filter((r) => r.contractorId === c.id);
    const totalJobs    = cRecords.length;
    const totalAmount  = cRecords.reduce((s, r) => s + r.totalAmount, 0);
    const totalPaid    = cRecords.reduce((s, r) => s + r.advancePaid, 0);
    const totalPending = cRecords.reduce((s, r) => s + r.remainingBalance, 0);
    return { ...c, totalJobs, totalAmount, totalPaid, totalPending };
  });

  // ── Contractor CRUD ────────────────────────────────────────
  const openAddContractor = () => { setCForm(blankC()); setCTarget(null); setContractorModal("add"); setCError(""); };
  const openEditContractor = (c: LabourContractor) => {
    setCTarget(c);
    setCForm({ name: c.name, phone: c.phone || "", teamSize: String(c.teamSize), notes: c.notes || "" });
    setContractorModal("edit"); setCError("");
  };

  const saveContractor = async () => {
    if (!cForm.name.trim()) { setCError("Name is required"); return; }
    const teamSize = parseInt(cForm.teamSize) || 1;
    setCSaving(true); setCError("");
    try {
      if (contractorModal === "add") {
        await addLabourContractor({ name: cForm.name.trim(), phone: cForm.phone.trim() || undefined, teamSize, notes: cForm.notes.trim() || undefined, organizationId: orgId! });
      } else if (cTarget) {
        await updateLabourContractor(cTarget.id, { name: cForm.name.trim(), phone: cForm.phone.trim() || undefined, teamSize, notes: cForm.notes.trim() || undefined });
      }
      setContractorModal(null);
    } catch (e) { setCError("Failed to save. Try again."); }
    finally { setCSaving(false); }
  };

  const confirmDeleteContractor = async () => {
    if (!cTarget) return;
    setCDeleting(true);
    try { await deleteLabourContractor(cTarget.id); setContractorModal(null); setCDelConfirm(false); }
    catch (e) { setCError("Failed to delete."); }
    finally { setCDeleting(false); }
  };

  // ── Record CRUD ────────────────────────────────────────────
  const openAddRecord = () => {
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setRForm({ ...blankR(), cropCycleId: active?.id || "" });
    setRTarget(null); setRecordModal("add"); setRError(""); setRSuccess(false);
  };
  const openEditRecord = (r: HarvestLabourRecord) => {
    setRTarget(r);
    setRForm({
      contractorId: r.contractorId, cropCycleId: r.cropCycleId, parcelId: r.parcelId,
      harvestDate: r.harvestDate, paymentType: r.paymentType,
      rate: String(r.rate), quantity: r.quantity ? String(r.quantity) : "",
      advancePaid: String(r.advancePaid), notes: r.notes || "",
    });
    setRecordModal("edit"); setRError(""); setRSuccess(false);
  };

  const saveRecord = async () => {
    if (!rForm.contractorId) { setRError("Select a contractor"); return; }
    if (!rForm.cropCycleId)  { setRError("Select a crop cycle"); return; }
    if (!rForm.parcelId)     { setRError("Select a parcel"); return; }
    if (!rate)               { setRError("Enter a rate"); return; }
    if (rForm.paymentType !== "fixed" && !qty) { setRError("Enter quantity"); return; }

    const contractor  = contractors.find((c) => c.id === rForm.contractorId)!;
    const cropCycle   = cropCycles.find((c) => c.id === rForm.cropCycleId)!;
    const parcel      = parcels.find((p) => p.id === rForm.parcelId)!;
    const totalAmt    = calcTotal(rForm.paymentType, rate, qty);
    const remaining   = Math.max(0, totalAmt - advance);
    const status      = calcStatus(totalAmt, advance);

    setRSaving(true); setRError("");
    try {
      if (recordModal === "add") {
        // 1. Auto-create the linked expense transaction first so we can store its id on the record
        const txnId = await addTransaction({
          organizationId:  orgId!,
          type:            "expense",
          category:        "harvestLabour",
          categoryLabel:   "Harvest Labour",
          amount:          totalAmt,
          date:            rForm.harvestDate,
          description:     `Harvest Labour — ${contractor.name}`,
          cropCycleId:     rForm.cropCycleId,
          cropCycleName:   cropCycle.name,
          parcelId:        rForm.parcelId,
          parcelName:      parcel.name,
          contractorId:    rForm.contractorId,
          contractorName:  contractor.name,
          notes:           rForm.notes.trim() || undefined,
        }, "Harvest Labour");

        // 2. Create the harvest record, linked back to the transaction
        await addHarvestRecord({
          contractorId:   rForm.contractorId,
          contractorName: contractor.name,
          cropCycleId:    rForm.cropCycleId,
          cropCycleName:  cropCycle.name,
          parcelId:       rForm.parcelId,
          parcelName:     parcel.name,
          harvestDate:    rForm.harvestDate,
          paymentType:    rForm.paymentType,
          rate,
          quantity:       rForm.paymentType !== "fixed" ? qty : undefined,
          totalAmount:    totalAmt,
          advancePaid:    advance,
          remainingBalance: remaining,
          paymentStatus:  status,
          notes:          rForm.notes.trim() || undefined,
          transactionId:  txnId || undefined,
          organizationId: orgId!,
        });

        setRSuccess(true);
      } else if (rTarget) {
        await updateHarvestRecord(rTarget.id, {
          contractorId: rForm.contractorId, contractorName: contractor.name,
          cropCycleId:  rForm.cropCycleId,  cropCycleName:  cropCycle.name,
          parcelId:     rForm.parcelId,     parcelName:     parcel.name,
          harvestDate:  rForm.harvestDate,  paymentType:    rForm.paymentType,
          rate, quantity: rForm.paymentType !== "fixed" ? qty : undefined,
          totalAmount:  totalAmt, advancePaid: advance,
          remainingBalance: remaining, paymentStatus: status,
          notes:        rForm.notes.trim() || undefined,
        });

        // Keep the linked expense transaction in sync with the edited record
        if (rTarget.transactionId) {
          await updateTransaction(rTarget.transactionId, {
            amount:         totalAmt,
            date:           rForm.harvestDate,
            description:    `Harvest Labour — ${contractor.name}`,
            cropCycleId:    rForm.cropCycleId,
            cropCycleName:  cropCycle.name,
            parcelId:       rForm.parcelId,
            parcelName:     parcel.name,
            contractorId:   rForm.contractorId,
            contractorName: contractor.name,
            notes:          rForm.notes.trim() || undefined,
          });
        }
        setRecordModal(null);
      }
    } catch (e) { console.error(e); setRError("Failed to save. Try again."); }
    finally { setRSaving(false); }
  };

  const confirmDeleteRecord = async () => {
    if (!rTarget) return;
    setRDeleting(true);
    try {
      // Remove the linked expense transaction first so the Khata/Ledger never overstates expenses
      if (rTarget.transactionId) {
        await deleteTransaction(rTarget.transactionId).catch((e) => console.error("Failed to delete linked transaction", e));
      }
      await deleteHarvestRecord(rTarget.id);
      setRecordModal(null); setRDelConfirm(false); setSelectedRecord(null);
    }
    catch (e) { setRError("Failed to delete."); }
    finally { setRDeleting(false); }
  };

  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* ── Contractor Modal ── */}
      {contractorModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setContractorModal(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-base">
                {contractorModal === "add" ? "Add Contractor" : "Edit Contractor"}
              </h2>
              <button onClick={() => setContractorModal(null)}><X size={20} color="#9CA3AF" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {cError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-xl">{cError}</div>}

              {cDelConfirm ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#FFEBEE" }}>
                    <Trash2 size={24} color="#C62828" />
                  </div>
                  <p className="font-bold text-gray-800 mb-1">Delete {cTarget?.name}?</p>
                  <p className="text-gray-500 text-sm mb-4">All harvest records for this contractor will remain.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setCDelConfirm(false)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                    <button onClick={confirmDeleteContractor} disabled={cDeleting}
                      className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: "#C62828" }}>
                      {cDeleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Name *</label>
                    <input value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="Contractor name"
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Phone (Optional)</label>
                    <input value={cForm.phone} onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} placeholder="03XX-XXXXXXX"
                      type="tel" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Team Size (Workers)</label>
                    <input value={cForm.teamSize} onChange={(e) => setCForm({ ...cForm, teamSize: e.target.value })} placeholder="e.g. 12"
                      type="number" inputMode="numeric" min="1"
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Notes (Optional)</label>
                    <textarea value={cForm.notes} onChange={(e) => setCForm({ ...cForm, notes: e.target.value })} rows={2}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    {contractorModal === "edit" && (
                      <button onClick={() => setCDelConfirm(true)}
                        className="py-3 px-4 rounded-2xl border-2 border-red-200 text-red-600 font-bold active:scale-95 transition-transform flex items-center justify-center">
                        <Trash2 size={18} />
                      </button>
                    )}
                    <button onClick={saveContractor} disabled={cSaving}
                      className="flex-1 py-3.5 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}>
                      {cSaving ? <Loader2 size={20} className="animate-spin" /> : "Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Record Detail Modal ── */}
      {selectedRecord && !recordModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setSelectedRecord(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-800 text-base">Harvest Record</h2>
                <p className="text-gray-400 text-xs">{selectedRecord.contractorName}</p>
              </div>
              <button onClick={() => setSelectedRecord(null)}><X size={20} color="#9CA3AF" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-0">
              {[
                ["Contractor",    selectedRecord.contractorName],
                ["Parcel",        selectedRecord.parcelName],
                ["Crop Cycle",    selectedRecord.cropCycleName],
                ["Harvest Date",  fmtDate(selectedRecord.harvestDate)],
                ["Payment Type",  PAYMENT_TYPE_LABELS[selectedRecord.paymentType]],
                ["Rate",          fmt(selectedRecord.rate) + (selectedRecord.paymentType === "perAcre" ? "/Acre" : selectedRecord.paymentType === "perMaund" ? "/Maund" : "")],
                selectedRecord.paymentType !== "fixed" ? ["Quantity", String(selectedRecord.quantity) + (selectedRecord.paymentType === "perAcre" ? " Acres" : " Maunds")] : null,
                ["Total Amount",  fmt(selectedRecord.totalAmount)],
                ["Advance Paid",  fmt(selectedRecord.advancePaid)],
                ["Remaining",     fmt(selectedRecord.remainingBalance)],
              ].filter((row): row is [string, string] => row !== null).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500 text-sm">{label}</span>
                  <span className="text-gray-800 text-sm font-semibold">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2.5">
                <span className="text-gray-500 text-sm">Status</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: STATUS_CONFIG[selectedRecord.paymentStatus].bg, color: STATUS_CONFIG[selectedRecord.paymentStatus].color }}>
                  {STATUS_CONFIG[selectedRecord.paymentStatus].label}
                </span>
              </div>
              {selectedRecord.notes && (
                <div className="py-2">
                  <p className="text-gray-400 text-xs mb-1">Notes</p>
                  <p className="text-gray-700 text-sm">{selectedRecord.notes}</p>
                </div>
              )}
              {canEdit && (
                <div className="flex gap-3 pt-4">
                  <button onClick={() => { openEditRecord(selectedRecord); setSelectedRecord(null); }}
                    className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    <Pencil size={16} /> Edit
                  </button>
                  <button onClick={() => navigate(`/labour-contractors/${selectedRecord.contractorId}`)}
                    className="py-3.5 px-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1">
                    Profile <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Record Add/Edit Modal ── */}
      {recordModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setRecordModal(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-base">
                {recordModal === "add" ? "Add Harvest Record" : "Edit Harvest Record"}
              </h2>
              <button onClick={() => setRecordModal(null)}><X size={20} color="#9CA3AF" /></button>
            </div>

            {rSuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                  <CheckCircle size={44} color="#1B5E20" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">Record Saved!</h2>
                <p className="text-gray-500 text-sm mb-2">Expense transaction created automatically.</p>
                <p className="text-2xl font-bold mb-8" style={{ color: "#C62828" }}>−{fmt(total)}</p>
                <button onClick={() => setRecordModal(null)}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base"
                  style={{ backgroundColor: "#1B5E20" }}>
                  Done
                </button>
              </div>
            ) : rDelConfirm ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#FFEBEE" }}>
                  <Trash2 size={24} color="#C62828" />
                </div>
                <p className="font-bold text-gray-800 mb-1">Delete this record?</p>
                <p className="text-gray-500 text-sm mb-6">This will also remove the linked expense transaction from your Khata.</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setRDelConfirm(false)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                  <button onClick={confirmDeleteRecord} disabled={rDeleting}
                    className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: "#C62828" }}>
                    {rDeleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                {rError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-xl">{rError}</div>}

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Contractor *</label>
                  <select value={rForm.contractorId} onChange={(e) => setRForm({ ...rForm, contractorId: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base bg-white focus:border-green-700">
                    <option value="">— Select Contractor —</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.teamSize} workers)</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Crop Cycle *</label>
                  <select value={rForm.cropCycleId} onChange={(e) => setRForm({ ...rForm, cropCycleId: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base bg-white focus:border-green-700">
                    <option value="">— Select Crop Cycle —</option>
                    {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name} {c.status === "Active" ? "✓" : ""}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Parcel *</label>
                  <select value={rForm.parcelId} onChange={(e) => setRForm({ ...rForm, parcelId: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base bg-white focus:border-green-700">
                    <option value="">— Select Parcel —</option>
                    {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Harvest Date</label>
                  <input type="date" value={rForm.harvestDate} onChange={(e) => setRForm({ ...rForm, harvestDate: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                </div>

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Payment Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["perAcre", "perMaund", "fixed"] as HarvestPaymentType[]).map((pt) => (
                      <button key={pt} onClick={() => setRForm({ ...rForm, paymentType: pt })}
                        className="py-2.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95"
                        style={{
                          borderColor: rForm.paymentType === pt ? "#1B5E20" : "#E5E7EB",
                          backgroundColor: rForm.paymentType === pt ? "#E8F5E9" : "white",
                          color: rForm.paymentType === pt ? "#1B5E20" : "#6B7280",
                        }}>
                        {PAYMENT_TYPE_LABELS[pt]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`grid gap-3 ${rForm.paymentType !== "fixed" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div>
                    <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
                      {rForm.paymentType === "fixed" ? "Fixed Amount (Rs.)" : "Rate (Rs.)"}
                    </label>
                    <input type="number" inputMode="numeric" value={rForm.rate}
                      onChange={(e) => setRForm({ ...rForm, rate: e.target.value })} placeholder="e.g. 5000"
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  {rForm.paymentType !== "fixed" && (
                    <div>
                      <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
                        {rForm.paymentType === "perAcre" ? "Acres" : "Maunds"}
                      </label>
                      <input type="number" inputMode="decimal" value={rForm.quantity}
                        onChange={(e) => setRForm({ ...rForm, quantity: e.target.value })} placeholder="e.g. 10"
                        className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                    </div>
                  )}
                </div>

                {/* Auto-calculated total */}
                {total > 0 && (
                  <div className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <span className="text-gray-500 text-sm">Total Amount</span>
                    <span className="font-bold text-lg" style={{ color: "#C62828" }}>{fmt(total)}</span>
                  </div>
                )}

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Advance Paid (Rs.)</label>
                  <input type="number" inputMode="numeric" value={rForm.advancePaid}
                    onChange={(e) => setRForm({ ...rForm, advancePaid: e.target.value })} placeholder="0"
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                </div>

                {/* Remaining balance */}
                {total > 0 && (
                  <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
                    style={{ backgroundColor: remaining > 0 ? "#FFF3E0" : "#E8F5E9" }}>
                    <span className="text-sm font-semibold" style={{ color: remaining > 0 ? "#E65100" : "#1B5E20" }}>
                      {remaining > 0 ? "Remaining Balance" : "✓ Fully Paid"}
                    </span>
                    {remaining > 0 && <span className="font-bold text-lg" style={{ color: "#E65100" }}>{fmt(remaining)}</span>}
                  </div>
                )}

                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Notes (Optional)</label>
                  <textarea value={rForm.notes} onChange={(e) => setRForm({ ...rForm, notes: e.target.value })} rows={2}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                </div>

                <div className="flex gap-3 pt-1 pb-2">
                  {recordModal === "edit" && (
                    <button onClick={() => setRDelConfirm(true)}
                      className="py-3.5 px-4 rounded-2xl border-2 border-red-200 text-red-600 font-bold active:scale-95 transition-transform flex items-center justify-center">
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button onClick={saveRecord} disabled={rSaving}
                    className="flex-1 py-3.5 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    {rSaving ? <Loader2 size={20} className="animate-spin" /> : recordModal === "add" ? "Save & Create Expense" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-0" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-2xl font-bold">Labour Contractors</h1>
            <p className="text-green-200 text-xs mt-0.5">Harvest teams & payment records</p>
          </div>
          {canEdit && (
            <button onClick={tab === "contractors" ? openAddContractor : openAddRecord}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <Plus size={22} color="white" />
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex">
          {([
            { key: "records" as const,     label: "Harvest Records" },
            { key: "contractors" as const, label: "Contractors" },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-3 text-sm font-semibold transition-all"
              style={{
                color: tab === key ? "white" : "rgba(255,255,255,0.55)",
                borderBottom: tab === key ? "3px solid white" : "3px solid transparent",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">

        {/* ── Records Tab ── */}
        {tab === "records" && (
          <>
            {/* Search */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl px-3 py-2.5 border border-gray-200">
                <Search size={16} color="#9CA3AF" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contractor, parcel…"
                  className="flex-1 outline-none text-gray-800 text-sm bg-transparent" />
                {search && <button onClick={() => setSearch("")}><X size={14} color="#9CA3AF" /></button>}
              </div>
              <button onClick={() => setShowFilters((v) => !v)}
                className="w-11 h-11 rounded-2xl flex items-center justify-center border-2 transition-all"
                style={{
                  borderColor: hasFilters ? "#1B5E20" : "#E5E7EB",
                  backgroundColor: hasFilters ? "#E8F5E9" : "white",
                }}>
                <Filter size={18} color={hasFilters ? "#1B5E20" : "#9CA3AF"} />
              </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="bg-white rounded-2xl p-4 mb-3 space-y-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-gray-700 text-sm">Filters</p>
                  {hasFilters && (
                    <button onClick={() => { setFilterContractor(""); setFilterCropCycle(""); setFilterParcel(""); setFilterStatus(""); }}
                      className="text-xs font-semibold" style={{ color: "#1B5E20" }}>Clear All</button>
                  )}
                </div>
                <select value={filterContractor} onChange={(e) => setFilterContractor(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-700">
                  <option value="">All Contractors</option>
                  {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={filterCropCycle} onChange={(e) => setFilterCropCycle(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-700">
                  <option value="">All Crop Cycles</option>
                  {cropCycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={filterParcel} onChange={(e) => setFilterParcel(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-700">
                  <option value="">All Parcels</option>
                  {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-700">
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            )}

            {/* Summary bar */}
            {filteredRecords.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Total",   value: filteredRecords.reduce((s, r) => s + r.totalAmount, 0),    color: "#374151", bg: "#F9FAFB" },
                  { label: "Paid",    value: filteredRecords.reduce((s, r) => s + r.advancePaid, 0),    color: "#1B5E20", bg: "#E8F5E9" },
                  { label: "Pending", value: filteredRecords.reduce((s, r) => s + r.remainingBalance, 0), color: "#E65100", bg: "#FFF3E0" },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: bg }}>
                    <p className="text-[10px] font-semibold mb-0.5" style={{ color }}>{label}</p>
                    <p className="text-xs font-bold leading-tight" style={{ color }}>Rs. {Math.round(value).toLocaleString("en-PK")}</p>
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin" style={{ color: "#1B5E20" }} /></div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🌾</p>
                <p className="text-gray-500 text-sm">{hasFilters || search ? "No records match your filters" : "No harvest records yet"}</p>
                {canEdit && !hasFilters && !search && (
                  <button onClick={openAddRecord} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#1B5E20" }}>
                    Add First Record
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRecords.map((r) => {
                  const sc = STATUS_CONFIG[r.paymentStatus];
                  return (
                    <button key={r.id} onClick={() => setSelectedRecord(r)}
                      className="w-full bg-white rounded-2xl px-4 py-3.5 text-left shadow-sm active:scale-[0.98] transition-transform">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: "#FFF8E1" }}>
                          <Wheat size={18} color="#F9A825" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-gray-800 font-semibold text-sm leading-tight truncate">{r.contractorName}</p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: sc.bg, color: sc.color }}>
                              {sc.label}
                            </span>
                          </div>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {r.parcelName} · {r.cropCycleName} · {fmtDate(r.harvestDate)}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-xs text-gray-500">{PAYMENT_TYPE_LABELS[r.paymentType]}</p>
                            <div className="text-right">
                              <p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmt(r.totalAmount)}</p>
                              {r.remainingBalance > 0 && (
                                <p className="text-xs" style={{ color: "#E65100" }}>Due: {fmt(r.remainingBalance)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Contractors Tab ── */}
        {tab === "contractors" && (
          <>
            {contractors.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">👷</p>
                <p className="text-gray-500 text-sm">No contractors yet</p>
                {canEdit && (
                  <button onClick={openAddContractor} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#1B5E20" }}>
                    Add First Contractor
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {contractorStats.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                        <Users size={20} color="#1B5E20" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-gray-800 font-bold text-base leading-tight truncate">{c.name}</p>
                          {canEdit && (
                            <button onClick={() => openEditContractor(c)}
                              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#F5F5F5" }}>
                              <Pencil size={14} color="#6B7280" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-gray-400 text-xs flex items-center gap-1">
                            <Users size={11} /> {c.teamSize} workers
                          </span>
                          {c.phone && (
                            <span className="text-gray-400 text-xs flex items-center gap-1">
                              <Phone size={11} /> {c.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {c.totalJobs > 0 && (
                      <>
                        <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2">
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Total Jobs</p>
                            <p className="text-gray-800 font-bold text-sm">{c.totalJobs}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Total Paid</p>
                            <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>Rs. {Math.round(c.totalPaid).toLocaleString("en-PK")}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Pending</p>
                            <p className="font-bold text-sm" style={{ color: c.totalPending > 0 ? "#E65100" : "#1B5E20" }}>
                              Rs. {Math.round(c.totalPending).toLocaleString("en-PK")}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => navigate(`/labour-contractors/${c.id}`)}
                          className="mt-3 w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                          View Profile <ChevronRight size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {canEdit && (
        <button onClick={tab === "contractors" ? openAddContractor : openAddRecord}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-40"
          style={{ backgroundColor: "#1B5E20" }}>
          <Plus size={26} color="white" />
        </button>
      )}
    </div>
  );
}
