import { useState } from "react";
import { useLocation } from "wouter";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { saveCache } from "@/components/shared/AuthProvider";
import { Mail, Lock, ArrowLeft, Loader2, Eye, EyeOff, Wheat, CheckCircle } from "lucide-react";

export default function EmailLoginPage() {

  // ── Login state ──────────────────────────────────────────────
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  // ── Forgot password state ────────────────────────────────────
  const [forgotMode, setForgotMode]     = useState(false);
  const [resetEmail, setResetEmail]     = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const [resetError, setResetError]     = useState("");

  // ── Login handler ────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter email and password"); return; }
    setLoading(true); setError("");
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const userSnap = await getDoc(doc(db, "users", credential.user.uid));
      if (!userSnap.exists()) { window.location.replace("/role-select"); return; }
      const userData = userSnap.data();
      if (!userData.role) { window.location.replace("/role-select"); return; }
      if (userData.role === "farmer") {
        setError("Farmers don't have a separate login. Contact your farm Landlord or Manager.");
        setLoading(false); return;
      }
      if (!userData.organizationId) {
        saveCache(credential.user, null, userData.role);
        window.location.replace(userData.role === "landlord" ? "/create-farm" : "/join-farm");
        return;
      }
      const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
      saveCache(credential.user, orgSnap.exists() ? orgSnap.data() : null, userData.role);
      window.location.replace("/overview");
    } catch (err: any) {
      const code = err.code ?? "";
      if (["auth/invalid-credential","auth/user-not-found","auth/wrong-password"].includes(code))
        setError("Incorrect email or password. Please try again.");
      else if (code === "auth/invalid-email")    setError("Invalid email address.");
      else if (code === "auth/too-many-requests") setError("Too many attempts. Please wait and try again.");
      else if (code === "auth/network-request-failed") setError("Network error. Check your connection.");
      else setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  // ── Password reset handler ───────────────────────────────────
  const handleResetPassword = async () => {
    const addr = resetEmail.trim();
    if (!addr) { setResetError("Enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setResetError("Enter a valid email address."); return; }
    setResetSending(true); setResetError("");
    try {
      await sendPasswordResetEmail(auth, addr);
      setResetSent(true);
    } catch (err: any) {
      const code = err.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/invalid-email")
        setResetError("No account found with this email.");
      else if (code === "auth/too-many-requests")
        setResetError("Too many attempts. Please wait a few minutes.");
      else if (code === "auth/network-request-failed")
        setResetError("Network error. Check your connection.");
      else
        setResetError("Could not send reset email. Please try again.");
    } finally { setResetSending(false); }
  };

  // ═══ FORGOT PASSWORD VIEW ════════════════════════════════════
  if (forgotMode) return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={() => { setForgotMode(false); setResetSent(false); setResetError(""); }} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-white text-xl font-bold">Reset Password</h1>
          <p className="text-green-200 text-xs">We'll send a link to your Gmail</p>
        </div>
      </div>

      <div className="flex-1 px-6 pt-8 pb-10">
        {resetSent ? (
          // ── Success state ──
          <div className="flex flex-col items-center text-center pt-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow"
              style={{ backgroundColor: "#E8F5E9" }}>
              <CheckCircle size={44} color="#1B5E20" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Email Sent!</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              A password reset link has been sent to:
            </p>
            <p className="font-semibold text-gray-800 mb-6">{resetEmail}</p>
            <p className="text-gray-400 text-xs mb-10 leading-relaxed">
              Check your inbox (and spam folder). Click the link in the email to set a new password.
            </p>
            <button
              onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(""); }}
              className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
              style={{ backgroundColor: "#1B5E20" }}>
              Back to Login
            </button>
          </div>
        ) : (
          // ── Input state ──
          <>
            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
              Enter the email address linked to your FaslBook account and we'll send you a reset link.
            </p>

            {resetError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">
                {resetError}
              </div>
            )}

            <label className="text-gray-600 text-sm font-medium mb-2 block">Email Address</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 mb-8 focus-within:border-green-700">
              <Mail size={20} color="#9E9E9E" className="mr-3 shrink-0" />
              <input
                type="email"
                placeholder="your@gmail.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                autoFocus
              />
            </div>

            <button
              onClick={handleResetPassword}
              disabled={resetSending}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
              style={{ backgroundColor: "#1B5E20" }}>
              {resetSending ? <Loader2 size={22} className="animate-spin" /> : "Send Reset Link"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ═══ LOGIN VIEW ═══════════════════════════════════════════════
  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={() => window.history.back()} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <Wheat size={20} color="white" />
          <div>
            <h1 className="text-white text-xl font-bold">Login with Email</h1>
            <p className="text-green-200 text-xs">Welcome back!</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-8 pb-10 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        <div className="mb-5">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Email Address</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Mail size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Password</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Lock size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={20} color="#9E9E9E" /> : <Eye size={20} color="#9E9E9E" />}
            </button>
          </div>
        </div>

        {/* Forgot password — pre-fills reset email with whatever is typed in the login field */}
        <div className="text-right mb-8">
          <button
            type="button"
            onClick={() => { setResetEmail(email); setForgotMode(true); }}
            style={{ color: "#1B5E20" }}
            className="text-sm font-medium">
            Forgot Password?
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          style={{ backgroundColor: "#1B5E20" }}>
          {loading ? <Loader2 size={22} className="animate-spin" /> : "Login"}
        </button>

        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            No account?{" "}
            <button
              onClick={() => window.location.href = "/role-select"}
              className="font-bold"
              style={{ color: "#1B5E20" }}>
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
