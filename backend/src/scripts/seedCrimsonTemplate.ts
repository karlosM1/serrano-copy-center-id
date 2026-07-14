/**
 * Seeds "Crimson School ID" from original portrait FRONT/BACK PDFs.
 * Does not rotate — editor and print use portrait CR80 (~54×86 mm).
 *
 * Usage: npm run seed:crimson -w backend
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { DEFAULT_PRINT_SETTINGS, type PlaceholderMapping } from "@id-formatter/shared";
import { ensureStorageDirs, getDb } from "../database";
import { TemplateRepository } from "../repositories";
import { TemplateService } from "../services/templateService";
import { getPdfPageInfo } from "../services/pdfPreviewService";

const ROOT = path.resolve(__dirname, "../../..");
const SAMPLES = path.join(ROOT, "samples", "id-templates");

function ph(
  templateId: string,
  side: "front" | "back",
  name: PlaceholderMapping["name"],
  x: number,
  y: number,
  width: number,
  height: number,
  extras: Partial<PlaceholderMapping> = {}
): PlaceholderMapping {
  return {
    id: uuid(),
    templateId,
    side,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    font: "Helvetica",
    fontSize: extras.fontSize ?? 9,
    fontWeight: extras.fontWeight ?? "normal",
    color: extras.color ?? "#111111",
    alignment: extras.alignment ?? "left",
    lineHeight: 1.15,
    letterSpacing: 0,
    locked: false,
    zIndex: extras.zIndex ?? 0,
    ...extras,
  };
}

async function main(): Promise<void> {
  ensureStorageDirs();
  getDb();

  const frontSrc = path.join(SAMPLES, "FRONT.pdf");
  const backSrc = path.join(SAMPLES, "BACK.pdf");
  if (!fs.existsSync(frontSrc) || !fs.existsSync(backSrc)) {
    throw new Error(`Missing templates at ${SAMPLES}`);
  }

  const frontInfo = await getPdfPageInfo(frontSrc, 1);
  const backInfo = await getPdfPageInfo(backSrc, 1);
  console.log("FRONT MediaBox:", frontInfo.width, "x", frontInfo.height, "pt (portrait expected)");
  console.log("BACK MediaBox:", backInfo.width, "x", backInfo.height, "pt");

  const W = frontInfo.width;
  const H = frontInfo.height;

  // Remove previous Crimson seeds so designer opens a clean portrait template
  const repo = new TemplateRepository();
  for (const t of repo.list()) {
    if (t.name.startsWith("Crimson School ID")) {
      console.log("Removing old template", t.id, t.name);
      new TemplateService().delete(t.id);
    }
  }

  const templates = new TemplateService();
  const template = templates.create("Crimson School ID", {
    ...DEFAULT_PRINT_SETTINGS,
    // Portrait CR80: short edge width, long edge height
    idWidthMm: (W * 25.4) / 72,
    idHeightMm: (H * 25.4) / 72,
    columns: 2,
    rows: 3,
    marginMm: 8,
    gapXMm: 4,
    gapYMm: 4,
    cropMarks: false,
    outputDpi: 300,
  });

  const tmpDir = path.join(SAMPLES, "upload-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const frontUpload = path.join(tmpDir, `front-${Date.now()}.pdf`);
  const backUpload = path.join(tmpDir, `back-${Date.now()}.pdf`);
  fs.copyFileSync(frontSrc, frontUpload);
  fs.copyFileSync(backSrc, backUpload);

  await templates.uploadPdf(template.id, "front", frontUpload, "FRONT.pdf", 1);
  await templates.uploadPdf(template.id, "back", backUpload, "BACK.pdf", 1);

  /**
   * Portrait layout (top → bottom), Konva top-left origin in PDF points:
   * FRONT: white branding (top) · maroon band · photo (bottom)
   * BACK: maroon header (top) · form fields (middle) · footer crest (bottom)
   */
  const placeholders: PlaceholderMapping[] = [
    // FRONT — photo sits in the lower area
    ph(template.id, "front", "photo", W * 0.04, H * 0.40, W * 0.92, H * 0.48, { zIndex: 0 }),
    ph(template.id, "front", "full_name", W * 0.06, H * 0.88, W * 0.88, H * 0.055, {
      fontSize: 10,
      fontWeight: "bold",
      alignment: "center",
      color: "#ffffff",
      zIndex: 2,
    }),
    ph(template.id, "front", "student_no", W * 0.06, H * 0.935, W * 0.88, H * 0.04, {
      fontSize: 8,
      alignment: "center",
      color: "#ffffff",
      zIndex: 3,
    }),
    ph(template.id, "front", "grade", W * 0.08, H * 0.32, W * 0.35, H * 0.045, {
      fontSize: 9,
      color: "#111111",
      zIndex: 1,
    }),

    // BACK — form values to the right of printed labels
    ph(template.id, "back", "birthday", W * 0.34, H * 0.455, W * 0.22, H * 0.04, {
      fontSize: 8,
      zIndex: 1,
    }),
    ph(template.id, "back", "contact", W * 0.66, H * 0.455, W * 0.28, H * 0.04, {
      fontSize: 8,
      zIndex: 2,
    }),
    ph(template.id, "back", "guardian", W * 0.34, H * 0.53, W * 0.58, H * 0.04, {
      fontSize: 8,
      zIndex: 3,
    }),
    ph(template.id, "back", "address", W * 0.34, H * 0.64, W * 0.58, H * 0.10, {
      fontSize: 8,
      zIndex: 4,
    }),
    ph(template.id, "back", "school_name", W * 0.34, H * 0.12, W * 0.55, H * 0.04, {
      fontSize: 7,
      color: "#ffffff",
      zIndex: 0,
    }),
  ];

  templates.savePlaceholders(template.id, placeholders);

  const saved = templates.get(template.id)!;
  console.log("Created", saved.id);
  console.log("Page size:", saved.frontPageWidth, "x", saved.frontPageHeight, "pt");
  console.log("Print ID mm:", saved.printSettings.idWidthMm.toFixed(2), "x", saved.printSettings.idHeightMm.toFixed(2));
  console.log(`Designer: http://localhost:5173/templates/${saved.id}/designer`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
