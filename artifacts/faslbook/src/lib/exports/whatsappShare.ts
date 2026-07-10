export function shareViaWhatsApp(title: string, summary: string) {
  const text = `🌾 FaslBook Report – ${title}\n\n${summary}\n\nGenerated: ${new Date().toLocaleDateString("en-PK")}`;
  const url  = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}
