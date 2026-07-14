import { v4 as uuid } from "uuid";
import type {
  AppSettings,
  CsvColumnMapping,
  CsvProfile,
  ExportType,
  GenerationHistoryRecord,
  JobProgress,
  JobStatus,
  PlaceholderKind,
  PlaceholderMapping,
  PrintSettings,
  Template,
  TemplateSide,
  TextAlignment,
  FontWeight,
} from "@id-formatter/shared";
import { getDb } from "../database";

interface TemplateRow {
  id: string;
  name: string;
  front_pdf_path: string | null;
  back_pdf_path: string | null;
  front_page: number;
  back_page: number;
  front_page_width: number;
  front_page_height: number;
  back_page_width: number;
  back_page_height: number;
  print_settings_json: string;
  created_at: string;
  updated_at: string;
}

interface PlaceholderRow {
  id: string;
  template_id: string;
  side: TemplateSide;
  name: PlaceholderKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  font: string;
  font_size: number;
  font_weight: FontWeight;
  color: string;
  alignment: TextAlignment;
  line_height: number;
  letter_spacing: number;
  locked: number;
  z_index: number;
}

interface CsvProfileRow {
  id: string;
  template_id: string;
  name: string;
  mapping_json: string;
}

interface HistoryRow {
  id: string;
  template_id: string;
  template_name: string;
  csv_filename: string;
  generated_count: number;
  export_type: ExportType;
  operator: string;
  output_paths_json: string;
  status: JobStatus;
  created_at: string;
}

interface JobRow {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  message: string;
  error: string | null;
  result_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    frontPdfPath: row.front_pdf_path,
    backPdfPath: row.back_pdf_path,
    frontPage: row.front_page,
    backPage: row.back_page,
    frontPageWidth: row.front_page_width,
    frontPageHeight: row.front_page_height,
    backPageWidth: row.back_page_width,
    backPageHeight: row.back_page_height,
    printSettings: JSON.parse(row.print_settings_json) as PrintSettings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaceholder(row: PlaceholderRow): PlaceholderMapping {
  return {
    id: row.id,
    templateId: row.template_id,
    side: row.side,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    font: row.font,
    fontSize: row.font_size,
    fontWeight: row.font_weight,
    color: row.color,
    alignment: row.alignment,
    lineHeight: row.line_height,
    letterSpacing: row.letter_spacing,
    locked: row.locked === 1,
    zIndex: row.z_index,
  };
}

export class TemplateRepository {
  list(): Template[] {
    const rows = getDb().prepare("SELECT * FROM templates ORDER BY updated_at DESC").all() as TemplateRow[];
    return rows.map(mapTemplate);
  }

  getById(id: string): Template | null {
    const row = getDb().prepare("SELECT * FROM templates WHERE id = ?").get(id) as TemplateRow | undefined;
    return row ? mapTemplate(row) : null;
  }

  create(name: string, printSettings: PrintSettings): Template {
    const now = new Date().toISOString();
    const id = uuid();
    getDb()
      .prepare(
        `INSERT INTO templates (
          id, name, front_pdf_path, back_pdf_path, front_page, back_page,
          front_page_width, front_page_height, back_page_width, back_page_height,
          print_settings_json, created_at, updated_at
        ) VALUES (?, ?, NULL, NULL, 1, 1, 243.78, 153.07, 243.78, 153.07, ?, ?, ?)`
      )
      .run(id, name, JSON.stringify(printSettings), now, now);
    const created = this.getById(id);
    if (!created) throw new Error("Failed to create template");
    return created;
  }

  update(id: string, patch: Partial<{
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
  }>): Template {
    const existing = this.getById(id);
    if (!existing) throw new Error("Template not found");
    const next: Template = {
      ...existing,
      name: patch.name ?? existing.name,
      frontPdfPath: patch.frontPdfPath !== undefined ? patch.frontPdfPath : existing.frontPdfPath,
      backPdfPath: patch.backPdfPath !== undefined ? patch.backPdfPath : existing.backPdfPath,
      frontPage: patch.frontPage ?? existing.frontPage,
      backPage: patch.backPage ?? existing.backPage,
      frontPageWidth: patch.frontPageWidth ?? existing.frontPageWidth,
      frontPageHeight: patch.frontPageHeight ?? existing.frontPageHeight,
      backPageWidth: patch.backPageWidth ?? existing.backPageWidth,
      backPageHeight: patch.backPageHeight ?? existing.backPageHeight,
      printSettings: patch.printSettings ?? existing.printSettings,
      updatedAt: new Date().toISOString(),
    };
    getDb()
      .prepare(
        `UPDATE templates SET
          name = ?, front_pdf_path = ?, back_pdf_path = ?, front_page = ?, back_page = ?,
          front_page_width = ?, front_page_height = ?, back_page_width = ?, back_page_height = ?,
          print_settings_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.name,
        next.frontPdfPath,
        next.backPdfPath,
        next.frontPage,
        next.backPage,
        next.frontPageWidth,
        next.frontPageHeight,
        next.backPageWidth,
        next.backPageHeight,
        JSON.stringify(next.printSettings),
        next.updatedAt,
        id
      );
    return next;
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
  }
}

export class PlaceholderRepository {
  listByTemplate(templateId: string): PlaceholderMapping[] {
    const rows = getDb()
      .prepare("SELECT * FROM placeholders WHERE template_id = ? ORDER BY z_index ASC")
      .all(templateId) as PlaceholderRow[];
    return rows.map(mapPlaceholder);
  }

  replaceAll(templateId: string, placeholders: PlaceholderMapping[]): PlaceholderMapping[] {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM placeholders WHERE template_id = ?").run(templateId);
      const insert = db.prepare(
        `INSERT INTO placeholders (
          id, template_id, side, name, x, y, width, height, rotation,
          font, font_size, font_weight, color, alignment, line_height, letter_spacing, locked, z_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of placeholders) {
        insert.run(
          p.id || uuid(),
          templateId,
          p.side,
          p.name,
          p.x,
          p.y,
          p.width,
          p.height,
          p.rotation,
          p.font,
          p.fontSize,
          p.fontWeight,
          p.color,
          p.alignment,
          p.lineHeight,
          p.letterSpacing,
          p.locked ? 1 : 0,
          p.zIndex
        );
      }
    });
    tx();
    return this.listByTemplate(templateId);
  }
}

export class CsvProfileRepository {
  listByTemplate(templateId: string): CsvProfile[] {
    const rows = getDb()
      .prepare("SELECT * FROM csv_profiles WHERE template_id = ? ORDER BY name")
      .all(templateId) as CsvProfileRow[];
    return rows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      mapping: JSON.parse(row.mapping_json) as CsvColumnMapping,
    }));
  }

  create(templateId: string, name: string, mapping: CsvColumnMapping): CsvProfile {
    const id = uuid();
    getDb()
      .prepare("INSERT INTO csv_profiles (id, template_id, name, mapping_json) VALUES (?, ?, ?, ?)")
      .run(id, templateId, name, JSON.stringify(mapping));
    return { id, templateId, name, mapping };
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM csv_profiles WHERE id = ?").run(id);
  }
}

export class SettingsRepository {
  get(): AppSettings {
    const row = getDb().prepare("SELECT settings_json FROM app_settings WHERE id = 1").get() as
      | { settings_json: string }
      | undefined;
    if (!row) throw new Error("Settings not initialized");
    return JSON.parse(row.settings_json) as AppSettings;
  }

  update(settings: AppSettings): AppSettings {
    getDb().prepare("UPDATE app_settings SET settings_json = ? WHERE id = 1").run(JSON.stringify(settings));
    return settings;
  }
}

export class HistoryRepository {
  list(): GenerationHistoryRecord[] {
    const rows = getDb()
      .prepare("SELECT * FROM generation_history ORDER BY created_at DESC")
      .all() as HistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      csvFilename: row.csv_filename,
      generatedCount: row.generated_count,
      exportType: row.export_type,
      operator: row.operator,
      outputPaths: JSON.parse(row.output_paths_json) as GenerationHistoryRecord["outputPaths"],
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  create(record: Omit<GenerationHistoryRecord, "id" | "createdAt"> & { id?: string }): GenerationHistoryRecord {
    const id = record.id ?? uuid();
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO generation_history (
          id, template_id, template_name, csv_filename, generated_count,
          export_type, operator, output_paths_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        record.templateId,
        record.templateName,
        record.csvFilename,
        record.generatedCount,
        record.exportType,
        record.operator,
        JSON.stringify(record.outputPaths),
        record.status,
        createdAt
      );
    return { ...record, id, createdAt };
  }

  getById(id: string): GenerationHistoryRecord | null {
    const row = getDb().prepare("SELECT * FROM generation_history WHERE id = ?").get(id) as HistoryRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      csvFilename: row.csv_filename,
      generatedCount: row.generated_count,
      exportType: row.export_type,
      operator: row.operator,
      outputPaths: JSON.parse(row.output_paths_json) as GenerationHistoryRecord["outputPaths"],
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

export class JobRepository {
  create(type: string): JobProgress {
    const id = uuid();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO jobs (id, type, status, progress, message, error, result_json, created_at, updated_at)
         VALUES (?, ?, 'queued', 0, 'Queued', NULL, NULL, ?, ?)`
      )
      .run(id, type, now, now);
    return this.getById(id)!;
  }

  getById(id: string): JobProgress | null {
    const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      message: row.message,
      error: row.error,
      result: row.result_json ? (JSON.parse(row.result_json) as JobProgress["result"]) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  update(
    id: string,
    patch: Partial<{
      status: JobStatus;
      progress: number;
      message: string;
      error: string | null;
      result: JobProgress["result"];
    }>
  ): JobProgress {
    const existing = this.getById(id);
    if (!existing) throw new Error("Job not found");
    const next: JobProgress = {
      ...existing,
      status: patch.status ?? existing.status,
      progress: patch.progress ?? existing.progress,
      message: patch.message ?? existing.message,
      error: patch.error !== undefined ? patch.error : existing.error,
      result: patch.result !== undefined ? patch.result : existing.result,
      updatedAt: new Date().toISOString(),
    };
    getDb()
      .prepare(
        `UPDATE jobs SET status = ?, progress = ?, message = ?, error = ?, result_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        next.status,
        next.progress,
        next.message,
        next.error,
        next.result ? JSON.stringify(next.result) : null,
        next.updatedAt,
        id
      );
    return next;
  }
}
