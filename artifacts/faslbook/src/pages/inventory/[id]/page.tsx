

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { doc, onSnapshot, collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine,
  Warehouse, Package, Users, Sprout,
} from "lucide-react";
import {
  categoryConfig,
} from "../_categoryConfig";

const sourceLabels: Record<string, { label: string; color: string; bg: string }> = {
  Purchase:       { label: "Purchase",        color: "#1565C0", bg: "#E3F2FD" },
  Harvest:        { label: "Harvest",         color: "#1B5E20", bg: "#E8F5E9" },
  harvest:        { label: "Harvest",         color: "#1B5E20", bg: "#E8F5E9" },
  Adjustment:     { label: "Adjustment",      color: "#6A1B9A", bg: "#F3E5F5" },
  Transfer:       { label: "Transfer",        color: "#00695C", bg: "#E0F2F1" },
  farmerTransfer: { label: "Farmer Transfer", color: "#E65100", bg: "#FFF3E0" },
  Sale:           { label: "Sale",            color: "#757575", bg: "#F5F5F5" },
  Consumption:    { label: "Consumption",     color: "#BF360C", bg: "#FBE9E7" },
  Damage:         { label: "Damage",          color: "#B71C1C", bg: "#FFEBEE" },
  Loss:           { label: "Loss",            color: "#880E4F", bg: "#FCE4EC" },
};

export default function InventoryItemDetailPage() {
  const { id } = useParams();
  
  const { organization } = useAuthStore();

  const [item, setItem]     = useState<any>(null);
  const [txns, setTxns]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(doc(db, "inventoryItems", id as string), (snap) => {
      if (snap.exists()) setItem({ id: snap.id, ...snap.data() });
      setLoading(false);
    }));

    unsubs.push(onSnapshot(
      query(
        collection(db, "inventoryTransactions"),
        where("itemId", "==", id as string),
      ),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setTxns(data);
      }
    ));

    return () => unsubs.forEach((u) => u());
  }, [id]);

  const fmt = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Item not found</p>
      </div>
    );
  }

  const cc = categoryConfig[item.category as string] || categoryConfig.other;
  const totalIn  = txns.filter((t) => t.type === "in").reduce((s: number, t: any) => s + (t.quantity || 0), 0);
  const totalOut = txns.filter((t) => t.type === "out").reduce((s: number, t: any) => s + (t.quantity || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={() => window.history.back()} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">{item.name}</h1>
          <p className="text-green-200 text-xs">{cc.label}</p>
        </div>
        <div className="text-right">
          <p className="text-white text-2xl font-bold">{item.currentStock}</p>
          <p className="text-green-200 text-xs">{item.unit}</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <ArrowDownToLine size={20} color="#1B5E20" className="mx-auto mb-1" />
            <p className="text-gray-800 font-bold text-base">{totalIn}</p>
            <p className="text-gray-400 text-xs">Total In</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <ArrowUpFromLine size={20} color="#E65100" className="mx-auto mb-1" />
            <p className="text-gray-800 font-bold text-base">{totalOut}</p>
            <p className="text-gray-400 text-xs">Total Out</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <Warehouse size={20} color="#1565C0" className="mx-auto mb-1" />
            <p className="text-gray-800 font-bold text-base">{item.currentStock}</p>
            <p className="text-gray-400 text-xs">In Godown</p>
          </div>
        </div>

        {/* Transaction history */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-gray-700 font-bold text-sm mb-3">Transaction History</p>
          {txns.length === 0 ? (
            <div className="text-center py-8">
              <Package size={32} color="#D1D5DB" className="mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No transactions yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {txns.map((tx: any) => {
                const sl = sourceLabels[tx.source] || { label: tx.source, color: "#757575", bg: "#F5F5F5" };
                const isIn = tx.type === "in";
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isIn ? "#E8F5E9" : "#FFF3E0" }}>
                      {isIn
                        ? <ArrowDownToLine size={16} color="#1B5E20" />
                        : <ArrowUpFromLine size={16} color="#E65100" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sl.bg, color: sl.color }}>
                          {sl.label}
                        </span>
                      </div>
                      {tx.relatedFarmerName && (
                        <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                          <Users size={11} />
                          {tx.relatedFarmerName}
                        </p>
                      )}
                      {tx.notes && <p className="text-gray-400 text-xs truncate">{tx.notes}</p>}
                      <p className="text-gray-400 text-xs">{fmt(tx.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-base" style={{ color: isIn ? "#1B5E20" : "#E65100" }}>
                        {isIn ? "+" : "-"}{tx.quantity}
                      </p>
                      <p className="text-gray-400 text-xs">{tx.unit}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
