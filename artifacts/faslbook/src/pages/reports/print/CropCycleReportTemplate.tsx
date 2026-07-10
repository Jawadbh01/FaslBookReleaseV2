import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1]) - 1]} ${parts[0]}`;
}

interface CropCycleTxn {
  id: string;
  date: string;
  type: "income" | "expense";
  categoryLabel?: string;
  category?: string;
  description?: string;
  amount: number;
}

interface CropCycleInfo {
  id: string;
  name: string;
  crop: string;
  seasonName?: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface Props {
  cropCycles: CropCycleInfo[];
  transactionsByCycle: Record<string, CropCycleTxn[]>;
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function CropCycleReportTemplate({ cropCycles, transactionsByCycle, farmName, printedBy, dateFrom, dateTo }: Props) {
  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`);

  let grandIncome = 0, grandExpense = 0;

  return (
    <PrintLayout
      reportName="Crop Cycle Report"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      {cropCycles.length === 0 && (
        <p style={{ color: "#999" }}>No crop cycles found for the selected period.</p>
      )}

      {cropCycles.map((cycle) => {
        const rows = (transactionsByCycle[cycle.id] || []).sort((a, b) => a.date.localeCompare(b.date));
        const income = rows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
        const expense = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
        const profit = income - expense;
        grandIncome += income;
        grandExpense += expense;

        return (
          <div key={cycle.id} className="print-section">
            <div className="section-title">
              {cycle.name} — {cycle.crop} ({cycle.status})
              {cycle.seasonName ? ` · Season: ${cycle.seasonName}` : ""}
            </div>
            <p style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
              {fmtDate(cycle.startDate)} — {fmtDate(cycle.endDate)}
            </p>

            {rows.length === 0 ? (
              <p style={{ color: "#999", fontSize: 12 }}>No transactions recorded for this crop cycle.</p>
            ) : (
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: "13%" }}>Date</th>
                    <th style={{ width: "12%" }}>Type</th>
                    <th style={{ width: "20%" }}>Category</th>
                    <th>Description</th>
                    <th className="num" style={{ width: "16%" }}>Amount (Rs)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.type === "income" ? "Income" : "Expense"}</td>
                      <td>{r.categoryLabel || r.category || "—"}</td>
                      <td>{r.description || "—"}</td>
                      <td className="num">{fmtPKR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="summary-row" style={{ marginTop: 6 }}>
              <span>Income</span>
              <span>{fmtPKR(income)}</span>
            </div>
            <div className="summary-row">
              <span>Expenses</span>
              <span>{fmtPKR(expense)}</span>
            </div>
            <div className="summary-row total">
              <span>Net Profit — {cycle.name}</span>
              <span>{fmtPKR(profit)}</span>
            </div>
          </div>
        );
      })}

      {cropCycles.length > 0 && (
        <div className="print-section" style={{ marginTop: 10 }}>
          <div className="summary-row total">
            <span>Grand Total Income (All Crop Cycles)</span>
            <span>{fmtPKR(grandIncome)}</span>
          </div>
          <div className="summary-row total">
            <span>Grand Total Expense (All Crop Cycles)</span>
            <span>{fmtPKR(grandExpense)}</span>
          </div>
          <div className="summary-row total">
            <span>Grand Net Profit</span>
            <span>{fmtPKR(grandIncome - grandExpense)}</span>
          </div>
        </div>
      )}
    </PrintLayout>
  );
}
