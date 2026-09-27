import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import AuthProvider from "@/components/shared/AuthProvider";
import BottomNav from "@/components/shared/BottomNav";
import ConditionalTopBar from "@/components/shared/ConditionalTopBar";
import SyncIndicator from "@/components/shared/SyncIndicator";
import OfflineSaveToast from "@/components/shared/OfflineSaveToast";

// All page routes are code-split so the initial bundle only contains the shell.
const LoginPage = lazy(() => import("@/pages/login/page"));
const EmailPage = lazy(() => import("@/pages/email/page"));
const RegisterPage = lazy(() => import("@/pages/register/page"));
const RoleSelectPage = lazy(() => import("@/pages/role-select/page"));
const CreateFarmPage = lazy(() => import("@/pages/create-farm/page"));
const JoinFarmPage = lazy(() => import("@/pages/join-farm/page"));
const PendingPage = lazy(() => import("@/pages/pending/page"));
const OfflinePage = lazy(() => import("@/pages/offline/page"));

const OverviewPage = lazy(() => import("@/pages/overview/page"));
const CropsPage = lazy(() => import("@/pages/crops/page"));
const CropDetailPage = lazy(() => import("@/pages/crops/[id]/page"));
const FarmersPage = lazy(() => import("@/pages/farmers/page"));
const WorkersPage = lazy(() => import("@/pages/workers/page"));
const WorkerDetailPage = lazy(() => import("@/pages/workers/worker/[id]/page"));
const FarmerDetailPage = lazy(() => import("@/pages/workers/farmer/[id]/page"));
const AttendancePage = lazy(() => import("@/pages/workers/attendance/page"));
const AttendanceHistoryPage = lazy(() => import("@/pages/workers/attendance/history/page"));
const WorkforcePage = lazy(() => import("@/pages/workforce/page"));
const WorkforceProfilePage = lazy(() => import("@/pages/workforce/[id]/page"));
const WorkforceAttendancePage = lazy(() => import("@/pages/workforce/attendance/page"));
const WorkforceAttendanceHistoryPage = lazy(() => import("@/pages/workforce/attendance/history/page"));
const WorkforceEmployeePrintPage = lazy(() => import("@/pages/workforce/[id]/print/page"));
const ParcelsPage = lazy(() => import("@/pages/parcels/page"));
const ExpensesPage = lazy(() => import("@/pages/expenses/page"));
const IncomePage = lazy(() => import("@/pages/income/page"));
const InventoryPage = lazy(() => import("@/pages/inventory/page"));
const InventoryDetailPage = lazy(() => import("@/pages/inventory/[id]/page"));
const LedgerPage = lazy(() => import("@/pages/ledger/page"));
const LoansPage = lazy(() => import("@/pages/loans/page"));
const DealersPage = lazy(() => import("@/pages/dealers/page"));
const ApprovalsPage = lazy(() => import("@/pages/approvals/page"));
const NotificationsPage = lazy(() => import("@/pages/notifications/page"));
const ProfilePage = lazy(() => import("@/pages/profile/page"));
const ReportsPage = lazy(() => import("@/pages/reports/page"));
const PrintHubPage = lazy(() => import("@/pages/reports/print/page"));
const SeasonsPage = lazy(() => import("@/pages/seasons/page"));
const CropCycleDetailPage = lazy(() => import("@/pages/crop-cycles/[id]/page"));
const OwnerExpensesPage = lazy(() => import("@/pages/owner-expenses/page"));
const KhataPage = lazy(() => import("@/pages/khata/page"));
const LabourContractorsPage = lazy(() => import("@/pages/labour-contractors/page"));
const LabourContractorProfilePage = lazy(() => import("@/pages/labour-contractors/[id]/page"));
const ProfilesPage = lazy(() => import("@/pages/profiles/page"));
const ProfileDetailPage = lazy(() => import("@/pages/profiles/[type]/[id]/page"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center" style={{ height: "60vh" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
    </div>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col" style={{ height: "100%", overflow: "hidden" }}>
      <ConditionalTopBar />
      <main
        className="flex-1 scroll-container"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

function AnimatedSwitch() {
  const [pathname] = useLocation();

  return (
    <div key={pathname} className="page-transition" style={{ height: "100%" }}>
      <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/">
          {() => { window.location.replace("/login"); return null; }}
        </Route>

        {/* Auth routes */}
        <Route path="/login"       component={LoginPage} />
        <Route path="/email"       component={EmailPage} />
        <Route path="/register"    component={RegisterPage} />
        <Route path="/role-select" component={RoleSelectPage} />
        <Route path="/create-farm" component={CreateFarmPage} />
        <Route path="/join-farm"   component={JoinFarmPage} />
        <Route path="/pending"     component={PendingPage} />
        <Route path="/offline">
          {() => <OfflinePage />}
        </Route>

        {/* Dashboard routes */}
        <Route path="/overview">
          {() => <DashboardLayout><OverviewPage /></DashboardLayout>}
        </Route>
        <Route path="/crops">
          {() => <DashboardLayout><CropsPage /></DashboardLayout>}
        </Route>
        <Route path="/crops/:id">
          {() => <DashboardLayout><CropDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/farmers">
          {() => <DashboardLayout><FarmersPage /></DashboardLayout>}
        </Route>
        <Route path="/workers">
          {() => <DashboardLayout><WorkersPage /></DashboardLayout>}
        </Route>
        <Route path="/workers/attendance/history">
          {() => <DashboardLayout><AttendanceHistoryPage /></DashboardLayout>}
        </Route>
        <Route path="/workers/attendance">
          {() => <DashboardLayout><AttendancePage /></DashboardLayout>}
        </Route>
        <Route path="/workers/worker/:id">
          {() => <DashboardLayout><WorkerDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/workers/farmer/:id">
          {() => <DashboardLayout><FarmerDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/workforce">
          {() => <DashboardLayout><WorkforcePage /></DashboardLayout>}
        </Route>
        <Route path="/workforce/attendance/history">
          {() => <DashboardLayout><WorkforceAttendanceHistoryPage /></DashboardLayout>}
        </Route>
        <Route path="/workforce/attendance">
          {() => <DashboardLayout><WorkforceAttendancePage /></DashboardLayout>}
        </Route>
        <Route path="/workforce/:id/print">
          {() => <DashboardLayout><WorkforceEmployeePrintPage /></DashboardLayout>}
        </Route>
        <Route path="/workforce/:id">
          {() => <DashboardLayout><WorkforceProfilePage /></DashboardLayout>}
        </Route>
        <Route path="/parcels">
          {() => <DashboardLayout><ParcelsPage /></DashboardLayout>}
        </Route>
        <Route path="/expenses">
          {() => <DashboardLayout><ExpensesPage /></DashboardLayout>}
        </Route>
        <Route path="/income">
          {() => <DashboardLayout><IncomePage /></DashboardLayout>}
        </Route>
        <Route path="/inventory">
          {() => <DashboardLayout><InventoryPage /></DashboardLayout>}
        </Route>
        <Route path="/inventory/:id">
          {() => <DashboardLayout><InventoryDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/ledger">
          {() => <DashboardLayout><LedgerPage /></DashboardLayout>}
        </Route>
        <Route path="/loans">
          {() => <DashboardLayout><LoansPage /></DashboardLayout>}
        </Route>
        <Route path="/dealers">
          {() => <DashboardLayout><DealersPage /></DashboardLayout>}
        </Route>
        <Route path="/approvals">
          {() => <DashboardLayout><ApprovalsPage /></DashboardLayout>}
        </Route>
        <Route path="/notifications">
          {() => <DashboardLayout><NotificationsPage /></DashboardLayout>}
        </Route>
        <Route path="/profile">
          {() => <DashboardLayout><ProfilePage /></DashboardLayout>}
        </Route>
        <Route path="/reports">
          {() => <DashboardLayout><ReportsPage /></DashboardLayout>}
        </Route>
        <Route path="/seasons">
          {() => <DashboardLayout><SeasonsPage /></DashboardLayout>}
        </Route>
        <Route path="/crop-cycles/:id">
          {() => <DashboardLayout><CropCycleDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/owner-expenses">
          {() => <DashboardLayout><OwnerExpensesPage /></DashboardLayout>}
        </Route>
        <Route path="/khata">
          {() => <DashboardLayout><KhataPage /></DashboardLayout>}
        </Route>
        <Route path="/labour-contractors">
          {() => <DashboardLayout><LabourContractorsPage /></DashboardLayout>}
        </Route>
        <Route path="/labour-contractors/:id">
          {() => <DashboardLayout><LabourContractorProfilePage /></DashboardLayout>}
        </Route>
        <Route path="/profiles">
          {() => <DashboardLayout><ProfilesPage /></DashboardLayout>}
        </Route>
        <Route path="/profiles/:type/:id">
          {() => <DashboardLayout><ProfileDetailPage /></DashboardLayout>}
        </Route>
        <Route path="/reports/print">
          {() => <DashboardLayout><PrintHubPage /></DashboardLayout>}
        </Route>
        {/* Legacy report routes — redirect to print hub with matching type */}
        <Route path="/reports/farm">
          {() => { window.location.replace("/reports/print?type=summary"); return null; }}
        </Route>
        <Route path="/reports/farmer">
          {() => { window.location.replace("/reports/print?type=ledger"); return null; }}
        </Route>
        <Route path="/reports/worker">
          {() => { window.location.replace("/reports/print?type=summary"); return null; }}
        </Route>
        <Route path="/reports/dealer">
          {() => { window.location.replace("/reports/print?type=expense"); return null; }}
        </Route>
        <Route path="/reports/godown">
          {() => { window.location.replace("/reports/print?type=godown"); return null; }}
        </Route>
        <Route path="/reports/parcel">
          {() => { window.location.replace("/reports/print?type=parcel"); return null; }}
        </Route>
        <Route path="/reports/ledger">
          {() => { window.location.replace("/reports/print?type=ledger"); return null; }}
        </Route>
        <Route path="/reports/crops">
          {() => { window.location.replace("/reports/print?type=parcel"); return null; }}
        </Route>

        <Route>
          {() => { window.location.replace("/login"); return null; }}
        </Route>
      </Switch>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}>
        <SyncIndicator />
        <OfflineSaveToast />
        <AnimatedSwitch />
      </WouterRouter>
    </AuthProvider>
  );
}

export default App;
