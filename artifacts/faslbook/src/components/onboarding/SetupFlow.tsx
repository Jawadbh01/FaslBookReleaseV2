import { useState } from "react";
import {
  addDoc, collection, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ChevronLeft, CheckCircle2, Loader2, Circle } from "lucide-react";
import type { OnboardingState } from "@/hooks/useOnboarding";

const GREEN = "#1B5E20";
const UNIT_TO_ACRES: Record<string, number> = {
  acres: 1,
  kanals: 0.125,
  marlas: 0.00625,
};
const STEP_TITLES = [
  "Farm Information",
  "Crop Cycle",
  "First Parcel",
  "First Profile",
  "Setup Complete",
];
const TOTAL_STEPS = 4;

interface Props {
  onboardingState: OnboardingState;
  onUpdate: (patch: Partial<OnboardingState>) => Promise<void>;
  onClose: () => void;
}

// ── Sub-components ──────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      <div className="border border-gray-200 rounded-2xl px-4 py-3.5 bg-white">
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({
  onClick, loading, children,
}: {
  onClick: () => void; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3.5 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
      style={{ backgroundColor: GREEN }}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────

export default function SetupFlow({ onboardingState, onUpdate, onClose }: Props) {
  const { organization } = useAuthStore();
  const orgId = organization?.id ?? "";

  // start at first incomplete step
  const getStartStep = (): number => {
    if (!onboardingState.farmDone) return 1;
    if (!onboardingState.cropCycleDone) return 2;
    if (!onboardingState.parcelDone) return 3;
    if (!onboardingState.profileDone) return 4;
    return 5;
  };

  const [step, setStep] = useState<number>(getStartStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 – Farm
  const [farmName, setFarmName]       = useState(organization?.name ?? "");
  const [farmLocation, setFarmLocation] = useState(organization?.village ?? "");

  // Step 2 – Crop Cycle
  const [ccName, setCcName]   = useState("");
  const [ccCrop, setCcCrop]   = useState("");
  const [ccStart, setCcStart] = useState("");
  const [ccEnd, setCcEnd]     = useState("");

  // Step 3 – Parcel
  const [parcelName, setParcelName] = useState("");
  const [parcelArea, setParcelArea] = useState("");
  const [parcelUnit, setParcelUnit] = useState("acres");

  // Step 4 – Profile
  const [profileType, setProfileType]       = useState<"farmer" | "dealer" | "contractor">("farmer");
  const [profileName, setProfileName]       = useState("");
  const [profilePhone, setProfilePhone]     = useState("");
  const [profileAddress, setProfileAddress] = useState("");

  const progress = Math.min(step, TOTAL_STEPS) / TOTAL_STEPS;

  // ── Step handlers ──────────────────────────────────────────

  async function handleFarmNext() {
    if (!farmName.trim()) { setError("Farm name is required"); return; }
    setSaving(true); setError("");
    try {
      if (orgId && (farmName.trim() !== organization?.name || farmLocation.trim() !== organization?.village)) {
        await updateDoc(doc(db, "organizations", orgId), {
          name: farmName.trim(),
          village: farmLocation.trim(),
        });
      }
      await onUpdate({ farmDone: true });
      setStep(2);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleCropCycleNext() {
    if (!ccName.trim()) { setError("Crop cycle name is required"); return; }
    if (!ccCrop.trim()) { setError("Crop type is required"); return; }
    setSaving(true); setError("");
    try {
      await addDoc(collection(db, "cropCycles"), {
        organizationId: orgId,
        name: ccName.trim(),
        crop: ccCrop.trim(),
        startDate: ccStart,
        endDate: ccEnd,
        status: "Active",
        seasonId: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: "synced",
      });
      await onUpdate({ cropCycleDone: true });
      setStep(3);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleParcelNext() {
    if (!parcelName.trim()) { setError("Parcel name is required"); return; }
    setSaving(true); setError("");
    try {
      const acres = parseFloat(parcelArea || "0") * (UNIT_TO_ACRES[parcelUnit] ?? 1);
      await addDoc(collection(db, "parcels"), {
        organizationId: orgId,
        name: parcelName.trim(),
        acres: Number.isFinite(acres) ? acres : 0,
        location: "",
        assignedFarmer: null,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: "synced",
      });
      await onUpdate({ parcelDone: true });
      setStep(4);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleProfileSave() {
    if (!profileName.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    try {
      if (profileType === "dealer") {
        await addDoc(collection(db, "dealers"), {
          organizationId: orgId,
          name: profileName.trim(),
          phone: profilePhone.trim(),
          address: profileAddress.trim(),
          notes: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          syncStatus: "synced",
        });
      } else if (profileType === "contractor") {
        await addDoc(collection(db, "employees"), {
          organizationId: orgId,
          name: profileName.trim(),
          phone: profilePhone.trim(),
          employeeType: "worker",
          salary: 0,
          salaryType: "monthly",
          status: "active",
          notes: "",
          createdAt: serverTimestamp(),
        });
      } else {
        // farmer
        await addDoc(collection(db, "workers"), {
          organizationId: orgId,
          name: profileName.trim(),
          phone: profilePhone.trim(),
          workerType: "farmer",
          status: "active",
          notes: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          syncStatus: "synced",
        });
      }
      await onUpdate({ profileDone: true });
      setStep(5);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleSkipProfile() {
    await onUpdate({ profileDone: true });
    setStep(5);
  }

  async function handleComplete() {
    await onUpdate({ completed: true });
    onClose();
  }

  // ── Step renderers ─────────────────────────────────────────

  const renderStep = () => {
    if (step === 1) return (
      <>
        <Field label="Farm Name *">
          <input
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            placeholder="e.g. Ali Farm"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <Field label="Location (Optional)">
          <input
            value={farmLocation}
            onChange={(e) => setFarmLocation(e.target.value)}
            placeholder="Village or city"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <p className="text-gray-400 text-xs -mt-1 mb-4">You can update this anytime in Farm Settings.</p>
        <PrimaryBtn onClick={handleFarmNext} loading={saving}>Next →</PrimaryBtn>
      </>
    );

    if (step === 2) return (
      <>
        <Field label="Crop Cycle Name *">
          <input
            value={ccName}
            onChange={(e) => setCcName(e.target.value)}
            placeholder="e.g. Wheat 2026"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <Field label="Crop *">
          <input
            value={ccCrop}
            onChange={(e) => setCcCrop(e.target.value)}
            placeholder="e.g. Wheat, Cotton, Rice"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
              Start Date
            </label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 bg-white">
              <input
                type="date"
                value={ccStart}
                onChange={(e) => setCcStart(e.target.value)}
                className="w-full outline-none text-gray-800 text-sm bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
              End Date
            </label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 bg-white">
              <input
                type="date"
                value={ccEnd}
                onChange={(e) => setCcEnd(e.target.value)}
                className="w-full outline-none text-gray-800 text-sm bg-transparent"
              />
            </div>
          </div>
        </div>
        <PrimaryBtn onClick={handleCropCycleNext} loading={saving}>Save &amp; Next →</PrimaryBtn>
      </>
    );

    if (step === 3) return (
      <>
        <Field label="Parcel Name *">
          <input
            value={parcelName}
            onChange={(e) => setParcelName(e.target.value)}
            placeholder="e.g. North Field, Block A"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
              Area
            </label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 bg-white">
              <input
                type="number"
                min="0"
                step="0.01"
                value={parcelArea}
                onChange={(e) => setParcelArea(e.target.value)}
                placeholder="0"
                className="w-full outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
              Unit
            </label>
            <div className="border border-gray-200 rounded-2xl px-4 py-3.5 bg-white">
              <select
                value={parcelUnit}
                onChange={(e) => setParcelUnit(e.target.value)}
                className="w-full outline-none text-gray-800 text-sm bg-transparent"
              >
                <option value="acres">Acres</option>
                <option value="kanals">Kanals</option>
                <option value="marlas">Marlas</option>
              </select>
            </div>
          </div>
        </div>
        <PrimaryBtn onClick={handleParcelNext} loading={saving}>Save &amp; Next →</PrimaryBtn>
      </>
    );

    if (step === 4) return (
      <>
        <p className="text-gray-500 text-sm mb-4">
          Add one person to get started — you can add more later.
        </p>
        {/* Type selector */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(["farmer", "dealer", "contractor"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setProfileType(t)}
              className="py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all"
              style={{
                borderColor: profileType === t ? GREEN : "#E5E7EB",
                backgroundColor: profileType === t ? "#E8F5E9" : "white",
                color: profileType === t ? GREEN : "#9CA3AF",
              }}
            >
              {t === "farmer" ? "Farmer" : t === "dealer" ? "Dealer" : "Contractor"}
            </button>
          ))}
        </div>
        <Field label="Name *">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Full name"
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        <Field label="Phone (Optional)">
          <input
            type="tel"
            value={profilePhone}
            onChange={(e) => setProfilePhone(e.target.value)}
            placeholder="+92..."
            className="w-full outline-none text-gray-800 text-base bg-transparent"
          />
        </Field>
        {profileType === "dealer" && (
          <Field label="Address (Optional)">
            <input
              value={profileAddress}
              onChange={(e) => setProfileAddress(e.target.value)}
              placeholder="City or market"
              className="w-full outline-none text-gray-800 text-base bg-transparent"
            />
          </Field>
        )}
        <PrimaryBtn onClick={handleProfileSave} loading={saving}>Save &amp; Finish</PrimaryBtn>
        <button
          onClick={handleSkipProfile}
          className="w-full py-3 text-gray-400 font-medium text-sm mt-2 active:scale-95 transition-transform"
        >
          Skip this step
        </button>
      </>
    );

    if (step === 5) {
      const items = [
        { label: "Farm Created",        done: onboardingState.farmDone || true },
        { label: "Crop Cycle Created",  done: onboardingState.cropCycleDone },
        { label: "Parcel Created",       done: onboardingState.parcelDone },
        { label: "First Profile Added", done: onboardingState.profileDone },
      ];
      return (
        <div className="flex flex-col items-center text-center pt-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ backgroundColor: "#E8F5E9" }}
          >
            <CheckCircle2 size={40} color={GREEN} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Setup Complete!</h3>
          <p className="text-gray-400 text-sm mb-8">Your farm is ready. You can add more details anytime.</p>

          <div className="w-full flex flex-col gap-2.5 mb-8">
            {items.map(({ label, done }) => (
              <div key={label} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: done ? "#E8F5E9" : "#F5F5F5" }}
                >
                  {done
                    ? <CheckCircle2 size={16} color={GREEN} />
                    : <Circle size={16} color="#D1D5DB" />
                  }
                </div>
                <span className="text-sm font-medium text-gray-700 text-left flex-1">{label}</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: done ? "#E8F5E9" : "#F5F5F5",
                    color: done ? GREEN : "#9CA3AF",
                  }}
                >
                  {done ? "✓ Done" : "Skipped"}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleComplete}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
            style={{ backgroundColor: GREEN }}
          >
            Go to Dashboard →
          </button>
        </div>
      );
    }
    return null;
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[55] bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        {step < 5 ? (
          <button
            onClick={step === 1 ? onClose : () => { setStep((s) => s - 1); setError(""); }}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ backgroundColor: "#F3F4F6" }}
          >
            <ChevronLeft size={20} color="#374151" />
          </button>
        ) : (
          <div className="w-9 h-9" />
        )}
        <div className="flex-1">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {step < 5 ? `Step ${step} of ${TOTAL_STEPS}` : "All done"}
          </p>
          <p className="text-gray-900 font-bold text-base leading-tight">
            {STEP_TITLES[step - 1]}
          </p>
        </div>
        {step < 5 && (
          <button
            onClick={onClose}
            className="text-gray-400 text-sm font-medium px-2 py-1 active:opacity-60"
          >
            Exit
          </button>
        )}
      </div>

      {/* Progress bar */}
      {step < 5 && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${progress * 100}%`, backgroundColor: GREEN }}
          />
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-6 pb-10">
          {error && (
            <div
              className="rounded-2xl px-4 py-3 mb-4 border"
              style={{ backgroundColor: "#FFF3F3", borderColor: "#FFCDD2" }}
            >
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
