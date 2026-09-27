import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

interface SaleRow {
  id: string;
  date: string;
  buyer?: string;
  cropName?: string;
  parcelName?: string;
  weightKg?: number;
  ratePerKg?: number;
  amount: number;
  paymentStatus?: string;
  notes?: string;
}

interface Props {
  sales: SaleRow[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function SalesReportTemplate({ sales, farmName, printedBy, dateFrom, dateTo }: Props) {
  const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));

  const totalAmount = sorted.reduce((s, r) => s + (r.amount || 0), 0);
  const totalWeight = sorted.reduce((s, r) => s + (r.weightKg || 0), 0);
  const paid    = sorted.filter(r => (r.paymentStatus || "").toLowerCase() === "paid");
  const pending = sorted.filter(r => (r.paymentStatus || "").toLowerCase() !== "paid");
  const totalPaid    = paid.reduce((s, r) => s + r.amount, 0);
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);

  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`);

  return (
    <PrintLayout
      reportName="Sales Report"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      <div className="print-section">
        <div className="section-title">Sales Transactions</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>No.</th>
              <th style={{ width: "11%" }}>Date</th>
              <th>Buyer</th>
              <th>Crop / Parcel</th>
              <th className="num" style={{ width: "11%" }}>Weight (kg)</th>
              <th className="num" style={{ width: "10%" }}>Rate/kg</th>
              <th className="num" style={{ width: "13%" }}>Amount (Rs)</th>
              <th className="ctr" style={{ width: "9%" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#999" }}>No sales recorded.</td></tr>
            )}
            {sorted.map((r, i) => {
              const isPaid = (r.paymentStatus || "").toLowerCase() === "paid";
              return (
                <tr key={i}>
                  <td className="ctr">{i + 1}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.buyer || "—"}</td>
                  <td>{[r.cropName, r.parcelName].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="num">{r.weightKg ? r.weightKg.toLocaleString("en-PK") : "—"}</td>
                  <td className="num">{r.ratePerKg ? fmtPKR(r.ratePerKg) : "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(r.amount)}</td>
                  <td className="ctr" style={{ fontWeight: 600, color: isPaid ? "#1B5E20" : "#E65100" }}>
                    {isPaid ? "Paid" : "Pending"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ fontWeight: 700 }}>Total ({sorted.length} transactions)</td>
              <td className="num">{totalWeight > 0 ? totalWeight.toLocaleString("en-PK") + " kg" : "—"}</td>
              <td></td>
              <td className="num">{fmtPKR(totalAmount)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment summary */}
      <div className="print-section" style={{ marginTop: 14 }}>
        <div className="section-title">Payment Summary</div>
        {[
          ["Total Sales",        fmtPKR(totalAmount)],
          ["Amount Received (Paid)",   fmtPKR(totalPaid)],
          ["Amount Pending",     fmtPKR(totalPending)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total"><span>Net Sales Total</span><span>{fmtPKR(totalAmount)}</span></div>
      </div>
    </PrintLayout>
  );
}
