import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import type { OnboardingState } from "@/hooks/useOnboarding";

const GREEN = "#1B5E20";

interface Props {
  state: OnboardingState;
  onContinue: () => void;
  onDismiss: () => void;
}

export default function SetupProgressCard({ state, onContinue, onDismiss }: Props) {
  if (state.completed) return null;

  const steps = [
    { label: "Farm",        done: state.farmDone },
    { label: "Crop Cycle",  done: state.cropCycleDone },
    { label: "Parcel",      done: state.parcelDone },
    { label: "Profile",     done: state.profileDone },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div
      className="mx-4 mb-4 rounded-2xl overflow-hidden shadow-sm"
      style={{ backgroundColor: "#F1F8E9", border: "1.5px solid #C5E1A5" }}
    >
      {/* Top row */}
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-bold" style={{ color: GREEN }}>
              Complete Farm Setup
            </p>
            <p className="text-xs text-gray-500">
              {doneCount} of {steps.length} steps done
            </p>
          </div>
          <button
            onClick={onContinue}
            className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-white text-xs font-bold active:scale-95 transition-transform"
            style={{ backgroundColor: GREEN }}
          >
            Continue <ChevronRight size={13} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-green-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%`, backgroundColor: GREEN }}
          />
        </div>
      </div>

      {/* Step chips */}
      <div className="flex gap-2 px-4 pt-1 flex-wrap">
        {steps.map(({ label, done }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
            style={{
              backgroundColor: done ? "#E8F5E9" : "white",
              color: done ? GREEN : "#9CA3AF",
              border: `1.5px solid ${done ? "#A5D6A7" : "#E5E7EB"}`,
            }}
          >
            {done
              ? <CheckCircle2 size={11} color={GREEN} />
              : <Circle size={11} color="#D1D5DB" />
            }
            {label}
          </div>
        ))}
      </div>

      {/* Mark Complete */}
      <div className="px-4 pt-2.5 pb-3.5">
        <button
          onClick={onDismiss}
          className="w-full py-2 rounded-xl text-xs font-semibold border active:scale-95 transition-transform"
          style={{ borderColor: "#A5D6A7", color: GREEN, backgroundColor: "white" }}
        >
          ✓ Mark Complete &amp; Use App
        </button>
      </div>
    </div>
  );
}
