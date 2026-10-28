// Extração de texto de PDF NO NAVEGADOR (o arquivo não sai do computador; só o texto é enviado).

export const MAX_PDF_BYTES = 40 * 1024 * 1024;

export class PdfReadError extends Error {}

export async function pdfToText(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new PdfReadError("Envie um arquivo PDF.");
  }
  if (file.size > MAX_PDF_BYTES) throw new PdfReadError("PDF grande demais (máximo 40 MB).");
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    throw new PdfReadError("Não foi possível ler este PDF. Cole o texto manualmente.");
  }
}
