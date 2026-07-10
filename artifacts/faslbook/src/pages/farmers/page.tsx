

import { useLocation } from "wouter";
import { Printer, User } from "lucide-react";

export default function FarmersPage() {
  

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Farmers</h1>
            <p className="text-green-200 text-xs mt-0.5">Your farm team</p>
          </div>
          <button
            onClick={() => window.location.href = "/reports/print?type=ledger"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center pt-24 text-center px-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
          <User size={32} color="#1B5E20" />
        </div>
        <p className="text-gray-600 font-semibold">Farmers content coming soon</p>
        <p className="text-gray-400 text-sm mt-1">Use the Print button to view the Farmer Report</p>
      </div>
    </div>
  );
}
