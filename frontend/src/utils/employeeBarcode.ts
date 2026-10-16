import JsBarcode from "jsbarcode";

export interface EmployeeBarcode {
  nik: string;
  nama: string;
  svg: string;
}

// FastReport dimensions in BARCODE.fr3 are 96 dpi pixels; page margins are mm.
const mm = (pixels: number) => `${(pixels * 25.4 / 96).toFixed(5)}mm`;
export const barcodeLabelCss = `
  .barcode-band { position: relative; width: 208mm; height: ${mm(124.72449)}; margin-top: ${mm(18.89765)}; }
  .employee-barcode { position: absolute; left: ${mm(22.7953)}; top: ${mm(24.45671)}; width: ${mm(123)}; height: ${mm(46.03154)}; }
  .employee-name { position: absolute; left: ${mm(6.74799)}; top: ${mm(72.48825)}; width: ${mm(155.86611)}; height: ${mm(18.89765)}; margin: 0; color: #000; font: bold 9pt "Arial Narrow", Arial, sans-serif; text-align: center; white-space: nowrap; overflow: hidden; }
`;
export const barcodePrintCss = `
  @page { size: A4 portrait; margin: 1mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  ${barcodeLabelCss}
`;

export function createEmployeeBarcode(nik: unknown, nama: unknown, doc: Document = document): EmployeeBarcode {
  if (typeof nik !== "string" || !nik.trim()) throw new Error("NIK kosong atau tidak valid. Barcode tidak dapat dibuat.");
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, nik, { format: "CODE128A", displayValue: false, width: 2, height: 90,
      margin: 0, marginLeft: 20, marginRight: 20, marginTop: 0, marginBottom: 0,
      lineColor: "#000000", background: "#ffffff", xmlDocument: doc });
  } catch {
    throw new Error("NIK tidak dapat dienkode sebagai barcode Code 128A.");
  }
  svg.setAttribute("aria-label", `Barcode NIK ${nik}`);
  // Only bars are scaled: match the legacy rectangle without SVG letterboxing.
  svg.setAttribute("preserveAspectRatio", "none");
  return { nik, nama: String(nama ?? ""), svg: svg.outerHTML };
}

export const barcodeImageUrl = (barcode: EmployeeBarcode) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcode.svg)}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function employeeBarcodePrintHtml(barcode: EmployeeBarcode): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Barcode Karyawan ${escapeHtml(barcode.nik)}</title><style>${barcodePrintCss}</style></head><body><main class="barcode-band"><img class="employee-barcode" src="${barcodeImageUrl(barcode)}" alt="Barcode karyawan"><p class="employee-name">${escapeHtml(barcode.nama)}</p></main></body></html>`;
}

export async function printEmployeeBarcode(barcode: EmployeeBarcode): Promise<void> {
  // Open synchronously within the user's click to avoid popup blocking.
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) throw new Error("Popup diblokir browser. Izinkan popup untuk mencetak barcode.");
  try {
    popup.document.open();
    popup.document.write(employeeBarcodePrintHtml(barcode));
    popup.document.close();
    await Promise.all(Array.from(popup.document.images, image => image.decode()));
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.addEventListener("afterprint", () => popup.close(), { once: true });
    popup.focus();
    popup.print();
  } catch (error) {
    if (popup.closed) return;
    popup.close();
    throw error;
  }
}
