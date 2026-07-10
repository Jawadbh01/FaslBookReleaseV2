import { useLocation } from "wouter";
import TopBar from "./TopBar";

const HIDDEN_PATHS = [
  "/crops", "/inventory", "/ledger", "/income", "/expenses",
  "/workers", "/dealers", "/loans", "/parcels", "/reports",
  "/farmers", "/approvals", "/profile",
];

export default function ConditionalTopBar() {
  const [pathname] = useLocation();
  const hide = HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (hide) return null;
  return <TopBar />;
}
