import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import AuthProvider from "@/components/shared/AuthProvider";
import BottomNav from "@/components/shared/BottomNav";
import ConditionalTopBar from "@/components/shared/ConditionalTopBar";
import SyncIndicator from "@/components/shared/SyncIndicator";
import OfflineSaveToast from "@/components/shared/OfflineSaveToast";

// Auth pages
import LoginPage from "@/pages/login/page";
import EmailPage from "@/pages/email/page";
import RegisterPage from "@/pages/register/page";
import RoleSelectPage from "@/pages/role-select/page";
import CreateFarmPage from "@/pages/create-farm/page";
import JoinFarmPage from "@/pages/join-farm/page";
import PendingPage from "@/pages/pending/page";
import OfflinePage from "@/pages/offline/page";

// Dashboard pages
import OverviewPage from "@/pages/overview/page";
import CropsPage from "@/pages/crops/page";
import CropDetailPage from "@/pages/crops/[id]/page";
import FarmersPage from "@/pages/farmers/page";
import WorkersPage from "@/pages/workers/page";
import WorkerDetailPage from "@/pages/workers/worker/[id]/page";
import FarmerDetailPage from "@/pages/workers/farmer/[id]/page";
import AttendancePage from "@/pages/workers/attendance/page";
import AttendanceHistoryPage from "@/pages/workers/attendance/history/page";
import ParcelsPage from "@/pages/parcels/page";
import ExpensesPage from "@/pages/expenses/page";
import IncomePage from "@/pages/income/page";
import InventoryPage from "@/pages/inventory/page";
import InventoryDetailPage from "@/pages/inventory/[id]/page";
import LedgerPage from "@/pages/ledger/page";
import LoansPage from "@/pages/loans/page";
import DealersPage from "@/pages/dealers/page";
import ApprovalsPage from "@/pages/approvals/page";
import NotificationsPage from "@/pages/notifications/page";
import ProfilePage from "@/pages/profile/page";
import ReportsPage from "@/pages/reports/page";
import PrintHubPage from "@/pages/reports/print/page";
import SeasonsPage from "@/pages/seasons/page";
import CropCycleDetailPage from "@/pages/crop-cycles/[id]/page";
import OwnerExpensesPage from "@/pages/owner-expenses/page";

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
