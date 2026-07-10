import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + Math.abs(n).toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

interface DealerTx {
  id: string;
  date: string;
  type: "purchase" | "payment";
  items?: string;
  paymentType?: string;
  amount: number;
  notes?: string;
}

interface Dealer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  totalPurchased?: number;
  totalPaid?: number;
}

interface Props {
  dealer: Dealer | null;
  dealers: Dealer[];
  transactions: DealerTx[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function DealerReportTemplate({ dealer, dealers, transactions, farmName, printedBy, dateFrom, dateTo }: Props) {
  const isAllDealers = !dealer;

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const rows = sorted.map(t => {
    const purchase = t.type === "purchase" ? t.amount : 0;
    const payment  = t.type === "payment"  ? t.amount : 0;
    running += purchase - payment;
    return { ...t, purchase, payment, balance: running };
  });

  const totalPurchased = rows.reduce((s, r) => s + r.purchase, 0);
  const totalPaid      = rows.reduce((s, r) => s + r.payment, 0);
  const outstanding    = totalPurchased - totalPaid;

  const filters = [
    `Dealer: ${isAllDealers ? "All Dealers" : dealer!.name}`,
    dateFrom && dateTo ? `Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}` : "",
  ].filter(Boolean);

  const allOutstanding = dealers.reduce((s, d) => s + ((d.totalPurchased || 0) - (d.totalPaid || 0)), 0);

  return (
    <PrintLayout
      reportName="Dealer Report"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      {/* Dealer info */}
      <div className="print-section-compact">
        <div className="section-title">Dealer Information</div>
        {isAllDealers ? (
          <div className="info-grid">
            <span className="label">Total Dealers</span><span className="value">{dealers.length}</span>
            <span className="label">Total Outstanding (All)</span>
            <span className="value" style={{ color: allOutstanding > 0 ? "#C62828" : "#1B5E20" }}>
              {fmtPKR(allOutstanding)} {allOutstanding > 0 ? "(Payable)" : ""}
            </span>
            {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
            {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
          </div>
        ) : (
          <div className="info-grid">
            <span className="label">Dealer Name</span><span className="value">{dealer!.name}</span>
            <span className="label">Phone</span><span className="value">{dealer!.phone || "—"}</span>
            <span className="label">Address</span><span className="value">{dealer!.address || "—"}</span>
            <span className="label">Outstanding Balance</span>
            <span className="value" style={{ color: outstanding > 0 ? "#C62828" : "#1B5E20" }}>
              {fmtPKR(outstanding)} {outstanding > 0 ? "(Payable)" : "(Clear)"}
            </span>
            {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
            {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
          </div>
        )}
      </div>

      {/* All dealers summary table (only shown when viewing all dealers) */}
      {isAllDealers && (
        <div className="print-section">
          <div className="section-title">Dealer Summary</div>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>No.</th>
                <th>Dealer Name</th>
                <th>Phone</th>
                <th className="num">Total Purchased (Rs)</th>
                <th className="num">Total Paid (Rs)</th>
                <th className="num">Outstanding (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {dealers.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "#999" }}>No dealers found.</td></tr>
              )}
              {dealers.map((d, i) => {
                const bal = (d.totalPurchased || 0) - (d.totalPaid || 0);
                return (
                  <tr key={d.id}>
                    <td className="ctr">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td>{d.phone || "—"}</td>
                    <td className="num">{fmtPKR(d.totalPurchased || 0)}</td>
                    <td className="num">{fmtPKR(d.totalPaid || 0)}</td>
                    <td className="num" style={{ fontWeight: 700, color: bal > 0 ? "#C62828" : "#1B5E20" }}>
                      {fmtPKR(bal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>Total</td>
                <td className="num">{fmtPKR(dealers.reduce((s, d) => s + (d.totalPurchased || 0), 0))}</td>
                <td className="num">{fmtPKR(dealers.reduce((s, d) => s + (d.totalPaid || 0), 0))}</td>
                <td className="num">{fmtPKR(allOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Transaction history */}
      <div className="print-section">
        <div className="section-title">
          {isAllDealers ? "All Transactions" : "Purchase & Payment History"}
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "10%" }}>Date</th>
              {isAllDealers && <th>Dealer</th>}
              <th>Items / Notes</th>
              <th className="ctr" style={{ width: "9%" }}>Payment</th>
              <th className="num" style={{ width: "13%" }}>Purchase (Rs)</th>
              <th className="num" style={{ width: "13%" }}>Payment (Rs)</th>
              {!isAllDealers && <th className="num" style={{ width: "13%" }}>Balance (Rs)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={isAllDealers ? 5 : 6} style={{ textAlign: "center", color: "#999", padding: "14px" }}>No transactions in this period</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.date)}</td>
                {isAllDealers && <td>{(r as any).dealerName || "—"}</td>}
                <td>{r.items || r.notes || "—"}</td>
                <td className="ctr" style={{ textTransform: "capitalize" }}>{r.paymentType || "—"}</td>
                <td className="num" style={{ color: r.purchase ? "#C62828" : "#999" }}>
                  {r.purchase ? fmtPKR(r.purchase) : "—"}
                </td>
                <td className="num" style={{ color: r.payment ? "#1B5E20" : "#999" }}>
                  {r.payment ? fmtPKR(r.payment) : "—"}
                </td>
                {!isAllDealers && (
                  <td className="num" style={{ fontWeight: 600, color: r.balance > 0 ? "#C62828" : "#1B5E20" }}>
                    {fmtPKR(r.balance)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isAllDealers ? 3 : 2} style={{ fontWeight: 700 }}>Total</td>
              <td></td>
              <td className="num">{fmtPKR(totalPurchased)}</td>
              <td className="num">{fmtPKR(totalPaid)}</td>
              {!isAllDealers && <td className="num">{fmtPKR(outstanding)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="print-section-compact" style={{ marginTop: 14 }}>
        <div className="section-title">Account Summary</div>
        {[
          ["Total Purchased", fmtPKR(totalPurchased)],
          ["Total Paid",      fmtPKR(totalPaid)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total">
          <span>Outstanding Balance</span>
          <span style={{ color: outstanding > 0 ? "#C62828" : "#1B5E20" }}>
            {fmtPKR(outstanding)} {outstanding > 0 ? "(Payable)" : "(Clear)"}
          </span>
        </div>
      </div>
    </PrintLayout>
  );
}
