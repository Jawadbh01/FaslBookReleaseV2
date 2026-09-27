import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");

function fmtDate(str: string) {
  if (!str) return "—";
  const p = str.split("-");
  if (p.length !== 3) return str;
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(p[2])} ${M[parseInt(p[1]) - 1]} ${p[0]}`;
}

const TYPE_LABELS: Record<string, string> = {
  worker: "Worker", manager: "Manager", driver: "Driver",
  helper: "Helper", security: "Security", mechanic: "Mechanic", custom: "Custom",
};

const SALARY_LABELS: Record<string, string> = {
  daily: "Daily", monthly: "Monthly", contract: "Contract",
};

interface Employee {
  id: string;
  name: string;
  phone?: string;
  employeeType: string;
  customTypeName?: string;
  joinDate?: string;
  salaryType: string;
  salary: number;
  status: string;
}

interface AttRecord {
  workerId: string;
  date: string;
  status: "present" | "halfDay" | "absent";
}

interface EmployeeRow extends Employee {
  present: number;
  halfDay: number;
  absent: number;
  totalEarned: number;
}

interface Props {
  employees: Employee[];
  attendance: AttRecord[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

function getTypeLabel(emp: Employee) {
  return emp.employeeType === "custom" && emp.customTypeName ? emp.customTypeName : (TYPE_LABELS[emp.employeeType] || emp.employeeType);
}

export default function WorkforceReportTemplate({ employees, attendance, farmName, printedBy, dateFrom, dateTo }: Props) {
  const rows: EmployeeRow[] = employees
    .map((emp) => {
      const empAtt = attendance.filter((a) => a.workerId === emp.id);
      const present = empAtt.filter((a) => a.status === "present").length;
      const halfDay = empAtt.filter((a) => a.status === "halfDay").length;
      const absent  = empAtt.filter((a) => a.status === "absent").length;
      const totalEarned = emp.salaryType === "daily"
        ? present * (emp.salary || 0) + halfDay * (emp.salary || 0) * 0.5
        : emp.salaryType === "monthly"
        ? (emp.salary || 0)
        : emp.salary || 0;
      return { ...emp, present, halfDay, absent, totalEarned };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeRows   = rows.filter((r) => r.status === "active");
  const inactiveRows = rows.filter((r) => r.status === "inactive");

  const totalActive   = activeRows.length;
  const totalInactive = inactiveRows.length;
  const grandTotal    = activeRows.reduce((s, r) => s + r.totalEarned, 0);

  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`);

  // Group active by type
  const byType: Record<string, EmployeeRow[]> = {};
  activeRows.forEach((r) => {
    const key = getTypeLabel(r);
    if (!byType[key]) byType[key] = [];
    byType[key].push(r);
  });

  return (
    <PrintLayout reportName="Workforce Report" filters={filters} printedBy={printedBy} farmName={farmName}>

      {/* Summary box */}
      <div className="print-section">
        <div className="section-title">Summary</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="summary-row" style={{ flex: "1 1 auto" }}>
            <span>Total Employees</span><span>{rows.length}</span>
          </div>
          <div className="summary-row" style={{ flex: "1 1 auto" }}>
            <span>Active</span><span>{totalActive}</span>
          </div>
          <div className="summary-row" style={{ flex: "1 1 auto" }}>
            <span>Inactive</span><span>{totalInactive}</span>
          </div>
        </div>
      </div>

      {/* Active employees table */}
      {activeRows.length > 0 && (
        <div className="print-section">
          <div className="section-title">Active Employees — Attendance & Earnings</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: "13%" }}>Phone</th>
                <th style={{ width: "11%" }}>Type</th>
                <th style={{ width: "9%" }}>Salary Type</th>
                <th className="num" style={{ width: "12%" }}>Rate (Rs)</th>
                <th className="num" style={{ width: "8%" }}>Present</th>
                <th className="num" style={{ width: "8%" }}>Half</th>
                <th className="num" style={{ width: "8%" }}>Absent</th>
                <th className="num" style={{ width: "14%" }}>Earned (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>{emp.phone || "—"}</td>
                  <td>{getTypeLabel(emp)}</td>
                  <td>{SALARY_LABELS[emp.salaryType] || emp.salaryType}</td>
                  <td className="num">{fmtPKR(emp.salary || 0)}</td>
                  <td className="num">{emp.present}</td>
                  <td className="num">{emp.halfDay}</td>
                  <td className="num">{emp.absent}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(emp.totalEarned)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} style={{ fontWeight: 700 }}>Total Earned — Active Employees</td>
                <td className="num">{fmtPKR(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* By type breakdown */}
      {Object.keys(byType).length > 1 && (
        <div className="print-section">
          <div className="section-title">By Employee Type</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Employee Type</th>
                <th className="num">Count</th>
                <th className="num">Total Earned (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byType).map(([typeName, list]) => (
                <tr key={typeName}>
                  <td>{typeName}</td>
                  <td className="num">{list.length}</td>
                  <td className="num">{fmtPKR(list.reduce((s, r) => s + r.totalEarned, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inactive employees */}
      {inactiveRows.length > 0 && (
        <div className="print-section">
          <div className="section-title">Inactive Employees</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: "16%" }}>Phone</th>
                <th style={{ width: "13%" }}>Type</th>
                <th style={{ width: "11%" }}>Salary Type</th>
                <th className="num" style={{ width: "15%" }}>Rate (Rs)</th>
                <th style={{ width: "13%" }}>Join Date</th>
              </tr>
            </thead>
            <tbody>
              {inactiveRows.map((emp) => (
                <tr key={emp.id} style={{ color: "#888" }}>
                  <td>{emp.name}</td>
                  <td>{emp.phone || "—"}</td>
                  <td>{getTypeLabel(emp)}</td>
                  <td>{SALARY_LABELS[emp.salaryType] || emp.salaryType}</td>
                  <td className="num">{fmtPKR(emp.salary || 0)}</td>
                  <td>{fmtDate(emp.joinDate || "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && <p style={{ color: "#999" }}>No employees found.</p>}

    </PrintLayout>
  );
}
