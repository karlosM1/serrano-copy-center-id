import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { PDFDocument } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { STORAGE_ROOT } from "../database";

interface CanvasAndContext {
  canvas: {
    width: number;
    height: number;
    toBuffer: (mime?: "image/png") => Buffer;
  };
  context: {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
  };
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    const context = canvas.getContext("2d");
    return {
      canvas: canvas as unknown as CanvasAndContext["canvas"],
      context: context as unknown as CanvasAndContext["context"],
    };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = Math.max(1, Math.floor(width));
    canvasAndContext.canvas.height = Math.max(1, Math.floor(height));
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

function resolvePdfjsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/pdfjs-dist"),
    path.resolve(process.cwd(), "../node_modules/pdfjs-dist"),
    path.resolve(__dirname, "../../../node_modules/pdfjs-dist"),
    path.resolve(__dirname, "../../../../node_modules/pdfjs-dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function pdfjsAssetUrl(subpath: string): string {
  const abs = path.join(resolvePdfjsRoot(), subpath) + path.sep;
  return pathToFileURL(abs).href;
}

async function loadPdfJs(): Promise<{
  getDocument: (src: Record<string, unknown>) => { promise: Promise<Record<string, unknown>> };
}> {
  const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (src: Record<string, unknown>) => { promise: Promise<Record<string, unknown>> };
  };
  return mod;
}

export interface PdfPageInfo {
  pageCount: number;
  width: number;
  height: number;
}

export async function getPdfPageInfo(filePath: string, pageNumber: number): Promise<PdfPageInfo> {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const pageIndex = Math.max(0, Math.min(pageNumber - 1, pageCount - 1));
  const page = doc.getPage(pageIndex);
  const { width, height } = page.getSize();
  return { pageCount, width, height };
}

async function renderWithPdfJs(data: Uint8Array, pageNumber: number, scale: number): Promise<Buffer> {
  const pdfjs = await loadPdfJs();
  const canvasFactory = new NodeCanvasFactory();
  const pdf = (await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    canvasFactory,
    standardFontDataUrl: pdfjsAssetUrl("standard_fonts"),
    cMapUrl: pdfjsAssetUrl("cmaps"),
    cMapPacked: true,
    disableFontFace: true,
  }).promise) as {
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number };
      render: (o: Record<string, unknown>) => { promise: Promise<void> };
    }>;
    destroy: () => Promise<void>;
  };

  const pageIndex = Math.max(1, Math.min(pageNumber, pdf.numPages));
  const page = await pdf.getPage(pageIndex);
  const viewport = page.getViewport({ scale });
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  canvasAndContext.context.fillStyle = "#ffffff";
  canvasAndContext.context.fillRect(0, 0, viewport.width, viewport.height);

  await page.render({
    canvasContext: canvasAndContext.context,
    viewport,
    canvas: canvasAndContext.canvas,
  }).promise;

  const png = canvasAndContext.canvas.toBuffer("image/png");
  canvasFactory.destroy(canvasAndContext);
  await pdf.destroy();
  return png;
}

export async function renderPdfPageToPng(
  filePath: string,
  pageNumber: number,
  scale = 2
): Promise<{ pngPath: string; width: number; height: number }> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pngBuffer = await renderWithPdfJs(data, pageNumber, scale);
  const info = await getPdfPageInfo(filePath, pageNumber);
  const outName = `${path.basename(filePath, path.extname(filePath))}-p${pageNumber}-${Date.now()}.png`;
  const pngPath = path.join(STORAGE_ROOT, "previews", outName);
  fs.writeFileSync(pngPath, pngBuffer);
  return {
    pngPath,
    width: Math.floor(info.width * scale),
    height: Math.floor(info.height * scale),
  };
}

export async function renderPdfBytesPageToPng(
  pdfBytes: Uint8Array,
  pageNumber: number,
  scale = 2
): Promise<Buffer> {
  return renderWithPdfJs(pdfBytes, pageNumber, scale);
}

export function toPublicStoragePath(absolutePath: string): string {
  const rel = path.relative(STORAGE_ROOT, absolutePath).replace(/\\/g, "/");
  return `/storage/${rel}`;
}

export function absoluteFromPublic(publicPath: string): string {
  const rel = publicPath.replace(/^\/storage\//, "");
  return path.join(STORAGE_ROOT, rel);
}
