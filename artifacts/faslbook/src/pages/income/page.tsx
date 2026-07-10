
import { useEffect } from "react";
import { useLocation } from "wouter";
export default function IncomePage() {
  
  useEffect(() => { window.location.replace("/ledger?view=addIncome"); }, []);
  return null;
}
