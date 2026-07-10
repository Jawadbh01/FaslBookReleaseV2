import { useEffect } from "react";
export default function ReportsGodownPage() {
  useEffect(() => { window.location.replace("/reports/print?type=godown"); }, []);
  return null;
}
