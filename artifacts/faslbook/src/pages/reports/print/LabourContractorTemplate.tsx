import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + Math.abs(n).toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const p = str.split("-");
  if (p.length !== 3) return str;
  return `${parseInt(p[2])} ${MONTHS[parseInt(p[1]) - 1]} ${p[0]}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", partial: "Partial Paid", paid: "Paid",
};

interface HarvestRecord {
  id: string; contractorId: string; contractorName: string;
  parcelName?: string; cropName?: string;
  harvestDate: string; bags?: number; totalAmount: number;
  advancePaid: number; remainingBalance: number;
  paymentStatus: "pending" | "partial" | "paid"; notes?: string;
}

interface Contractor { id: string; name: string; phone?: string; teamSize?: number; }

interface Props {
  contractor: Contractor | null;
  contractors: Contractor[];
  records: HarvestRecord[];
  farmName: string; printedBy: string; dateFrom: string; dateTo: string;
}

export default function LabourContractorTemplate({ contractor, contractors, records, farmName, printedBy, dateFrom, dateTo }: Props) {
  const isAll = !contractor;

  const totalAmount    = records.reduce((s, r) => s + r.totalAmount,       0);
  const totalPaid      = records.reduce((s, r) => s + r.advancePaid,       0);
  const totalRemaining = records.reduce((s, r) => s + r.remainingBalance,  0);

  const filters = [
    `Contractor: ${isAll ? "All Contractors" : contractor!.name}`,
    dateFrom && dateTo ? `Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}` : "",
  ].filter(Boolean);

  return (
    <PrintLayout reportName="Labour Contractor Khata" filters={filters} printedBy={printedBy} farmName={farmName}>

      {/* Contractor info */}
      <div className="print-section-compact">
        <div className="section-title">Contractor Information</div>
        {isAll ? (
          <div className="info-grid">
            <span className="label">Total Contractors</span><span className="value">{contractors.length}</span>
            <span className="label">Total Jobs</span><span className="value">{records.length}</span>
            {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
            {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
          </div>
        ) : (
          <div className="info-grid">
            <span className="label">Contractor Name</span><span className="value">{contractor!.name}</span>
            <span className="label">Phone</span><span className="value">{contractor!.phone || "—"}</span>
            <span className="label">Team Size</span><span className="value">{contractor!.teamSize ?? "—"} workers</span>
            <span className="label">Total Jobs</span><span className="value">{records.length}</span>
            {dateFrom && <><span className="label">From</span><span className="value">{fmtDate(dateFrom)}</span></>}
            {dateTo   && <><span className="label">To</span>  <span className="value">{fmtDate(dateTo)}</span></>}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="print-section-compact">
        <div className="section-title">Payment Summary</div>
        <div style={{ display:"flex", gap:"8px 32px", flexWrap:"wrap" }}>
          {[
            ["Total Labour Cost",   fmtPKR(totalAmount),    "#111"],
            ["Total Paid",          fmtPKR(totalPaid),      "#1B5E20"],
            ["Remaining Balance",   fmtPKR(totalRemaining), totalRemaining > 0 ? "#C62828" : "#1B5E20"],
          ].map(([l, v, c]) => (
            <div key={l as string} className="summary-row" style={{ flex:"1 1 180px" }}>
              <span>{l as string}</span>
              <span style={{ fontWeight:700, color: c as string }}>{v as string}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All-contractors summary table */}
      {isAll && contractors.length > 0 && (
        <div className="print-section">
          <div className="section-title">Contractor Balances</div>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width:"5%" }}>No.</th>
                <th>Contractor Name</th>
                <th>Phone</th>
                <th className="ctr">Team</th>
                <th className="num">Total Cost (Rs)</th>
                <th className="num">Paid (Rs)</th>
                <th className="num">Remaining (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c, i) => {
                const crecs = records.filter(r => r.contractorId === c.id);
                const cTotal = crecs.reduce((s, r) => s + r.totalAmount, 0);
                const cPaid  = crecs.reduce((s, r) => s + r.advancePaid, 0);
                const cRem   = crecs.reduce((s, r) => s + r.remainingBalance, 0);
                return (
                  <tr key={c.id}>
                    <td className="ctr">{i + 1}</td>
                    <td style={{ fontWeight:600 }}>{c.name}</td>
                    <td>{c.phone || "—"}</td>
                    <td className="ctr">{c.teamSize ?? "—"}</td>
                    <td className="num">{fmtPKR(cTotal)}</td>
                    <td className="num" style={{ color:"#1B5E20" }}>{fmtPKR(cPaid)}</td>
                    <td className="num" style={{ fontWeight:700, color: cRem > 0 ? "#C62828" : "#1B5E20" }}>{fmtPKR(cRem)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight:700 }}>Total</td>
                <td className="num">{fmtPKR(totalAmount)}</td>
                <td className="num">{fmtPKR(totalPaid)}</td>
                <td className="num">{fmtPKR(totalRemaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Harvest records table */}
      <div className="print-section">
        <div className="section-title">{isAll ? "All Harvest Records" : "Harvest Job Records"}</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width:"10%" }}>Date</th>
              {isAll && <th>Contractor</th>}
              <th>Parcel / Crop</th>
              <th className="ctr" style={{ width:"6%" }}>Bags</th>
              <th className="num" style={{ width:"13%" }}>Total (Rs)</th>
              <th className="num" style={{ width:"12%" }}>Paid (Rs)</th>
              <th className="num" style={{ width:"13%" }}>Remaining (Rs)</th>
              <th className="ctr" style={{ width:"10%" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={isAll ? 8 : 7} style={{ textAlign:"center", color:"#999", padding:"14px" }}>No records in this period</td></tr>
            )}
            {records.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.harvestDate)}</td>
                {isAll && <td style={{ fontWeight:600 }}>{r.contractorName}</td>}
                <td>{[r.parcelName, r.cropName].filter(Boolean).join(" / ") || "—"}</td>
                <td className="ctr">{r.bags ?? "—"}</td>
                <td className="num">{fmtPKR(r.totalAmount)}</td>
                <td className="num" style={{ color:"#1B5E20" }}>{fmtPKR(r.advancePaid)}</td>
                <td className="num" style={{ fontWeight:600, color: r.remainingBalance > 0 ? "#C62828" : "#1B5E20" }}>
                  {fmtPKR(r.remainingBalance)}
                </td>
                <td className="ctr" style={{ fontSize:"8.5pt", fontWeight:700,
                  color: r.paymentStatus === "paid" ? "#1B5E20" : r.paymentStatus === "partial" ? "#1565C0" : "#E65100" }}>
                  {STATUS_LABEL[r.paymentStatus] ?? r.paymentStatus}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isAll ? 4 : 3} style={{ fontWeight:700 }}>Total</td>
              <td></td>
              <td className="num">{fmtPKR(totalAmount)}</td>
              <td className="num">{fmtPKR(totalPaid)}</td>
              <td className="num">{fmtPKR(totalRemaining)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes column if any */}
      {records.some(r => r.notes) && (
        <div className="print-section-compact">
          <div className="section-title">Notes</div>
          {records.filter(r => r.notes).map((r, i) => (
            <div key={i} className="summary-row" style={{ fontSize:"9pt" }}>
              <span>{fmtDate(r.harvestDate)} — {r.contractorName}</span>
              <span>{r.notes}</span>
            </div>
          ))}
        </div>
      )}
    </PrintLayout>
  );
}
