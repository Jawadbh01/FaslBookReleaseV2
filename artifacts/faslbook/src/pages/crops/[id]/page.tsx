

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { runHarvestWorkflow } from "@/lib/workflows/harvestWorkflow";
import {
  ArrowLeft, Wheat, Calendar, MapPin,
  User, Loader2, CheckCircle, Package, Check,
} from "lucide-react";
import { useParams } from "wouter";

const statusConfig: Record<string, { label: string; color: string; bg: string; step: number }> = {
  planned:   { label: "Planned",   color: "#1565C0", bg: "#E3F2FD", step: 1 },
  sown:      { label: "Sown",      color: "#6A1B9A", bg: "#F3E5F5", step: 2 },
  growing:   { label: "Growing",   color: "#1B5E20", bg: "#E8F5E9", step: 3 },
  ready:     { label: "Ready",     color: "#E65100", bg: "#FFF3E0", step: 4 },
  harvested: { label: "Harvested", color: "#00695C", bg: "#E0F2F1", step: 5 },
  closed:    { label: "Closed",    color: "#757575", bg: "#F5F5F5", step: 6 },
};

const units = ["Maund", "KG", "Ton", "Quintal", "Bag", "Litre"];

export default function CropDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = new URLSearchParams(window.location.search);
  
  const { organization, role } = useAuthStore();
  const canEdit = role === "landlord" || role === "manager";

  const [crop, setCrop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showHarvest, setShowHarvest] = useState(
    searchParams.get("harvest") === "true"
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Harvest form
  const [hForm, setHForm] = useState({
    quantity: "",
    unit: "Maund",
    harvestDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "crops", id as string), (snap) => {
      if (snap.exists()) {
        setCrop({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const fmt = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PK", {
      day: "numeric", month: "short", year: "numeric"
    });
  };

  const handleHarvest = async () => {
    if (!hForm.quantity || isNaN(Number(hForm.quantity))) {
      setError("Please enter a valid quantity");
      return;
    }
    if (Number(hForm.quantity) <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await runHarvestWorkflow({
        cropId: crop.id,
        cropName: crop.cropName,
        parcelId: crop.parcelId,
        parcelName: crop.parcelName,
        organizationId: organization!.id,
        quantity: Number(hForm.quantity),
        unit: hForm.unit,
        harvestDate: new Date(hForm.harvestDate),
        notes: hForm.notes,
      });

      setSuccess(true);
    } catch (err) {
      console.error("Harvest error:", err);
      setError("Failed to record harvest. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div
          className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100"
          style={{ borderTopColor: "#1B5E20" }}
        />
      </div>
    );
  }

  if (!crop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Crop not found</p>
      </div>
    );
  }

  const sc = statusConfig[crop.status] || statusConfig.planned;

  // ── Success Screen ─────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <CheckCircle size={52} color="#1B5E20" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Harvest Recorded! 🌾
        </h1>
        <p className="text-gray-500 text-sm mb-2">
          {hForm.quantity} {hForm.unit} of {crop.cropName}
        </p>
        <p className="text-gray-400 text-xs mb-8">
          Stock added to Godown automatically
        </p>

        <div
          className="w-full rounded-2xl p-4 mb-6 text-left"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <p className="text-green-800 text-sm font-semibold mb-2">
            ✅ What happened automatically:
          </p>
          <p className="text-green-700 text-xs mb-1">• Crop marked as Harvested</p>
          <p className="text-green-700 text-xs mb-1">• {hForm.quantity} {hForm.unit} added to Godown</p>
          <p className="text-green-700 text-xs mb-1">• Inventory transaction created</p>
          <p className="text-green-700 text-xs mb-1">• Ledger entry created</p>
          <p className="text-green-700 text-xs">• Activity log updated</p>
        </div>

        <button
          onClick={() => window.location.href = "/crops"}
          className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}
        >
          Back to Crops
        </button>
      </div>
    );
  }

  // ── Harvest Form ───────────────────────────────────────────
  if (showHarvest) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div
          className="flex items-center px-4 pt-12 pb-6"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <button
            onClick={() => setShowHarvest(false)}
            className="text-white mr-3"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Record Harvest</h1>
            <p className="text-green-200 text-xs">{crop.cropName} • {crop.parcelName}</p>
          </div>
        </div>

        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
              {error}
            </div>
          )}

          {/* Info card */}
          <div
            className="rounded-2xl p-4 mb-6 flex items-center gap-3"
            style={{ backgroundColor: "#E8F5E9" }}
          >
            <Package size={24} color="#1B5E20" />
            <div>
              <p className="text-green-800 font-semibold text-sm">
                Stock will be added to Godown automatically
              </p>
              <p className="text-green-700 text-xs">
                Inventory, ledger and logs update instantly
              </p>
            </div>
          </div>

          {/* Quantity */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Harvested Quantity *
            </label>
            <div className="flex gap-3">
              <div className="flex-1 flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={hForm.quantity}
                  onChange={(e) => setHForm({ ...hForm, quantity: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <select
                  value={hForm.unit}
                  onChange={(e) => setHForm({ ...hForm, unit: e.target.value })}
                  className="outline-none text-gray-800 text-base bg-transparent"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Harvest Date */}
          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">
              Harvest Date *
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Calendar size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="date"
                value={hForm.harvestDate}
                onChange={(e) => setHForm({ ...hForm, harvestDate: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
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
                placeholder="Quality notes, storage location etc..."
                value={hForm.notes}
                onChange={(e) => setHForm({ ...hForm, notes: e.target.value })}
                rows={3}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleHarvest}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving
              ? <Loader2 size={22} className="animate-spin" />
              : "Record Harvest 🌾"
            }
          </button>
        </div>
      </div>
    );
  }

  // ── Crop Detail ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div
        className="flex items-center px-4 pt-12 pb-6"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <button onClick={() => window.history.back()} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">{crop.cropName}</h1>
          <p className="text-green-200 text-xs">
            {crop.season} • {crop.parcelName}
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: sc.bg }}
        >
          <span className="text-xs font-bold" style={{ color: sc.color }}>
            {sc.label}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Status timeline */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-gray-600 font-semibold text-sm mb-3">
            Status Timeline
          </p>
          <div className="flex items-center justify-between">
            {["planned", "sown", "growing", "ready", "harvested"].map((s, i) => {
              const ssc = statusConfig[s];
              const isDone = statusConfig[crop.status]?.step >= ssc.step;
              const isCurrent = crop.status === s;
              return (
                <div key={s} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                      style={{
                        backgroundColor: isDone ? ssc.color : "white",
                        borderColor: isDone ? ssc.color : "#E5E7EB",
                      }}
                    >
                      {isDone && <Check size={14} color="white" />}
                    </div>
                    <p
                      className="text-xs mt-1"
                      style={{
                        color: isCurrent ? ssc.color : "#9CA3AF",
                        fontWeight: isCurrent ? "700" : "400",
                      }}
                    >
                      {ssc.label}
                    </p>
                  </div>
                  {i < 4 && (
                    <div
                      className="h-0.5 w-6 mx-1 mb-4"
                      style={{
                        backgroundColor: isDone ? sc.color : "#E5E7EB",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-gray-600 font-semibold text-sm mb-3">Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Sowing Date</p>
              <p className="text-gray-800 font-semibold text-sm">{fmt(crop.sowingDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Expected Harvest</p>
              <p className="text-gray-800 font-semibold text-sm">{fmt(crop.expectedHarvest)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Parcel</p>
              <p className="text-gray-800 font-semibold text-sm">{crop.parcelName || "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Farmer</p>
              <p className="text-gray-800 font-semibold text-sm">
                {crop.assignedFarmerName || "—"}
              </p>
            </div>
          </div>
          {crop.notes && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Notes</p>
              <p className="text-gray-700 text-sm">{crop.notes}</p>
            </div>
          )}
        </div>

        {/* Harvest result if done */}
        {crop.status === "harvested" && (
          <div
            className="rounded-2xl p-4 shadow-sm mb-4"
            style={{ backgroundColor: "#E8F5E9" }}
          >
            <p className="text-green-800 font-semibold text-sm mb-2">
              ✅ Harvest Completed
            </p>
            <p className="text-green-700 text-sm">
              {crop.harvestedQuantity} {crop.harvestUnit} harvested
            </p>
            {crop.actualHarvest && (
              <p className="text-green-600 text-xs mt-1">
                on {fmt(crop.actualHarvest)}
              </p>
            )}
          </div>
        )}

        {/* Record Harvest button */}
        {canEdit && crop.status === "ready" && (
          <button
            onClick={() => setShowHarvest(true)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3"
            style={{ backgroundColor: "#1B5E20" }}
          >
            <Wheat size={20} />
            Record Harvest
          </button>
        )}
      </div>
    </div>
  );
}
