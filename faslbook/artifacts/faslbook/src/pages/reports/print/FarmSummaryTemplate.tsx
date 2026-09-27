import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");

interface Props {
  farmName: string;
  printedBy: string;
  farmerCount: number;
  parcelCount: number;
  totalAcres: number;
  activeCrops: number;
  harvestedCrops: number;
  totalIncome: number;
  totalExpense: number;
  totalExpenseByCategory: Record<string, number>;
  totalIncomeByType: Record<string, number>;
  outstandingBalance: number;
  inventoryValue: number;
  recentActivities: { date: string; description: string }[];
}

export default function FarmSummaryTemplate({
  farmName, printedBy, farmerCount, parcelCount, totalAcres,
  activeCrops, harvestedCrops, totalIncome, totalExpense,
  totalExpenseByCategory, totalIncomeByType,
  outstandingBalance, inventoryValue, recentActivities,
}: Props) {
  const netProfit = totalIncome - totalExpense;

  return (
    <PrintLayout
      reportName="Farm Summary Report"
      printedBy={printedBy}
      farmName={farmName}
    >
      {/* Key Metrics grid */}
      <div className="print-section">
        <div className="section-title">Farm Overview</div>
        <table className="print-table" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, width: "35%" }}>Farm / Organization</td>
              <td>{farmName}</td>
              <td style={{ fontWeight: 600, width: "25%" }}>Total Farmers</td>
              <td>{farmerCount}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Total Parcels</td>
              <td>{parcelCount}</td>
              <td style={{ fontWeight: 600 }}>Total Land</td>
              <td>{totalAcres} Acres</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Active Crops</td>
              <td>{activeCrops}</td>
              <td style={{ fontWeight: 600 }}>Harvested Crops</td>
              <td>{harvestedCrops}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Inventory Value</td>
              <td>{fmtPKR(inventoryValue)}</td>
              <td style={{ fontWeight: 600 }}>Outstanding Balance</td>
              <td style={{ color: outstandingBalance > 0 ? "#C62828" : "#1B5E20" }}>
                {fmtPKR(Math.abs(outstandingBalance))} {outstandingBalance > 0 ? "(Dr)" : "(Cr)"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Financial summary side by side */}
      <div className="print-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Income breakdown */}
        <div>
          <div className="section-title">Income Breakdown</div>
          <table className="print-table">
            <thead><tr><th>Source</th><th className="num">Amount (Rs)</th></tr></thead>
            <tbody>
              {Object.entries(totalIncomeByType).length === 0
                ? <tr><td colSpan={2} style={{ color: "#999" }}>No income data</td></tr>
                : Object.entries(totalIncomeByType).map(([k, v]) => (
                  <tr key={k}><td style={{ textTransform: "capitalize" }}>{k}</td><td className="num">{fmtPKR(v)}</td></tr>
                ))
              }
            </tbody>
            <tfoot>
              <tr><td>Total Income</td><td className="num">{fmtPKR(totalIncome)}</td></tr>
            </tfoot>
          </table>
        </div>

        {/* Expense breakdown */}
        <div>
          <div className="section-title">Expense Breakdown</div>
          <table className="print-table">
            <thead><tr><th>Category</th><th className="num">Amount (Rs)</th></tr></thead>
            <tbody>
              {Object.entries(totalExpenseByCategory).length === 0
                ? <tr><td colSpan={2} style={{ color: "#999" }}>No expense data</td></tr>
                : Object.entries(totalExpenseByCategory).map(([k, v]) => (
                  <tr key={k}><td style={{ textTransform: "capitalize" }}>{k}</td><td className="num">{fmtPKR(v)}</td></tr>
                ))
              }
            </tbody>
            <tfoot>
              <tr><td>Total Expenses</td><td className="num">{fmtPKR(totalExpense)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net P&L */}
      <div className="print-section">
        <div className="section-title">Financial Result</div>
        {[
          ["Total Income",  fmtPKR(totalIncome)],
          ["Total Expense", fmtPKR(totalExpense)],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total">
          <span>{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
          <span style={{ color: netProfit >= 0 ? "#1B5E20" : "#C62828" }}>{fmtPKR(Math.abs(netProfit))}</span>
        </div>
      </div>

      {/* Recent activities */}
      {recentActivities.length > 0 && (
        <div className="print-section">
          <div className="section-title">Recent Activities</div>
          <table className="print-table">
            <thead><tr><th style={{ width: "20%" }}>Date</th><th>Activity</th></tr></thead>
            <tbody>
              {recentActivities.slice(0, 15).map((a, i) => (
                <tr key={i}><td>{a.date}</td><td>{a.description}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PrintLayout>
  );
}
