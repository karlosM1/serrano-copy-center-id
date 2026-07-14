import fs from "fs";
import path from "path";
import JSZip from "jszip";
import sharp from "sharp";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { ensureStorageDirs, getDb } from "../database";
import { TemplateService } from "../services/templateService";
import { CsvService } from "../services/csvService";
import { PhotoService } from "../services/photoService";
import { ExportService } from "../services/exportService";
import { DEFAULT_PRINT_SETTINGS } from "@id-formatter/shared";
import { v4 as uuid } from "uuid";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(ROOT, "fixtures");

async function makeIdPdf(label: string, filePath: string): Promise<void> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([243.78, 153.07]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 243.78,
    height: 153.07,
    color: rgb(0.05, 0.35, 0.28),
  });
  page.drawRectangle({
    x: 8,
    y: 8,
    width: 227.78,
    height: 137.07,
    color: rgb(1, 1, 1),
  });
  page.drawText(label, {
    x: 16,
    y: 120,
    size: 14,
    font,
    color: rgb(0.05, 0.35, 0.28),
  });
  page.drawText("Serrano Copy Center", {
    x: 16,
    y: 20,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  fs.writeFileSync(filePath, await doc.save());
}

async function main(): Promise<void> {
  console.log("Preparing fixtures...");
  fs.mkdirSync(path.join(FIXTURES, "photos"), { recursive: true });
  ensureStorageDirs();
  getDb();

  const frontPdf = path.join(FIXTURES, "front-id.pdf");
  const backPdf = path.join(FIXTURES, "back-id.pdf");
  await makeIdPdf("STUDENT ID — FRONT", frontPdf);
  await makeIdPdf("STUDENT ID — BACK", backPdf);

  const students = [
    {
      no: "104423080181",
      name: "Juan Dela Cruz",
      school: "Serrano Elementary School",
      grade: "6",
      birthday: "2013-05-12",
      guardian: "Maria Dela Cruz",
      phone: "09171234567",
      address: "Quezon City",
    },
    {
      no: "104423080182",
      name: "Maria Reyes",
      school: "Serrano Elementary School",
      grade: "5",
      birthday: "2014-08-21",
      guardian: "Jose Reyes",
      phone: "09181234567",
      address: "Manila",
    },
    {
      no: "104423080183",
      name: "Pedro Santos",
      school: "Serrano Elementary School",
      grade: "4",
      birthday: "2015-01-03",
      guardian: "Ana Santos",
      phone: "09191234567",
      address: "Pasig City",
    },
  ];

  const csvLines = [
    "School Name,Student Name,LRN Number,Student Grade Number,Birthday,Name of Guardian,Phone Number,Student Address",
    ...students.map(
      (s) =>
        `${s.school},${s.name},${s.no},${s.grade},${s.birthday},${s.guardian},${s.phone},${s.address}`
    ),
  ];
  const csvPath = path.join(FIXTURES, "students.csv");
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  for (const s of students) {
    const svg = Buffer.from(
      `<svg width="300" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#cbd5e1"/>
        <circle cx="150" cy="140" r="60" fill="#64748b"/>
        <rect x="75" y="220" width="150" height="120" rx="60" fill="#64748b"/>
        <text x="150" y="380" text-anchor="middle" font-size="14" fill="#334155">${s.no}</text>
      </svg>`
    );
    await sharp(svg).jpeg().toFile(path.join(FIXTURES, "photos", `${s.no}.jpg`));
  }

  const zip = new JSZip();
  for (const s of students) {
    zip.file(`${s.no}.jpg`, fs.readFileSync(path.join(FIXTURES, "photos", `${s.no}.jpg`)));
  }
  const zipPath = path.join(FIXTURES, "StudentPhotos.zip");
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }));

  console.log("Running smoke generation...");
  const templates = new TemplateService();
  const template = templates.create("Smoke Test Template", {
    ...DEFAULT_PRINT_SETTINGS,
    cropMarks: true,
  });

  const frontUpload = path.join(FIXTURES, `tmp-front-${Date.now()}.pdf`);
  const backUpload = path.join(FIXTURES, `tmp-back-${Date.now()}.pdf`);
  fs.copyFileSync(frontPdf, frontUpload);
  fs.copyFileSync(backPdf, backUpload);
  await templates.uploadPdf(template.id, "front", frontUpload, "front-id.pdf", 1);
  await templates.uploadPdf(template.id, "back", backUpload, "back-id.pdf", 1);

  templates.savePlaceholders(template.id, [
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "school_name",
      x: 110,
      y: 28,
      width: 120,
      height: 16,
      rotation: 0,
      font: "Helvetica",
      fontSize: 8,
      fontWeight: "normal",
      color: "#0b6e4f",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 0,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "full_name",
      x: 110,
      y: 50,
      width: 120,
      height: 20,
      rotation: 0,
      font: "Helvetica",
      fontSize: 11,
      fontWeight: "bold",
      color: "#0f172a",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 1,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "student_no",
      x: 110,
      y: 75,
      width: 120,
      height: 18,
      rotation: 0,
      font: "Helvetica",
      fontSize: 10,
      fontWeight: "normal",
      color: "#334155",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 2,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "grade",
      x: 110,
      y: 95,
      width: 60,
      height: 16,
      rotation: 0,
      font: "Helvetica",
      fontSize: 10,
      fontWeight: "normal",
      color: "#334155",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 3,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "photo",
      x: 20,
      y: 35,
      width: 70,
      height: 90,
      rotation: 0,
      font: "Helvetica",
      fontSize: 12,
      fontWeight: "normal",
      color: "#000000",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 0,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "front",
      name: "qr",
      x: 190,
      y: 95,
      width: 40,
      height: 40,
      rotation: 0,
      font: "Helvetica",
      fontSize: 12,
      fontWeight: "normal",
      color: "#000000",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 4,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "back",
      name: "guardian",
      x: 20,
      y: 28,
      width: 200,
      height: 18,
      rotation: 0,
      font: "Helvetica",
      fontSize: 9,
      fontWeight: "normal",
      color: "#0f172a",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 0,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "back",
      name: "contact",
      x: 20,
      y: 48,
      width: 200,
      height: 16,
      rotation: 0,
      font: "Helvetica",
      fontSize: 9,
      fontWeight: "normal",
      color: "#0f172a",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 1,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "back",
      name: "address",
      x: 20,
      y: 68,
      width: 200,
      height: 28,
      rotation: 0,
      font: "Helvetica",
      fontSize: 9,
      fontWeight: "normal",
      color: "#0f172a",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 2,
    },
    {
      id: uuid(),
      templateId: template.id,
      side: "back",
      name: "barcode",
      x: 30,
      y: 105,
      width: 180,
      height: 30,
      rotation: 0,
      font: "Helvetica",
      fontSize: 12,
      fontWeight: "normal",
      color: "#000000",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: 3,
    },
  ]);

  const full = templates.get(template.id)!;
  const csv = new CsvService();
  const parsed = csv.parse(fs.readFileSync(csvPath, "utf8"));
  const mappedStudents = csv.mapRows(parsed.rows, parsed.suggestedMapping);

  const photos = new PhotoService();
  const index = await photos.extractZip(zipPath, `smoke-${Date.now()}`);
  const photoIndex = photos.buildPhotoPathMap(mappedStudents, index, "student_number");
  const validation = photos.validate(mappedStudents, index, "student_number");
  console.log(
    "Photo validation:",
    validation.map((v) => `${v.studentNo}:${v.status}`).join(", ")
  );

  const exporter = new ExportService();
  const result = await exporter.generate({
    template: full,
    students: mappedStudents,
    photoPaths: photoIndex,
    printSettings: full.printSettings,
    exportTypes: ["pdf", "png", "zip"],
    cropMode: "cover",
    missingPhotoPolicy: "placeholder",
    roundCorners: false,
    cornerRadius: 8,
    dpi: 150,
    onProgress: (p, msg) => console.log(`${Math.round(p * 100)}% ${msg}`),
  });

  console.log("Smoke OK");
  console.log("PDF:", result.pdfPath);
  console.log("ZIP:", result.zipPath);
  console.log("Generated:", result.generatedCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
