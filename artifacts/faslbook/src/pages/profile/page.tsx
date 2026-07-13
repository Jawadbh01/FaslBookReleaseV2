import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential, GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase/config";
import { clearAuthCache } from "@/components/shared/AuthProvider";
import { compressImage } from "@/lib/utils/compressImage";
import { useAuthStore } from "@/store/authStore";
import { useLangStore } from "@/store/langStore";
import { useDarkMode } from "@/hooks/useDarkMode";
import { usePushNotifications, NOTIF_PREF_KEY } from "@/hooks/usePushNotifications";
import {
  ChevronLeft, User, Mail, Phone,
  LogOut, Camera, Sun, Moon, Bell, BellOff,
  Copy, Check, Wheat, Loader2, Calendar, ChevronRight,
  Trash2, AlertTriangle, X, ShieldCheck, Lock,
} from "lucide-react";
import type { Lang } from "@/lib/i18n/translations";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type DeleteStep = "idle" | "confirm" | "reauth" | "deleting";

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, organization, role } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const { dark, toggle: toggleDark } = useDarkMode();
  const orgId = organization?.id ?? null;

  // ── Push notifications state ────────────────────────────────
  const { permState, requestPermission } = usePushNotifications(orgId);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    const pref = localStorage.getItem(NOTIF_PREF_KEY);
    if (pref === "off") return false;
    return true; // default on if permission is granted
  });

  // ── Profile data ────────────────────────────────────────────
  const [userName, setUserName]         = useState("");
  const [userPhone, setUserPhone]       = useState("");
  const [photoUrl, setPhotoUrl]         = useState("");
  const [copied, setCopied]             = useState(false);
  const [loggingOut, setLoggingOut]     = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError]               = useState("");

  // ── Delete account flow ─────────────────────────────────────
  const [deleteStep, setDeleteStep]     = useState<DeleteStep>("idle");
  const [deleteError, setDeleteError]   = useState("");
  const [reauthPass, setReauthPass]     = useState("");
  const [confirmText, setConfirmText]   = useState("");
  const confirmRef                      = useRef<HTMLInputElement>(null);

  // ── Load user data ──────────────────────────────────────────
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

  // ── Photo upload ────────────────────────────────────────────
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    const localUrl = URL.createObjectURL(file);
    setPhotoUrl(localUrl);
    setError("");
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 250, quality: 0.35 });
      const storageRef = ref(storage, `profiles/${auth.currentUser.uid}/photo.jpg`);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "users", auth.currentUser.uid), { photoUrl: url });
      setPhotoUrl(url);
      URL.revokeObjectURL(localUrl);
    } catch (err: any) {
      setError(`Upload failed (${err?.code ?? "unknown"}). Shown locally only.`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      ["faslbook_user_cache","faslbook_org_cache","faslbook_last_sync","faslbook-auth"]
        .forEach((k) => localStorage.removeItem(k));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      await signOut(auth);
      window.location.replace("/login");
    } catch {
      window.location.replace("/login");
    }
  };

  // ── Delete account ──────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!user || !auth.currentUser) return;
    setDeleteStep("deleting");
    setDeleteError("");
    try {
      const batch = writeBatch(db);
      const uid   = user.uid;

      // 1. Delete user Firestore doc
      batch.delete(doc(db, "users", uid));

      // 2. Delete all notifications for this org (best effort)
      if (orgId) {
        const notifSnap = await getDocs(
          query(collection(db, "notifications"), where("organizationId", "==", orgId))
        );
        notifSnap.docs.forEach((d) => batch.delete(d.ref));

        // 3. If owner/landlord — delete the org doc
        if (role === "landlord" || role === "owner") {
          batch.delete(doc(db, "organizations", orgId));
        }
      }

      await batch.commit();

      // 4. Delete Firebase Auth account
      await deleteUser(auth.currentUser);

      // 5. Clear local data
      localStorage.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      window.location.replace("/login");
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        setDeleteStep("reauth");
        setDeleteError("Please re-enter your password to confirm deletion.");
      } else {
        setDeleteError(err?.message ?? "Deletion failed. Please try again.");
        setDeleteStep("confirm");
      }
    }
  };

  const handleReauth = async () => {
    if (!auth.currentUser) return;
    setDeleteError("");
    try {
      const providerData = auth.currentUser.providerData;
      const isGoogle = providerData.some((p) => p.providerId === "google.com");

      if (isGoogle) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(auth.currentUser, provider);
      } else {
        const credential = EmailAuthProvider.credential(
          auth.currentUser.email ?? "",
          reauthPass
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      }
      setReauthPass("");
      await handleDeleteAccount();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Re-authentication failed.");
    }
  };

  // ── Notification toggle ─────────────────────────────────────
  const handleNotifToggle = async () => {
    if (permState === "denied") return; // can't re-enable if blocked by browser

    if (permState === "default" && !notifEnabled) {
      // Request permission first
      await requestPermission();
      localStorage.setItem(NOTIF_PREF_KEY, "on");
      setNotifEnabled(true);
      return;
    }

    const next = !notifEnabled;
    localStorage.setItem(NOTIF_PREF_KEY, next ? "on" : "off");
    setNotifEnabled(next);
  };

  const notifActive   = permState === "granted" && notifEnabled;
  const notifBlocked  = permState === "denied";

  // ── Copy Farm ID ────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: dark ? "#0F172A" : "#F8FAFC" }}>

      {/* Hidden file input */}
      <input type="file" accept="image/*" id="photoInput" className="hidden" onChange={handlePhotoChange} />

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-4 pt-10 pb-16" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={24} color="white" />
          </button>
          <h1 className="text-white text-lg font-bold flex-1">Profile & Settings</h1>
        </div>
      </div>

      {/* ── Avatar card ──────────────────────────────────────── */}
      <div className="px-5 -mt-12">
        <div
          className="rounded-2xl shadow-md px-5 pt-5 pb-5 flex flex-col items-center"
          style={{ backgroundColor: dark ? "#1E293B" : "white" }}
        >
          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-3 text-center">{error}</div>
          )}
          <label htmlFor="photoInput" className="relative mb-3 cursor-pointer block" style={{ display: "inline-block" }}>
            {photoUrl ? (
              <img src={photoUrl} alt="profile" className="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-md flex items-center justify-center" style={{ backgroundColor: "#1B5E20" }}>
                <span className="text-white font-bold text-3xl">{initials}</span>
              </div>
            )}
            {uploadingPhoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 size={28} color="white" className="animate-spin" />
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow border-2 border-white" style={{ backgroundColor: "#1B5E20" }}>
              <Camera size={14} color="white" />
            </div>
          </label>
          <p className="font-bold text-xl" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
            {userName || user?.displayName || "User"}
          </p>
          <p className="text-sm mt-0.5" style={{ color: dark ? "#94A3B8" : "#9CA3AF" }}>
            {organization?.name ?? ""}{role ? ` · ${role.charAt(0).toUpperCase() + role.slice(1)}` : ""}
          </p>
        </div>
      </div>

      {/* ── Personal Info ─────────────────────────────────────── */}
      <Section label="Personal Info" dark={dark}>
        <InfoRow icon={<User size={18} color="#1B5E20" />} label="Name"  value={userName || user?.displayName || "—"} dark={dark} />
        <InfoRow icon={<Mail size={18} color="#1B5E20" />} label="Email" value={user?.email || "—"} dark={dark} divider />
        <InfoRow icon={<Phone size={18} color="#1B5E20" />} label="Phone" value={userPhone || "—"} dark={dark} divider />
      </Section>

      {/* ── Language ──────────────────────────────────────────── */}
      <Section label="Language" dark={dark}>
        <div className="flex gap-2 p-4">
          {LANGS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                backgroundColor: lang === code ? "#1B5E20" : dark ? "#0F172A" : "#F3F4F6",
                color: lang === code ? "white" : dark ? "#94A3B8" : "#6B7280",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Appearance & Notifications ────────────────────────── */}
      <Section label="Preferences" dark={dark}>
        {/* Dark mode row */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: dark ? "rgba(234,179,8,0.15)" : "#FEF9C3" }}>
              {dark ? <Moon size={18} color="#EAB308" /> : <Sun size={18} color="#CA8A04" />}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                {dark ? "Dark Mode" : "Light Mode"}
              </p>
              <p className="text-xs" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>
                {dark ? "Easy on the eyes at night" : "Bright and clear"}
              </p>
            </div>
          </div>
          <Toggle on={dark} onToggle={toggleDark} />
        </div>

        <Divider dark={dark} />

        {/* Notifications row */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: notifBlocked
                ? (dark ? "rgba(239,68,68,0.15)" : "#FEF2F2")
                : notifActive
                  ? (dark ? "rgba(27,94,32,0.25)" : "#E8F5E9")
                  : (dark ? "rgba(100,116,139,0.2)" : "#F3F4F6") }}
            >
              {notifBlocked
                ? <Lock size={18} color="#EF4444" />
                : notifActive
                  ? <Bell size={18} color="#1B5E20" />
                  : <BellOff size={18} color={dark ? "#64748B" : "#9CA3AF"} />}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                Notifications
              </p>
              <p className="text-xs" style={{ color: notifBlocked ? "#EF4444" : dark ? "#64748B" : "#9CA3AF" }}>
                {notifBlocked
                  ? "Blocked in browser settings"
                  : notifActive
                    ? "Receiving alerts"
                    : permState === "default"
                      ? "Tap to enable"
                      : "Turned off"}
              </p>
            </div>
          </div>
          {notifBlocked ? (
            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: dark ? "rgba(239,68,68,0.15)" : "#FEE2E2", color: "#EF4444" }}>
              Blocked
            </span>
          ) : (
            <Toggle on={notifActive} onToggle={handleNotifToggle} />
          )}
        </div>
      </Section>

      {/* ── Farm Info ─────────────────────────────────────────── */}
      {organization && (
        <Section label="Farm Info" dark={dark}>
          <div className="flex items-center gap-3 px-4 py-3">
            <IconBox dark={dark}><Wheat size={18} color="#1B5E20" /></IconBox>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>Farm Name</p>
              <p className="text-sm font-semibold truncate" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                {organization.name}
              </p>
            </div>
          </div>
          <Divider dark={dark} />
          <div className="flex items-center gap-3 px-4 py-3">
            <IconBox dark={dark}><Wheat size={18} color="#1B5E20" /></IconBox>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>Farm ID</p>
              <p className="text-sm font-semibold font-mono tracking-wider" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                {organization.farmId}
              </p>
            </div>
            <button
              onClick={copyFarmId}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white shrink-0 active:scale-95 transition-transform"
              style={{ backgroundColor: "#1B5E20" }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <Divider dark={dark} />
          <Link href="/seasons">
            <div className="flex items-center gap-3 px-4 py-3 active:opacity-70">
              <IconBox dark={dark}><Calendar size={18} color="#1B5E20" /></IconBox>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                  Manage Crop Cycles
                </p>
                <p className="text-xs" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>
                  Create, edit and switch crop cycles
                </p>
              </div>
              <ChevronRight size={18} color={dark ? "#475569" : "#9CA3AF"} />
            </div>
          </Link>
        </Section>
      )}

      {/* ── Actions: Sign Out + Delete Account ────────────────── */}
      <div className="px-5 mt-6 flex flex-col gap-3">
        {/* Sign Out */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold text-base disabled:opacity-60 active:scale-98 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <LogOut size={20} />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>

        {/* Delete Account */}
        <button
          onClick={() => { setDeleteStep("confirm"); setDeleteError(""); setConfirmText(""); }}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base active:scale-98 transition-transform border-2"
          style={{ color: "#DC2626", borderColor: "#DC2626", backgroundColor: dark ? "rgba(220,38,38,0.08)" : "#FFF5F5" }}
        >
          <Trash2 size={20} />
          Delete Account
        </button>
      </div>

      {/* ── Version ───────────────────────────────────────────── */}
      <p className="text-center text-xs mt-6" style={{ color: dark ? "#334155" : "#D1D5DB" }}>
        FaslBook V2 · v2.0.0
      </p>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Delete account confirmation modal                     */}
      {/* ══════════════════════════════════════════════════════ */}
      {deleteStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => deleteStep !== "deleting" && setDeleteStep("idle")}
          />

          <div
            className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl z-10"
            style={{ backgroundColor: dark ? "#1E293B" : "white" }}
          >
            {/* Close button */}
            {deleteStep !== "deleting" && (
              <button
                onClick={() => setDeleteStep("idle")}
                className="absolute top-4 right-4 p-1.5 rounded-full"
                style={{ backgroundColor: dark ? "#334155" : "#F3F4F6" }}
              >
                <X size={16} color={dark ? "#94A3B8" : "#6B7280"} />
              </button>
            )}

            {/* ── Confirm step ── */}
            {deleteStep === "confirm" && (
              <>
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "#FEF2F2" }}>
                    <AlertTriangle size={32} color="#DC2626" />
                  </div>
                  <h2 className="text-lg font-bold mb-1" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                    Delete Everything?
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: dark ? "#94A3B8" : "#6B7280" }}>
                    This will permanently delete your account, profile, and all notifications.
                    {(role === "landlord" || role === "owner") && " Your farm organisation record will also be removed."}
                    {" "}This cannot be undone.
                  </p>
                </div>

                <p className="text-xs font-semibold mb-1.5" style={{ color: dark ? "#94A3B8" : "#6B7280" }}>
                  Type <span style={{ color: "#DC2626", fontFamily: "monospace" }}>DELETE</span> to confirm
                </p>
                <input
                  ref={confirmRef}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="DELETE"
                  className="w-full px-4 py-3 rounded-xl text-sm font-mono border-2 outline-none mb-4"
                  style={{
                    backgroundColor: dark ? "#0F172A" : "#F8FAFC",
                    borderColor: confirmText === "DELETE" ? "#DC2626" : dark ? "#334155" : "#E5E7EB",
                    color: dark ? "#F1F5F9" : "#1F2937",
                  }}
                  autoFocus
                />

                {deleteError && (
                  <p className="text-xs text-red-500 mb-3 text-center">{deleteError}</p>
                )}

                <button
                  onClick={handleDeleteAccount}
                  disabled={confirmText !== "DELETE"}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40 active:scale-98 transition-all"
                  style={{ backgroundColor: "#DC2626" }}
                >
                  Yes, Delete My Account
                </button>
              </>
            )}

            {/* ── Re-auth step ── */}
            {deleteStep === "reauth" && (
              <>
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "#FEF2F2" }}>
                    <ShieldCheck size={28} color="#DC2626" />
                  </div>
                  <h2 className="text-base font-bold mb-1" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                    Confirm Your Identity
                  </h2>
                  <p className="text-sm" style={{ color: dark ? "#94A3B8" : "#6B7280" }}>
                    {auth.currentUser?.providerData.some((p) => p.providerId === "google.com")
                      ? "Please sign in with Google to confirm."
                      : "Enter your password to continue."}
                  </p>
                </div>

                {!auth.currentUser?.providerData.some((p) => p.providerId === "google.com") && (
                  <input
                    type="password"
                    value={reauthPass}
                    onChange={(e) => setReauthPass(e.target.value)}
                    placeholder="Your password"
                    className="w-full px-4 py-3 rounded-xl text-sm border-2 outline-none mb-4"
                    style={{
                      backgroundColor: dark ? "#0F172A" : "#F8FAFC",
                      borderColor: dark ? "#334155" : "#E5E7EB",
                      color: dark ? "#F1F5F9" : "#1F2937",
                    }}
                    autoFocus
                  />
                )}

                {deleteError && (
                  <p className="text-xs text-red-500 mb-3 text-center">{deleteError}</p>
                )}

                <button
                  onClick={handleReauth}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm active:scale-98 transition-all"
                  style={{ backgroundColor: "#DC2626" }}
                >
                  {auth.currentUser?.providerData.some((p) => p.providerId === "google.com")
                    ? "Sign in with Google & Delete"
                    : "Confirm & Delete"}
                </button>
              </>
            )}

            {/* ── Deleting step ── */}
            {deleteStep === "deleting" && (
              <div className="flex flex-col items-center py-6 gap-4">
                <Loader2 size={40} color="#DC2626" className="animate-spin" />
                <div className="text-center">
                  <p className="font-bold text-base" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>
                    Deleting your account…
                  </p>
                  <p className="text-sm mt-1" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>
                    Please wait
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function Section({ label, dark, children }: { label: string; dark: boolean; children: React.ReactNode }) {
  return (
    <div className="px-5 mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1"
        style={{ color: dark ? "#475569" : "#9CA3AF" }}>
        {label}
      </p>
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: dark ? "#1E293B" : "white" }}>
        {children}
      </div>
    </div>
  );
}

function Divider({ dark }: { dark: boolean }) {
  return <div className="h-px mx-4" style={{ backgroundColor: dark ? "#334155" : "#F3F4F6" }} />;
}

function IconBox({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: dark ? "rgba(27,94,32,0.25)" : "#E8F5E9" }}>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value, divider, dark }: {
  icon: React.ReactNode; label: string; value: string; divider?: boolean; dark: boolean;
}) {
  return (
    <>
      {divider && <Divider dark={dark} />}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: dark ? "rgba(27,94,32,0.25)" : "#E8F5E9" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: dark ? "#64748B" : "#9CA3AF" }}>{label}</p>
          <p className="text-sm font-medium truncate" style={{ color: dark ? "#F1F5F9" : "#1F2937" }}>{value}</p>
        </div>
      </div>
    </>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0"
      style={{ backgroundColor: on ? "#1B5E20" : "#D1D5DB" }}
      aria-checked={on}
      role="switch"
    >
      <span
        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: on ? "translateX(26px)" : "translateX(2px)" }}
      />
    </button>
  );
}
