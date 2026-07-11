import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + Math.abs(n).toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const p = str.split("-");
  if (p.length !== 3) return str;
  return `${parseInt(p[2])} ${MONTHS[parseInt(p[1]) - 1]} ${p[0]}`;
}

interface Entry {
  id: string; date: string; type: "credit" | "debit";
  categoryLabel: string; description: string; amount: number;
}

interface Props {
  profile: { id: string; name: string; customLabel: string; phone?: string } | null;
  entries: Entry[];
  farmName: string; printedBy: string; dateFrom: string; dateTo: string;
}

export default function CustomKhataTemplate({ profile, entries, farmName, printedBy, dateFrom, dateTo }: Props) {
  let running = 0;
  const rows = entries.map(e => {
    const debit  = e.type === "debit"  ? e.amount : 0;
    const credit = e.type === "credit" ? e.amount : 0;
    running += credit - debit;
    return { ...e, debit, credit, balance: running };
  });

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing     = totalCredit - totalDebit;

  const filters = [
    profile ? `Account: ${profile.name} (${profile.customLabel})` : "All Custom Accounts",
    dateFrom && dateTo ? `Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}` : "",
  ].filter(Boolean);

  return (
    <PrintLayout reportName="Custom Khata" filters={filters} printedBy={printedBy} farmName={farmName}>

      {/* Account info */}
      <div className="print-section-compact">
        <div className="section-title">Account Information</div>
        <div className="info-grid">
          <span className="label">Account Name</span>
          <span className="value">{profile?.name ?? "—"}</span>
          <span className="label">Account Type</span>
          <span className="value">{profile?.customLabel ?? "—"}</span>
          {profile?.phone && (
            <><span className="label">Phone</span><span className="value">{profile.phone}</span></>
          )}
          {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
          {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
        </div>
      </div>

      {/* Ledger table */}
      <div className="print-section">
        <div className="section-title">Account Statement</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "11%" }}>Date</th>
              <th style={{ width: "20%" }}>Type</th>
              <th>Description / Notes</th>
              <th className="num" style={{ width: "14%" }}>Debit (Rs)</th>
              <th className="num" style={{ width: "14%" }}>Credit (Rs)</th>
              <th className="num" style={{ width: "15%" }}>Balance (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign:"center", color:"#999", padding:"14px" }}>No entries for this period</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.date)}</td>
                <td>{r.categoryLabel}</td>
                <td>{r.description || "—"}</td>
                <td className="num" style={{ color: r.debit  ? "#C62828" : "#999" }}>{r.debit  ? fmtPKR(r.debit)  : "—"}</td>
                <td className="num" style={{ color: r.credit ? "#1B5E20" : "#999" }}>{r.credit ? fmtPKR(r.credit) : "—"}</td>
                <td className="num" style={{ fontWeight:600, color: r.balance >= 0 ? "#1B5E20" : "#C62828" }}>
                  {fmtPKR(r.balance)} {r.balance < 0 ? "(Dr)" : "(Cr)"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontWeight:700 }}>Total</td>
              <td className="num">{fmtPKR(totalDebit)}</td>
              <td className="num">{fmtPKR(totalCredit)}</td>
              <td className="num">{fmtPKR(closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="print-section-compact" style={{ marginTop:14 }}>
        <div className="section-title">Account Summary</div>
        {[
          ["Total Debit (Dr)",  fmtPKR(totalDebit)],
          ["Total Credit (Cr)", fmtPKR(totalCredit)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total">
          <span>Closing Balance</span>
          <span style={{ color: closing >= 0 ? "#1B5E20" : "#C62828" }}>
            {fmtPKR(closing)} {closing >= 0 ? "(Cr)" : "(Dr)"}
          </span>
        </div>
      </div>
    </PrintLayout>
  );
}
