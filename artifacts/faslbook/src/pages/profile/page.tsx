


import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase/config";
import { clearAuthCache } from "@/components/shared/AuthProvider";
import { compressImage } from "@/lib/utils/compressImage";
import { useAuthStore } from "@/store/authStore";
import { useLangStore } from "@/store/langStore";
import {
  ChevronLeft, User, Mail, Phone,
  LogOut, Camera, Sun, Moon, Bell,
  Copy, Check, Wheat, Loader2, Calendar, ChevronRight,
} from "lucide-react";
import type { Lang } from "@/lib/i18n/translations";

export default function ProfilePage() {
  
  const { user, organization, role } = useAuthStore();
  const { lang, setLang } = useLangStore();

  const [userName, setUserName]         = useState("");
  const [userPhone, setUserPhone]       = useState("");
  const [photoUrl, setPhotoUrl]         = useState("");
  const [darkMode, setDarkMode]         = useState(false);
  const [notifs, setNotifs]             = useState(true);
  const [copied, setCopied]             = useState(false);
  const [loggingOut, setLoggingOut]     = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError]               = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setUserName(d.name || user.displayName || "");
        setUserPhone(d.phone || user.phoneNumber || "");
        setPhotoUrl(d.photoUrl || user.photoURL || "");
      } else {
        setUserName(user.displayName || "");
        setUserPhone(user.phoneNumber || "");
        setPhotoUrl(user.photoURL || "");
      }
    });
  }, [user?.uid]);

  const initials = (userName || user?.displayName || "U")
    .split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "U";

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("You must be logged in to upload a photo.");
      return;
    }

    // Show preview INSTANTLY from local file — no waiting
    const localUrl = URL.createObjectURL(file);
    setPhotoUrl(localUrl);
    setError("");
    setUploadingPhoto(true);

    // Upload in background — UI is already updated
    (async () => {
      try {
        console.log("[Profile] Starting photo upload for uid:", currentUser.uid);
        console.log("[Profile] File:", file.name, `${(file.size / 1024).toFixed(1)} KB`);

        const compressed = await compressImage(file, { maxWidth: 250, quality: 0.35 });
        console.log("[Profile] Compressed to:", `${(compressed.size / 1024).toFixed(1)} KB`);

        const storageRef = ref(storage, `profiles/${currentUser.uid}/photo.jpg`);
        console.log("[Profile] Uploading to:", storageRef.fullPath);

        await uploadBytes(storageRef, compressed);
        console.log("[Profile] uploadBytes OK");

        const url = await getDownloadURL(storageRef);
        console.log("[Profile] Download URL obtained");

        await updateDoc(doc(db, "users", currentUser.uid), { photoUrl: url });
        setPhotoUrl(url);
        URL.revokeObjectURL(localUrl);
        console.log("[Profile] Photo upload complete ✓");
      } catch (err: any) {
        const code = err?.code ?? "unknown";
        const msg  = err?.message ?? "";
        console.error("[Profile] Photo upload FAILED — code:", code, "| message:", msg, err);

        if (code === "storage/unauthorized") {
          setError("Permission denied (storage/unauthorized). Fix Firebase Storage Rules → allow write: if request.auth != null;");
        } else if (code === "unauthenticated") {
          setError("Not logged in — please log out and back in.");
        } else if (code === "cors" || msg.includes("CORS")) {
          setError("CORS error — Firebase Storage is blocking this domain. Configure CORS in Firebase Console.");
        } else {
          setError(`Upload failed (${code}). Photo shown locally but not saved. Check browser console for details.`);
        }
      } finally {
        setUploadingPhoto(false);
      }
    })();
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Clear localStorage cache first
      localStorage.removeItem("faslbook_user_cache");
      localStorage.removeItem("faslbook_org_cache");
      localStorage.removeItem("faslbook_last_sync");
      localStorage.removeItem("faslbook-auth");

      // Clear all SW caches
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Unregister service worker so it re-installs fresh after next login
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      await signOut(auth);
      window.location.replace("/login");
    } catch (err) {
      console.error("Sign out error:", err);
      window.location.replace("/login");
    }
  };

  const copyFarmId = () => {
    navigator.clipboard.writeText(organization?.farmId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const LANGS: { code: Lang; label: string }[] = [
    { code: "en", label: "English" },
    { code: "ur", label: "اردو" },
    { code: "sd", label: "سنڌي" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        id="photoInput"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* ── Green Header ─────────────────────────────────────── */}
      <div className="px-4 pt-10 pb-16" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} color="white" />
          </button>
          <h1 className="text-white text-lg font-bold flex-1">Profile & Settings</h1>
        </div>
      </div>

      {/* ── Avatar card (overlaps header) ────────────────────── */}
      <div className="px-5 -mt-12">
        <div className="bg-white rounded-2xl shadow-md px-5 pt-5 pb-5 flex flex-col items-center">
          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-3 text-center">{error}</div>
          )}
          <label
            htmlFor="photoInput"
            className="relative mb-3 cursor-pointer block"
            style={{ display: "inline-block" }}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="profile"
                className="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-full border-4 border-white shadow-md flex items-center justify-center"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <span className="text-white font-bold text-3xl">{initials}</span>
              </div>
            )}
            {/* Uploading overlay */}
            {uploadingPhoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 size={28} color="white" className="animate-spin" />
              </div>
            )}
            <div
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow border-2 border-white"
              style={{ backgroundColor: "#1B5E20" }}
            >
              <Camera size={14} color="white" />
            </div>
          </label>
          <p className="text-gray-800 font-bold text-xl">{userName || user?.displayName || "User"}</p>
          <p className="text-gray-400 text-sm">
            {organization?.name ?? ""}{role ? ` • ${role.charAt(0).toUpperCase() + role.slice(1)}` : ""}
          </p>
        </div>
      </div>

      {/* ── Personal Info ─────────────────────────────────────── */}
      <div className="px-5 mt-4">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Personal Info</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <InfoRow icon={<User size={18} color="#1B5E20" />} label="Name" value={userName || user?.displayName || "—"} />
          <InfoRow icon={<Mail size={18} color="#1B5E20" />} label="Email" value={user?.email || "—"} divider />
          <InfoRow icon={<Phone size={18} color="#1B5E20" />} label="Phone" value={userPhone || "—"} divider />
        </div>
      </div>

      {/* ── Language ──────────────────────────────────────────── */}
      <div className="px-5 mt-4">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Language</p>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex gap-3">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  backgroundColor: lang === code ? "#1B5E20" : "#F5F5F5",
                  color: lang === code ? "white" : "#6B7280",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Appearance ────────────────────────────────────────── */}
      <div className="px-5 mt-4">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Appearance</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
                {darkMode ? <Moon size={18} color="#1B5E20" /> : <Sun size={18} color="#1B5E20" />}
              </div>
              <span className="text-gray-800 font-medium text-sm">{darkMode ? "Dark Mode" : "Light Mode"}</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: darkMode ? "#1B5E20" : "#D1D5DB" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: darkMode ? "translateX(26px)" : "translateX(2px)" }}
              />
            </button>
          </div>
          <div className="h-px bg-gray-100 mx-4" />
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
                <Bell size={18} color="#1B5E20" />
              </div>
              <span className="text-gray-800 font-medium text-sm">Notifications</span>
            </div>
            <button
              onClick={() => setNotifs(!notifs)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: notifs ? "#1B5E20" : "#D1D5DB" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: notifs ? "translateX(26px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Farm Info ─────────────────────────────────────────── */}
      {organization && (
        <div className="px-5 mt-4">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Farm Info</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                <Wheat size={18} color="#1B5E20" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs">Farm Name</p>
                <p className="text-gray-800 font-semibold text-sm truncate">{organization.name}</p>
              </div>
            </div>
            <div className="h-px bg-gray-100 mx-4" />
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                <Wheat size={18} color="#1B5E20" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs">Farm ID</p>
                <p className="text-gray-800 font-semibold text-sm font-mono tracking-wider">{organization.farmId}</p>
              </div>
              <button
                onClick={copyFarmId}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl text-white shrink-0"
                style={{ backgroundColor: "#1B5E20" }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="h-px bg-gray-100 mx-4" />
            <Link href="/seasons">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                  <Calendar size={18} color="#1B5E20" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 font-semibold text-sm">Manage Crop Cycles</p>
                  <p className="text-gray-400 text-xs">Create, edit and switch crop cycles</p>
                </div>
                <ChevronRight size={18} color="#9CA3AF" />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Logout ────────────────────────────────────────────── */}
      <div className="px-5 mt-6">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base disabled:opacity-60"
          style={{ backgroundColor: "#C62828" }}
        >
          <LogOut size={20} />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>

      {/* ── Version ───────────────────────────────────────────── */}
      <p className="text-center text-gray-300 text-xs mt-6">FaslBook V2 • v2.0.0</p>
    </div>
  );
}

function InfoRow({
  icon, label, value, divider,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <>
      {divider && <div className="h-px bg-gray-100 mx-4" />}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-xs">{label}</p>
          <p className="text-gray-800 font-medium text-sm truncate">{value}</p>
        </div>
      </div>
    </>
  );
}
