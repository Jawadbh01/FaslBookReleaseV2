import { create } from "zustand";

interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

interface OrgState {
  org: Organization | null;
  setOrg: (org: Organization | null) => void;
}

export const useOrgStore = create<OrgState>((set) => ({
  org: null,
  setOrg: (org) => set({ org }),
}));
