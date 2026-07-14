import fs from "fs";
import type { Request, Response } from "express";
import type { CsvColumnMapping, GenerateRequest, PhotoMatchMethod } from "@id-formatter/shared";
import { asyncHandler, AppError } from "../middlewares/errorHandler";
import { CsvService } from "../services/csvService";
import { PhotoService } from "../services/photoService";
import { CsvProfileRepository, HistoryRepository, SettingsRepository } from "../repositories";
import { jobService } from "../services/jobService";
import type { AppSettings } from "@id-formatter/shared";
import { v4 as uuid } from "uuid";

const csvService = new CsvService();
const photoService = new PhotoService();
const csvProfiles = new CsvProfileRepository();
const historyRepo = new HistoryRepository();
const settingsRepo = new SettingsRepository();

const photoSessions = new Map<
  string,
  { index: Awaited<ReturnType<PhotoService["extractZip"]>>; zipName: string }
>();

export const parseCsv = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new AppError("CSV file required");
  const content = fs.readFileSync(file.path, "utf8");
  const parsed = csvService.parse(content);
  res.json({
    filename: file.originalname,
    ...parsed,
  });
});

export const mapCsv = asyncHandler(async (req, res) => {
  const { rows, mapping } = req.body as {
    rows: Record<string, string>[];
    mapping: CsvColumnMapping;
  };
  if (!rows || !mapping) throw new AppError("rows and mapping required");
  const errors = csvService.validateMapping(mapping);
  if (errors.length) throw new AppError(errors.join("; "));
  const students = csvService.mapRows(rows, mapping);
  res.json({ students, count: students.length });
});

export const listCsvProfiles = asyncHandler(async (req, res) => {
  const templateId = String(req.query.templateId ?? "");
  if (!templateId) throw new AppError("templateId required");
  res.json(csvProfiles.listByTemplate(templateId));
});

export const createCsvProfile = asyncHandler(async (req, res) => {
  const { templateId, name, mapping } = req.body as {
    templateId: string;
    name: string;
    mapping: CsvColumnMapping;
  };
  if (!templateId || !name || !mapping) throw new AppError("templateId, name, mapping required");
  res.status(201).json(csvProfiles.create(templateId, name, mapping));
});

export const deleteCsvProfile = asyncHandler(async (req, res) => {
  csvProfiles.delete(String(req.params.id));
  res.status(204).send();
});

export const uploadPhotosZip = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new AppError("ZIP file required");
  const sessionId = uuid();
  const index = await photoService.extractZip(file.path, sessionId);
  photoSessions.set(sessionId, { index, zipName: file.originalname });
  res.json({
    sessionId,
    photoCount: index.byName.size,
    extractDir: index.extractDir,
  });
});

export const validatePhotos = asyncHandler(async (req, res) => {
  const { sessionId, students, method } = req.body as {
    sessionId: string;
    students: Parameters<PhotoService["validate"]>[0];
    method?: PhotoMatchMethod;
  };
  const session = photoSessions.get(sessionId);
  if (!session) throw new AppError("Photo session not found. Re-upload ZIP.", 404);
  const settings = settingsRepo.get();
  const rows = photoService.validate(students, session.index, method ?? settings.photoMatchMethod);
  const photoIndex = photoService.buildPhotoPathMap(
    students,
    session.index,
    method ?? settings.photoMatchMethod
  );
  res.json({ rows, photoIndex });
});

export const startGenerate = asyncHandler(async (req, res) => {
  const body = req.body as GenerateRequest;
  if (!body.templateId || !body.students?.length) {
    throw new AppError("templateId and students required");
  }
  const job = jobService.enqueueGenerate({
    ...body,
    exportTypes: body.exportTypes?.length ? body.exportTypes : ["pdf"],
    csvFilename: body.csvFilename || "students.csv",
  });
  res.status(202).json(job);
});

export const getJob = asyncHandler(async (req, res) => {
  const job = jobService.get(String(req.params.id));
  if (!job) throw new AppError("Job not found", 404);
  res.json(job);
});

export const jobEvents = (req: Request, res: Response): void => {
  const id = String(req.params.id);
  const job = jobService.get(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send(job);
  const unsub = jobService.subscribe(id, send);

  req.on("close", () => {
    unsub();
  });
};

export const listHistory = asyncHandler(async (_req, res) => {
  res.json(historyRepo.list());
});

export const getHistory = asyncHandler(async (req, res) => {
  const row = historyRepo.getById(String(req.params.id));
  if (!row) throw new AppError("Not found", 404);
  res.json(row);
});

export const getSettings = asyncHandler(async (_req, res) => {
  res.json(settingsRepo.get());
});

export const updateSettings = asyncHandler(async (req, res) => {
  const current = settingsRepo.get();
  const next = { ...current, ...(req.body as Partial<AppSettings>) };
  res.json(settingsRepo.update(next));
});
