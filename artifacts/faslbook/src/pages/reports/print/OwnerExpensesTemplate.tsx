import PrintLayout from "@/components/print/PrintLayout";

interface OwnerExpense {
  id: string;
  category: string;
  categoryLabel: string;
  amount: number;
  date: string;
  paymentMethod: string;
  vendor: string;
  description: string;
}

interface Props {
  expenses: OwnerExpense[];
  farmName: string;
  printedBy: string;
  dateFrom: string;
  dateTo: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer",
  cheque: "Cheque", jazzcash: "JazzCash/EasyPaisa",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  fuel: "⛽", tractor: "🔧", machinery: "🚜", irrigation: "💧",
  land_prep: "🌾", labour: "👷", seeds: "🌱", fertilizer: "🧪",
  pesticide: "🪣", transport: "🚛", utilities: "💡", other: "💰",
};

function fmtD(s: string) {
  if (!s) return "—";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
}
const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");

export default function OwnerExpensesTemplate({ expenses, farmName, printedBy, dateFrom, dateTo }: Props) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCat: Record<string, number> = {};
  expenses.forEach((e) => { byCat[e.categoryLabel] = (byCat[e.categoryLabel] || 0) + e.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const filters = [
    dateFrom ? `From: ${fmtD(dateFrom)}` : null,
    dateTo   ? `To: ${fmtD(dateTo)}`     : null,
  ].filter(Boolean) as string[];

  return (
    <PrintLayout
      reportName="Farm Expenses Report"
      farmName={farmName}
      printedBy={printedBy}
      filters={filters}
    >
      {/* Summary */}
      <div className="print-section-compact">
        <div className="section-title">Summary</div>
        <div className="info-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 20px" }}>
          <div><span className="label">Total Expenses</span></div>
          <div><span className="label">No. of Records</span></div>
          <div><span className="label">Period</span></div>
          <div><span className="value" style={{ color: "#C62828", fontWeight: 700 }}>{fmt(total)}</span></div>
          <div><span className="value">{expenses.length}</span></div>
          <div><span className="value">{dateFrom && dateTo ? `${fmtD(dateFrom)} – ${fmtD(dateTo)}` : "All time"}</span></div>
        </div>
      </div>

      {/* By category */}
      {catEntries.length > 0 && (
        <div className="print-section-compact">
          <div className="section-title">Expenses by Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
            {catEntries.map(([cat, amt]) => (
              <div key={cat} className="summary-row" style={{ minWidth: 180, flex: "1 1 180px" }}>
                <span>{CATEGORY_EMOJIS[cat.toLowerCase().replace(/ /g,"_")] || "💰"} {cat}</span>
                <span style={{ fontWeight: 600, color: "#C62828" }}>{fmt(amt)}</span>
              </div>
            ))}
            <div className="summary-row total" style={{ width: "100%", flex: "0 0 100%" }}>
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="print-section">
        <div className="section-title">Expense Details</div>
        {expenses.length === 0 ? (
          <p style={{ color: "#888", fontSize: "9.5pt", fontStyle: "italic" }}>No expenses found for this period.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>Date</th>
                <th style={{ width: "18%" }}>Type</th>
                <th style={{ width: "18%" }}>Vendor / Supplier</th>
                <th style={{ width: "14%" }}>Payment</th>
                <th>Notes</th>
                <th className="num" style={{ width: "14%" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{fmtD(e.date)}</td>
                  <td>{CATEGORY_EMOJIS[e.category] || ""} {e.categoryLabel}</td>
                  <td>{e.vendor || "—"}</td>
                  <td>{PAYMENT_LABELS[e.paymentMethod] || e.paymentMethod}</td>
                  <td>{e.description || "—"}</td>
                  <td className="num" style={{ color: "#C62828", fontWeight: 600 }}>{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: "right", paddingRight: 12 }}>Total</td>
                <td className="num">{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </PrintLayout>
  );
}
