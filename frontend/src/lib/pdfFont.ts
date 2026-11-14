import type { jsPDF as JsPdf } from "jspdf";

let cached: Promise<string> | null = null;

/** Noto Sans as base64, fetched once: it covers Latin and Cyrillic, so Kazakh and Russian names print correctly. */
export function loadNotoFont() {
  cached ??= fetch("/fonts/NotoSans-Regular.ttf").then(async (response) => {
    if (!response.ok) throw new Error("PDF font unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }).catch((error: unknown) => { cached = null; throw error; });
  return cached;
}

/** Registers the font on a document as "NotoSans" (normal and bold share one file). */
export function addNotoFont(doc: JsPdf, font: string) {
  doc.addFileToVFS("NotoSans.ttf", font);
  doc.addFont("NotoSans.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans.ttf", "NotoSans", "bold");
}
