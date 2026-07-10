

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { saveCache } from "@/components/shared/AuthProvider";
import { Wheat, Clock, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";

export default function PendingPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "joinRequests"),
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRequests(data);
      setLoading(false);

      // Check if any request got approved
      const approved = data.find((r: any) => r.status === "approved") as any;
      if (approved) {
        (async () => {
          try {
            // Persist the approved org onto the user's own doc so future logins
            // resolve it directly, and cache it now so the hard navigation to
            // /overview below doesn't get bounced back to /login for lack of
            // any cached session (AuthProvider requires a cache or a page in
            // its PUBLIC list on every protected route).
            await updateDoc(doc(db, "users", user.uid), {
              organizationId: approved.organizationId,
              status: "active",
              updatedAt: serverTimestamp(),
            });
            const orgSnap = await getDoc(doc(db, "organizations", approved.organizationId));
            const orgData = orgSnap.exists() ? orgSnap.data() : null;
            saveCache(user, orgData, approved.role || "worker");
          } catch {}
          window.location.replace("/overview");
        })();
      }
    });

    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.replace("/login");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      {/* Icon */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg"
        style={{ backgroundColor: "#E8F5E9" }}
      >
        <Clock size={48} color="#1B5E20" />
      </div>

      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Waiting for Approval
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        منظوری کا انتظار ہے
      </p>

      {/* Requests */}
      {loading ? (
        <div
          className="animate-spin rounded-full h-8 w-8 border-4 border-gray-100 mb-8"
          style={{ borderTopColor: "#1B5E20" }}
        />
      ) : (
        <div className="w-full mb-8">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-2xl p-4 mb-3 text-left"
              style={{ backgroundColor: "#F1F8E9" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#1B5E20" }}
                >
                  <Wheat size={20} color="white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800">
                    {req.farmName}
                  </p>
                  <p className="text-green-700 text-xs font-mono">
                    {req.farmId}
                  </p>
                </div>
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor:
                      req.status === "pending" ? "#FFF3E0" : "#E8F5E9",
                    color:
                      req.status === "pending" ? "#E65100" : "#1B5E20",
                  }}
                >
                  {req.status === "pending" ? "Pending" : "Approved"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-gray-400 text-xs mb-8">
        The landlord will approve your request shortly.
        This page will automatically redirect when approved.
      </p>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 text-gray-400 text-sm"
      >
        <LogOut size={16} />
        Logout and use different account
      </button>
    </div>
  );
}
