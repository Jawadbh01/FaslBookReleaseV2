

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";
import {
  subscribeLabourContractors, addLabourContractor, updateLabourContractor,
  type LabourContractor,
} from "@/lib/firebase/labourContractors";
import {
  subscribeCustomProfiles, addCustomProfile, updateCustomProfile,
  type CustomProfile,
} from "@/lib/firebase/customProfiles";
import {
  Plus, Search, X, Loader2, Trash2, Pencil, ChevronRight,
  Wheat, Handshake, HardHat, Tag, Phone, MapPin, BookOpen,
  AlertTriangle, EyeOff, User,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// Profiles — a single place to manage every person/business the farm
// deals with (Farmer, Dealer, Labour Contractor, Custom). Financial
// transactions themselves live in the Khata Hub; a Profile just owns the
// identity + links out to its Khata.
// ═══════════════════════════════════════════════════════════════

export type ProfileType = "farmer" | "dealer" | "labourContractor" | "custom";

export interface UnifiedProfile {
  id: string;
  type: ProfileType;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  // type-specific
  farmName?: string;
  businessName?: string;
  productsServices?: string;
  teamSize?: number;
  customLabel?: string;
}

export const TYPE_CONFIG: Record<ProfileType, { label: string; icon: any; color: string; bg: string }> = {
  farmer:          { label: "Farmer",            icon: Wheat,     color: "#1B5E20", bg: "#E8F5E9" },
  dealer:          { label: "Dealer",            icon: Handshake, color: "#1565C0", bg: "#E3F2FD" },
  labourContractor:{ label: "Labour Contractor", icon: HardHat,   color: "#6A1B9A", bg: "#F3E5F5" },
  custom:          { label: "Custom",            icon: Tag,       color: "#E65100", bg: "#FFF3E0" },
};

interface RawFarmer {
  id: string; name: string; phone?: string; address?: string; farmName?: string;
  notes?: string; isActive?: boolean; workerType: string; organizationId: string;
}
interface RawDealer {
  id: string; name: string; phone?: string; address?: string; businessName?: string;
  productsServices?: string; notes?: string; isActive?: boolean; organizationId: string;
}

function initials(name: string) {
  return (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

export default function ProfilesPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [farmers, setFarmers]         = useState<RawFarmer[]>([]);
  const [dealers, setDealers]         = useState<RawDealer[]>([]);
  const [contractors, setContractors] = useState<LabourContractor[]>([]);
  const [customs, setCustoms]         = useState<CustomProfile[]>([]);
  const [loading, setLoading]         = useState(true);

  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<ProfileType | "all">("all");

  // ── Add / Edit modal ────────────────────────────────────────
  const [modal, setModal] = useState<"typePicker" | "form" | null>(null);
  const [formType, setFormType] = useState<ProfileType>("farmer");
  const [editTarget, setEditTarget] = useState<UnifiedProfile | null>(null);
  const [form, setForm] = useState({
    name: "", phone: "", address: "", notes: "",
    farmName: "", businessName: "", productsServices: "", teamSize: "", customLabel: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // ── Delete / deactivate confirm ─────────────────────────────
  const [delTarget, setDelTarget]   = useState<UnifiedProfile | null>(null);
  const [delChecking, setDelChecking] = useState(false);
  const [delBlocked, setDelBlocked] = useState(false);
  const [delBusy, setDelBusy]       = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "workers"), where("organizationId", "==", orgId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setFarmers(all.filter((w: any) => w.workerType === "farmer"));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => setDealers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawDealer)))
    ));

    unsubs.push(subscribeLabourContractors(orgId, setContractors));
    unsubs.push(subscribeCustomProfiles(orgId, setCustoms));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Unified list ────────────────────────────────────────────
  const profiles: UnifiedProfile[] = useMemo(() => {
    const f: UnifiedProfile[] = farmers.map((f) => ({
      id: f.id, type: "farmer", name: f.name, phone: f.phone, address: f.address,
      notes: f.notes, farmName: f.farmName, isActive: f.isActive !== false,
    }));
    const d: UnifiedProfile[] = dealers.map((d) => ({
      id: d.id, type: "dealer", name: d.name, phone: d.phone, address: d.address,
      notes: d.notes, businessName: d.businessName, productsServices: d.productsServices,
      isActive: d.isActive !== false,
    }));
    const l: UnifiedProfile[] = contractors.map((c) => ({
      id: c.id, type: "labourContractor", name: c.name, phone: c.phone, address: c.address,
      notes: c.notes, teamSize: c.teamSize, isActive: c.isActive !== false,
    }));
    const c: UnifiedProfile[] = customs.map((c) => ({
      id: c.id, type: "custom", name: c.name, phone: c.phone, address: c.address,
      notes: c.notes, customLabel: c.customLabel, isActive: c.isActive !== false,
    }));
    return [...f, ...d, ...l, ...c].sort((a, b) => a.name.localeCompare(b.name));
  }, [farmers, dealers, contractors, customs]);

  const filtered = profiles.filter((p) => {
    if (filter !== "all" && p.type !== filter) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !(p.phone || "").includes(s)) return false;
    }
    return true;
  });

  const counts = useMemo(() => ({
    all: profiles.length,
    farmer: profiles.filter((p) => p.type === "farmer").length,
    dealer: profiles.filter((p) => p.type === "dealer").length,
    labourContractor: profiles.filter((p) => p.type === "labourContractor").length,
    custom: profiles.filter((p) => p.type === "custom").length,
  }), [profiles]);

  // ── Modal helpers ───────────────────────────────────────────
  const resetForm = () => setForm({
    name: "", phone: "", address: "", notes: "",
    farmName: "", businessName: "", productsServices: "", teamSize: "", customLabel: "",
  });

  const openAdd = () => { resetForm(); setEditTarget(null); setError(""); setModal("typePicker"); };
  const pickType = (t: ProfileType) => { setFormType(t); setModal("form"); };

  const openEdit = (p: UnifiedProfile) => {
    setEditTarget(p);
    setFormType(p.type);
    setForm({
      name: p.name, phone: p.phone || "", address: p.address || "", notes: p.notes || "",
      farmName: p.farmName || "", businessName: p.businessName || "",
      productsServices: p.productsServices || "", teamSize: p.teamSize ? String(p.teamSize) : "",
      customLabel: p.customLabel || "",
    });
    setError("");
    setModal("form");
  };

  const closeModal = () => { setModal(null); setEditTarget(null); setError(""); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (formType === "dealer" && !form.businessName.trim() && !form.name.trim()) { setError("Business name is required"); return; }
    if (formType === "custom" && !form.customLabel.trim()) { setError("Custom label is required"); return; }
    if (formType === "labourContractor" && !form.teamSize) { setError("Team size is required"); return; }

    setSaving(true); setError("");
    try {
      if (formType === "farmer") {
        const payload = {
          name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(),
          farmName: form.farmName.trim() || null, notes: form.notes.trim(),
          workerType: "farmer", status: "active", organizationId: orgId, syncStatus: "synced",
        };
        if (editTarget) await updateDoc(doc(db, "workers", editTarget.id), { ...payload, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, "workers"), { ...payload, isActive: true, createdAt: serverTimestamp() });
      } else if (formType === "dealer") {
        const payload = {
          name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(),
          businessName: form.businessName.trim() || form.name.trim(),
          productsServices: form.productsServices.trim() || null,
          notes: form.notes.trim(), organizationId: orgId, syncStatus: "synced",
        };
        if (editTarget) await updateDoc(doc(db, "dealers", editTarget.id), { ...payload, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, "dealers"), { ...payload, isActive: true, createdAt: serverTimestamp() });
      } else if (formType === "labourContractor") {
        const payload = {
          name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(),
          teamSize: Number(form.teamSize) || 0, notes: form.notes.trim(),
          organizationId: orgId!,
        };
        if (editTarget) await updateLabourContractor(editTarget.id, payload);
        else await addLabourContractor(payload as any);
      } else {
        const payload = {
          name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(),
          customLabel: form.customLabel.trim(), notes: form.notes.trim(),
          organizationId: orgId!,
        };
        if (editTarget) await updateCustomProfile(editTarget.id, payload);
        else await addCustomProfile(payload as any);
      }
      closeModal();
    } catch (e) {
      console.error(e);
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete / deactivate ─────────────────────────────────────
  const collectionFor = (t: ProfileType) =>
    t === "farmer" ? "workers" : t === "dealer" ? "dealers" : t === "labourContractor" ? "labourContractors" : "customProfiles";
  const linkFieldFor = (t: ProfileType) =>
    t === "farmer" ? "farmerId" : t === "dealer" ? "dealerId" : t === "labourContractor" ? "contractorId" : "customProfileId";

  const openDelete = async (p: UnifiedProfile) => {
    setDelTarget(p); setDelBlocked(false); setDelChecking(true);
    try {
      const field = linkFieldFor(p.type);
      const snap = await getDocs(query(
        collection(db, "transactions"),
        where("organizationId", "==", orgId),
        where(field, "==", p.id),
      ));
      let hasTxns = !snap.empty;
      if (!hasTxns && p.type === "labourContractor") {
        const recSnap = await getDocs(query(
          collection(db, "harvestLabourRecords"),
          where("organizationId", "==", orgId),
          where("contractorId", "==", p.id),
        ));
        hasTxns = !recSnap.empty;
      }
      setDelBlocked(hasTxns);
    } catch (e) {
      console.error(e);
      setDelBlocked(true); // fail safe — don't allow a hard delete if we can't confirm
    } finally {
      setDelChecking(false);
    }
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await deleteDoc(doc(db, collectionFor(delTarget.type), delTarget.id));
      setDelTarget(null);
    } catch (e) { console.error(e); }
    finally { setDelBusy(false); }
  };

  const markInactive = async () => {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await updateDoc(doc(db, collectionFor(delTarget.type), delTarget.id), { isActive: false });
      setDelTarget(null);
    } catch (e) { console.error(e); }
    finally { setDelBusy(false); }
  };

  const openKhata = (p: UnifiedProfile) => navigate(`/khata?view=${p.type}&id=${p.id}`);
  const openDetail = (p: UnifiedProfile) => navigate(`/profiles/${p.type}/${p.id}`);

  const filterChips: { key: ProfileType | "all"; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "farmer", label: `Farmers (${counts.farmer})` },
    { key: "dealer", label: `Dealers (${counts.dealer})` },
    { key: "labourContractor", label: `Contractors (${counts.labourContractor})` },
    { key: "custom", label: `Custom (${counts.custom})` },
  ];

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <User size={20} color="white" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold leading-tight">Profiles</h1>
              <p className="text-green-200 text-xs">People &amp; businesses</p>
            </div>
          </div>
          {canEdit && (
            <button onClick={openAdd}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <Plus size={22} color="white" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
          <Search size={18} color="rgba(255,255,255,0.8)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="flex-1 bg-transparent outline-none text-white placeholder-green-100 text-sm"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-4 pt-4 flex gap-2 overflow-x-auto no-scrollbar">
        {filterChips.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className="px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
            style={{
              backgroundColor: filter === c.key ? "#1B5E20" : "white",
              color: filter === c.key ? "white" : "#6B7280",
              border: filter === c.key ? "none" : "1px solid #E5E7EB",
            }}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <User size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No profiles found</p>
            <p className="text-gray-400 text-sm mb-6">Add a Farmer, Dealer, Labour Contractor, or Custom profile</p>
            {canEdit && (
              <button onClick={openAdd}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}>
                <Plus size={18} /> Add Profile
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => {
              const cfg = TYPE_CONFIG[p.type];
              const Icon = cfg.icon;
              const subtitle = p.type === "dealer" ? (p.businessName || p.productsServices)
                : p.type === "farmer" ? p.farmName
                : p.type === "labourContractor" ? `${p.teamSize ?? 0} workers`
                : p.customLabel;
              return (
                <div key={`${p.type}-${p.id}`} className="bg-white rounded-2xl p-4 shadow-sm"
                  style={{ opacity: p.isActive ? 1 : 0.55 }}>
                  <div className="flex items-start justify-between mb-3">
                    <button onClick={() => openDetail(p)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative" style={{ backgroundColor: cfg.bg }}>
                        <Icon size={20} color={cfg.color} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-800 text-base truncate">{p.name}</p>
                          {!p.isActive && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: "#F5F5F5", color: "#9CA3AF" }}>
                              <EyeOff size={9} /> Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          {subtitle && <span className="text-gray-400 text-xs truncate">{subtitle}</span>}
                        </div>
                      </div>
                    </button>
                  </div>

                  {(p.phone || p.address) && (
                    <div className="flex flex-col gap-0.5 mb-3 pl-1">
                      {p.phone && <p className="text-gray-500 text-xs flex items-center gap-1.5"><Phone size={11} /> {p.phone}</p>}
                      {p.address && <p className="text-gray-500 text-xs flex items-center gap-1.5"><MapPin size={11} /> {p.address}</p>}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => openKhata(p)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                      style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                      <BookOpen size={13} /> Open Khata
                    </button>
                    <button onClick={() => openDetail(p)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border-2 border-gray-200 text-gray-600 active:scale-95 transition-transform">
                      View <ChevronRight size={13} />
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => openEdit(p)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-gray-200 active:scale-95 transition-transform shrink-0">
                          <Pencil size={14} color="#6B7280" />
                        </button>
                        <button onClick={() => openDelete(p)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-red-100 active:scale-95 transition-transform shrink-0">
                          <Trash2 size={14} color="#C62828" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Type Picker Modal ── */}
      {modal === "typePicker" && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">Add Profile</h2>
              <button onClick={closeModal}><X size={22} color="#9CA3AF" /></button>
            </div>
            <p className="text-gray-500 text-sm mb-4">Choose a profile type</p>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(TYPE_CONFIG) as [ProfileType, typeof TYPE_CONFIG[ProfileType]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button key={key} onClick={() => pickType(key)}
                    className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-gray-100 active:scale-95 transition-transform"
                    style={{ backgroundColor: cfg.bg }}>
                    <Icon size={26} color={cfg.color} />
                    <span className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add / Edit Form Modal ── */}
      {modal === "form" && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = TYPE_CONFIG[formType].icon; return <Icon size={18} color={TYPE_CONFIG[formType].color} />; })()}
                  <h2 className="text-lg font-bold text-gray-800">
                    {editTarget ? "Edit" : "Add"} {TYPE_CONFIG[formType].label}
                  </h2>
                </div>
                <button onClick={closeModal}><X size={22} color="#9CA3AF" /></button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
              )}

              <label className="text-gray-600 text-sm font-medium mb-2 block">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />

              <label className="text-gray-600 text-sm font-medium mb-2 block">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="03XX-XXXXXXX" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />

              <label className="text-gray-600 text-sm font-medium mb-2 block">Address (Optional)</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Village / area address" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />

              {formType === "farmer" && (
                <>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Farm Name (Optional)</label>
                  <input value={form.farmName} onChange={(e) => setForm({ ...form, farmName: e.target.value })}
                    placeholder="e.g. Green Acres Farm" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                </>
              )}

              {formType === "dealer" && (
                <>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Business Name *</label>
                  <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    placeholder="e.g. Al-Rahman Traders" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Products/Services (Optional)</label>
                  <input value={form.productsServices} onChange={(e) => setForm({ ...form, productsServices: e.target.value })}
                    placeholder="e.g. Fertilizer, Seeds" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                </>
              )}

              {formType === "labourContractor" && (
                <>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Team Size *</label>
                  <input type="number" value={form.teamSize} onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                    placeholder="Number of workers" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                </>
              )}

              {formType === "custom" && (
                <>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Custom Label *</label>
                  <input value={form.customLabel} onChange={(e) => setForm({ ...form, customLabel: e.target.value })}
                    placeholder="e.g. Landlord, Investor, Transporter" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-4 outline-none text-gray-800 text-base focus:border-green-700" />
                </>
              )}

              <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2} placeholder="Any notes…"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-2 outline-none text-gray-800 text-base resize-none focus:border-green-700" />

              <div className="pt-4 mt-2 border-t border-gray-100">
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                  style={{ backgroundColor: "#1B5E20" }}>
                  {saving ? <Loader2 size={22} className="animate-spin" /> : editTarget ? "Save Changes" : "Add Profile"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete / Deactivate Modal ── */}
      {delTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !delBusy && setDelTarget(null)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            {delChecking ? (
              <div className="flex flex-col items-center py-6">
                <Loader2 size={28} className="animate-spin mb-3" style={{ color: "#1B5E20" }} />
                <p className="text-gray-500 text-sm">Checking transaction history…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: delBlocked ? "#FFF3E0" : "#FFEBEE" }}>
                  <AlertTriangle size={24} color={delBlocked ? "#E65100" : "#C62828"} />
                </div>
                {delBlocked ? (
                  <>
                    <p className="font-bold text-gray-800 mb-1">Can't delete — Khata has entries</p>
                    <p className="text-gray-500 text-sm mb-6">
                      {delTarget.name} has financial transactions linked to their Khata. Mark them Inactive instead — their history stays intact.
                    </p>
                    <div className="flex gap-3 w-full">
                      <button onClick={() => setDelTarget(null)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                      <button onClick={markInactive} disabled={delBusy}
                        className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ backgroundColor: "#E65100" }}>
                        {delBusy ? <Loader2 size={16} className="animate-spin" /> : "Mark Inactive"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-gray-800 mb-1">Delete this profile?</p>
                    <p className="text-gray-500 text-sm mb-6">{delTarget.name} has no Khata entries — this can't be undone.</p>
                    <div className="flex gap-3 w-full">
                      <button onClick={() => setDelTarget(null)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 font-semibold text-sm text-gray-700">Cancel</button>
                      <button onClick={confirmDelete} disabled={delBusy}
                        className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ backgroundColor: "#C62828" }}>
                        {delBusy ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
