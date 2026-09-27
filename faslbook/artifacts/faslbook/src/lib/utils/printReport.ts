export interface PrintColumn {
  header: string;
  key: string;
  width?: string;
  align?: "left" | "right" | "center";
}

export interface PrintSection {
  title: string;
  data: Record<string, any>[];
  columns: PrintColumn[];
}

export interface PrintReportOptions {
  title: string;
  farmName?: string;
  subtitle?: string;
  sections: PrintSection[];
  summaryCards?: { label: string; value: string; color?: string }[];
}

export function printReport(options: PrintReportOptions) {
  const { title, farmName, subtitle, sections, summaryCards } = options;
  const date = new Date().toLocaleDateString("en-PK", {
    day: "numeric", month: "long", year: "numeric",
  });

  const cardsHTML = summaryCards?.length
    ? `<div class="summary-grid">
        ${summaryCards.map((c) => `
          <div class="summary-card">
            <div class="summary-label">${c.label}</div>
            <div class="summary-value" style="color:${c.color || "#1B5E20"}">${c.value}</div>
          </div>
        `).join("")}
      </div>`
    : "";

  const sectionsHTML = sections.map((sec) => `
    <div class="section">
      <div class="section-title">${sec.title}</div>
      <table>
        <thead>
          <tr>
            ${sec.columns.map((col) => `
              <th style="width:${col.width || "auto"};text-align:${col.align || "left"}">${col.header}</th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${sec.data.length === 0
            ? `<tr><td colspan="${sec.columns.length}" style="text-align:center;color:#9CA3AF;padding:16px">No data</td></tr>`
            : sec.data.map((row, i) => `
              <tr class="${i % 2 === 0 ? "even" : "odd"}">
                ${sec.columns.map((col) => `
                  <td style="text-align:${col.align || "left"}">${row[col.key] ?? "—"}</td>
                `).join("")}
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — FaslBook</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #1F2937;
      background: #fff;
      padding: 0;
    }
    .header {
      background: #1B5E20;
      color: white;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .header-left h1 { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
    .header-left p  { font-size: 11px; opacity: 0.8; }
    .header-right   { text-align: right; font-size: 11px; opacity: 0.8; }
    .logo { width: 40px; height: 40px; object-fit: contain;
            border-radius: 8px; background: white; padding: 4px; margin-right: 12px; }
    .header-inner { display: flex; align-items: center; }

    .content { padding: 20px 24px; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-card {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 12px;
      page-break-inside: avoid;
    }
    .summary-label { font-size: 10px; color: #6B7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 16px; font-weight: 700; }

    .section { margin-bottom: 24px; page-break-inside: avoid; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1B5E20;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid #E8F5E9;
    }

    table { width: 100%; border-collapse: collapse; }
    th {
      background: #1B5E20;
      color: white;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 600;
    }
    td { padding: 7px 10px; border-bottom: 1px solid #F3F4F6; font-size: 11px; }
    tr.even td { background: #F9FAF9; }
    tr.odd  td { background: #FFFFFF; }

    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #E5E7EB;
      font-size: 10px;
      color: #9CA3AF;
      text-align: center;
    }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none !important; }
      @page { margin: 10mm; size: A4; }
    }

    .print-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      background: #1B5E20;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .print-btn:hover { background: #155724; }
    @media print { .print-btn { display: none !important; } }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">
    🖨️ Print / Save PDF
  </button>

  <div class="header">
    <div class="header-inner">
      <img src="/logo.png" class="logo" alt="FB" onerror="this.style.display='none'"/>
      <div class="header-left">
        <h1>${title}</h1>
        <p>${farmName ? farmName + " — " : ""}${subtitle || ""}</p>
      </div>
    </div>
    <div class="header-right">
      <div>FaslBook Farm OS</div>
      <div>${date}</div>
    </div>
  </div>

  <div class="content">
    ${cardsHTML}
    ${sectionsHTML}
    <div class="footer">
      Generated by FaslBook • ${date} • ${farmName || ""}
    </div>
  </div>

  <script>
    window.addEventListener("load", function() {
      // Auto-focus so Ctrl+P works immediately
      document.querySelector(".print-btn")?.focus();
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups for printing.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
