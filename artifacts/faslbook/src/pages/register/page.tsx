

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase/config";
import { compressImage } from "@/lib/utils/compressImage";
import {
  User, Mail, Lock, Phone,
  ArrowLeft, Loader2, Eye, EyeOff,
  Wheat, Users, Tractor, Camera,
} from "lucide-react";

const roleConfig: Record<string, {
  label: string;
  urdu: string;
  color: string;
  bg: string;
  icon: any;
}> = {
  landlord: { label: "Landlord", urdu: "زمیندار", color: "#1B5E20", bg: "#E8F5E9", icon: Wheat },
  manager:  { label: "Manager",  urdu: "منیجر",   color: "#1565C0", bg: "#E3F2FD", icon: Users },
  farmer:   { label: "Farmer",   urdu: "کسان",    color: "#E65100", bg: "#FFF3E0", icon: Tractor },
};

export default function RegisterPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const role   = searchParams.get("role") || "landlord";
  const config = roleConfig[role] || roleConfig.landlord;
  const Icon   = config.icon;

  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [phone, setPhone]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");

  const handleRegister = async () => {
    if (!name || !email || !phone || !password || !confirm) {
      setError("Please fill all fields"); return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters"); return;
    }
    if (password !== confirm) {
      setError("Passwords do not match"); return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await createUserWithEmailAndPassword(auth, email, password);

      let photoUrl = "";
      if (photoFile) {
        const compressed = await compressImage(photoFile, { maxWidth: 400, quality: 0.5 });
        const storageRef = ref(storage, `profiles/${result.user.uid}/profile.jpg`);
        await uploadBytes(storageRef, compressed);
        photoUrl = await getDownloadURL(storageRef);
      }

      await setDoc(doc(db, "users", result.user.uid), {
        id: result.user.uid,
        name,
        email,
        phone,
        photoUrl,
        role,
        organizationId: null,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: "synced",
      });

      if (role === "landlord") {
        window.location.replace("/create-farm");
      } else {
        window.location.replace("/join-farm");
      }

    } catch (err: any) {
      const code = err.code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("This email is already registered. Please login instead.");
      } else if (code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your internet connection.");
      } else {
        setError("Registration failed. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: config.color }}>
        <button onClick={() => window.history.back()} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-full p-2" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <Icon size={22} color="white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Create Account</h1>
            <p className="text-white text-xs opacity-80">as {config.label} • {config.urdu}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
            <p>{error}</p>
            {error.includes("already registered") && (
              <button onClick={() => window.location.href = "/email"}
                className="mt-2 text-red-700 underline font-semibold text-xs">
                → Go to Login
              </button>
            )}
          </div>
        )}

        {/* ── Photo Picker ───────────────────────────────── */}
        <input
          type="file"
          accept="image/*"
          id="regPhoto"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPhotoFile(file);
              setPhotoPreview(URL.createObjectURL(file));
            }
          }}
        />
        <div className="flex flex-col items-center mb-6">
          <div
            onClick={() => document.getElementById("regPhoto")?.click()}
            className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden"
            style={{ backgroundColor: "#F9F9F9" }}
          >
            {photoPreview ? (
              <img src={photoPreview} className="w-full h-full object-cover" alt="preview" />
            ) : (
              <>
                <Camera size={28} color="#9E9E9E" />
                <p className="text-gray-400 text-xs mt-1">Add Photo</p>
              </>
            )}
          </div>
          <p className="text-gray-400 text-xs mt-2">Optional</p>
        </div>

        {/* Full Name */}
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Full Name</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <User size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input type="text" placeholder="Muhammad Ali" value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          </div>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Email Address</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Mail size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input type="email" placeholder="example@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          </div>
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Phone Number</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Phone size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input type="tel" placeholder="03XX-XXXXXXX" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          </div>
        </div>

        {/* Password */}
        <div className="mb-4">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Password</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Lock size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input type={showPassword ? "text" : "password"} placeholder="Minimum 6 characters"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={20} color="#9E9E9E" /> : <Eye size={20} color="#9E9E9E" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="mb-8">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Confirm Password</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Lock size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input type="password" placeholder="Re-enter password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
          </div>
        </div>

        <button onClick={handleRegister} disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: config.color }}>
          {loading ? <Loader2 size={22} className="animate-spin" /> : "Create Account"}
        </button>

        <div className="text-center mt-5">
          <p className="text-gray-500 text-sm">
            Already have account?{" "}
            <button onClick={() => window.location.href = "/email"} className="font-bold" style={{ color: config.color }}>
              Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
