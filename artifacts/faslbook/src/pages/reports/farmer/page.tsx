import { useEffect } from "react";
export default function ReportsFarmerPage() {
  useEffect(() => { window.location.replace("/reports/print?type=ledger"); }, []);
  return null;
}
