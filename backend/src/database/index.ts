import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { DEFAULT_APP_SETTINGS, DEFAULT_PRINT_SETTINGS } from "@id-formatter/shared";

const ROOT = path.resolve(__dirname, "../..");
export const STORAGE_ROOT = path.join(ROOT, "storage");
export const DB_PATH = path.join(ROOT, "data", "id-formatter.db");

const DIRS = [
  path.join(ROOT, "data"),
  path.join(STORAGE_ROOT, "templates"),
  path.join(STORAGE_ROOT, "uploads"),
  path.join(STORAGE_ROOT, "outputs"),
  path.join(STORAGE_ROOT, "photos"),
  path.join(STORAGE_ROOT, "previews"),
];

export function ensureStorageDirs(): void {
  for (const dir of DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    ensureStorageDirs();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      front_pdf_path TEXT,
      back_pdf_path TEXT,
      front_page INTEGER NOT NULL DEFAULT 1,
      back_page INTEGER NOT NULL DEFAULT 1,
      front_page_width REAL NOT NULL DEFAULT 243.78,
      front_page_height REAL NOT NULL DEFAULT 153.07,
      back_page_width REAL NOT NULL DEFAULT 243.78,
      back_page_height REAL NOT NULL DEFAULT 153.07,
      print_settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS placeholders (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('front', 'back')),
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      rotation REAL NOT NULL DEFAULT 0,
      font TEXT NOT NULL DEFAULT 'Helvetica',
      font_size REAL NOT NULL DEFAULT 12,
      font_weight TEXT NOT NULL DEFAULT 'normal',
      color TEXT NOT NULL DEFAULT '#000000',
      alignment TEXT NOT NULL DEFAULT 'left',
      line_height REAL NOT NULL DEFAULT 1.2,
      letter_spacing REAL NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      z_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS csv_profiles (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_history (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      csv_filename TEXT NOT NULL,
      generated_count INTEGER NOT NULL,
      export_type TEXT NOT NULL,
      operator TEXT NOT NULL,
      output_paths_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const settings = database.prepare("SELECT id FROM app_settings WHERE id = 1").get();
  if (!settings) {
    database
      .prepare("INSERT INTO app_settings (id, settings_json) VALUES (1, ?)")
      .run(JSON.stringify(DEFAULT_APP_SETTINGS));
  }

  void DEFAULT_PRINT_SETTINGS;
}
