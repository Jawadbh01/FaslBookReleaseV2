

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import { subscribeCropCycles, type CropCycle } from "@/lib/firebase/cropCycles";
import {
  Plus, X, Loader2, User,
  Building2, Users, HandCoins,
  Check, Calendar,
} from "lucide-react";

// Loan docs hold only metadata (who, type, amount taken, dates). paidAmount
// is NOT stored — Loan Due = Taken − Repaid, derived live from `transactions`
// (type loanRepayment, matched by loanId).
interface Loan {
  id: string;
  lenderName: string;
  lenderType: "person" | "relative" | "bank" | "friend" | "other";
  amount: number;
  borrowDate: any;
  dueDate: any;
  notes: string;
  organizationId: string;
  createdAt: any;
}

const lenderTypes = [
  { val: "person",   label: "Person",   icon: User,       color: "#1565C0", bg: "#E3F2FD" },
  { val: "relative", label: "Relative", icon: Users,      color: "#6A1B9A", bg: "#F3E5F5" },
  { val: "bank",     label: "Bank",     icon: Building2,  color: "#1B5E20", bg: "#E8F5E9" },
  { val: "friend",   label: "Friend",   icon: HandCoins,  color: "#E65100", bg: "#FFF3E0" },
  { val: "other",    label: "Other",    icon: HandCoins,  color: "#757575", bg: "#F5F5F5" },
];

export default function LoansPage() {
  const { organization, role } = useAuthStore();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  const [form, setForm] = useState({
    lenderName: "",
    lenderType: "person" as Loan["lenderType"],
    amount: "",
    borrowDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    cropCycleId: "",
    notes: "",
  });

  const [payCropCycleId, setPayCropCycleId] = useState("");
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [repayments, setRepayments] = useState<{ id: string; loanId: string; amount: number }[]>([]);

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "loans"), where("organizationId", "==", orgId)),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Loan))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setLoans(data);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "transactions"), where("organizationId", "==", orgId), where("type", "==", "loanRepayment")),
      (snap) => setRepayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => unsub();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeCropCycles(orgId, setCropCycles);
  }, [orgId]);

  useEffect(() => {
    if (cropCycles.length === 0) return;
    const active = cropCycles.find((c) => c.status === "Active") || cropCycles[0];
    setForm((f) => (f.cropCycleId ? f : { ...f, cropCycleId: active.id }));
    setPayCropCycleId((id) => (id ? id : active.id));
  }, [cropCycles]);

  const paidAmountFor = (loanId: string) =>
    repayments.filter((r) => r.loanId === loanId).reduce((s, r) => s + (r.amount || 0), 0);

  const totalBorrowed = loans.reduce((s, l) => s + (l.amount || 0), 0);
  const totalPaid = repayments.reduce((s, r) => s + (r.amount || 0), 0);
  const totalRemaining = totalBorrowed - totalPaid;

  const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");
  const fmtDate = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  };

  const handleSaveLoan = async () => {
    if (!form.lenderName) { setError("Lender name is required"); return; }
    if (!form.amount || isNaN(Number(form.amount))) { setError("Enter valid amount"); return; }
    if (!form.cropCycleId) { setError("Please select a crop cycle"); return; }
    const isOnline = navigator.onLine;
    try {
      setSaving(true);
      setError("");
      const amount = Number(form.amount);
      const cropCycle = cropCycles.find((c) => c.id === form.cropCycleId);
      const loanPayload = {
        lenderName: form.lenderName.trim(),
        lenderType: form.lenderType,
        amount,
        borrowDate: new Date(form.borrowDate),
        dueDate: form.dueDate ? new Date(form.dueDate) : null,
        notes: form.notes,
        organizationId: orgId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const resetForm = () => setForm({
        lenderName: "", lenderType: "person",
        amount: "", borrowDate: new Date().toISOString().split("T")[0],
        dueDate: "",
        cropCycleId: (cropCycles.find((c) => c.status === "Active") || cropCycles[0])?.id || "",
        notes: "",
      });

      if (!isOnline) {
        // Offline: truly fire-and-forget — never await any write, Firestore queues all locally
        addDoc(collection(db, "loans"), loanPayload).catch(console.error);
        addDoc(collection(db, "transactions"), {
          organizationId: orgId,
          cropCycleId: form.cropCycleId,
          cropCycleName: cropCycle?.name || "",
          seasonId: cropCycle?.seasonId || "",
          seasonName: cropCycle?.seasonName || "",
          type: "loanTaken",
          loanId: "pending", // loanId linked properly on next online sync via Firestore queue ordering
          amount,
          date: form.borrowDate,
          description: `Borrowed from ${form.lenderName}`,
          notes: form.notes,
          createdBy: auth.currentUser?.uid || "",
          createdAt: serverTimestamp(),
          syncStatus: "pending",
        }).catch(console.error);
        addDoc(collection(db, "activityLogs"), {
          organizationId: orgId,
          userId: auth.currentUser?.uid || "",
          userName: auth.currentUser?.displayName || "",
          action: "LOAN_ADDED",
          description: `Borrowed ${fmt(amount)} from ${form.lenderName}`,
          recordType: "loans",
          createdAt: serverTimestamp(),
          syncStatus: "pending",
        }).catch(console.error);
        notifyOfflineSave("Loan");
        setShowAdd(false);
        resetForm();
        setSaving(false);
        return;
      }

      // Online: await to get the real loanId for the transaction link
      const loanRef = await addDoc(collection(db, "loans"), loanPayload);
      await addDoc(collection(db, "transactions"), {
        organizationId: orgId,
        cropCycleId: form.cropCycleId,
        cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "",
        seasonName: cropCycle?.seasonName || "",
        type: "loanTaken",
        loanId: loanRef.id,
        amount,
        date: form.borrowDate,
        description: `Borrowed from ${form.lenderName}`,
        notes: form.notes,
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });
      addDoc(collection(db, "activityLogs"), {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "LOAN_ADDED",
        description: `Borrowed ${fmt(amount)} from ${form.lenderName}`,
        recordId: loanRef.id,
        recordType: "loans",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      }).catch(console.error);

      setShowAdd(false);
      resetForm();
    } catch {
      setError("Failed to save loan.");
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!payAmount || isNaN(Number(payAmount))) { setError("Enter valid amount"); return; }
    if (!payCropCycleId) { setError("Please select a crop cycle"); return; }
    if (!selectedLoan) return;
    const amount = Number(payAmount);
    const remaining = (selectedLoan.amount || 0) - paidAmountFor(selectedLoan.id);
    if (amount > remaining) { setError(`Cannot pay more than remaining: ${fmt(remaining)}`); return; }

    const isOnline = navigator.onLine;
    try {
      setSaving(true);
      setError("");
      const cropCycle = cropCycles.find((c) => c.id === payCropCycleId);
      const txPayload = {
        organizationId: orgId,
        cropCycleId: payCropCycleId,
        cropCycleName: cropCycle?.name || "",
        seasonId: cropCycle?.seasonId || "",
        seasonName: cropCycle?.seasonName || "",
        type: "loanRepayment",
        loanId: selectedLoan.id,
        amount,
        date: new Date().toISOString().split("T")[0],
        description: `Loan payment to ${selectedLoan.lenderName}`,
        notes: payNote,
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };
      const logPayload = {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        action: "LOAN_PAYMENT",
        description: `Paid ${fmt(amount)} to ${selectedLoan.lenderName}`,
        recordId: selectedLoan.id,
        recordType: "loans",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        addDoc(collection(db, "transactions"), txPayload).catch(console.error);
        addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
        notifyOfflineSave("Loan Payment");
        setShowPay(false);
        setSelectedLoan(null);
        setPayAmount(""); setPayNote("");
        setSaving(false);
        return;
      }

      await addDoc(collection(db, "transactions"), txPayload);
      addDoc(collection(db, "activityLogs"), logPayload).catch(console.error);
      setShowPay(false);
      setSelectedLoan(null);
      setPayAmount(""); setPayNote("");
    } catch {
      setError("Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  // ── Add Loan Form ──────────────────────────────────────────
  if (showAdd) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowAdd(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Loan</h1>
            <p className="text-green-200 text-xs">Record borrowed money</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          <div className="mb-5">
            <label className="text-gray-600 text-sm font-medium mb-3 block">Lender Type</label>
            <div className="grid grid-cols-3 gap-2">
              {lenderTypes.map(({ val, label, icon: Icon, color, bg }) => (
                <button
                  key={val}
                  onClick={() => setForm({ ...form, lenderType: val as any })}
                  className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all"
                  style={{
                    borderColor: form.lenderType === val ? color : "#E5E7EB",
                    backgroundColor: form.lenderType === val ? bg : "white",
                  }}
                >
                  <Icon size={20} color={form.lenderType === val ? color : "#9CA3AF"} />
                  <span className="text-xs font-medium" style={{ color: form.lenderType === val ? color : "#6B7280" }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Lender Name *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <User size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="text"
                placeholder="e.g. Hassan Bhai, Bank Alfalah"
                value={form.lenderName}
                onChange={(e) => setForm({ ...form, lenderName: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.) *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <span className="text-gray-400 mr-2 font-medium">Rs.</span>
              <input
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Borrow Date</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Calendar size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="date"
                value={form.borrowDate}
                onChange={(e) => setForm({ ...form, borrowDate: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Due Date (Optional)</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Calendar size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle *</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700 bg-white">
              <select
                value={form.cropCycleId}
                onChange={(e) => setForm({ ...form, cropCycleId: e.target.value })}
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
              <textarea
                placeholder="Purpose, conditions etc..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSaveLoan}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Loan"}
          </button>
        </div>
      </div>
    );
  }

  // ── Payment Form ───────────────────────────────────────────
  if (showPay && selectedLoan) {
    const remaining = (selectedLoan.amount || 0) - paidAmountFor(selectedLoan.id);
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowPay(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Payment</h1>
            <p className="text-green-200 text-xs">{selectedLoan.lenderName}</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}
          <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: "#FFF3E0" }}>
            <p className="text-orange-800 text-xs font-medium mb-1">Remaining Balance</p>
            <p className="text-orange-700 font-bold text-2xl">{fmt(remaining)}</p>
          </div>
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Payment Amount *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <span className="text-gray-400 mr-2 font-medium">Rs.</span>
              <input
                type="number"
                placeholder="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
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
              <textarea
                placeholder="Optional..."
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                rows={2}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>
          <button
            onClick={handlePayment}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Record Payment"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main List ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold">Loans</h1>
            <p className="text-green-200 text-xs">{loans.length} loan record{loans.length !== 1 ? "s" : ""}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <Plus size={22} color="white" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FFEBEE" }}>
              <p className="text-red-500 text-xs mb-1">Borrowed</p>
              <p className="text-red-700 font-bold text-sm">{fmt(totalBorrowed)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#E8F5E9" }}>
              <p className="text-green-600 text-xs mb-1">Paid</p>
              <p className="text-green-700 font-bold text-sm">{fmt(totalPaid)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FFF3E0" }}>
              <p className="text-orange-600 text-xs mb-1">Remaining</p>
              <p className="text-orange-700 font-bold text-sm">{fmt(totalRemaining)}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : loans.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <HandCoins size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No loans recorded</p>
            <p className="text-gray-400 text-sm mb-6">Track borrowed money here</p>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} />
                Add First Loan
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {loans.map((loan) => {
              const loanPaid = paidAmountFor(loan.id);
              const remaining = (loan.amount || 0) - loanPaid;
              const paidPct = Math.min(100, (loanPaid / (loan.amount || 1)) * 100);
              const lt = lenderTypes.find((t) => t.val === loan.lenderType) || lenderTypes[0];
              const LIcon = lt.icon;
              const isFullyPaid = remaining <= 0;

              return (
                <div key={loan.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: lt.bg }}>
                        <LIcon size={22} color={lt.color} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">{loan.lenderName}</p>
                        <p className="text-gray-500 text-xs capitalize">{lt.label} • {fmtDate(loan.borrowDate)}</p>
                      </div>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full"
                      style={{ backgroundColor: isFullyPaid ? "#E8F5E9" : "#FFEBEE" }}
                    >
                      <span className="text-xs font-bold" style={{ color: isFullyPaid ? "#1B5E20" : "#C62828" }}>
                        {isFullyPaid ? "✅ Paid" : fmt(remaining)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-xl p-2">
                      <p className="text-gray-400 text-xs mb-0.5">Borrowed</p>
                      <p className="text-gray-800 font-bold text-sm">{fmt(loan.amount || 0)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2">
                      <p className="text-gray-400 text-xs mb-0.5">Paid</p>
                      <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(loanPaid)}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Repayment Progress</span>
                      <span>{Math.round(paidPct)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${paidPct}%`, backgroundColor: isFullyPaid ? "#1B5E20" : "#E65100" }}
                      />
                    </div>
                  </div>

                  {!isFullyPaid && canEdit && (
                    <button
                      onClick={() => { setSelectedLoan(loan); setShowPay(true); }}
                      className="w-full py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}
                    >
                      <Check size={16} />
                      Add Payment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canEdit && loans.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <Plus size={26} color="white" />
        </button>
      )}
    </div>
  );
}
