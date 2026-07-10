import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");

function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1]) - 1]} ${parts[0]}`;
}

interface Worker {
  id: string;
  name: string;
  phone?: string;
  workerType: "daily" | "monthly";
  dailyRate?: number;
  monthlySalary?: number;
}

interface WorkerRow extends Worker {
  present: number;
  halfDay: number;
  absent: number;
  totalPay: number;
}

interface Props {
  workers: Worker[];
  attendance: { workerId: string; date: string; status: "present" | "halfDay" | "absent" }[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function WorkersReportTemplate({ workers, attendance, farmName, printedBy, dateFrom, dateTo }: Props) {
  const rows: WorkerRow[] = workers
    .map(w => {
      const wAtt = attendance.filter(a => a.workerId === w.id);
      const present = wAtt.filter(a => a.status === "present").length;
      const halfDay = wAtt.filter(a => a.status === "halfDay").length;
      const absent  = wAtt.filter(a => a.status === "absent").length;
      const totalPay = w.workerType === "daily"
        ? present * (w.dailyRate || 0) + halfDay * (w.dailyRate || 0) * 0.5
        : (w.monthlySalary || 0);
      return { ...w, present, halfDay, absent, totalPay };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const dailyWorkers   = rows.filter(r => r.workerType === "daily");
  const monthlyWorkers = rows.filter(r => r.workerType === "monthly");
  const grandTotal = rows.reduce((s, r) => s + r.totalPay, 0);

  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`);

  return (
    <PrintLayout
      reportName="Workers Report"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      {rows.length === 0 && (
        <p style={{ color: "#999" }}>No workers found.</p>
      )}

      {dailyWorkers.length > 0 && (
        <div className="print-section">
          <div className="section-title">Daily Wage Workers</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: "14%" }}>Phone</th>
                <th className="num" style={{ width: "13%" }}>Daily Rate (Rs)</th>
                <th className="num" style={{ width: "10%" }}>Present</th>
                <th className="num" style={{ width: "10%" }}>Half Day</th>
                <th className="num" style={{ width: "10%" }}>Absent</th>
                <th className="num" style={{ width: "16%" }}>Total Pay (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {dailyWorkers.map(w => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.phone || "—"}</td>
                  <td className="num">{fmtPKR(w.dailyRate || 0)}</td>
                  <td className="num">{w.present}</td>
                  <td className="num">{w.halfDay}</td>
                  <td className="num">{w.absent}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(w.totalPay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ fontWeight: 700 }}>Subtotal — Daily Workers</td>
                <td className="num">{fmtPKR(dailyWorkers.reduce((s, r) => s + r.totalPay, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {monthlyWorkers.length > 0 && (
        <div className="print-section">
          <div className="section-title">Monthly Salaried Workers</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: "20%" }}>Phone</th>
                <th className="num" style={{ width: "25%" }}>Monthly Salary (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {monthlyWorkers.map(w => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.phone || "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(w.monthlySalary || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>Subtotal — Monthly Workers</td>
                <td className="num">{fmtPKR(monthlyWorkers.reduce((s, r) => s + r.totalPay, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="print-section" style={{ marginTop: 10 }}>
          <div className="summary-row total">
            <span>Grand Total — All Workers</span>
            <span>{fmtPKR(grandTotal)}</span>
          </div>
        </div>
      )}
    </PrintLayout>
  );
}
