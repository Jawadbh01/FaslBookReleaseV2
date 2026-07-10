

import { useState } from "react";
import {
  doc, setDoc, updateDoc,
  serverTimestamp, collection
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { saveCache } from "@/components/shared/AuthProvider";
import { Wheat, MapPin, ArrowLeft, Loader2, Copy, Check } from "lucide-react";

const generateFarmId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "FB-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const provinces = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Gilgit-Baltistan",
  "Azad Kashmir",
];

export default function CreateFarmPage() {
  const { setOrganization } = useAuthStore();
  const [farmName, setFarmName] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdFarmId, setCreatedFarmId] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(createdFarmId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!farmName || !village || !district || !province) {
      setError("Please fill all fields");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError("Session expired. Please login again.");
      window.location.replace("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const farmId = generateFarmId();
      const orgRef = doc(collection(db, "organizations"));

      const orgData = {
        id: orgRef.id,
        farmId,
        name: farmName,
        village,
        district,
        province,
        landlordId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        settings: {
          currency: "PKR",
          language: "en",
          theme: "light",
        },
      };

      await setDoc(orgRef, orgData);

      await updateDoc(doc(db, "users", user.uid), {
        organizationId: orgRef.id,
        role: "landlord",
        status: "active",
        updatedAt: serverTimestamp(),
      });

      setOrganization(orgData as any);
      // Cache now — the "Go to Dashboard" button below does a hard navigation to
      // /overview, and without a cache AuthProvider would immediately bounce it
      // straight back to /login for lack of any cached session.
      saveCache(user, orgData, "landlord");
      setCreatedFarmId(farmId);

    } catch (err: any) {
      console.error("Create farm error:", err);
      setError(`Failed to create farm: ${err?.message || "Please try again."}`);
    } finally {
      setLoading(false);
    }
  };

  // Success screen — use window.location.href for guaranteed navigation
  if (createdFarmId) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-lg"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <Wheat size={40} color="white" />
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Farm Created! 🎉
        </h1>
        <p className="text-gray-500 text-sm text-center mb-8">
          Your farm is ready. Share your Farm ID with managers and farmers to join.
        </p>

        {/* Farm ID Card */}
        <div
          className="w-full rounded-2xl p-6 mb-8 text-center"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <p className="text-green-700 text-sm font-medium mb-2">
            Your Farm ID
          </p>
          <p
            className="text-3xl font-bold tracking-widest mb-4"
            style={{ color: "#1B5E20" }}
          >
            {createdFarmId}
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 mx-auto px-6 py-2 rounded-xl text-white text-sm font-medium"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {copied
              ? <><Check size={16} /> Copied!</>
              : <><Copy size={16} /> Copy Farm ID</>
            }
          </button>
        </div>

        {/* Hard navigation — guaranteed to work */}
        <button
          onClick={() => { window.location.href = "/overview"; }}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ backgroundColor: "#1B5E20" }}
        >
          Go to Dashboard 🌾
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
            <h1 className="text-white text-xl font-bold">Create Your Farm</h1>
            <p className="text-green-200 text-xs">
              Setup your farm to get started
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-8 pb-10 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
            {error}
          </div>
        )}

        {/* Farm Name */}
        <div className="mb-5">
          <label className="text-gray-600 text-sm font-medium mb-2 block">
            Farm Name
          </label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Wheat size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type="text"
              placeholder="e.g. Ali Farm, Green Fields"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
          </div>
        </div>

        {/* Village */}
        <div className="mb-5">
          <label className="text-gray-600 text-sm font-medium mb-2 block">
            Village
          </label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <MapPin size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type="text"
              placeholder="Enter village name"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
          </div>
        </div>

        {/* District */}
        <div className="mb-5">
          <label className="text-gray-600 text-sm font-medium mb-2 block">
            District
          </label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <MapPin size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type="text"
              placeholder="Enter district name"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
          </div>
        </div>

        {/* Province */}
        <div className="mb-8">
          <label className="text-gray-600 text-sm font-medium mb-2 block">
            Province
          </label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <MapPin size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            >
              <option value="">Select Province</option>
              {provinces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "#1B5E20" }}
        >
          {loading
            ? <Loader2 size={22} className="animate-spin" />
            : "🌾  Create My Farm"
          }
        </button>

        <div
          className="mt-5 px-4 py-3 rounded-xl"
          style={{ backgroundColor: "#E8F5E9" }}
        >
          <p className="text-green-800 text-xs text-center">
            A unique Farm ID like <strong>FB-7H9D4K</strong> will be
            auto-generated. Share it with your team to join your farm.
          </p>
        </div>
      </div>
    </div>
  );
}
