export async function exportToPDF(title: string, data: (string | number)[][], columns: string[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable  = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();

  // Green header bar
  doc.setFillColor(27, 94, 32);
  doc.rect(0, 0, 210, 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("FaslBook – " + title, 14, 16);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("en-PK"), 160, 16);

  autoTable(doc, {
    startY: 30,
    head: [columns],
    body: data,
    theme: "striped",
    headStyles: { fillColor: [27, 94, 32] },
  });

  doc.save(`FaslBook-${title.replace(/\s+/g, "-")}-${Date.now()}.pdf`);
}
