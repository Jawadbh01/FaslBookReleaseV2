export async function exportToExcel(title: string, data: (string | number)[][], columns: string[]) {
  const XLSX = await import("xlsx");
  const ws   = XLSX.utils.aoa_to_sheet([columns, ...data]);
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `FaslBook-${title.replace(/\s+/g, "-")}-${Date.now()}.xlsx`);
}
