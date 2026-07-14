export type PlaceholderKind =
  | "school_name"
  | "student_no"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "full_name"
  | "course"
  | "year"
  | "grade"
  | "section"
  | "birthday"
  | "address"
  | "guardian"
  | "contact"
  | "photo"
  | "qr"
  | "barcode"
  | "signature";

export type TemplateSide = "front" | "back";

export type TextAlignment = "left" | "center" | "right";

export type FontWeight = "normal" | "bold";

export type PhotoMatchMethod = "student_number" | "photo_filename";

export type MissingPhotoPolicy = "placeholder" | "blank" | "skip";

export type CropMode = "cover" | "contain";

export type ExportType = "pdf" | "png" | "zip";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PhotoStatus =
  | "found"
  | "missing"
  | "duplicate"
  | "unsupported";

export interface PrintSettings {
  paperSize: "A4";
  orientation: "portrait";
  columns: number;
  rows: number;
  idWidthMm: number;
  idHeightMm: number;
  marginMm: number;
  gapXMm: number;
  gapYMm: number;
  bleedMm: number;
  cropMarks: boolean;
  outputDpi: number;
}

export interface PlaceholderMapping {
  id: string;
  templateId: string;
  side: TemplateSide;
  name: PlaceholderKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  font: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  alignment: TextAlignment;
  lineHeight: number;
  letterSpacing: number;
  locked: boolean;
  zIndex: number;
}

export interface Template {
  id: string;
  name: string;
  frontPdfPath: string | null;
  backPdfPath: string | null;
  frontPage: number;
  backPage: number;
  frontPageWidth: number;
  frontPageHeight: number;
  backPageWidth: number;
  backPageHeight: number;
  printSettings: PrintSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateWithPlaceholders extends Template {
  placeholders: PlaceholderMapping[];
}

export interface CsvColumnMapping {
  [placeholder: string]: string;
}

export interface CsvProfile {
  id: string;
  templateId: string;
  name: string;
  mapping: CsvColumnMapping;
}

export interface StudentRecord {
  school_name: string;
  student_no: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  course: string;
  year: string;
  grade: string;
  section: string;
  birthday: string;
  address: string;
  guardian: string;
  contact: string;
  qr: string;
  barcode: string;
  signature: string;
  photo_filename: string;
  [key: string]: string;
}

export interface PhotoValidationRow {
  studentNo: string;
  studentName: string;
  status: PhotoStatus;
  matchedFilename: string | null;
}

export interface AppSettings {
  operatorName: string;
  photoMatchMethod: PhotoMatchMethod;
  missingPhotoPolicy: MissingPhotoPolicy;
  cropMode: CropMode;
  dpi: number;
  quality: number;
  supportedFormats: string[];
  defaultPrintSettings: PrintSettings;
  roundPhotoCorners: boolean;
  photoCornerRadiusPx: number;
}

export interface GenerationHistoryRecord {
  id: string;
  templateId: string;
  templateName: string;
  csvFilename: string;
  generatedCount: number;
  exportType: ExportType;
  operator: string;
  outputPaths: {
    pdf?: string;
    zip?: string;
    pngDir?: string;
  };
  status: JobStatus;
  createdAt: string;
}

export interface JobProgress {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  message: string;
  error: string | null;
  result: {
    historyId?: string;
    pdfUrl?: string;
    zipUrl?: string;
    pngDirUrl?: string;
    generatedCount?: number;
    previewPages?: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateRequest {
  templateId: string;
  students: StudentRecord[];
  photoIndex: Record<string, string>;
  exportTypes: ExportType[];
  printSettings?: Partial<PrintSettings>;
  photoMatchMethod?: PhotoMatchMethod;
  missingPhotoPolicy?: MissingPhotoPolicy;
  cropMode?: CropMode;
  csvFilename: string;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: "A4",
  orientation: "portrait",
  columns: 2,
  rows: 5,
  idWidthMm: 85.6,
  idHeightMm: 53.98,
  marginMm: 10,
  gapXMm: 5,
  gapYMm: 5,
  bleedMm: 0,
  cropMarks: false,
  outputDpi: 300,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  operatorName: "Administrator",
  photoMatchMethod: "student_number",
  missingPhotoPolicy: "placeholder",
  cropMode: "cover",
  dpi: 300,
  quality: 90,
  supportedFormats: ["jpg", "jpeg", "png", "webp"],
  defaultPrintSettings: DEFAULT_PRINT_SETTINGS,
  roundPhotoCorners: false,
  photoCornerRadiusPx: 8,
};

export const PLACEHOLDER_LABELS: Record<PlaceholderKind, string> = {
  school_name: "School Name",
  student_no: "LRN Number",
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  full_name: "Student Name",
  course: "Course",
  year: "Year",
  grade: "Student Grade Number",
  section: "Section",
  birthday: "Birthday",
  address: "Student Address",
  guardian: "Name of Guardian",
  contact: "Phone Number",
  photo: "Photo",
  qr: "QR Code",
  barcode: "Barcode",
  signature: "Signature",
};

/** Primary school CSV fields used by Serrano Copy Center. */
export const SCHOOL_CSV_FIELDS: Array<{ key: string; label: string }> = [
  { key: "school_name", label: "School Name" },
  { key: "full_name", label: "Student Name" },
  { key: "student_no", label: "LRN Number" },
  { key: "grade", label: "Student Grade Number" },
  { key: "birthday", label: "Birthday" },
  { key: "guardian", label: "Name of Guardian" },
  { key: "contact", label: "Phone Number" },
  { key: "address", label: "Student Address" },
];

export const TEXT_PLACEHOLDERS: PlaceholderKind[] = [
  "school_name",
  "student_no",
  "full_name",
  "first_name",
  "middle_name",
  "last_name",
  "grade",
  "year",
  "course",
  "section",
  "birthday",
  "guardian",
  "contact",
  "address",
  "signature",
];

export const IMAGE_PLACEHOLDERS: PlaceholderKind[] = ["photo", "qr", "barcode"];
