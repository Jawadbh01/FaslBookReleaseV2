const GREEN = "#1B5E20";

interface Props {
  onContinue: () => void;
  onSkip: () => void;
}

export default function WelcomeModal({ onContinue, onSkip }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm overflow-hidden shadow-2xl">
        {/* Green header */}
        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{ background: `linear-gradient(160deg,${GREEN} 0%,#2E7D32 100%)` }}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <img
              src="/logo.png"
              alt="FaslBook"
              className="w-10 h-10 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <h2 className="text-white text-xl font-bold">Welcome to FaslBook</h2>
          <p className="text-green-200 text-sm mt-1">Let's get your farm set up</p>
        </div>

        <div className="px-6 pt-5 pb-8">
          <p className="text-gray-500 text-sm text-center leading-relaxed mb-5">
            Let's set up your farm so you can start managing everything easily.
            This only takes a few minutes.
          </p>

          {/* Step preview */}
          <div className="flex flex-col gap-3 mb-6">
            {([
              ["Farm Information",  "Confirm your farm details"],
              ["Crop Cycle",        "Track your harvest season"],
              ["First Parcel",      "Add your farm land"],
              ["First Profile",     "Farmer, dealer or contractor (optional)"],
            ] as const).map(([title, sub], i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ backgroundColor: GREEN }}
                >
                  {i + 1}
                </div>
                <div>
                  <p className="text-gray-800 text-sm font-semibold leading-tight">{title}</p>
                  <p className="text-gray-400 text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onContinue}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base mb-3 active:scale-95 transition-transform"
            style={{ backgroundColor: GREEN }}
          >
            Continue Setup
          </button>
          <button
            onClick={onSkip}
            className="w-full py-3 rounded-2xl text-gray-400 font-medium text-sm active:scale-95 transition-transform"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  );
}
