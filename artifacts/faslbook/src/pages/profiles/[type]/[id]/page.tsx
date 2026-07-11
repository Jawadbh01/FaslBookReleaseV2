

import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  collection, query, where, onSnapshot, doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { subscribeHarvestRecords, type HarvestLabourRecord } from "@/lib/firebase/labourContractors";
import { TYPE_CONFIG, type ProfileType } from "@/pages/profiles/page";
import {
  ChevronLeft, Phone, MapPin, BookOpen, TrendingUp, TrendingDown,
  Wallet, StickyNote, EyeOff,
} from "lucide-react";

interface AnyDoc { id: string; [key: string]: any }

const CREDIT_TYPES = ["income", "loanTaken", "dealerPayment"];
const fmt = (n: number) => "Rs. " + Math.round(n || 0).toLocaleString("en-PK");
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return p.length === 3 ? `${parseInt(p[2])} ${M[parseInt(p[1]) - 1]} ${p[0]}` : s;
};

const COLLECTION_FOR: Record<ProfileType, string> = {
  farmer: "workers", dealer: "dealers", labourContractor: "labourContractors", custom: "customProfiles",
};
const LINK_FIELD_FOR: Record<ProfileType, string> = {
  farmer: "farmerId", dealer: "dealerId", labourContractor: "contractorId", custom: "customProfileId",
};

export default function ProfileDetailPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const profileType = type as ProfileType;
  const { organization } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;

  const [profile, setProfile] = useState<AnyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<AnyDoc[]>([]);
  const [harvestRecs, setHarvestRecs] = useState<HarvestLabourRecord[]>([]);

  useEffect(() => {
    if (!id || !profileType) return;
    getDoc(doc(db, COLLECTION_FOR[profileType], id)).then((snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
  }, [id, profileType]);

  useEffect(() => {
    if (!orgId || !id || !profileType) return;
    const field = LINK_FIELD_FOR[profileType];
    const unsub = onSnapshot(
      query(collection(db, "transactions"), where("organizationId", "==", orgId), where(field, "==", id)),
      (snap) => setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnyDoc))
        .sort((a, b) => (b.date > a.date ? 1 : -1)))
    );
    return () => unsub();
  }, [orgId, id, profileType]);

  useEffect(() => {
    if (!orgId || profileType !== "labourContractor") return;
    return subscribeHarvestRecords(orgId, setHarvestRecs);
  }, [orgId, profileType]);

  const myRecords = harvestRecs.filter((r) => r.contractorId === id);

  const { totalCredit, totalDebit, balance } = useMemo(() => {
    if (profileType === "labourContractor") {
      const totalDebit = myRecords.reduce((s, r) => s + r.totalAmount, 0);
      const totalCredit = myRecords.reduce((s, r) => s + r.advancePaid, 0);
      return { totalCredit, totalDebit, balance: totalCredit - totalDebit };
    }
    const totalCredit = txns.filter((t) => CREDIT_TYPES.includes(t.type)).reduce((s, t) => s + (t.amount || 0), 0);
    const totalDebit = txns.filter((t) => !CREDIT_TYPES.includes(t.type)).reduce((s, t) => s + (t.amount || 0), 0);
    return { totalCredit, totalDebit, balance: totalCredit - totalDebit };
  }, [txns, myRecords, profileType]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
    </div>
  );

  if (!profile || !TYPE_CONFIG[profileType]) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-gray-500">Profile not found</p>
      <button onClick={() => navigate("/profiles")} className="text-sm font-semibold" style={{ color: "#1B5E20" }}>Back to Profiles</button>
    </div>
  );

  const cfg = TYPE_CONFIG[profileType];
  const Icon = cfg.icon;
  const isActive = profile.isActive !== false;
  const subtitle = profileType === "dealer" ? (profile.businessName || profile.productsServices)
    : profileType === "farmer" ? profile.farmName
    : profileType === "labourContractor" ? `${profile.teamSize ?? 0} workers`
    : profile.customLabel;

  const recentEntries = profileType === "labourContractor"
    ? myRecords.slice(0, 10).map((r) => ({
        id: r.id, label: `Harvest — ${r.parcelName}`, date: r.harvestDate,
        credit: false, amount: r.totalAmount,
      }))
    : txns.slice(0, 10).map((t) => ({
        id: t.id, label: t.categoryLabel || t.description || t.type, date: t.date,
        credit: CREDIT_TYPES.includes(t.type), amount: t.amount,
      }));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.back()} className="text-white active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">{profile.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>{cfg.label}</span>
              {isActive ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>Active</span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
                  <EyeOff size={10} /> Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <Icon size={28} color="white" />
          </div>
          <div>
            {profile.phone && <p className="text-green-100 text-sm flex items-center gap-1.5"><Phone size={13} /> {profile.phone}</p>}
            {profile.address && <p className="text-green-100 text-sm flex items-center gap-1.5 mt-0.5"><MapPin size={13} /> {profile.address}</p>}
            {subtitle && <p className="text-green-200 text-xs mt-1">{subtitle}</p>}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-800 mb-3">Basic Information</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm"><span className="text-gray-400">Name</span><span className="text-gray-800 font-medium">{profile.name}</span></div>
            {profile.phone && <div className="flex justify-between text-sm"><span className="text-gray-400">Phone</span><span className="text-gray-800 font-medium">{profile.phone}</span></div>}
            {profile.address && <div className="flex justify-between text-sm"><span className="text-gray-400">Address</span><span className="text-gray-800 font-medium text-right">{profile.address}</span></div>}
            {profileType === "farmer" && profile.farmName && <div className="flex justify-between text-sm"><span className="text-gray-400">Farm Name</span><span className="text-gray-800 font-medium">{profile.farmName}</span></div>}
            {profileType === "dealer" && profile.businessName && <div className="flex justify-between text-sm"><span className="text-gray-400">Business Name</span><span className="text-gray-800 font-medium">{profile.businessName}</span></div>}
            {profileType === "dealer" && profile.productsServices && <div className="flex justify-between text-sm"><span className="text-gray-400">Products/Services</span><span className="text-gray-800 font-medium text-right">{profile.productsServices}</span></div>}
            {profileType === "labourContractor" && <div className="flex justify-between text-sm"><span className="text-gray-400">Team Size</span><span className="text-gray-800 font-medium">{profile.teamSize ?? 0} workers</span></div>}
            {profileType === "custom" && profile.customLabel && <div className="flex justify-between text-sm"><span className="text-gray-400">Custom Label</span><span className="text-gray-800 font-medium">{profile.customLabel}</span></div>}
          </div>
          {profile.notes && (
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-start gap-2">
              <StickyNote size={14} color="#9CA3AF" className="mt-0.5 shrink-0" />
              <p className="text-gray-500 text-sm">{profile.notes}</p>
            </div>
          )}
        </div>

        {/* Linked Khata */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen size={16} color="#1B5E20" />
              <p className="font-bold text-gray-800">Linked Khata Account</p>
            </div>
            <button onClick={() => navigate(`/khata?view=${profileType}&id=${id}`)}
              className="px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
              style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
              Open Khata
            </button>
          </div>

          <div className="mb-3 rounded-xl p-3" style={{ backgroundColor: balance >= 0 ? "#E3F2FD" : "#FFEBEE" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet size={14} color={balance >= 0 ? "#1565C0" : "#C62828"} />
              <p className="text-xs font-medium" style={{ color: balance >= 0 ? "#1565C0" : "#C62828" }}>Current Balance</p>
            </div>
            <p className="font-bold text-lg" style={{ color: balance >= 0 ? "#1565C0" : "#C62828" }}>
              {balance < 0 ? "−" : ""}{fmt(Math.abs(balance))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
              <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={14} color="#1B5E20" /><p className="text-xs font-medium" style={{ color: "#1B5E20" }}>Total Credit</p></div>
              <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(totalCredit)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
              <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={14} color="#C62828" /><p className="text-xs font-medium" style={{ color: "#C62828" }}>Total Debit</p></div>
              <p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmt(totalDebit)}</p>
            </div>
          </div>

          <p className="font-bold text-gray-700 text-sm mb-2">Recent Transactions</p>
          {recentEntries.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No transactions yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-gray-800 font-medium text-sm truncate">{e.label}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(e.date)}</p>
                  </div>
                  <p className="font-semibold text-sm shrink-0" style={{ color: e.credit ? "#1B5E20" : "#C62828" }}>
                    {e.credit ? "+" : "−"}{fmt(e.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
