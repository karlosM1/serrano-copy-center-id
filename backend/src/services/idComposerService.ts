import fs from "fs";
import path from "path";
import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type {
  CropMode,
  MissingPhotoPolicy,
  PlaceholderMapping,
  StudentRecord,
  TemplateSide,
  TemplateWithPlaceholders,
} from "@id-formatter/shared";
import { IMAGE_PLACEHOLDERS } from "@id-formatter/shared";
import { STORAGE_ROOT } from "../database";
import { CodeService } from "./codeService";
import { PhotoService } from "./photoService";

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const num = parseInt(full, 16);
  return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}

function resolveFont(
  fonts: { regular: PDFFont; bold: PDFFont },
  fontName: string,
  weight: string
): PDFFont {
  void fontName;
  return weight === "bold" ? fonts.bold : fonts.regular;
}

export interface ComposedIdPage {
  studentNo: string;
  side: TemplateSide;
  pdfBytes: Uint8Array;
  width: number;
  height: number;
}

export class IdComposerService {
  private codes = new CodeService();
  private photos = new PhotoService();

  async composeStudentIds(
    template: TemplateWithPlaceholders,
    student: StudentRecord,
    photoPath: string | null,
    options: {
      cropMode: CropMode;
      missingPhotoPolicy: MissingPhotoPolicy;
      roundCorners: boolean;
      cornerRadius: number;
      dpi: number;
    }
  ): Promise<{ front: ComposedIdPage; back: ComposedIdPage | null; skipped: boolean }> {
    if (!photoPath && options.missingPhotoPolicy === "skip") {
      return {
        front: { studentNo: student.student_no, side: "front", pdfBytes: new Uint8Array(), width: 0, height: 0 },
        back: null,
        skipped: true,
      };
    }

    const front = await this.composeSide(template, "front", student, photoPath, options);
    let back: ComposedIdPage | null = null;
    if (template.backPdfPath) {
      back = await this.composeSide(template, "back", student, photoPath, options);
    }
    return { front, back, skipped: false };
  }

  private async composeSide(
    template: TemplateWithPlaceholders,
    side: TemplateSide,
    student: StudentRecord,
    photoPath: string | null,
    options: {
      cropMode: CropMode;
      missingPhotoPolicy: MissingPhotoPolicy;
      roundCorners: boolean;
      cornerRadius: number;
      dpi: number;
    }
  ): Promise<ComposedIdPage> {
    const pdfPath = side === "front" ? template.frontPdfPath : template.backPdfPath;
    if (!pdfPath) {
      throw new Error(`Template missing ${side} PDF`);
    }
    const abs = path.join(STORAGE_ROOT, pdfPath.replace(/^\/storage\//, ""));
    const srcBytes = fs.readFileSync(abs);
    const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const outDoc = await PDFDocument.create();
    const pageIndex = (side === "front" ? template.frontPage : template.backPage) - 1;
    const [embeddedPage] = await outDoc.copyPages(srcDoc, [Math.max(0, pageIndex)]);
    const page = outDoc.addPage(embeddedPage);
    const { width, height } = page.getSize();

    const fonts = {
      regular: await outDoc.embedFont(StandardFonts.Helvetica),
      bold: await outDoc.embedFont(StandardFonts.HelveticaBold),
    };

    const placeholders = template.placeholders
      .filter((p) => p.side === side)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const ph of placeholders) {
      if (IMAGE_PLACEHOLDERS.includes(ph.name)) {
        await this.drawImagePlaceholder(outDoc, page, ph, student, photoPath, options, height);
      } else {
        this.drawTextPlaceholder(page, fonts, ph, student, height);
      }
    }

    const pdfBytes = await outDoc.save();
    return {
      studentNo: student.student_no,
      side,
      pdfBytes,
      width,
      height,
    };
  }

  private drawTextPlaceholder(
    page: PDFPage,
    fonts: { regular: PDFFont; bold: PDFFont },
    ph: PlaceholderMapping,
    student: StudentRecord,
    pageHeight: number
  ): void {
    const text = student[ph.name] ?? "";
    if (!text) return;
    const font = resolveFont(fonts, ph.font, ph.fontWeight);
    const fontSize = ph.fontSize;
    const color = hexToRgb(ph.color);
    // Designer uses top-left origin; pdf-lib uses bottom-left.
    const pdfY = pageHeight - ph.y - ph.height;

    let x = ph.x;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    if (ph.alignment === "center") {
      x = ph.x + (ph.width - textWidth) / 2;
    } else if (ph.alignment === "right") {
      x = ph.x + ph.width - textWidth;
    }

    // Vertically center text in the placeholder box (matches Konva verticalAlign="middle")
    const baseline = pdfY + (ph.height - fontSize) / 2 + fontSize * 0.15;

    page.drawText(text, {
      x,
      y: baseline,
      size: fontSize,
      font,
      color,
      maxWidth: ph.width,
      lineHeight: fontSize * ph.lineHeight,
      rotate: degrees(ph.rotation),
    });
  }

  private async drawImagePlaceholder(
    doc: PDFDocument,
    page: PDFPage,
    ph: PlaceholderMapping,
    student: StudentRecord,
    photoPath: string | null,
    options: {
      cropMode: CropMode;
      missingPhotoPolicy: MissingPhotoPolicy;
      roundCorners: boolean;
      cornerRadius: number;
      dpi: number;
    },
    pageHeight: number
  ): Promise<void> {
    const widthPx = Math.max(32, Math.round((ph.width / 72) * options.dpi));
    const heightPx = Math.max(32, Math.round((ph.height / 72) * options.dpi));
    let buffer: Buffer | null = null;

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

    const image = await doc.embedPng(buffer);
    const pdfY = pageHeight - ph.y - ph.height;
    page.drawImage(image, {
      x: ph.x,
      y: pdfY,
      width: ph.width,
      height: ph.height,
      rotate: degrees(ph.rotation),
    });
  }
}
