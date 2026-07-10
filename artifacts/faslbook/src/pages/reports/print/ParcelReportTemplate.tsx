import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

const STATUS_LABEL: Record<string,string> = {
  planned: "Planned", sown: "Sown", growing: "Growing",
  ready: "Ready to Harvest", harvested: "Harvested", closed: "Closed",
};

interface Props {
  parcel: any;
  crops: any[];
  expenses: any[];
  incomeEntries: any[];
  farmName: string;
  printedBy: string;
}

export default function ParcelReportTemplate({ parcel, crops, expenses, incomeEntries, farmName, printedBy }: Props) {
  const totalExpense = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const totalIncome  = incomeEntries.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const netPL        = totalIncome - totalExpense;

  const expByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const cat = e.category || e.categoryLabel || "Other";
    expByCategory[cat] = (expByCategory[cat] || 0) + (Number(e.amount) || 0);
  });

  return (
    <PrintLayout
      reportName="Parcel Report"
      filters={[`Parcel: ${parcel?.name || "—"}`]}
      printedBy={printedBy}
      farmName={farmName}
    >
      {/* Parcel info */}
      <div className="print-section">
        <div className="section-title">Parcel Information</div>
        <div className="info-grid">
          <span className="label">Parcel Name</span><span className="value">{parcel?.name || "—"}</span>
          <span className="label">Area</span><span className="value">{parcel?.acres ? `${parcel.acres} Acres` : "—"}</span>
          <span className="label">Location</span><span className="value">{parcel?.location || "—"}</span>
          <span className="label">Assigned Farmer</span><span className="value">{parcel?.assignedFarmerName || "—"}</span>
          <span className="label">Land Type</span><span className="value">{parcel?.landType || "—"}</span>
          <span className="label">Notes</span><span className="value">{parcel?.notes || "—"}</span>
        </div>
      </div>

      {/* Crop history */}
      <div className="print-section">
        <div className="section-title">Crop History</div>
        {crops.length === 0 ? (
          <p style={{ color: "#999", fontSize: 9 }}>No crops recorded for this parcel.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Crop</th>
                <th>Season</th>
                <th>Planted</th>
                <th>Harvested</th>
                <th>Status</th>
                <th className="num">Yield (kg)</th>
              </tr>
            </thead>
            <tbody>
              {crops.map((c: any, i: number) => (
                <tr key={i}>
                  <td>{c.cropName || "—"}</td>
                  <td>{c.season || "—"}</td>
                  <td>{fmtDate(c.plantingDate || c.startDate || "")}</td>
                  <td>{fmtDate(c.harvestDate || c.endDate || "")}</td>
                  <td>{STATUS_LABEL[c.status] || c.status || "—"}</td>
                  <td className="num">{c.yieldKg ? c.yieldKg.toLocaleString("en-PK") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expense breakdown */}
      <div className="print-section">
        <div className="section-title">Expense Summary</div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Amount (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(expByCategory).length === 0 ? (
              <tr><td colSpan={2} style={{ color: "#999" }}>No expenses recorded.</td></tr>
            ) : (
              Object.entries(expByCategory).map(([cat, amt]) => (
                <tr key={cat}>
                  <td style={{ textTransform: "capitalize" }}>{cat}</td>
                  <td className="num">{fmtPKR(amt)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total Expenses</td>
              <td className="num">{fmtPKR(totalExpense)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* P&L Summary */}
      <div className="print-section" style={{ marginTop: 14 }}>
        <div className="section-title">Profit &amp; Loss</div>
        {[
          ["Total Income",  fmtPKR(totalIncome)],
          ["Total Expense", fmtPKR(totalExpense)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total">
          <span>{netPL >= 0 ? "Net Profit" : "Net Loss"}</span>
          <span style={{ color: netPL >= 0 ? "#1B5E20" : "#C62828" }}>{fmtPKR(Math.abs(netPL))}</span>
        </div>
      </div>
    </PrintLayout>
  );
}
