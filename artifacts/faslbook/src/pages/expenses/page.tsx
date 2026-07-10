
import { useEffect } from "react";
import { useLocation } from "wouter";
export default function ExpensesPage() {
  
  useEffect(() => { window.location.replace("/ledger?view=addExpense"); }, []);
  return null;
}
