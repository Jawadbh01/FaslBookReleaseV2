export async function exportToExcel(title: string, data: (string | number)[][], columns: string[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "FaslBook";
  const ws = wb.addWorksheet(title.slice(0, 31));

  ws.columns = columns.map((c) => ({ header: c, key: c, width: 22 }));

  // Green header row to match the app branding
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B5E20" } };
  });

  data.forEach((row) => ws.addRow(row));
  ws.getRow(1).commit();

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FaslBook-${title.replace(/\s+/g, "-")}-${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
