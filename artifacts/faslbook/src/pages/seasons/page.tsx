import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/authStore";
import {
  CropCycle, subscribeCropCycles, createCropCycle, updateCropCycle,
} from "@/lib/firebase/cropCycles";
import { Season, subscribeSeasons, createSeason } from "@/lib/firebase/seasons";
import { subscribeTransactions, sumByType, filterByCropCycle, type Transaction } from "@/lib/firebase/transactions";
import {
  ChevronLeft, Plus, X, Loader2, Sprout, Pencil, CheckCircle2,
  TrendingUp, TrendingDown, Wallet, MapPin, User, CalendarDays,
} from "lucide-react";
import { useLocation } from "wouter";

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
};
const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

export default function SeasonsPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CropCycle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Add Season inline state ──────────────────────────────────
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ name: "", startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31` });
  const [savingSeason, setSavingSeason] = useState(false);
  const [seasonError, setSeasonError] = useState("");

  const now = new Date();
  const emptyForm = {
    name: "",
    crop: "",
    seasonId: "",
    startDate: `${now.getFullYear()}-01-01`,
    endDate: `${now.getFullYear()}-12-31`,
    status: "Active" as "Active" | "Completed",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!orgId) return;
    const unsub1 = subscribeCropCycles(orgId, (data) => { setCropCycles(data); setLoading(false); });
    const unsub2 = subscribeSeasons(orgId, setSeasons);
    const unsub3 = subscribeTransactions(orgId, setTxns);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [orgId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(""); setShowForm(true); };
  const openEdit = (c: CropCycle) => {
    setEditing(c);
    setForm({
      name: c.name, crop: c.crop, seasonId: c.seasonId || "",
      startDate: c.startDate, endDate: c.endDate, status: c.status,
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Crop Cycle name is required"); return; }
    if (!form.crop.trim()) { setError("Crop is required"); return; }
    if (!form.startDate || !form.endDate) { setError("Start and end dates are required"); return; }
    if (form.startDate > form.endDate) { setError("Start date must be before end date"); return; }
    try {
      setSaving(true); setError("");
      const season = seasons.find((s) => s.id === form.seasonId);
      const payload = {
        name: form.name, crop: form.crop,
        seasonId: form.seasonId || "", seasonName: season?.name || "",
        startDate: form.startDate, endDate: form.endDate, status: form.status,
      };
      if (editing) {
        await updateCropCycle(editing.id, payload);
      } else {
        if (!orgId) return;
        await createCropCycle({ organizationId: orgId, ...payload });
      }
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError("Failed to save crop cycle.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSeason = async () => {
    if (!seasonForm.name.trim()) { setSeasonError("Season name is required"); return; }
    if (!seasonForm.startDate || !seasonForm.endDate) { setSeasonError("Start and end dates required"); return; }
    if (!orgId) return;
    try {
      setSavingSeason(true); setSeasonError("");
      const year = parseInt(seasonForm.startDate.split("-")[0]) || new Date().getFullYear();
      const newId = await createSeason({
        organizationId: orgId, name: seasonForm.name.trim(), year,
        startDate: seasonForm.startDate, endDate: seasonForm.endDate, status: "Active",
      });
      setForm((f) => ({ ...f, seasonId: newId }));
      setShowSeasonForm(false);
      setSeasonForm({ name: "", startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31` });
    } catch { setSeasonError("Failed to save season."); }
    finally { setSavingSeason(false); }
  };

  const cycleStats = (cycleId: string) => {
    const cycleTxns = filterByCropCycle(txns, cycleId);
    const income = sumByType(cycleTxns, ["income"]);
    const expense = sumByType(cycleTxns, ["expense"]);
    const profit = income - expense;
    const farmerNames = Array.from(new Set(cycleTxns.map((t) => t.farmerName).filter(Boolean)));
    const parcelIds = Array.from(new Set(cycleTxns.map((t) => t.parcelId).filter(Boolean)));
    return { income, expense, profit, farmerNames, parcelCount: parcelIds.length };
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-10 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10">
            <ChevronLeft size={24} color="white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Crop Cycles</h1>
            <p className="text-green-200 text-xs">{cropCycles.length} crop cycle{cropCycles.length !== 1 ? "s" : ""}</p>
          </div>
          {canEdit && (
            <button
              onClick={openCreate}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <Plus size={22} color="white" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : cropCycles.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <Sprout size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No crop cycles yet</p>
            <p className="text-gray-400 text-sm mb-6">Every transaction belongs to a crop cycle</p>
            {canEdit && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} /> Add First Crop Cycle
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cropCycles.map((c) => {
              const stats = cycleStats(c.id);
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                  onClick={() => navigate(`/crop-cycles/${c.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-gray-800 text-base">{c.name}</p>
                      <p className="text-gray-500 text-xs">
                        {c.crop}{c.seasonName ? ` • ${c.seasonName}` : ""}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap"
                        style={{
                          backgroundColor: c.status === "Active" ? "#E8F5E9" : "#F5F5F5",
                          color: c.status === "Active" ? "#1B5E20" : "#757575",
                        }}
                      >
                        {c.status === "Active" && <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />}
                        {c.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: "#F5F5F5" }}
                        >
                          <Pencil size={14} color="#6B7280" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                    {stats.farmerNames.length > 0 && (
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        <span>{stats.farmerNames.slice(0, 2).join(", ")}{stats.farmerNames.length > 2 ? ` +${stats.farmerNames.length - 2}` : ""}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <MapPin size={12} />
                      <span>{stats.parcelCount} parcel{stats.parcelCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#E8F5E9" }}>
                      <TrendingUp size={12} color="#1B5E20" className="mx-auto mb-1" />
                      <p className="text-[10px] text-gray-500">Income</p>
                      <p className="font-bold text-xs" style={{ color: "#1B5E20" }}>{fmt(stats.income)}</p>
                    </div>
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: "#FFEBEE" }}>
                      <TrendingDown size={12} color="#C62828" className="mx-auto mb-1" />
                      <p className="text-[10px] text-gray-500">Expenses</p>
                      <p className="font-bold text-xs" style={{ color: "#C62828" }}>{fmt(stats.expense)}</p>
                    </div>
                    <div className="rounded-xl p-2 text-center" style={{ backgroundColor: stats.profit >= 0 ? "#E3F2FD" : "#FFEBEE" }}>
                      <Wallet size={12} color={stats.profit >= 0 ? "#1565C0" : "#C62828"} className="mx-auto mb-1" />
                      <p className="text-[10px] text-gray-500">Profit</p>
                      <p className="font-bold text-xs" style={{ color: stats.profit >= 0 ? "#1565C0" : "#C62828" }}>{fmt(stats.profit)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Crop Cycle" : "New Crop Cycle"}</h2>
                <button onClick={() => setShowForm(false)}><X size={22} color="#9CA3AF" /></button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
              )}

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Crop Cycle Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Wheat 2026"
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                />
              </div>

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Crop</label>
                <input
                  type="text"
                  value={form.crop}
                  onChange={(e) => setForm({ ...form, crop: e.target.value })}
                  placeholder="e.g. Wheat"
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                />
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-gray-600 text-sm font-medium">Season (optional)</label>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { setShowSeasonForm((v) => !v); setSeasonError(""); }}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full active:scale-95 transition-transform"
                      style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}
                    >
                      <Plus size={12} /> New Season
                    </button>
                  )}
                </div>

                {showSeasonForm && (
                  <div className="border-2 rounded-2xl p-4 mb-3" style={{ borderColor: "#1B5E20", backgroundColor: "#F9FFF9" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarDays size={16} color="#1B5E20" />
                      <p className="text-sm font-bold text-gray-700">Add New Season</p>
                      <button onClick={() => setShowSeasonForm(false)} className="ml-auto">
                        <X size={16} color="#9CA3AF" />
                      </button>
                    </div>
                    {seasonError && (
                      <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-xl mb-3">{seasonError}</p>
                    )}
                    <input
                      type="text"
                      value={seasonForm.name}
                      onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                      placeholder="Season name e.g. Rabi 2026"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 outline-none text-gray-800 text-sm focus:border-green-700 mb-2"
                    />
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Start Date</p>
                        <input type="date" value={seasonForm.startDate}
                          onChange={(e) => setSeasonForm({ ...seasonForm, startDate: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 outline-none text-gray-800 text-xs focus:border-green-700" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">End Date</p>
                        <input type="date" value={seasonForm.endDate}
                          onChange={(e) => setSeasonForm({ ...seasonForm, endDate: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 outline-none text-gray-800 text-xs focus:border-green-700" />
                      </div>
                    </div>
                    <button
                      onClick={handleSaveSeason}
                      disabled={savingSeason}
                      className="w-full py-2.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}
                    >
                      {savingSeason ? <Loader2 size={16} className="animate-spin" /> : "Save Season"}
                    </button>
                  </div>
                )}

                <select
                  value={form.seasonId}
                  onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700 bg-white"
                >
                  <option value="">No season</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 outline-none text-gray-800 text-sm focus:border-green-700"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 outline-none text-gray-800 text-sm focus:border-green-700"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-gray-600 text-sm font-medium mb-3 block">Status</label>
                <div className="flex gap-3">
                  {(["Active", "Completed"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setForm({ ...form, status: st })}
                      className="flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all"
                      style={{
                        borderColor: form.status === st ? "#1B5E20" : "#E5E7EB",
                        backgroundColor: form.status === st ? "#E8F5E9" : "white",
                        color: form.status === st ? "#1B5E20" : "#6B7280",
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <p className="text-gray-400 text-xs mt-2">Multiple crop cycles can be Active at the same time.</p>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                {saving ? <Loader2 size={22} className="animate-spin" /> : editing ? "Save Changes" : "Create Crop Cycle"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
