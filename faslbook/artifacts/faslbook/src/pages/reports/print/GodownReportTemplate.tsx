import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");

interface Props {
  items: any[];
  transactions: any[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function GodownReportTemplate({ items, transactions, farmName, printedBy, dateFrom, dateTo }: Props) {
  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${dateFrom} — ${dateTo}`);

  // Calculate stock in / stock out per item
  const stockInMap:  Record<string, number> = {};
  const stockOutMap: Record<string, number> = {};

  transactions.forEach((t: any) => {
    const id = t.itemId || t.inventoryItemId || "";
    if (!id) return;
    const qty = Number(t.quantity) || 0;
    if (t.type === "in")  stockInMap[id]  = (stockInMap[id]  || 0) + qty;
    if (t.type === "out") stockOutMap[id] = (stockOutMap[id] || 0) + qty;
  });

  const totalValue = items.reduce((s: number, i: any) => s + ((i.currentStock || 0) * (i.pricePerUnit || 0)), 0);
  const totalIn    = Object.values(stockInMap).reduce((s, v) => s + v, 0);
  const totalOut   = Object.values(stockOutMap).reduce((s, v) => s + v, 0);

  return (
    <PrintLayout
      reportName="Godown Stock Register"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      <div className="print-section">
        <div className="section-title">Stock Inventory</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>No.</th>
              <th>Item Name</th>
              <th>Category</th>
              <th className="ctr">Unit</th>
              <th className="num">Stock In</th>
              <th className="num">Stock Out</th>
              <th className="num">Closing Stock</th>
              <th className="num">Rate (Rs)</th>
              <th className="num">Total Value (Rs)</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "#999" }}>No inventory items found.</td></tr>
            )}
            {items.map((item: any, i: number) => {
              const inQty   = stockInMap[item.id]  || 0;
              const outQty  = stockOutMap[item.id] || 0;
              const closing = item.currentStock ?? 0;
              const value   = closing * (item.pricePerUnit || 0);
              return (
                <tr key={item.id}>
                  <td className="ctr">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td style={{ textTransform: "capitalize" }}>{item.category || "Other"}</td>
                  <td className="ctr">{item.unit || "—"}</td>
                  <td className="num" style={{ color: "#1B5E20" }}>{inQty > 0 ? `+${inQty.toLocaleString("en-PK")}` : "—"}</td>
                  <td className="num" style={{ color: "#C62828" }}>{outQty > 0 ? `-${outQty.toLocaleString("en-PK")}` : "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{closing.toLocaleString("en-PK")}</td>
                  <td className="num">{item.pricePerUnit ? fmtPKR(item.pricePerUnit) : "—"}</td>
                  <td className="num">{value ? fmtPKR(value) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
              <td className="num" style={{ color: "#1B5E20" }}>+{totalIn.toLocaleString("en-PK")}</td>
              <td className="num" style={{ color: "#C62828" }}>-{totalOut.toLocaleString("en-PK")}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{fmtPKR(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="print-section" style={{ marginTop: 14 }}>
        <div className="section-title">Summary</div>
        {[
          ["Total Items in Godown", `${items.length} items`],
          ["Total Stock In (this period)", `${totalIn.toLocaleString("en-PK")} units`],
          ["Total Stock Out (this period)", `${totalOut.toLocaleString("en-PK")} units`],
        ].map(([l, v]) => (
          <div key={l} className="summary-row"><span>{l}</span><span>{v}</span></div>
        ))}
        <div className="summary-row total"><span>Total Inventory Value</span><span>{fmtPKR(totalValue)}</span></div>
      </div>
    </PrintLayout>
  );
}
