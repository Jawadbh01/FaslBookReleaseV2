import PrintLayout from "@/components/print/PrintLayout";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
  id: string; name: string; phone?: string; address?: string;
  emergencyContact?: string; notes?: string;
  employeeType: string; customTypeName?: string;
  joinDate?: string; salaryType: string; salary: number;
  status: string;
}

interface AttRecord {
  workerId: string; date: string;
  status: "present" | "halfDay" | "absent";
}

interface Payment {
  id: string; amount: number; month: number; year: number; createdAt?: any;
}

interface Props {
  employee: Employee;
  attendance: AttRecord[];   // all attendance records for this employee
  payments: Payment[];       // all payment records for this employee
  month: number;             // 0-based
  year: number;
  farmName: string;
  printedBy: string;
}

const STATUS_META = {
  present:  { label: "P", color: "#1B5E20", bg: "#E8F5E9", full: "Present" },
  halfDay:  { label: "H", color: "#E65100", bg: "#FFF3E0", full: "Half Day" },
  absent:   { label: "A", color: "#C62828", bg: "#FFEBEE", full: "Absent" },
};

export default function WorkforceEmployeeReportTemplate({
  employee, attendance, payments, month, year, farmName, printedBy,
}: Props) {
  const typeLabel = employee.employeeType === "custom" && employee.customTypeName
    ? employee.customTypeName
    : (TYPE_LABELS[employee.employeeType] || employee.employeeType);

  // ── Build calendar for selected month ─────────────────────────
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay(); // 0=Sun

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const attMap: Record<string, AttRecord["status"]> = {};
  attendance.forEach((a) => { if (a.date?.startsWith(monthPrefix)) attMap[a.date] = a.status; });

  let presentDays = 0, halfDays = 0, absentDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    const s = attMap[key];
    if (s === "present") presentDays++;
    else if (s === "halfDay") halfDays++;
    else if (s === "absent") absentDays++;
  }
  const totalMarked = presentDays + halfDays + absentDays;

  // ── Salary calc ────────────────────────────────────────────────
  const rate = employee.salary || 0;
  let earned = 0;
  if (employee.salaryType === "daily") {
    earned = presentDays * rate + halfDays * rate * 0.5;
  } else if (employee.salaryType === "monthly") {
    earned = rate; // flat monthly
  } else {
    earned = rate; // contract
  }

  // Payments for this month
  const paidThisMonth = payments
    .filter((p) => p.month === month && p.year === year)
    .reduce((s, p) => s + p.amount, 0);
  const pending = Math.max(0, earned - paidThisMonth);

  // All payments (for history)
  const allPayments = [...payments].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  // ── All-time attendance summary ────────────────────────────────
  const totalPresent = attendance.filter((a) => a.status === "present").length;
  const totalHalf    = attendance.filter((a) => a.status === "halfDay").length;
  const totalAbsent  = attendance.filter((a) => a.status === "absent").length;

  const filters = [`Month: ${MONTHS[month]} ${year}`];

  return (
    <PrintLayout reportName="Employee Report" filters={filters} printedBy={printedBy} farmName={farmName}>

      {/* Employee Profile */}
      <div className="print-section">
        <div className="section-title">Employee Details</div>
        <table className="print-table" style={{ marginBottom: 0 }}>
          <tbody>
            <tr><td style={{ width: "30%", fontWeight: 600 }}>Name</td><td>{employee.name}</td>
                <td style={{ width: "30%", fontWeight: 600 }}>Status</td>
                <td style={{ textTransform: "capitalize" }}>{employee.status}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Type</td><td>{typeLabel}</td>
                <td style={{ fontWeight: 600 }}>Salary Type</td><td>{SALARY_LABELS[employee.salaryType] || employee.salaryType}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Rate</td><td>{fmtPKR(rate)}{employee.salaryType === "daily" ? " / day" : employee.salaryType === "monthly" ? " / month" : " (contract)"}</td>
                <td style={{ fontWeight: 600 }}>Join Date</td><td>{fmtDate(employee.joinDate || "")}</td></tr>
            {employee.phone && (
              <tr><td style={{ fontWeight: 600 }}>Phone</td><td>{employee.phone}</td>
                  <td style={{ fontWeight: 600 }}>Emergency</td><td>{employee.emergencyContact || "—"}</td></tr>
            )}
            {employee.address && (
              <tr><td style={{ fontWeight: 600 }}>Address</td><td colSpan={3}>{employee.address}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Monthly Attendance */}
      <div className="print-section">
        <div className="section-title">Attendance — {MONTHS[month]} {year}</div>

        {/* Calendar grid */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#888", padding: "3px 0" }}>{d}</div>
            ))}
            {/* Blank cells for first day offset */}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d    = i + 1;
              const key  = `${monthPrefix}-${String(d).padStart(2, "0")}`;
              const s    = attMap[key];
              const meta = s ? STATUS_META[s] : null;
              return (
                <div key={d} style={{
                  textAlign: "center", fontSize: 9, padding: "4px 2px",
                  borderRadius: 3, fontWeight: meta ? 700 : 400,
                  backgroundColor: meta ? meta.bg : "#F9FAFB",
                  color: meta ? meta.color : "#CCC",
                  border: "0.5px solid #EEE",
                }}>
                  <div style={{ fontSize: 8, color: "#999", marginBottom: 1 }}>{d}</div>
                  {meta ? meta.label : "·"}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9 }}>
            {Object.entries(STATUS_META).map(([, m]) => (
              <span key={m.full} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, backgroundColor: m.bg, border: "0.5px solid #DDD" }} />
                {m.label} = {m.full}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, backgroundColor: "#F9FAFB", border: "0.5px solid #DDD" }} />
              · = No record
            </span>
          </div>
        </div>

        {/* Summary row */}
        <table className="print-table">
          <thead>
            <tr>
              <th>Days Marked</th><th className="num">Present</th>
              <th className="num">Half Day</th><th className="num">Absent</th>
              <th className="num">Not Marked</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{totalMarked} of {daysInMonth}</td>
              <td className="num" style={{ color: "#1B5E20", fontWeight: 700 }}>{presentDays}</td>
              <td className="num" style={{ color: "#E65100", fontWeight: 700 }}>{halfDays}</td>
              <td className="num" style={{ color: "#C62828", fontWeight: 700 }}>{absentDays}</td>
              <td className="num" style={{ color: "#9E9E9E" }}>{daysInMonth - totalMarked}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Monthly Salary */}
      <div className="print-section">
        <div className="section-title">Salary — {MONTHS[month]} {year}</div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Salary Type</th><th className="num">Rate</th>
              <th className="num">Earned</th><th className="num">Paid</th>
              <th className="num">Pending</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{SALARY_LABELS[employee.salaryType] || employee.salaryType}</td>
              <td className="num">{fmtPKR(rate)}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(earned)}</td>
              <td className="num" style={{ color: "#1B5E20", fontWeight: 700 }}>{fmtPKR(paidThisMonth)}</td>
              <td className="num" style={{ color: pending > 0 ? "#C62828" : "#1B5E20", fontWeight: 700 }}>{fmtPKR(pending)}</td>
            </tr>
          </tbody>
        </table>
        {employee.salaryType === "daily" && (
          <p style={{ fontSize: 9, color: "#888", marginTop: 4 }}>
            Calculation: {presentDays} present × {fmtPKR(rate)} + {halfDays} half-day × {fmtPKR(rate * 0.5)} = {fmtPKR(earned)}
          </p>
        )}
      </div>

      {/* Payment History */}
      {allPayments.length > 0 && (
        <div className="print-section">
          <div className="section-title">Payment History (All Time)</div>
          <table className="print-table">
            <thead>
              <tr><th>Month</th><th>Year</th><th className="num">Amount Paid (Rs)</th></tr>
            </thead>
            <tbody>
              {allPayments.map((p) => (
                <tr key={p.id} style={{ fontWeight: p.month === month && p.year === year ? 700 : 400 }}>
                  <td>{MONTHS[p.month]}{p.month === month && p.year === year ? " ★" : ""}</td>
                  <td>{p.year}</td>
                  <td className="num">{fmtPKR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>Total Paid (All Time)</td>
                <td className="num">{fmtPKR(allPayments.reduce((s, p) => s + p.amount, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* All-time Attendance Summary */}
      {attendance.length > 0 && (
        <div className="print-section">
          <div className="section-title">All-Time Attendance Summary</div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="num">Total Present</th>
                <th className="num">Total Half Days</th>
                <th className="num">Total Absent</th>
                <th className="num">Total Days Recorded</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num" style={{ color: "#1B5E20", fontWeight: 700 }}>{totalPresent}</td>
                <td className="num" style={{ color: "#E65100", fontWeight: 700 }}>{totalHalf}</td>
                <td className="num" style={{ color: "#C62828", fontWeight: 700 }}>{totalAbsent}</td>
                <td className="num">{attendance.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {employee.notes && (
        <div className="print-section">
          <div className="section-title">Notes</div>
          <p style={{ fontSize: 11, color: "#444", lineHeight: 1.6 }}>{employee.notes}</p>
        </div>
      )}

    </PrintLayout>
  );
}
