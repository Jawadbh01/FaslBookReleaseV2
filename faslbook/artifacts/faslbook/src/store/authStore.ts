import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Organization {
  id: string;
  farmId: string;
  name: string;
  village: string;
  district: string;
  province: string;
  landlordId: string;
}

interface AuthState {
  user: any | null;
  organization: Organization | null;
  role: "landlord" | "manager" | "farmer" | "worker" | null;
  loading: boolean;
  setUser: (user: any | null) => void;
  setOrganization: (org: Organization | null) => void;
  setRole: (role: AuthState["role"]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,
      role: null,
      loading: true,
      setUser: (user) => set({ user }),
      setOrganization: (organization) => set({ organization }),
      setRole: (role) => set({ role }),
      setLoading: (loading) => set({ loading }),
      reset: () => set({ user: null, organization: null, role: null, loading: false }),
    }),
    {
      name: "faslbook-auth",
      partialize: (state: AuthState) => ({
        organization: state.organization,
        role: state.role,
      }),
    }
  )
);
