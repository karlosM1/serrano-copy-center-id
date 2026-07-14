import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { ExportType, PrintSettings, StudentRecord, TemplateWithPlaceholders } from "@id-formatter/shared";
import { STORAGE_ROOT } from "../database";
import { IdComposerService } from "./idComposerService";
import { renderPdfBytesPageToPng, toPublicStoragePath } from "./pdfPreviewService";
import { SheetLayoutService } from "./sheetLayoutService";
import { PngSheetService } from "./pngSheetService";

export interface GenerateOptions {
  template: TemplateWithPlaceholders;
  students: StudentRecord[];
  photoPaths: Record<string, string>;
  printSettings: PrintSettings;
  exportTypes: ExportType[];
  cropMode: "cover" | "contain";
  missingPhotoPolicy: "placeholder" | "blank" | "skip";
  roundCorners: boolean;
  cornerRadius: number;
  dpi: number;
  onProgress?: (progress: number, message: string) => void;
}

export interface GenerateResult {
  pdfPath?: string;
  zipPath?: string;
  pngDir?: string;
  generatedCount: number;
  previewPages: string[];
}

export class ExportService {
  private composer = new IdComposerService();
  private layout = new SheetLayoutService();
  private pngSheets = new PngSheetService();

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      template,
      students,
      photoPaths,
      printSettings,
      exportTypes,
      onProgress,
    } = options;

    const outDir = path.join(STORAGE_ROOT, "outputs", `job-${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });

    const fronts = [];
    const backs = [];
    let generated = 0;
    const batchSize = 25;

    for (let i = 0; i < students.length; i++) {
      const student = students[i]!;
      const photo = photoPaths[student.student_no] ?? null;
      const composed = await this.composer.composeStudentIds(template, student, photo, {
        cropMode: options.cropMode,
        missingPhotoPolicy: options.missingPhotoPolicy,
        roundCorners: options.roundCorners,
        cornerRadius: options.cornerRadius,
        dpi: options.dpi,
      });

      if (composed.skipped) {
        onProgress?.(
          ((i + 1) / students.length) * 0.7,
          `Skipped ${student.student_no} (missing photo)`
        );
        continue;
      }

      fronts.push(composed.front);
      backs.push(composed.back);
      generated++;

      if ((i + 1) % batchSize === 0 || i === students.length - 1) {
        onProgress?.(
          ((i + 1) / students.length) * 0.7,
          `Composed ${i + 1}/${students.length} IDs`
        );
      }
    }

    if (fronts.length === 0) {
      throw new Error("No IDs were generated. Check missing photo policy and CSV data.");
    }

    onProgress?.(0.75, "Building A4 duplex sheets...");
    const { pdfBytes, sheets } = await this.layout.buildDuplexDocument(
      fronts,
      backs,
      printSettings
    );

    const result: GenerateResult = {
      generatedCount: generated,
      previewPages: [],
    };

    if (exportTypes.includes("pdf") || exportTypes.length === 0) {
      const pdfPath = path.join(outDir, "ids-print.pdf");
      fs.writeFileSync(pdfPath, pdfBytes);
      result.pdfPath = toPublicStoragePath(pdfPath);
    }

    if (exportTypes.includes("png") || exportTypes.includes("zip")) {
      onProgress?.(0.85, "Rendering PNG pages...");
      const pngDir = path.join(outDir, "png");
      fs.mkdirSync(pngDir, { recursive: true });

      try {
        const { pngPaths } = await this.pngSheets.renderSheets({
          template,
          students: students.filter((s) => {
            if (options.missingPhotoPolicy === "skip" && !photoPaths[s.student_no]) return false;
            return true;
          }),
          photoPaths,
          printSettings,
          cropMode: options.cropMode,
          missingPhotoPolicy: options.missingPhotoPolicy,
          roundCorners: options.roundCorners,
          cornerRadius: options.cornerRadius,
          dpi: Math.min(options.dpi, 200),
          outDir: pngDir,
        });

        for (const pngPath of pngPaths.slice(0, 4)) {
          result.previewPages.push(toPublicStoragePath(pngPath));
        }
        result.pngDir = toPublicStoragePath(pngDir);

        if (exportTypes.includes("zip") && pngPaths.length > 0) {
          const zip = new JSZip();
          for (const pngPath of pngPaths) {
            zip.file(path.basename(pngPath), fs.readFileSync(pngPath));
          }
          const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
          const zipPath = path.join(outDir, "ids-png.zip");
          fs.writeFileSync(zipPath, zipBuf);
          result.zipPath = toPublicStoragePath(zipPath);
        }
        onProgress?.(0.95, `Rendered ${pngPaths.length} PNG pages`);
      } catch (err) {
        console.warn("PNG export failed:", err instanceof Error ? err.message : err);
        // Fallback: try pdf.js raster of print PDF
        let renderedOk = 0;
        for (let p = 0; p < Math.min(sheets.length, 2); p++) {
          try {
            const png = await renderPdfBytesPageToPng(pdfBytes, p + 1, 1.5);
            const name = `sheet-${String(p + 1).padStart(3, "0")}.png`;
            const pngPath = path.join(pngDir, name);
            fs.writeFileSync(pngPath, png);
            result.previewPages.push(toPublicStoragePath(pngPath));
            renderedOk++;
          } catch {
            // ignore
          }
        }
        if (renderedOk > 0) result.pngDir = toPublicStoragePath(pngDir);
      }
    } else if (result.pdfPath) {
      try {
        const previewDir = path.join(outDir, "preview");
        fs.mkdirSync(previewDir, { recursive: true });
        const { pngPaths } = await this.pngSheets.renderSheets({
          template,
          students: students.slice(0, 10),
          photoPaths,
          printSettings,
          cropMode: options.cropMode,
          missingPhotoPolicy: options.missingPhotoPolicy,
          roundCorners: options.roundCorners,
          cornerRadius: options.cornerRadius,
          dpi: 120,
          outDir: previewDir,
        });
        result.previewPages = pngPaths.slice(0, 2).map(toPublicStoragePath);
      } catch {
        // Preview optional
      }
    }

    onProgress?.(1, "Done");
    return result;
  }
}
