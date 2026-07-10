

import { useState } from "react";
import { useLocation } from "wouter";
import {
  collection, query, where,
  getDocs, addDoc, serverTimestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft, Wheat, Search,
  Loader2, CheckCircle, Building2, LogOut,
} from "lucide-react";

export default function JoinFarmPage() {
  
  const { user } = useAuthStore();
  const [farmId, setFarmId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [farm, setFarm] = useState<any>(null);
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const handleSearch = async () => {
    const clean = farmId.trim().toUpperCase();
    if (!clean) {
      setError("Please enter a Farm ID");
      return;
    }
    if (!clean.startsWith("FB-")) {
      setError("Farm ID must start with FB- (e.g. FB-7H9D4K)");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setFarm(null);

      const q = query(
        collection(db, "organizations"),
        where("farmId", "==", clean)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("No farm found with this ID. Please check and try again.");
        return;
      }

      setFarm({ id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch (err) {
      setError("Search failed. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !farm) return;

    try {
      setRequesting(true);
      setError("");

      // Check if already requested
      const existing = query(
        collection(db, "joinRequests"),
        where("userId", "==", currentUser.uid),
        where("organizationId", "==", farm.id)
      );
      const existingSnap = await getDocs(existing);

      if (!existingSnap.empty) {
        setError("You have already requested to join this farm.");
        setRequesting(false);
        return;
      }

      const { useAuthStore: store } = await import("@/store/authStore");
      const role = store.getState().role;

      // Create join request
      await addDoc(collection(db, "joinRequests"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "",
        userEmail: currentUser.email || "",
        organizationId: farm.id,
        farmName: farm.name,
        farmId: farm.farmId,
        role: role || "farmer",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRequested(true);
    } catch (err) {
      setError("Failed to send request. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  // Success screen
  if (requested) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <CheckCircle size={52} color="#1B5E20" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Request Sent! 🎉
        </h1>
        <p className="text-gray-500 text-sm mb-2">
          Your request to join
        </p>
        <div
          className="px-6 py-3 rounded-2xl mb-6"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <p className="font-bold text-lg" style={{ color: "#1B5E20" }}>
            {farm?.name}
          </p>
          <p className="text-green-700 text-sm">{farm?.farmId}</p>
        </div>
        <p className="text-gray-400 text-sm mb-8">
          The landlord will review your request and approve it shortly.
          You will be notified once approved.
        </p>
        <button
          onClick={() => window.location.replace("/pending")}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ backgroundColor: "#1B5E20" }}
        >
          Go to Waiting Screen
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div
        className="px-4 pt-12 pb-8"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <button
          onClick={() => window.history.back()}
          className="text-white mb-4 block"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-full p-2 shadow">
            <Wheat size={28} color="#1B5E20" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">
              Join a Farm
            </h1>
            <p className="text-green-200 text-xs">
              Enter Farm ID given by your landlord
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-8 pb-10 overflow-y-auto">

        {/* Farm ID Input */}
        <div className="mb-2">
          <label className="text-gray-600 text-sm font-medium mb-2 block">
            Farm ID
          </label>
          <div className="flex gap-3">
            <div className="flex-1 flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Building2
                size={20}
                color="#9E9E9E"
                className="mr-3 shrink-0"
              />
              <input
                type="text"
                placeholder="e.g. FB-7H9D4K"
                value={farmId}
                onChange={(e) => setFarmId(e.target.value.toUpperCase())}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent font-mono tracking-widest"
                maxLength={9}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-4 rounded-2xl text-white font-bold flex items-center gap-1 shrink-0"
              style={{ backgroundColor: "#1B5E20" }}
            >
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <Search size={18} />
              }
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mt-3 mb-4">
            {error}
          </div>
        )}

        {/* Farm Found Card */}
        {farm && (
          <div
            className="mt-6 rounded-2xl p-5 border-2"
            style={{
              borderColor: "#1B5E20",
              backgroundColor: "#F1F8E9"
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Wheat size={24} color="white" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-lg">
                  {farm.name}
                </p>
                <p className="text-green-700 text-sm font-mono">
                  {farm.farmId}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white rounded-xl p-3">
                <p className="text-gray-400 text-xs mb-1">Village</p>
                <p className="text-gray-800 font-semibold text-sm">
                  {farm.village}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3">
                <p className="text-gray-400 text-xs mb-1">District</p>
                <p className="text-gray-800 font-semibold text-sm">
                  {farm.district}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3 col-span-2">
                <p className="text-gray-400 text-xs mb-1">Province</p>
                <p className="text-gray-800 font-semibold text-sm">
                  {farm.province}
                </p>
              </div>
            </div>

            <button
              onClick={handleRequest}
              disabled={requesting}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "#1B5E20" }}
            >
              {requesting
                ? <Loader2 size={22} className="animate-spin" />
                : "Request to Join This Farm"
              }
            </button>
          </div>
        )}

        {/* Info */}
        {!farm && !loading && (
          <div
            className="mt-8 px-4 py-4 rounded-2xl"
            style={{ backgroundColor: "#F5F5F5" }}
          >
            <p className="text-gray-500 text-xs text-center">
              Ask your landlord for the Farm ID. It looks like{" "}
              <strong className="font-mono">FB-7H9D4K</strong>
            </p>
          </div>
        )}

        {/* Sign out */}
        <div className="mt-10 flex justify-center">
          <button
            onClick={async () => {
              await signOut(auth);
              window.location.replace("/login");
            }}
            className="flex items-center gap-2 text-gray-400 text-sm"
          >
            <LogOut size={16} />
            Logout and use different account
          </button>
        </div>
      </div>
    </div>
  );
}
