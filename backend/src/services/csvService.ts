import Papa from "papaparse";
import type { CsvColumnMapping, PlaceholderKind, StudentRecord } from "@id-formatter/shared";
import { TEXT_PLACEHOLDERS } from "@id-formatter/shared";

/** Normalized CSV header → placeholder / mapping key */
const AUTO_MAP: Record<string, string> = {
  // LRN / student number
  student_number: "student_no",
  studentnumber: "student_no",
  student_no: "student_no",
  studentno: "student_no",
  "student number": "student_no",
  lrn: "student_no",
  lrn_number: "student_no",
  "lrn number": "student_no",
  lrn_no: "student_no",
  "lrn no": "student_no",
  learner_reference_number: "student_no",
  "learner reference number": "student_no",

  // Names
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  middle_name: "middle_name",
  middlename: "middle_name",
  "middle name": "middle_name",
  last_name: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  full_name: "full_name",
  fullname: "full_name",
  "full name": "full_name",
  student_name: "full_name",
  "student name": "full_name",
  name: "full_name",

  // School / grade
  school_name: "school_name",
  "school name": "school_name",
  school: "school_name",
  grade: "grade",
  student_grade: "grade",
  "student grade": "grade",
  student_grade_number: "grade",
  "student grade number": "grade",
  grade_number: "grade",
  "grade number": "grade",
  grade_level: "grade",
  "grade level": "grade",

  course: "course",
  year: "year",
  section: "section",

  birthday: "birthday",
  birthdate: "birthday",
  "birth day": "birthday",
  "birth date": "birthday",
  date_of_birth: "birthday",
  "date of birth": "birthday",
  dob: "birthday",

  address: "address",
  student_address: "address",
  "student address": "address",

  guardian: "guardian",
  name_of_guardian: "guardian",
  "name of guardian": "guardian",
  guardian_name: "guardian",
  "guardian name": "guardian",
  parent_guardian: "guardian",
  "parent/guardian": "guardian",

  contact: "contact",
  phone: "contact",
  phone_number: "contact",
  "phone number": "contact",
  "contact number": "contact",
  contact_number: "contact",
  mobile: "contact",
  mobile_number: "contact",
  "mobile number": "contact",

  qr: "qr",
  qr_value: "qr",
  "qr value": "qr",
  barcode: "barcode",
  barcode_value: "barcode",
  "barcode value": "barcode",
  signature: "signature",

  photo: "photo_filename",
  photo_filename: "photo_filename",
  "photo filename": "photo_filename",
  filename: "photo_filename",
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_");
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: CsvColumnMapping;
}

export class CsvService {
  parse(content: string): ParsedCsv {
    const result = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    if (result.errors.length > 0) {
      const fatal = result.errors.find((e) => e.type === "Delimiter" || e.type === "Quotes");
      if (fatal) {
        throw new Error(`Invalid CSV: ${fatal.message}`);
      }
    }
    const headers = result.meta.fields ?? [];
    if (headers.length === 0) {
      throw new Error("Invalid CSV: no headers detected");
    }
    const rows = (result.data ?? []).map((row) => {
      const clean: Record<string, string> = {};
      for (const h of headers) {
        clean[h] = String(row[h] ?? "").trim();
      }
      return clean;
    });
    return {
      headers,
      rows,
      suggestedMapping: this.suggestMapping(headers),
    };
  }

  suggestMapping(headers: string[]): CsvColumnMapping {
    const mapping: CsvColumnMapping = {};
    for (const header of headers) {
      const key = normalizeHeader(header);
      const alt = header.toLowerCase().trim();
      const kind = AUTO_MAP[key] ?? AUTO_MAP[alt];
      if (kind && !mapping[kind]) {
        mapping[kind] = header;
      }
    }
    return mapping;
  }

  mapRows(rows: Record<string, string>[], mapping: CsvColumnMapping): StudentRecord[] {
    const students: StudentRecord[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const get = (kind: string): string => {
        const col = mapping[kind];
        return col ? String(row[col] ?? "").trim() : "";
      };

      const first = get("first_name");
      const middle = get("middle_name");
      const last = get("last_name");
      const full =
        get("full_name") ||
        [first, middle, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const studentNo = get("student_no");
      if (!studentNo) {
        throw new Error("Missing required mapping: LRN Number ({{student_no}})");
      }
      if (seen.has(studentNo)) {
        throw new Error(`Duplicate LRN number: ${studentNo}`);
      }
      seen.add(studentNo);

      const grade = get("grade");
      const year = get("year") || grade;

      students.push({
        school_name: get("school_name"),
        student_no: studentNo,
        first_name: first,
        middle_name: middle,
        last_name: last,
        full_name: full,
        course: get("course"),
        year,
        grade,
        section: get("section"),
        birthday: get("birthday"),
        address: get("address"),
        guardian: get("guardian"),
        contact: get("contact"),
        qr: get("qr") || studentNo,
        barcode: get("barcode") || studentNo,
        signature: get("signature") || full,
        photo_filename: get("photo_filename"),
      });
    }

    if (!mapping.student_no) {
      throw new Error("Missing required column mapping for LRN Number ({{student_no}})");
    }

    return students;
  }

  validateMapping(mapping: CsvColumnMapping, required: PlaceholderKind[] = ["student_no"]): string[] {
    const errors: string[] = [];
    for (const r of required) {
      if (!mapping[r]) errors.push(`Missing required mapping: {{${r}}}`);
    }
    for (const kind of TEXT_PLACEHOLDERS) {
      void kind;
    }
    return errors;
  }
}
