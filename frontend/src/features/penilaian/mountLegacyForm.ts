import { jsPDF } from "jspdf";
import icons from "./legacy-icons.css?inline";
import { createResultDelivery } from "./resultDelivery";
import type { LegacyDocument, LegacyRuntime, PenilaianEmployee, PenilaianFormType } from "./types";

/** Source HTML hanya template statis. Tidak memasang script/link CDN atau memakai eval. */
export async function mountLegacyForm(host: HTMLElement, type: PenilaianFormType, employee: PenilaianEmployee, isCurrent = () => true): Promise<LegacyRuntime | null> {
  const [source, runtime] = type === "tanpa-bawahan"
    ? await Promise.all([import("./legacy/source-tanpa-bawahan.html?raw"), import("./legacy/runtime-tanpa-bawahan.js")])
    : await Promise.all([import("./legacy/source-dengan-bawahan.html?raw"), import("./legacy/runtime-dengan-bawahan.js")]);
  if (!isCurrent()) return null;
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  const sourceStyle = source.default.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
  style.textContent = sourceStyle.replace(/:root/g, ":host").replace(/\bbody\b/g, ".legacy-body") + icons + `
    :host { display:block; width:100%; height:100%; overflow:auto; color-scheme:light; }
    .legacy-body { min-height:100%; }
    .field input[readonly] { background:#eef2f7; color:#334155; cursor:default; }
    .manual-copy { margin:12px 0; padding:12px; border:1px solid var(--border); border-radius:12px; background:white; }
    .manual-copy label { display:block; margin-bottom:8px; font-size:13px; }
    .manual-copy textarea { width:100%; min-height:180px; padding:8px; font:12px sans-serif; }
    .delivery-actions { margin:12px 0; padding:12px; border:1px solid var(--border); border-radius:12px; background:#f0f7ff; font-size:13px; line-height:1.5; }
    .delivery-actions p { margin-bottom:8px; }
    .delivery-actions button, .delivery-actions a { display:inline-block; padding:7px 10px; margin:4px 8px 0 0; border:1px solid var(--primary); border-radius:8px; color:var(--primary); background:white; font:inherit; cursor:pointer; text-decoration:none; }
    .delivery-actions button:focus-visible, .delivery-actions a:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
    .delivery-preview { margin-top:10px; }
    .delivery-preview summary { cursor:pointer; color:var(--primary); }
    .delivery-preview textarea { width:100%; min-height:220px; margin-top:8px; padding:10px; border:1px solid var(--border); border-radius:8px; background:white; color:var(--text); font:12px/1.6 ui-monospace,monospace,"Segoe UI Emoji","Apple Color Emoji"; }
  `;
  const body = document.createElement("div");
  body.className = "legacy-body";
  body.innerHTML = (source.default.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  shadow.replaceChildren(style, body);
  const localDocument: LegacyDocument = {
    getElementById: (id) => shadow.getElementById(id),
    querySelectorAll: (selector) => shadow.querySelectorAll(selector),
    createElement: document.createElement.bind(document),
    body,
  };
  const fields = { namaKaryawan: employee.nama, nik: employee.nik, jabatan: employee.jabatan, departemen: employee.bagian, statusKepegawaian: employee.statusKerja };
  // Identitas berasal dari server; tidak mengandalkan pilihan departemen/jabatan hardcoded HTML lama.
  for (const [id] of Object.entries(fields)) {
    const original = shadow.getElementById(id)!;
    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    input.setAttribute("aria-label", original.closest(".field")?.querySelector("label")?.textContent || id);
    original.replaceWith(input);
  }
  let delivery: ReturnType<typeof createResultDelivery> | undefined;
  const restoreIdentity = () => {
    delivery?.reset();
    shadow.getElementById("resultDelivery")?.remove();
    shadow.getElementById("manualCopy")?.remove();
    for (const [id, value] of Object.entries(fields)) (shadow.getElementById(id) as HTMLInputElement).value = value || "-";
  };
  restoreIdentity();
  const modal = shadow.getElementById("warningModal")!;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Alur Tanda Tangan dan Persetujuan");
  body.addEventListener("keydown", (event) => { if (event.key === "Escape") modal.classList.remove("show"); });
  const copyResultText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Browser tanpa clipboard permission tetap dapat menyalin teks secara manual.
      let panel = shadow.getElementById("manualCopy");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "manualCopy";
        panel.className = "manual-copy";
        panel.innerHTML = '<label for="resultText">PDF sudah diunduh. Salin pesan berikut dan lampirkan PDF di WhatsApp.</label><textarea id="resultText" readonly></textarea>';
        shadow.getElementById("shareWABtn")!.after(panel);
      }
      const textarea = panel.querySelector("textarea")!;
      textarea.value = text;
      panel.scrollIntoView({ block: "center" });
      textarea.focus();
      textarea.select();
      return false;
    }
  };
  const deliveryUiNotify = (message: string) => {
      const toast = shadow.getElementById("toastMsg");
      if (!toast || !isCurrent()) return;
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => { if (toast.textContent === message) toast.classList.remove("show"); }, 4000);
  };
  delivery = createResultDelivery({
    copyText: copyResultText,
    notify: deliveryUiNotify,
    showActions(message, fallback, whatsappUrl, text) {
      const shareButton = shadow.getElementById("shareWABtn");
      if (!shareButton || !isCurrent()) return;
      shadow.getElementById("resultDelivery")?.remove();
      const panel = document.createElement("div");
      panel.id = "resultDelivery";
      panel.className = "delivery-actions";
      const instruction = document.createElement("p");
      instruction.setAttribute("role", "status");
      instruction.textContent = message;
      const alternative = document.createElement("button");
      alternative.type = "button";
      alternative.textContent = "Unduh PDF & buka WhatsApp";
      alternative.addEventListener("click", () => { void fallback(); });
      panel.append(instruction, alternative);
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-result-text";
      copyButton.textContent = "Salin teks dengan emoji";
      copyButton.addEventListener("click", async () => {
        const copied = await copyResultText(text);
        if (copied) deliveryUiNotify("Teks beserta emoji disalin. Tempel di WhatsApp jika emoji pada pesan otomatis berubah.");
      });
      panel.append(copyButton);
      if (whatsappUrl) {
        const link = document.createElement("a");
        link.href = whatsappUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Buka WhatsApp";
        panel.append(link);
        const emojiHint = document.createElement("p");
        emojiHint.textContent = "Jika emoji pada teks otomatis berubah, klik Salin teks dengan emoji lalu tempel di WhatsApp untuk mengganti teks tersebut.";
        panel.append(emojiHint);
      }
      const preview = document.createElement("details");
      preview.className = "delivery-preview";
      const summary = document.createElement("summary");
      summary.textContent = "Pratinjau teks hasil";
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.setAttribute("aria-label", "Teks hasil penilaian asli beserta emoji");
      preview.append(summary, textarea);
      panel.append(preview);
      shareButton.after(panel);
    },
  });
  return runtime.initializeForm(localDocument, jsPDF, restoreIdentity, delivery.deliverResult);
}
