import { useEffect } from "react";
export default function ReportsCropsPage() {
  useEffect(() => { window.location.replace("/reports/print?type=expense"); }, []);
  return null;
}
