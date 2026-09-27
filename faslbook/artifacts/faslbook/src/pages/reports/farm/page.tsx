import { useEffect } from "react";
export default function ReportsFarmPage() {
  useEffect(() => { window.location.replace("/reports/print?type=summary"); }, []);
  return null;
}
