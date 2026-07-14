import fs from "fs";
import path from "path";
import JSZip from "jszip";
import sharp from "sharp";
import type {
  CropMode,
  MissingPhotoPolicy,
  PhotoMatchMethod,
  PhotoStatus,
  PhotoValidationRow,
  StudentRecord,
} from "@id-formatter/shared";
import { STORAGE_ROOT } from "../database";

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface PhotoIndex {
  /** basename lower -> absolute path */
  byName: Map<string, string>;
  /** all paths that share a basename (duplicates) */
  duplicates: Set<string>;
  extractDir: string;
}

export class PhotoService {
  async extractZip(zipPath: string, jobKey: string): Promise<PhotoIndex> {
    const extractDir = path.join(STORAGE_ROOT, "photos", jobKey);
    fs.mkdirSync(extractDir, { recursive: true });
    const zipData = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    const byName = new Map<string, string>();
    const duplicates = new Set<string>();

    const entries = Object.values(zip.files);
    for (const entry of entries) {
      if (entry.dir) continue;
      const base = path.basename(entry.name);
      if (base.startsWith(".")) continue;
      const ext = path.extname(base).toLowerCase();
      if (!SUPPORTED.has(ext)) continue;
      const buffer = Buffer.from(await entry.async("nodebuffer"));
      const dest = path.join(extractDir, base);
      fs.writeFileSync(dest, buffer);
      const key = base.toLowerCase();
      if (byName.has(key)) {
        duplicates.add(path.parse(base).name.toLowerCase());
      }
      byName.set(key, dest);
    }

    return { byName, duplicates, extractDir };
  }

  findPhoto(
    student: StudentRecord,
    index: PhotoIndex,
    method: PhotoMatchMethod
  ): { path: string | null; filename: string | null; status: PhotoStatus } {
    const candidates =
      method === "photo_filename" && student.photo_filename
        ? [student.photo_filename]
        : [`${student.student_no}.jpg`, `${student.student_no}.jpeg`, `${student.student_no}.png`, `${student.student_no}.webp`];

    const stem = method === "photo_filename" && student.photo_filename
      ? path.parse(student.photo_filename).name.toLowerCase()
      : student.student_no.toLowerCase();

    if (index.duplicates.has(stem)) {
      for (const name of candidates) {
        const hit = index.byName.get(name.toLowerCase());
        if (hit) {
          return { path: hit, filename: path.basename(hit), status: "duplicate" };
        }
      }
      return { path: null, filename: null, status: "duplicate" };
    }

    for (const name of candidates) {
      const lower = name.toLowerCase();
      const ext = path.extname(lower);
      if (ext && !SUPPORTED.has(ext)) {
        return { path: null, filename: name, status: "unsupported" };
      }
      const hit = index.byName.get(lower);
      if (hit) {
        return { path: hit, filename: path.basename(hit), status: "found" };
      }
    }

    // Try stem match with any supported extension
    for (const ext of SUPPORTED) {
      const hit = index.byName.get(`${stem}${ext}`);
      if (hit) {
        return { path: hit, filename: path.basename(hit), status: "found" };
      }
    }

    return { path: null, filename: null, status: "missing" };
  }

  validate(
    students: StudentRecord[],
    index: PhotoIndex,
    method: PhotoMatchMethod
  ): PhotoValidationRow[] {
    return students.map((s) => {
      const match = this.findPhoto(s, index, method);
      return {
        studentNo: s.student_no,
        studentName: s.full_name || `${s.first_name} ${s.last_name}`.trim(),
        status: match.status,
        matchedFilename: match.filename,
      };
    });
  }

  async processPhoto(
    inputPath: string | null,
    widthPx: number,
    heightPx: number,
    cropMode: CropMode,
    roundCorners: boolean,
    cornerRadius: number,
    missingPolicy: MissingPhotoPolicy,
    placeholderPath?: string
  ): Promise<Buffer | null> {
    let source = inputPath;
    if (!source) {
      if (missingPolicy === "blank" || missingPolicy === "skip") return null;
      source = placeholderPath ?? (await this.createDefaultPlaceholder(widthPx, heightPx));
    }

    let pipeline = sharp(source).rotate();
    if (cropMode === "cover") {
      pipeline = pipeline.resize(widthPx, heightPx, { fit: "cover", position: "centre" });
    } else {
      pipeline = pipeline.resize(widthPx, heightPx, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } });
    }

    if (roundCorners && cornerRadius > 0) {
      const r = Math.min(cornerRadius, Math.floor(Math.min(widthPx, heightPx) / 2));
      const svg = Buffer.from(
        `<svg width="${widthPx}" height="${heightPx}"><rect x="0" y="0" width="${widthPx}" height="${heightPx}" rx="${r}" ry="${r}"/></svg>`
      );
      pipeline = pipeline.composite([{ input: svg, blend: "dest-in" }]);
    }

    return pipeline.png().toBuffer();
  }

  async createDefaultPlaceholder(widthPx: number, heightPx: number): Promise<string> {
    const dest = path.join(STORAGE_ROOT, "photos", "placeholder.png");
    if (!fs.existsSync(dest)) {
      const svg = Buffer.from(
        `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#d1d5db"/>
          <text x="50%" y="50%" font-family="Arial" font-size="${Math.floor(widthPx / 8)}" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">NO PHOTO</text>
        </svg>`
      );
      await sharp(svg).png().toFile(dest);
    }
    return dest;
  }

  buildPhotoPathMap(
    students: StudentRecord[],
    index: PhotoIndex,
    method: PhotoMatchMethod
  ): Record<string, string> {
    const map: Record<string, string> = {};
    for (const s of students) {
      const match = this.findPhoto(s, index, method);
      if (match.path) {
        map[s.student_no] = match.path;
      }
    }
    return map;
  }
}
