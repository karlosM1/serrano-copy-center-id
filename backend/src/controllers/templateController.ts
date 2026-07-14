import type { Request, Response } from "express";
import type { PlaceholderMapping, PrintSettings } from "@id-formatter/shared";
import { asyncHandler, AppError } from "../middlewares/errorHandler";
import { TemplateService } from "../services/templateService";
import { getPdfPageInfo, renderPdfPageToPng, toPublicStoragePath } from "../services/pdfPreviewService";
import path from "path";
import { STORAGE_ROOT } from "../database";

const service = new TemplateService();

export const listTemplates = asyncHandler(async (_req, res) => {
  res.json(service.list());
});

export const getTemplate = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const template = service.get(id);
  if (!template) throw new AppError("Template not found", 404);
  res.json(template);
});

export const createTemplate = asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? "Untitled Template");
  const printSettings = req.body.printSettings as PrintSettings | undefined;
  res.status(201).json(service.create(name, printSettings));
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const patch = req.body as Partial<{
    name: string;
    frontPage: number;
    backPage: number;
    printSettings: PrintSettings;
  }>;
  try {
    res.json(service.update(id, patch));
  } catch {
    throw new AppError("Template not found", 404);
  }
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  try {
    service.delete(id);
    res.status(204).send();
  } catch {
    throw new AppError("Template not found", 404);
  }
});

export const duplicateTemplate = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  try {
    res.status(201).json(service.duplicate(id));
  } catch {
    throw new AppError("Template not found", 404);
  }
});

export const uploadTemplatePdf = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const side = String(req.params.side) as "front" | "back";
  if (side !== "front" && side !== "back") throw new AppError("Invalid side");
  const file = req.file;
  if (!file) throw new AppError("PDF file is required");
  const page = Number(req.body.page ?? 1);
  const template = await service.uploadPdf(id, side, file.path, file.originalname, page);
  res.json(template);
});

export const setTemplatePage = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const side = String(req.params.side) as "front" | "back";
  const page = Number(req.body.page);
  if (!page || page < 1) throw new AppError("Invalid page");
  try {
    res.json(await service.setPage(id, side, page));
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Failed", 400);
  }
});

export const getPlaceholders = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const template = service.get(id);
  if (!template) throw new AppError("Template not found", 404);
  res.json(template.placeholders);
});

export const savePlaceholders = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const placeholders = req.body.placeholders as PlaceholderMapping[];
  if (!Array.isArray(placeholders)) throw new AppError("placeholders array required");
  try {
    res.json(service.savePlaceholders(id, placeholders));
  } catch {
    throw new AppError("Template not found", 404);
  }
});

export const previewTemplatePage = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const side = String(req.params.side) as "front" | "back";
  const template = service.get(id);
  if (!template) throw new AppError("Template not found", 404);
  const pdfPath = side === "front" ? template.frontPdfPath : template.backPdfPath;
  if (!pdfPath) throw new AppError(`No ${side} PDF`, 400);
  const abs = path.join(STORAGE_ROOT, pdfPath.replace(/^\/storage\//, ""));
  const page = side === "front" ? template.frontPage : template.backPage;
  const info = await getPdfPageInfo(abs, page);
  try {
    const rendered = await renderPdfPageToPng(abs, page, 2);
    res.json({
      ...info,
      previewUrl: toPublicStoragePath(rendered.pngPath),
      rasterWidth: rendered.width,
      rasterHeight: rendered.height,
    });
  } catch {
    res.json({ ...info, previewUrl: null });
  }
});
