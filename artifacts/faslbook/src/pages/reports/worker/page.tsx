import { useEffect } from "react";
export default function ReportsWorkerPage() {
  useEffect(() => { window.location.replace("/reports/print?type=expense"); }, []);
  return null;
}
