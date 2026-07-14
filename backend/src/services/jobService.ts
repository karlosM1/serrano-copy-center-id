import type { EventEmitter } from "events";
import { EventEmitter as EE } from "events";
import type { GenerateRequest, JobProgress } from "@id-formatter/shared";
import { JobRepository, HistoryRepository, SettingsRepository, TemplateRepository, PlaceholderRepository } from "../repositories";
import { ExportService } from "./exportService";

type JobListener = (job: JobProgress) => void;

export class JobService {
  private jobs = new JobRepository();
  private history = new HistoryRepository();
  private settings = new SettingsRepository();
  private templates = new TemplateRepository();
  private placeholders = new PlaceholderRepository();
  private exporter = new ExportService();
  private emitters = new Map<string, EventEmitter>();
  private queue: string[] = [];
  private running = false;

  get(id: string): JobProgress | null {
    return this.jobs.getById(id);
  }

  subscribe(id: string, listener: JobListener): () => void {
    let emitter = this.emitters.get(id);
    if (!emitter) {
      emitter = new EE();
      this.emitters.set(id, emitter);
    }
    emitter.on("update", listener);
    return () => {
      emitter?.off("update", listener);
    };
  }

  private emit(job: JobProgress): void {
    this.emitters.get(job.id)?.emit("update", job);
  }

  enqueueGenerate(request: GenerateRequest): JobProgress {
    const job = this.jobs.create("generate");
    this.queue.push(job.id);
    void this.processQueue(request, job.id);
    return job;
  }

  private async processQueue(request: GenerateRequest, jobId: string): Promise<void> {
    if (this.running) {
      // Wait until our turn — simple sequential queue
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.running && this.queue[0] === jobId) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    this.running = true;
    try {
      await this.runGenerate(jobId, request);
    } finally {
      this.queue = this.queue.filter((id) => id !== jobId);
      this.running = false;
    }
  }

  private async runGenerate(jobId: string, request: GenerateRequest): Promise<void> {
    const update = (patch: Parameters<JobRepository["update"]>[1]) => {
      const job = this.jobs.update(jobId, patch);
      this.emit(job);
      return job;
    };

    try {
      update({ status: "running", progress: 0.01, message: "Starting generation..." });

      const template = this.templates.getById(request.templateId);
      if (!template) throw new Error("Template not found");
      if (!template.frontPdfPath) throw new Error("Front PDF is required");

      const full = {
        ...template,
        placeholders: this.placeholders.listByTemplate(template.id),
      };

      const settings = this.settings.get();
      const printSettings = {
        ...settings.defaultPrintSettings,
        ...template.printSettings,
        ...request.printSettings,
      };

      const photoIndexPaths = request.photoIndex;
      // photoIndex values may already be absolute paths from upload step

      const result = await this.exporter.generate({
        template: full,
        students: request.students,
        photoPaths: photoIndexPaths,
        printSettings,
        exportTypes: request.exportTypes.length > 0 ? request.exportTypes : ["pdf"],
        cropMode: request.cropMode ?? settings.cropMode,
        missingPhotoPolicy: request.missingPhotoPolicy ?? settings.missingPhotoPolicy,
        roundCorners: settings.roundPhotoCorners,
        cornerRadius: settings.photoCornerRadiusPx,
        dpi: settings.dpi,
        onProgress: (progress, message) => {
          update({ progress, message });
        },
      });

      const exportType = request.exportTypes.includes("zip")
        ? "zip"
        : request.exportTypes.includes("png")
          ? "png"
          : "pdf";

      const history = this.history.create({
        templateId: template.id,
        templateName: template.name,
        csvFilename: request.csvFilename,
        generatedCount: result.generatedCount,
        exportType,
        operator: settings.operatorName,
        outputPaths: {
          pdf: result.pdfPath,
          zip: result.zipPath,
          pngDir: result.pngDir,
        },
        status: "completed",
      });

      update({
        status: "completed",
        progress: 1,
        message: "Completed",
        result: {
          historyId: history.id,
          pdfUrl: result.pdfPath,
          zipUrl: result.zipPath,
          pngDirUrl: result.pngDir,
          generatedCount: result.generatedCount,
          previewPages: result.previewPages,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      update({ status: "failed", error: message, message: "Failed", progress: 1 });
    }
  }
}

export const jobService = new JobService();
