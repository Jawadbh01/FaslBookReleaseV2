import {
  Sprout, FlaskConical, Zap, Fuel, Wrench, MoreHorizontal, Warehouse,
} from "lucide-react";

export const categoryConfig: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  seed:           { label: "Seed",            color: "#1B5E20", bg: "#E8F5E9", Icon: Sprout },
  fertilizer:     { label: "Fertilizer",      color: "#1565C0", bg: "#E3F2FD", Icon: FlaskConical },
  pesticide:      { label: "Pesticide",       color: "#B71C1C", bg: "#FFEBEE", Icon: Zap },
  fuel:           { label: "Fuel",            color: "#E65100", bg: "#FFF3E0", Icon: Fuel },
  cropStock:      { label: "Crop Stock",      color: "#00695C", bg: "#E0F2F1", Icon: Warehouse },
  machineryParts: { label: "Machinery Parts", color: "#4527A0", bg: "#EDE7F6", Icon: Wrench },
  other:          { label: "Other",           color: "#757575", bg: "#F5F5F5", Icon: MoreHorizontal },
};
