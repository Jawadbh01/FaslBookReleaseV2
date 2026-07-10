

import { useEffect, useState } from "react";
import {
  collection, query, where,
  onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import {
  Wheat, Plus, X, ChevronRight,
  Calendar, MapPin, User, Loader2,
  Check, ArrowRight, Sprout, Printer,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Types ──────────────────────────────────────────────────────
interface Crop {
  id: string;
  cropName: string;
  season: string;
  parcelId: string;
  parcelName: string;
  assignedFarmer: string;
  assignedFarmerName: string;
  sowingDate: any;
  expectedHarvest: any;
  status: string;
  notes: string;
  organizationId: string;
  createdAt: any;
}

interface Parcel {
  id: string;
  name: string;
  acres: number;
}

interface Farmer {
  id: string;
  name: string;
}

// ── Status config ──────────────────────────────────────────────
const statusConfig: Record<string, {
  label: string;
  color: string;
  bg: string;
  step: number;
}> = {
  planned:   { label: "Planned",   color: "#1565C0", bg: "#E3F2FD", step: 1 },
  sown:      { label: "Sown",      color: "#6A1B9A", bg: "#F3E5F5", step: 2 },
  growing:   { label: "Growing",   color: "#1B5E20", bg: "#E8F5E9", step: 3 },
  ready:     { label: "Ready",     color: "#E65100", bg: "#FFF3E0", step: 4 },
  harvested: { label: "Harvested", color: "#00695C", bg: "#E0F2F1", step: 5 },
  closed:    { label: "Closed",    color: "#757575", bg: "#F5F5F5", step: 6 },
};

const statusOrder = ["planned", "sown", "growing", "ready", "harvested", "closed"];

// ── Season detection ───────────────────────────────────────────
const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 10 || month <= 3) return "Rabi";
  if (month >= 4 && month <= 6) return "Kharif";
  return "Zaid";
};

const cropSuggestions = [
  "Wheat", "Rice", "Cotton", "Sugarcane", "Maize",
  "Sunflower", "Mustard", "Gram", "Lentil", "Potato",
  "Tomato", "Onion", "Mango", "Date Palm", "Other",
];

export default function CropsPage() {
  const { organization, role } = useAuthStore();
  
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── State ──────────────────────────────────────────────────
  const [crops, setCrops]     = useState<Crop[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [filter, setFilter]   = useState("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState("");

  // Form
  const [form, setForm] = useState({
    cropName: "",
    customCrop: "",
    season: getCurrentSeason(),
    parcelId: "",
    assignedFarmer: "",
    sowingDate: "",
    expectedHarvest: "",
    notes: "",
  });

  // ── Listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "crops"), where("organizationId", "==", orgId)),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Crop))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setCrops(data);
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId)),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel));
        console.log("[Crops] parcels loaded:", data.length, data);
        setParcels(data);
      }
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, "users"),
        where("organizationId", "==", orgId),
        where("role", "==", "farmer")
      ),
      (snap) => {
        setFarmers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Farmer)));
      }
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // ── Filter ─────────────────────────────────────────────────
  const filtered = filter === "all"
    ? crops
    : crops.filter((c) => c.status === filter);

  // ── Save crop ──────────────────────────────────────────────
  const handleSave = async () => {
    const finalCropName = form.cropName === "Other"
      ? form.customCrop.trim()
      : form.cropName;

    if (!finalCropName) {
      setFormError("Please select or enter crop name");
      return;
    }
    if (!form.parcelId) {
      setFormError("Please select a parcel");
      return;
    }
    if (!form.sowingDate) {
      setFormError("Please enter sowing date");
      return;
    }

    const parcel = parcels.find((p) => p.id === form.parcelId);
    const farmer = farmers.find((f) => f.id === form.assignedFarmer);

    try {
      setSaving(true);
      setFormError("");

      const cropData = {
        cropName: finalCropName,
        season: form.season,
        parcelId: form.parcelId,
        parcelName: parcel?.name || "",
        assignedFarmer: form.assignedFarmer || "",
        assignedFarmerName: farmer?.name || "",
        sowingDate: form.sowingDate
          ? new Date(form.sowingDate)
          : null,
        expectedHarvest: form.expectedHarvest
          ? new Date(form.expectedHarvest)
          : null,
        status: "planned",
        notes: form.notes,
        organizationId: orgId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: "synced",
      };

      const docRef = await addDoc(collection(db, "crops"), cropData);

      if (!navigator.onLine) notifyOfflineSave("Crop");

      // Update parcel current crop
      if (form.parcelId) {
        await updateDoc(doc(db, "parcels", form.parcelId), {
          currentCropId: docRef.id,
          currentCropName: finalCropName,
          updatedAt: serverTimestamp(),
        });
      }

      // Activity log
      await addDoc(collection(db, "activityLogs"), {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "CROP_ADDED",
        description: `Added crop: ${finalCropName} on ${parcel?.name || "parcel"}`,
        recordId: docRef.id,
        recordType: "crops",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });

      setShowAdd(false);
      resetForm();
    } catch (err) {
      setFormError("Failed to save crop. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Update status ──────────────────────────────────────────
  const handleStatusUpdate = async (crop: Crop, newStatus: string) => {
    try {
      await updateDoc(doc(db, "crops", crop.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "activityLogs"), {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "CROP_STATUS_UPDATED",
        description: `${crop.cropName} status updated to ${newStatus}`,
        recordId: crop.id,
        recordType: "crops",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });
    } catch (err) {
      console.error("Status update error:", err);
    }
  };

  const resetForm = () => setForm({
    cropName: "",
    customCrop: "",
    season: getCurrentSeason(),
    parcelId: "",
    assignedFarmer: "",
    sowingDate: "",
    expectedHarvest: "",
    notes: "",
  });

  const fmt = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PK", {
      day: "numeric", month: "short", year: "numeric"
    });
  };

  // ── Add Form ───────────────────────────────────────────────
  if (showAdd) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div
          className="flex items-center px-4 pt-12 pb-6"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <button
            onClick={() => { setShowAdd(false); resetForm(); }}
            className="text-white mr-3"
          >
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add New Crop</h1>
            <p className="text-green-200 text-xs">
              {getCurrentSeason()} Season
            </p>
          </div>
        </div>

        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
              {formError}
            </div>
          )}

          {/* Crop Name */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Crop Name *
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Wheat size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <select
                value={form.cropName}
                onChange={(e) => setForm({ ...form, cropName: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              >
                <option value="">Select crop</option>
                {cropSuggestions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom crop name if Other */}
          {form.cropName === "Other" && (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">
                Crop Name (Custom)
              </label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Wheat size={20} color="#9E9E9E" className="mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Enter crop name"
                  value={form.customCrop}
                  onChange={(e) => setForm({ ...form, customCrop: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
            </div>
          )}

          {/* Season */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-3 block">
              Season
            </label>
            <div className="flex gap-3">
              {["Rabi", "Kharif", "Zaid"].map((s) => (
                <button
                  key={s}
                  onClick={() => setForm({ ...form, season: s })}
                  className="flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all"
                  style={{
                    borderColor: form.season === s ? "#1B5E20" : "#E5E7EB",
                    backgroundColor: form.season === s ? "#E8F5E9" : "white",
                    color: form.season === s ? "#1B5E20" : "#6B7280",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Select Parcel */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Select Parcel *
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <MapPin size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <select
                value={form.parcelId}
                onChange={(e) => setForm({ ...form, parcelId: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              >
                <option value="">Select parcel</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.acres} acres)
                  </option>
                ))}
              </select>
            </div>
            {parcels.length === 0 && (
              <p className="text-gray-400 text-xs mt-1 ml-2">
                No parcels found. Add parcels first.
              </p>
            )}
          </div>

          {/* Assign Farmer */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Assign Farmer (Optional)
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <User size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <select
                value={form.assignedFarmer}
                onChange={(e) => setForm({ ...form, assignedFarmer: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              >
                <option value="">No farmer assigned</option>
                {farmers.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sowing Date */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Sowing Date *
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Calendar size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="date"
                value={form.sowingDate}
                onChange={(e) => setForm({ ...form, sowingDate: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
            </div>
          </div>

          {/* Expected Harvest */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Expected Harvest Date
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Calendar size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="date"
                value={form.expectedHarvest}
                onChange={(e) => setForm({ ...form, expectedHarvest: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Notes (Optional)
            </label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <textarea
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving
              ? <Loader2 size={22} className="animate-spin" />
              : "Save Crop 🌱"
            }
          </button>
        </div>
      </div>
    );
  }

  // ── Main List ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div
        className="px-4 pt-12 pb-4"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-xl font-bold">Crops</h1>
            <p className="text-green-200 text-xs">
              {crops.length} crop{crops.length !== 1 ? "s" : ""} •{" "}
              {getCurrentSeason()} Season
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.href = "/reports/print?type=expense"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Printer size={14} />
              Print
            </button>
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

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {["all", ...statusOrder].map((s) => {
            const sc = statusConfig[s];
            const isActive = filter === s;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
                style={{
                  backgroundColor: isActive
                    ? "white"
                    : "rgba(255,255,255,0.2)",
                  color: isActive
                    ? (sc?.color || "#1B5E20")
                    : "white",
                }}
              >
                {s === "all" ? "All" : sc?.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div
              className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100"
              style={{ borderTopColor: "#1B5E20" }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#E8F5E9" }}
            >
              <Sprout size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">
              {filter === "all" ? "No crops yet" : `No ${statusConfig[filter]?.label} crops`}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {filter === "all"
                ? "Add your first crop to get started"
                : "Try a different filter"
              }
            </p>
            {canEdit && filter === "all" && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} />
                Add First Crop
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((crop) => {
              const sc = statusConfig[crop.status] || statusConfig.planned;
              const currentStep = sc.step;
              const totalSteps = statusOrder.length;
              const progress = (currentStep / totalSteps) * 100;
              const nextStatus = statusOrder[statusOrder.indexOf(crop.status) + 1];
              const nextSc = nextStatus ? statusConfig[nextStatus] : null;

              return (
                <div
                  key={crop.id}
                  className="bg-white rounded-2xl p-4 shadow-sm"
                >
                  {/* Top */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: sc.bg }}
                      >
                        <Wheat size={22} color={sc.color} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">
                          {crop.cropName}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {crop.season} • {crop.parcelName || "No parcel"}
                        </p>
                      </div>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: sc.bg }}
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: sc.color }}
                      >
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: sc.color,
                        }}
                      />
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-xl p-2">
                      <p className="text-gray-400 text-xs mb-0.5">Sowing</p>
                      <p className="text-gray-800 text-xs font-semibold">
                        {fmt(crop.sowingDate)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2">
                      <p className="text-gray-400 text-xs mb-0.5">
                        Expected Harvest
                      </p>
                      <p className="text-gray-800 text-xs font-semibold">
                        {fmt(crop.expectedHarvest)}
                      </p>
                    </div>
                  </div>

                  {/* Farmer */}
                  {crop.assignedFarmerName && (
                    <div className="flex items-center gap-2 mb-3">
                      <User size={14} color="#9E9E9E" />
                      <span className="text-gray-500 text-xs">
                        {crop.assignedFarmerName}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  {canEdit && crop.status !== "closed" && (
                    <div className="flex gap-2 mt-1">
                      {nextStatus && nextStatus !== "harvested" && (
                        <button
                          onClick={() => handleStatusUpdate(crop, nextStatus)}
                          className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                          style={{ backgroundColor: nextSc?.color || "#1B5E20" }}
                        >
                          <ArrowRight size={14} />
                          Mark as {nextSc?.label}
                        </button>
                      )}
                      {crop.status === "ready" && (
                        <button
                          onClick={() => window.location.href = `/crops/${crop.id}?harvest=true`}
                          className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                          style={{ backgroundColor: "#1B5E20" }}
                        >
                          <Check size={14} />
                          Record Harvest
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {canEdit && crops.length > 0 && (
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
