import { useState, useEffect } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { Mail, Phone, Chrome, AlertCircle } from "lucide-react";
import { ASSETS } from "@/lib/utils/assets";

function saveLoginCache(user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null; role: string | null }, org: any | null) {
  try {
    localStorage.setItem("faslbook_user_cache", JSON.stringify({
      uid:         user.uid,
      email:       user.email       || "",
      displayName: user.displayName || "",
      photoURL:    user.photoURL    || "",
      role:        user.role,
    }));
    if (org) localStorage.setItem("faslbook_org_cache", JSON.stringify(org));
  } catch {}
}

async function handleUserAfterAuth(
  uid: string,
  displayName: string | null,
  email: string | null,
  photoURL: string | null
) {
  const userRef  = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      id: uid, name: displayName || "", email: email || "",
      phone: "", photoUrl: photoURL || "", role: null,
      organizationId: null, status: "pending",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), syncStatus: "synced",
    });
    saveLoginCache({ uid, email, displayName, photoURL, role: null }, null);
    window.location.replace("/role-select");
    return;
  }

  const userData = userSnap.data();

  if (!userData.role) {
    saveLoginCache({ uid, email, displayName, photoURL, role: null }, null);
    window.location.replace("/role-select");
    return;
  }

  // Farmers cannot log in — they are managed by landlord/manager
  if (userData.role === "farmer") {
    throw new Error("FARMER_NO_ACCESS");
  }

  if (!userData.organizationId) {
    saveLoginCache({ uid, email, displayName, photoURL, role: userData.role }, null);
    window.location.replace(userData.role === "landlord" ? "/create-farm" : "/join-farm");
    return;
  }

  const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
  const orgData = orgSnap.exists() ? orgSnap.data() : null;

  saveLoginCache({ uid, email, displayName, photoURL, role: userData.role }, orgData);
  window.location.replace("/overview");
}

// Turns a raw Firebase error into a specific, actionable message instead of a
// generic "Login failed" — this is what lets us tell *why* the popup didn't
// work (blocked domain, popup blocked by browser, provider disabled, etc.)
// instead of guessing.
function describeAuthError(err: any): string {
  const code = err?.code || "";
  const domain = typeof window !== "undefined" ? window.location.hostname : "";
  console.error("[FaslBook auth error]", code, err?.message, err);

  switch (code) {
    case "auth/unauthorized-domain":
      return `This domain (${domain}) isn't authorized for sign-in yet. In the Firebase Console, go to Authentication → Settings → Authorized domains and add "${domain}".`;
    case "auth/operation-not-allowed":
      return "This sign-in method is disabled in Firebase. In the Firebase Console, go to Authentication → Sign-in method and enable Google/Facebook.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in window was closed before finishing. Please try again.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    case "auth/network-request-failed":
      return "Network error — check your internet connection and try again.";
    case "auth/internal-error":
      return "Firebase rejected the sign-in request. This usually means Google/Facebook sign-in isn't fully configured for this project yet.";
    case "":
      if (err?.message === "FARMER_NO_ACCESS") {
        return "Farmers don't have a separate login. Contact your farm Landlord or Manager.";
      }
      return `Login failed: ${err?.message || "unknown error"}`;
    default:
      return `Login failed (${code}). Please try again.`;
  }
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("farmer") === "1") {
      setError("Farmers don't have a separate login. Your account is managed by your farm's Landlord or Manager.");
    }
  }, []);

  const doAuth = async (providerFn: () => Promise<any>) => {
    try {
      setLoading(true); setError("");
      const result = await providerFn();
      await handleUserAfterAuth(result.user.uid, result.user.displayName, result.user.email, result.user.photoURL);
    } catch (err: any) {
      setLoading(false);
      setError(describeAuthError(err));
    }
  };

  if (loading) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "linear-gradient(160deg, #1B5E20 0%, #2E7D32 50%, #1B5E20 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <img src="/logo.png" alt="FaslBook"
          style={{ width: 80, height: 80, borderRadius: 20, objectFit: "contain", marginBottom: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        <p style={{ color: "white", fontSize: 26, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>FaslBook</p>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginBottom: 40 }}>Signing in…</p>
        <div style={{ width: 200, height: 4, borderRadius: 9999, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: "40%", borderRadius: 9999,
            backgroundColor: "white",
            animation: "slide 1.4s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100px);opacity:.6}50%{transform:translateX(80px);opacity:1}100%{transform:translateX(260px);opacity:.6}}`}</style>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col overflow-y-auto">
      {/* Banner */}
      <div
        className="relative flex items-center px-5 overflow-hidden shrink-0"
        style={{ backgroundImage: "url(/banner.png)", backgroundSize: "cover", backgroundPosition: "center top", height: 160 }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(5,40,5,0.58)" }} />
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white rounded-xl p-1.5 shadow-md shrink-0" style={{ width: 44, height: 44 }}>
            <img src={ASSETS.logo} alt="FaslBook" className="w-full h-full object-contain rounded-lg"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight drop-shadow">FaslBook</h1>
            <p className="text-green-200 text-xs leading-tight">Farm Operating System</p>
            <p className="text-green-100 text-sm font-semibold leading-tight mt-0.5">خوش آمدید</p>
          </div>
        </div>
        <p className="absolute bottom-3 right-4 text-green-200 text-[10px] font-medium z-10 opacity-80">
          Manage your farm, finances & team
        </p>
      </div>

      {/* Login card */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-3 px-5 pt-8 pb-8">

        {error && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl mb-5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" color="#D97706" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-gray-400 text-xs text-center mb-5 font-medium">
          FOR LANDLORDS &amp; MANAGERS ONLY
        </p>

        <div className="flex flex-col gap-3">
          <button onClick={() => doAuth(() => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); return signInWithPopup(auth, p); })}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 shadow-sm active:scale-95 transition-transform"
            style={{ WebkitTapHighlightColor: "transparent" }}>
            <div className="bg-red-50 rounded-full p-2 shrink-0"><Chrome size={20} color="#EA4335" /></div>
            <span className="text-gray-800 font-semibold text-[15px]">Continue with Google</span>
          </button>

          <button onClick={() => doAuth(() => signInWithPopup(auth, new FacebookAuthProvider()))}
            className="flex items-center gap-3 w-full bg-blue-600 rounded-2xl px-4 py-3.5 active:scale-95 transition-transform"
            style={{ WebkitTapHighlightColor: "transparent" }}>
            <div className="bg-blue-500 rounded-full p-2 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>
            </div>
            <span className="text-white font-semibold text-[15px]">Continue with Facebook</span>
          </button>

          <button disabled
            className="flex items-center gap-3 w-full border-2 border-gray-100 rounded-2xl px-4 py-3.5 opacity-40 cursor-not-allowed bg-gray-50">
            <div className="rounded-full p-2 bg-gray-100 shrink-0"><Phone size={20} color="#9CA3AF" /></div>
            <div className="flex flex-col items-start">
              <span className="font-semibold text-[15px] text-gray-400">Continue with Phone (OTP)</span>
              <span className="text-xs text-gray-400">Not available right now</span>
            </div>
          </button>

          <button onClick={() => { window.location.href = "/email"; }}
            className="flex items-center gap-3 w-full border-2 rounded-2xl px-4 py-3.5 active:scale-95 transition-transform"
            style={{ borderColor: "#1B5E20", WebkitTapHighlightColor: "transparent" }}>
            <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
              <Mail size={20} color="#1B5E20" />
            </div>
            <span className="font-semibold text-[15px]" style={{ color: "#1B5E20" }}>Continue with Email</span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-xs">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="text-center">
          <p className="text-gray-500 text-sm">
            New to FaslBook?{" "}
            <button onClick={() => { window.location.href = "/role-select"; }}
              className="font-bold" style={{ color: "#1B5E20" }}>
              Create Account
            </button>
          </p>
        </div>

        <div className="mt-6 px-4 py-3 rounded-2xl" style={{ backgroundColor: "#F1F8E9" }}>
          <p className="text-green-700 text-xs text-center">
            🌾 <strong>Farmers</strong> are added by the Landlord or Manager — no separate login needed
          </p>
        </div>
      </div>
    </div>
  );
}
