import { readBase64, writeBase64, uniqueName, joinDir, getInfo } from "./fs";
import { verifyOutput } from "./file-actions";
import { baseName } from "./format";

// pdf-lib is loaded lazily so its module (and the crypto polyfill) never
// evaluate at app startup. This keeps web bundling from crashing on tslib
// interop, and PDF operations run on-device when actually invoked.
let _libP: Promise<typeof import("pdf-lib")> | null = null;
async function lib() {
  if (!_libP) {
    _libP = (async () => {
      await import("react-native-get-random-values");
      return import("pdf-lib");
    })();
  }
  return _libP;
}

async function loadDoc(uri: string) {
  const { PDFDocument } = await lib();
  const b64 = await readBase64(uri);
  return PDFDocument.load(b64, { ignoreEncryption: true });
}

async function saveDoc(doc: import("pdf-lib").PDFDocument, destUri: string) {
  const b64 = await doc.saveAsBase64({ useObjectStreams: true });
  await writeBase64(destUri, b64);
  return verifyOutput(destUri, "JVBERi0");
}

export async function getPageCount(uri: string): Promise<number> {
  const doc = await loadDoc(uri);
  return doc.getPageCount();
}

export async function imagesToPdf(imageUris: string[], destDir: string, fileName: string) {
  if (!imageUris.length) throw new Error("Select at least one image");
  const { PDFDocument } = await lib();
  const doc = await PDFDocument.create();
  for (const uri of imageUris) {
    const b64 = await readBase64(uri);
    const lower = uri.toLowerCase();
    const img = lower.endsWith(".png")
      ? await doc.embedPng(b64)
      : await doc.embedJpg(b64).catch(async () => doc.embedPng(b64));
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const name = await uniqueName(destDir, fileName.endsWith(".pdf") ? fileName : fileName + ".pdf");
  return saveDoc(doc, joinDir(destDir, name));
}

export async function mergePdfs(uris: string[], destDir: string, fileName: string) {
  const { PDFDocument } = await lib();
  const out = await PDFDocument.create();
  for (const uri of uris) {
    const src = await loadDoc(uri);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const name = await uniqueName(destDir, fileName.endsWith(".pdf") ? fileName : fileName + ".pdf");
  return saveDoc(out, joinDir(destDir, name));
}

export async function splitPdf(uri: string, destDir: string) {
  const { PDFDocument } = await lib();
  const src = await loadDoc(uri);
  const total = src.getPageCount();
  const base = baseName(uri.split("/").pop() || "document");
  const created: string[] = [];
  for (let i = 0; i < total; i++) {
    const out = await PDFDocument.create();
    const [p] = await out.copyPages(src, [i]);
    out.addPage(p);
    const name = await uniqueName(destDir, `${base}_page_${i + 1}.pdf`);
    const r = await saveDoc(out, joinDir(destDir, name));
    created.push(r.uri);
  }
  return created;
}

export async function extractPages(uri: string, indices: number[], destDir: string, fileName: string) {
  const { PDFDocument } = await lib();
  const src = await loadDoc(uri);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  const name = await uniqueName(destDir, fileName.endsWith(".pdf") ? fileName : fileName + ".pdf");
  return saveDoc(out, joinDir(destDir, name));
}

export async function reorderPages(uri: string, order: number[], destUri: string) {
  const { PDFDocument } = await lib();
  const src = await loadDoc(uri);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  return saveDoc(out, destUri);
}

export async function deletePages(uri: string, removeIndices: number[], destUri: string) {
  const { PDFDocument } = await lib();
  const src = await loadDoc(uri);
  const keep = src.getPageIndices().filter((i) => !removeIndices.includes(i));
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keep);
  pages.forEach((p) => out.addPage(p));
  return saveDoc(out, destUri);
}

export async function rotatePages(uri: string, indices: number[], deg: number, destUri: string) {
  const { degrees } = await lib();
  const doc = await loadDoc(uri);
  const pageList = doc.getPages();
  indices.forEach((i) => {
    const p = pageList[i];
    if (p) {
      const current = p.getRotation().angle;
      p.setRotation(degrees((current + deg) % 360));
    }
  });
  return saveDoc(doc, destUri);
}

export async function addPageNumbers(uri: string, destUri: string) {
  const { StandardFonts, rgb } = await lib();
  const doc = await loadDoc(uri);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPages().forEach((p, i) => {
    const { width } = p.getSize();
    p.drawText(`${i + 1}`, { x: width / 2 - 6, y: 20, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
  });
  return saveDoc(doc, destUri);
}

export async function addWatermark(uri: string, text: string, destUri: string) {
  const { StandardFonts, rgb, degrees } = await lib();
  const doc = await loadDoc(uri);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.getPages().forEach((p) => {
    const { width, height } = p.getSize();
    p.drawText(text, {
      x: width / 2 - text.length * 8,
      y: height / 2,
      size: 40,
      font,
      color: rgb(0.85, 0.37, 0),
      opacity: 0.22,
      rotate: degrees(45),
    });
  });
  return saveDoc(doc, destUri);
}

export async function getMetadata(uri: string) {
  const doc = await loadDoc(uri);
  return {
    title: doc.getTitle() || "",
    author: doc.getAuthor() || "",
    subject: doc.getSubject() || "",
    keywords: (doc.getKeywords() as unknown as string) || "",
    pages: doc.getPageCount(),
  };
}

export async function setMetadata(
  uri: string,
  meta: { title?: string; author?: string; subject?: string; keywords?: string },
  destUri: string,
) {
  const doc = await loadDoc(uri);
  if (meta.title !== undefined) doc.setTitle(meta.title);
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  if (meta.keywords !== undefined) doc.setKeywords(meta.keywords ? meta.keywords.split(",").map((s) => s.trim()) : []);
  return saveDoc(doc, destUri);
}

export async function optimizePdf(uri: string, destUri: string) {
  const beforeInfo = await getInfo(uri);
  const doc = await loadDoc(uri);
  doc.setTitle(doc.getTitle() || "");
  const r = await saveDoc(doc, destUri);
  return { before: (beforeInfo as any).size ?? 0, after: r.size, uri: r.uri };
}

export async function createTextPdf(text: string, destDir: string, fileName: string) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const margin = 48;
  const pageW = 595;
  const pageH = 842;
  const maxW = pageW - margin * 2;
  const words = text.replace(/\r/g, "").split(/(\s+)/);
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;
  let line = "";
  const flush = () => {
    if (y < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= size * 1.5;
    line = "";
  };
  for (const w of words) {
    if (w === "\n") {
      flush();
      continue;
    }
    const test = line + w;
    if (font.widthOfTextAtSize(test.replace(/\n/g, ""), size) > maxW) {
      flush();
      line = w.trimStart();
    } else {
      line = test;
    }
  }
  if (line) flush();
  const name = await uniqueName(destDir, fileName.endsWith(".pdf") ? fileName : fileName + ".pdf");
  return saveDoc(doc, joinDir(destDir, name));
}
