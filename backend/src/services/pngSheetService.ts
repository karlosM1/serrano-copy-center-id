import fs from "fs";
import path from "path";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  CropMode,
  MissingPhotoPolicy,
  PlaceholderMapping,
  PrintSettings,
  StudentRecord,
  TemplateSide,
  TemplateWithPlaceholders,
} from "@id-formatter/shared";
import { IMAGE_PLACEHOLDERS } from "@id-formatter/shared";
import { STORAGE_ROOT } from "../database";
import { CodeService } from "./codeService";
import { PhotoService } from "./photoService";
import { A4_HEIGHT_PT, A4_WIDTH_PT } from "./sheetLayoutService";
import { renderPdfPageToPng } from "./pdfPreviewService";

const MM_TO_PT = 72 / 25.4;

function mm(n: number): number {
  return n * MM_TO_PT;
}

export class PngSheetService {
  private codes = new CodeService();
  private photos = new PhotoService();

  async renderSheets(options: {
    template: TemplateWithPlaceholders;
    students: StudentRecord[];
    photoPaths: Record<string, string>;
    printSettings: PrintSettings;
    cropMode: CropMode;
    missingPhotoPolicy: MissingPhotoPolicy;
    roundCorners: boolean;
    cornerRadius: number;
    dpi: number;
    outDir: string;
  }): Promise<{ pngPaths: string[]; frontBg: string | null; backBg: string | null }> {
    const { template, students, photoPaths, printSettings, dpi, outDir } = options;
    const scale = dpi / 72;
    const pageW = Math.round(A4_WIDTH_PT * scale);
    const pageH = Math.round(A4_HEIGHT_PT * scale);
    const idW = Math.round(mm(printSettings.idWidthMm) * scale);
    const idH = Math.round(mm(printSettings.idHeightMm) * scale);
    const margin = Math.round(mm(printSettings.marginMm) * scale);
    const gapX = Math.round(mm(printSettings.gapXMm) * scale);
    const gapY = Math.round(mm(printSettings.gapYMm) * scale);

    const frontBg = await this.loadTemplateBackground(template, "front", scale);
    const backBg = template.backPdfPath
      ? await this.loadTemplateBackground(template, "back", scale)
      : null;

    const frontTplW = Math.round((template.frontPageWidth || 244) * scale);
    const frontTplH = Math.round((template.frontPageHeight || 153) * scale);
    const backTplW = Math.round((template.backPageWidth || 244) * scale);
    const backTplH = Math.round((template.backPageHeight || 153) * scale);

    const cards: Array<{ front: Buffer; back: Buffer | null; studentNo: string }> = [];

    for (const student of students) {
      const photo = photoPaths[student.student_no] ?? null;
      if (!photo && options.missingPhotoPolicy === "skip") continue;

      const front = await this.renderCard({
        template,
        side: "front",
        student,
        photoPath: photo,
        bg: frontBg,
        width: frontTplW,
        height: frontTplH,
        options,
      });
      let back: Buffer | null = null;
      if (backBg || template.backPdfPath) {
        back = await this.renderCard({
          template,
          side: "back",
          student,
          photoPath: photo,
          bg: backBg,
          width: backTplW,
          height: backTplH,
          options,
        });
      }
      cards.push({ front, back, studentNo: student.student_no });
    }

    const perSheet = printSettings.columns * printSettings.rows;
    const pngPaths: string[] = [];
    const totalSheets = Math.ceil(cards.length / perSheet) || 0;

    for (let sheet = 0; sheet < totalSheets; sheet++) {
      const slice = cards.slice(sheet * perSheet, (sheet + 1) * perSheet);

      const frontCanvas = createCanvas(pageW, pageH);
      const frontCtx = frontCanvas.getContext("2d");
      frontCtx.fillStyle = "#ffffff";
      frontCtx.fillRect(0, 0, pageW, pageH);

      for (let i = 0; i < slice.length; i++) {
        const col = i % printSettings.columns;
        const row = Math.floor(i / printSettings.columns);
        const x = margin + col * (idW + gapX);
        const y = margin + row * (idH + gapY);
        const img = await loadImage(slice[i]!.front);
        frontCtx.drawImage(img, x, y, idW, idH);
      }
      const frontPath = path.join(outDir, `sheet-${String(sheet * 2 + 1).padStart(3, "0")}-front.png`);
      fs.writeFileSync(frontPath, frontCanvas.toBuffer("image/png"));
      pngPaths.push(frontPath);

      const backCanvas = createCanvas(pageW, pageH);
      const backCtx = backCanvas.getContext("2d");
      backCtx.fillStyle = "#ffffff";
      backCtx.fillRect(0, 0, pageW, pageH);

      for (let i = 0; i < slice.length; i++) {
        const col = printSettings.columns - 1 - (i % printSettings.columns);
        const row = Math.floor(i / printSettings.columns);
        const x = margin + col * (idW + gapX);
        const y = margin + row * (idH + gapY);
        const buf = slice[i]!.back;
        if (!buf) continue;
        const img = await loadImage(buf);
        backCtx.drawImage(img, x, y, idW, idH);
      }
      const backPath = path.join(outDir, `sheet-${String(sheet * 2 + 2).padStart(3, "0")}-back.png`);
      fs.writeFileSync(backPath, backCanvas.toBuffer("image/png"));
      pngPaths.push(backPath);
    }

    return {
      pngPaths,
      frontBg: frontBg ? "ok" : null,
      backBg: backBg ? "ok" : null,
    };
  }

  private async loadTemplateBackground(
    template: TemplateWithPlaceholders,
    side: TemplateSide,
    _scale: number
  ): Promise<Image | null> {
    const pdfPath = side === "front" ? template.frontPdfPath : template.backPdfPath;
    if (!pdfPath) return null;
    const abs = path.join(STORAGE_ROOT, pdfPath.replace(/^\/storage\//, ""));
    const page = side === "front" ? template.frontPage : template.backPage;
    try {
      const rendered = await renderPdfPageToPng(abs, page, 2);
      return await loadImage(rendered.pngPath);
    } catch {
      return null;
    }
  }

  private async renderCard(args: {
    template: TemplateWithPlaceholders;
    side: TemplateSide;
    student: StudentRecord;
    photoPath: string | null;
    bg: Image | null;
    width: number;
    height: number;
    options: {
      cropMode: CropMode;
      missingPhotoPolicy: MissingPhotoPolicy;
      roundCorners: boolean;
      cornerRadius: number;
      dpi: number;
    };
  }): Promise<Buffer> {
    const { template, side, student, photoPath, bg, width, height, options } = args;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (bg) {
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#0b6e4f";
      ctx.fillRect(0, 0, width, Math.round(height * 0.18));
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(height * 0.08)}px sans-serif`;
      ctx.fillText(side === "front" ? "STUDENT ID" : "BACK", 16, Math.round(height * 0.12));
    }

    const scaleX = width / (side === "front" ? template.frontPageWidth || width : template.backPageWidth || width);
    const scaleY = height / (side === "front" ? template.frontPageHeight || height : template.backPageHeight || height);

    const placeholders = template.placeholders
      .filter((p) => p.side === side)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const ph of placeholders) {
      const x = ph.x * scaleX;
      const y = ph.y * scaleY;
      const w = ph.width * scaleX;
      const h = ph.height * scaleY;

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((ph.rotation * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);

      if (IMAGE_PLACEHOLDERS.includes(ph.name)) {
        await this.drawImagePh(ctx, ph, student, photoPath, w, h, options);
      } else {
        this.drawTextPh(ctx, ph, student, w, h, scaleY);
      }
      ctx.restore();
    }

    return canvas.toBuffer("image/png");
  }

  private drawTextPh(
    ctx: SKRSContext2D,
    ph: PlaceholderMapping,
    student: StudentRecord,
    w: number,
    h: number,
    scaleY: number
  ): void {
    const text = student[ph.name] ?? "";
    if (!text) return;
    const fontSize = Math.max(8, ph.fontSize * scaleY);
    ctx.fillStyle = ph.color || "#000000";
    ctx.font = `${ph.fontWeight === "bold" ? "bold " : ""}${fontSize}px ${ph.font || "sans-serif"}`;
    ctx.textBaseline = "middle";
    let x = 0;
    const metrics = ctx.measureText(text);
    if (ph.alignment === "center") x = (w - metrics.width) / 2;
    if (ph.alignment === "right") x = w - metrics.width;
    ctx.fillText(text, x, h / 2, w);
  }

  private async drawImagePh(
    ctx: SKRSContext2D,
    ph: PlaceholderMapping,
    student: StudentRecord,
    photoPath: string | null,
    w: number,
    h: number,
    options: {
      cropMode: CropMode;
      missingPhotoPolicy: MissingPhotoPolicy;
      roundCorners: boolean;
      cornerRadius: number;
      dpi: number;
    }
  ): Promise<void> {
    let buffer: Buffer | null = null;
    const widthPx = Math.max(32, Math.round(w));
    const heightPx = Math.max(32, Math.round(h));

    if (ph.name === "photo") {
      buffer = await this.photos.processPhoto(
        photoPath,
        widthPx,
        heightPx,
        options.cropMode,
        options.roundCorners,
        options.cornerRadius,
        options.missingPhotoPolicy
      );
    } else if (ph.name === "qr") {
      buffer = await this.codes.generateQrPng(student.qr || student.student_no, Math.max(widthPx, heightPx));
    } else if (ph.name === "barcode") {
      buffer = await this.codes.generateBarcodePng(student.barcode || student.student_no, widthPx, heightPx);
    }

    if (!buffer) return;
    const img = await loadImage(buffer);
    ctx.drawImage(img, 0, 0, w, h);
  }
}
