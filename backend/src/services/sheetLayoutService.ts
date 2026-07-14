import {
  PDFDocument,
  rgb,
  type PDFPage,
} from "pdf-lib";
import type { PrintSettings } from "@id-formatter/shared";
import type { ComposedIdPage } from "./idComposerService";

const MM_TO_PT = 72 / 25.4;
export const A4_WIDTH_PT = 210 * MM_TO_PT;
export const A4_HEIGHT_PT = 297 * MM_TO_PT;

export interface SheetPageMeta {
  side: "front" | "back";
  sheetIndex: number;
  studentNos: string[];
}

function mm(n: number): number {
  return n * MM_TO_PT;
}

function slotPositions(settings: PrintSettings): Array<{ col: number; row: number; x: number; y: number }> {
  const slots: Array<{ col: number; row: number; x: number; y: number }> = [];
  const idW = mm(settings.idWidthMm);
  const idH = mm(settings.idHeightMm);
  const margin = mm(settings.marginMm);
  const gapX = mm(settings.gapXMm);
  const gapY = mm(settings.gapYMm);

  for (let row = 0; row < settings.rows; row++) {
    for (let col = 0; col < settings.columns; col++) {
      const x = margin + col * (idW + gapX);
      // PDF y from bottom
      const y = A4_HEIGHT_PT - margin - idH - row * (idH + gapY);
      slots.push({ col, row, x, y });
    }
  }
  return slots;
}

/** For duplex long-edge flip on portrait: swap columns per row. */
function mirroredSlotIndex(index: number, columns: number, rows: number): number {
  const perSheet = columns * rows;
  const local = index % perSheet;
  const row = Math.floor(local / columns);
  const col = local % columns;
  const mirroredCol = columns - 1 - col;
  return row * columns + mirroredCol;
}

function drawCropMarks(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  bleed: number
): void {
  const mark = 8;
  const color = rgb(0, 0, 0);
  const thickness = 0.5;
  const b = bleed;
  // corners
  const corners = [
    { x: x - b, y: y + h + b }, // TL
    { x: x + w + b, y: y + h + b }, // TR
    { x: x - b, y: y - b }, // BL
    { x: x + w + b, y: y - b }, // BR
  ];
  for (const c of corners) {
    page.drawLine({ start: { x: c.x - mark, y: c.y }, end: { x: c.x - 2, y: c.y }, thickness, color });
    page.drawLine({ start: { x: c.x + 2, y: c.y }, end: { x: c.x + mark, y: c.y }, thickness, color });
    page.drawLine({ start: { x: c.x, y: c.y - mark }, end: { x: c.x, y: c.y - 2 }, thickness, color });
    page.drawLine({ start: { x: c.x, y: c.y + 2 }, end: { x: c.x, y: c.y + mark }, thickness, color });
  }
}

export class SheetLayoutService {
  async buildDuplexDocument(
    fronts: ComposedIdPage[],
    backs: Array<ComposedIdPage | null>,
    settings: PrintSettings
  ): Promise<{ pdfBytes: Uint8Array; sheets: SheetPageMeta[] }> {
    const out = await PDFDocument.create();
    const slots = slotPositions(settings);
    const perSheet = settings.columns * settings.rows;
    const sheets: SheetPageMeta[] = [];
    const idW = mm(settings.idWidthMm);
    const idH = mm(settings.idHeightMm);
    const bleed = mm(settings.bleedMm);

    const totalSheets = Math.ceil(fronts.length / perSheet);

    for (let sheet = 0; sheet < totalSheets; sheet++) {
      const start = sheet * perSheet;
      const frontSlice = fronts.slice(start, start + perSheet);
      const backSlice = backs.slice(start, start + perSheet);

      // Front sheet
      const frontPage = out.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      const frontNos: string[] = [];
      for (let i = 0; i < frontSlice.length; i++) {
        const idPage = frontSlice[i]!;
        const slot = slots[i]!;
        await this.embedId(out, frontPage, idPage, slot.x, slot.y, idW, idH);
        if (settings.cropMarks) {
          drawCropMarks(frontPage, slot.x, slot.y, idW, idH, bleed);
        }
        frontNos.push(idPage.studentNo);
      }
      sheets.push({ side: "front", sheetIndex: sheet, studentNos: frontNos });

      // Back sheet — column-mirrored positions
      const backPage = out.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      const backNos: string[] = new Array(frontSlice.length).fill("");
      for (let i = 0; i < frontSlice.length; i++) {
        const mirrored = mirroredSlotIndex(i, settings.columns, settings.rows);
        const idPage = backSlice[i];
        const slot = slots[mirrored]!;
        if (idPage) {
          await this.embedId(out, backPage, idPage, slot.x, slot.y, idW, idH);
          backNos[mirrored] = idPage.studentNo;
        }
        if (settings.cropMarks) {
          drawCropMarks(backPage, slot.x, slot.y, idW, idH, bleed);
        }
      }
      sheets.push({ side: "back", sheetIndex: sheet, studentNos: backNos });
    }

    const pdfBytes = await out.save();
    return { pdfBytes, sheets };
  }

  private async embedId(
    doc: PDFDocument,
    sheet: PDFPage,
    idPage: ComposedIdPage,
    x: number,
    y: number,
    w: number,
    h: number
  ): Promise<void> {
    const idDoc = await PDFDocument.load(idPage.pdfBytes);
    const [embedded] = await doc.embedPdf(idDoc, [0]);
    sheet.drawPage(embedded, {
      x,
      y,
      width: w,
      height: h,
    });
  }
}
