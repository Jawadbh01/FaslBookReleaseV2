import { useEffect } from "react";
export default function ReportsLedgerPage() {
  useEffect(() => { window.location.replace("/reports/print?type=ledger"); }, []);
  return null;
}
