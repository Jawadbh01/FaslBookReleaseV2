

import { useEffect, useState } from "react";
import {
  collection, query, where,
  onSnapshot, doc, updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  CheckCircle, XCircle, Clock,
  User, Wheat, Users, Tractor,
} from "lucide-react";

const roleIcons: Record<string, any> = {
  landlord: Wheat,
  manager: Users,
  farmer: Tractor,
};

const roleColors: Record<string, string> = {
  landlord: "#1B5E20",
  manager: "#1565C0",
  farmer: "#E65100",
};

export default function ApprovalsPage() {
  const { organization } = useAuthStore();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;

    const q = query(
      collection(db, "joinRequests"),
      where("organizationId", "==", organization.id),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [organization?.id]);

  const handleApprove = async (request: any) => {
    try {
      setProcessing(request.id);

      // Update join request
      await updateDoc(doc(db, "joinRequests", request.id), {
        status: "approved",
        updatedAt: serverTimestamp(),
      });

      // Update user document
      await updateDoc(doc(db, "users", request.userId), {
        organizationId: organization!.id,
        role: request.role,
        status: "active",
        updatedAt: serverTimestamp(),
      });

    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: any) => {
    try {
      setProcessing(request.id);

      await updateDoc(doc(db, "joinRequests", request.id), {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });

    } catch (err) {
      console.error("Reject error:", err);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="px-4 pt-6 pb-6"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <h1 className="text-white text-xl font-bold">
          Join Requests
        </h1>
        <p className="text-green-200 text-xs mt-1">
          Approve or reject team member requests
        </p>
      </div>

      <div className="px-4 pt-4 pb-24">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div
              className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100"
              style={{ borderTopColor: "#1B5E20" }}
            />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#E8F5E9" }}
            >
              <Clock size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">
              No Pending Requests
            </p>
            <p className="text-gray-400 text-sm">
              When managers or farmers request to join, they will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {requests.map((req) => {
              const RoleIcon = roleIcons[req.role] || User;
              const roleColor = roleColors[req.role] || "#1B5E20";
              const isProcessing = processing === req.id;

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-5 shadow-sm"
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "#F5F5F5" }}
                    >
                      <User size={24} color="#9E9E9E" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-800">
                        {req.userName || "Unknown User"}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {req.userEmail}
                      </p>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full flex items-center gap-1"
                      style={{
                        backgroundColor: roleColor + "20",
                      }}
                    >
                      <RoleIcon size={12} color={roleColor} />
                      <span
                        className="text-xs font-bold capitalize"
                        style={{ color: roleColor }}
                      >
                        {req.role}
                      </span>
                    </div>
                  </div>

                  {/* Farm Info */}
                  <div
                    className="rounded-xl p-3 mb-4 flex items-center gap-2"
                    style={{ backgroundColor: "#F1F8E9" }}
                  >
                    <Wheat size={16} color="#1B5E20" />
                    <span className="text-green-800 text-sm font-medium">
                      Requesting to join your farm
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReject(req)}
                      disabled={isProcessing}
                      className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-500 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <XCircle size={18} />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={isProcessing}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ backgroundColor: "#1B5E20" }}
                    >
                      <CheckCircle size={18} />
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
