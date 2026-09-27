import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + Math.abs(n).toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

interface Entry {
  id: string; date: string; type: "credit"|"debit";
  categoryLabel: string; description: string;
  amount: number;
}

interface Props {
  farmerName: string;
  farmerPhone?: string;
  farmName: string;
  printedBy: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  entries: Entry[];
}

export default function FarmerLedgerTemplate({ farmerName, farmerPhone, farmName, printedBy, dateFrom, dateTo, openingBalance, entries }: Props) {
  let running = openingBalance;
  const rows = entries.map(e => {
    const debit  = e.type === "debit"  ? e.amount : 0;
    const credit = e.type === "credit" ? e.amount : 0;
    running += credit - debit;
    return { ...e, debit, credit, balance: running };
  });

  const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing     = openingBalance + totalCredit - totalDebit;

  const filters = [
    `Farmer: ${farmerName}`,
    dateFrom && dateTo ? `Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}` : "",
  ].filter(Boolean);

  return (
    <PrintLayout
      reportName="Farmer Khata"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      {/* Farmer info */}
      <div className="print-section">
        <div className="section-title">Account Information</div>
        <div className="info-grid">
          <span className="label">Farmer Name</span><span className="value">{farmerName}</span>
          {farmerPhone && <><span className="label">Phone</span><span className="value">{farmerPhone}</span></>}
          <span className="label">Opening Balance</span>
          <span className="value" style={{ color: openingBalance >= 0 ? "#1B5E20" : "#C62828" }}>
            {fmtPKR(openingBalance)} {openingBalance < 0 ? "(Dr)" : "(Cr)"}
          </span>
          {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
          {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
        </div>
      </div>

      {/* Transaction table */}
      <div className="print-section">
        <div className="section-title">Account Statement</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "12%" }}>Date</th>
              <th style={{ width: "18%" }}>Type</th>
              <th>Description</th>
              <th className="num" style={{ width: "14%" }}>Debit (Rs)</th>
              <th className="num" style={{ width: "14%" }}>Credit (Rs)</th>
              <th className="num" style={{ width: "16%" }}>Balance (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            <tr style={{ fontStyle: "italic" }}>
              <td>{dateFrom ? fmtDate(dateFrom) : "—"}</td>
              <td colSpan={2} style={{ color: "#555" }}>Opening Balance</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(openingBalance)}</td>
            </tr>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#999", padding: "14px" }}>No transactions in this period</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.date)}</td>
                <td>{r.categoryLabel}</td>
                <td>{r.description || "—"}</td>
                <td className="num" style={{ color: r.debit ? "#C62828" : "#999" }}>
                  {r.debit ? fmtPKR(r.debit) : "—"}
                </td>
                <td className="num" style={{ color: r.credit ? "#1B5E20" : "#999" }}>
                  {r.credit ? fmtPKR(r.credit) : "—"}
                </td>
                <td className="num" style={{ fontWeight: 600, color: r.balance >= 0 ? "#1B5E20" : "#C62828" }}>
                  {fmtPKR(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontWeight: 700 }}>Total</td>
              <td className="num">{fmtPKR(totalDebit)}</td>
              <td className="num">{fmtPKR(totalCredit)}</td>
              <td className="num">{fmtPKR(closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Closing summary */}
      <div className="print-section" style={{ marginTop: 16 }}>
        <div className="section-title">Account Summary</div>
        {[
          ["Opening Balance", fmtPKR(openingBalance)],
          ["Total Debit (Dr)", fmtPKR(totalDebit)],
          ["Total Credit (Cr)", fmtPKR(totalCredit)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total">
          <span>Closing Balance</span>
          <span>{fmtPKR(closing)} {closing >= 0 ? "(Cr)" : "(Dr)"}</span>
        </div>
      </div>
    </PrintLayout>
  );
}
