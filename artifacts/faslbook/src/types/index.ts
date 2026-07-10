export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Parcel {
  id: string;
  orgId: string;
  name: string;
  area: number;
  areaUnit: "acres" | "hectares" | "marla" | "kanal";
  location?: string;
  createdAt: string;
}

export interface Crop {
  id: string;
  orgId: string;
  parcelId: string;
  name: string;
  season: string;
  sowingDate?: string;
  harvestDate?: string;
  status: "planned" | "growing" | "harvested";
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  orgId: string;
  name: string;
  category: "seed" | "fertilizer" | "pesticide" | "equipment" | "other";
  quantity: number;
  unit: string;
  createdAt: string;
}

export interface Farmer {
  id: string;
  orgId: string;
  name: string;
  phone?: string;
  cnic?: string;
  address?: string;
  createdAt: string;
}

export interface Worker {
  id: string;
  orgId: string;
  name: string;
  phone?: string;
  role?: string;
  dailyWage?: number;
  createdAt: string;
}

export interface Dealer {
  id: string;
  orgId: string;
  name: string;
  phone?: string;
  address?: string;
  category?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  orgId: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface Income {
  id: string;
  orgId: string;
  title: string;
  amount: number;
  source: string;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  orgId: string;
  personName: string;
  type: "given" | "taken";
  amount: number;
  date: string;
  dueDate?: string;
  status: "pending" | "paid";
  notes?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  orgId: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
  createdAt: string;
}
