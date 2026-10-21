import type { PenilaianResult } from "./types";

export const SHARE_INSTRUCTION = "PDF dan pesan siap dibagikan. Pilih WhatsApp jika tersedia pada menu berbagi.";
export const FALLBACK_INSTRUCTION = "PDF siap diunduh. Selesaikan penyimpanan melalui browser, lalu pilih penerima di WhatsApp, lampirkan PDF tersebut, dan tekan Kirim.";

interface DeliveryUi {
  notify: (message: string) => void;
  showActions: (message: string, fallback: () => Promise<void>, whatsappUrl: string | undefined, text: string) => void;
  copyText: (text: string) => Promise<boolean>;
}

/** Mengurus UX berbagi saja; PDF dan teks sudah selesai dibentuk oleh runtime. */
export function createResultDelivery(ui: DeliveryUi) {
  let revision = 0;
  const reset = () => { ++revision; };
  async function deliverResult({ pdfBlob, filename, text }: PenilaianResult): Promise<void> {
    const current = ++revision;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    let fallbackBusy = false;
    const fallback = async () => {
      if (fallbackBusy || current !== revision) return;
      fallbackBusy = true;
      try {
        const href = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000); }
      } catch {
        if (current === revision) {
          const message = "Unduhan PDF belum dapat dimulai. Coba unduh kembali sebelum melampirkannya di WhatsApp.";
          ui.showActions(message, fallback, whatsappUrl, text);
          ui.notify(message);
        }
        fallbackBusy = false;
        return;
      }
      // Tidak mengasumsikan aplikasi native tersedia atau popup berhasil terbuka.
      try { window.open(whatsappUrl, "_blank", "noopener,noreferrer"); } catch { /* Tautan manual tetap tersedia. */ }
      if (current === revision) {
        ui.showActions(FALLBACK_INSTRUCTION, fallback, whatsappUrl, text);
        ui.notify(FALLBACK_INSTRUCTION);
      }
      try { await ui.copyText(text); } catch { /* Instruksi dan tautan WA tidak bergantung permission clipboard. */ }
      finally { fallbackBusy = false; }
    };
    let file: File | undefined;
    let canShareFiles = false;
    try {
      if (typeof File === "function" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
        file = new File([pdfBlob], filename, { type: "application/pdf" });
        canShareFiles = navigator.canShare({ files: [file] });
      }
    } catch { /* Feature detection dapat ditolak browser; gunakan fallback. */ }
    if (!canShareFiles || !file) { await fallback(); return; }
    ui.showActions(SHARE_INSTRUCTION, fallback, undefined, text);
    ui.notify(SHARE_INSTRUCTION);
    try {
      await navigator.share({ title: "Approval PKWT", text, files: [file] });
      // Resolve pada Windows/mobile bukan konfirmasi pengiriman ke WhatsApp.
    } catch (error) {
      if (current !== revision) return;
      if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") {
        const message = "Menu berbagi ditutup atau tidak tersedia. Gunakan alternatif unduh PDF dan buka WhatsApp bila diperlukan.";
        ui.showActions(message, fallback, undefined, text);
        ui.notify(message);
      } else await fallback();
    }
  }
  return { deliverResult, reset };
}
