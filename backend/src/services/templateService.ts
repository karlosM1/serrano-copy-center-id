import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { DEFAULT_PRINT_SETTINGS, type PrintSettings, type Template, type TemplateWithPlaceholders } from "@id-formatter/shared";
import { STORAGE_ROOT } from "../database";
import { PlaceholderRepository, TemplateRepository } from "../repositories";
import { getPdfPageInfo, toPublicStoragePath } from "./pdfPreviewService";

export class TemplateService {
  private templates = new TemplateRepository();
  private placeholders = new PlaceholderRepository();

  list(): Template[] {
    return this.templates.list();
  }

  get(id: string): TemplateWithPlaceholders | null {
    const template = this.templates.getById(id);
    if (!template) return null;
    return {
      ...template,
      placeholders: this.placeholders.listByTemplate(id),
    };
  }

  create(name: string, printSettings?: PrintSettings): Template {
    return this.templates.create(name, printSettings ?? DEFAULT_PRINT_SETTINGS);
  }

  update(
    id: string,
    patch: Partial<{
      name: string;
      frontPage: number;
      backPage: number;
      printSettings: PrintSettings;
    }>
  ): Template {
    return this.templates.update(id, patch);
  }

  async uploadPdf(
    id: string,
    side: "front" | "back",
    filePath: string,
    originalName: string,
    page = 1
  ): Promise<Template> {
    const template = this.templates.getById(id);
    if (!template) throw new Error("Template not found");

    const destDir = path.join(STORAGE_ROOT, "templates", id);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${side}-${Date.now()}-${originalName}`);
    fs.renameSync(filePath, dest);

    const info = await getPdfPageInfo(dest, page);
    const publicPath = toPublicStoragePath(dest);

    if (side === "front") {
      return this.templates.update(id, {
        frontPdfPath: publicPath,
        frontPage: page,
        frontPageWidth: info.width,
        frontPageHeight: info.height,
      });
    }
    return this.templates.update(id, {
      backPdfPath: publicPath,
      backPage: page,
      backPageWidth: info.width,
      backPageHeight: info.height,
    });
  }

  async setPage(id: string, side: "front" | "back", page: number): Promise<Template> {
    const template = this.templates.getById(id);
    if (!template) throw new Error("Template not found");
    const pdfPath = side === "front" ? template.frontPdfPath : template.backPdfPath;
    if (!pdfPath) throw new Error(`No ${side} PDF uploaded`);
    const abs = path.join(STORAGE_ROOT, pdfPath.replace(/^\/storage\//, ""));
    const info = await getPdfPageInfo(abs, page);
    if (side === "front") {
      return this.templates.update(id, {
        frontPage: page,
        frontPageWidth: info.width,
        frontPageHeight: info.height,
      });
    }
    return this.templates.update(id, {
      backPage: page,
      backPageWidth: info.width,
      backPageHeight: info.height,
    });
  }

  duplicate(id: string): TemplateWithPlaceholders {
    const source = this.get(id);
    if (!source) throw new Error("Template not found");
    const copy = this.templates.create(`${source.name} (Copy)`, source.printSettings);
    const patch: Parameters<TemplateRepository["update"]>[1] = {
      frontPdfPath: source.frontPdfPath,
      backPdfPath: source.backPdfPath,
      frontPage: source.frontPage,
      backPage: source.backPage,
      frontPageWidth: source.frontPageWidth,
      frontPageHeight: source.frontPageHeight,
      backPageWidth: source.backPageWidth,
      backPageHeight: source.backPageHeight,
    };
    this.templates.update(copy.id, patch);
    const placeholders = source.placeholders.map((p) => ({
      ...p,
      id: uuid(),
      templateId: copy.id,
    }));
    this.placeholders.replaceAll(copy.id, placeholders);
    return this.get(copy.id)!;
  }

  delete(id: string): void {
    const template = this.templates.getById(id);
    if (!template) throw new Error("Template not found");
    const dir = path.join(STORAGE_ROOT, "templates", id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    this.templates.delete(id);
  }

  savePlaceholders(id: string, placeholders: TemplateWithPlaceholders["placeholders"]) {
    if (!this.templates.getById(id)) throw new Error("Template not found");
    return this.placeholders.replaceAll(
      id,
      placeholders.map((p) => ({ ...p, templateId: id, id: p.id || uuid() }))
    );
  }
}
