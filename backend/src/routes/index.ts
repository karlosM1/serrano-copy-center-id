import { Router } from "express";
import { upload } from "../middlewares/upload";
import * as templates from "../controllers/templateController";
import * as workflow from "../controllers/workflowController";

export const apiRouter = Router();

apiRouter.get("/templates", templates.listTemplates);
apiRouter.post("/templates", templates.createTemplate);
apiRouter.get("/templates/:id", templates.getTemplate);
apiRouter.put("/templates/:id", templates.updateTemplate);
apiRouter.delete("/templates/:id", templates.deleteTemplate);
apiRouter.post("/templates/:id/duplicate", templates.duplicateTemplate);
apiRouter.post("/templates/:id/pdfs/:side", upload.single("file"), templates.uploadTemplatePdf);
apiRouter.put("/templates/:id/pages/:side", templates.setTemplatePage);
apiRouter.get("/templates/:id/placeholders", templates.getPlaceholders);
apiRouter.put("/templates/:id/placeholders", templates.savePlaceholders);
apiRouter.get("/templates/:id/preview/:side", templates.previewTemplatePage);

apiRouter.post("/csv/parse", upload.single("file"), workflow.parseCsv);
apiRouter.post("/csv/map", workflow.mapCsv);
apiRouter.get("/csv-profiles", workflow.listCsvProfiles);
apiRouter.post("/csv-profiles", workflow.createCsvProfile);
apiRouter.delete("/csv-profiles/:id", workflow.deleteCsvProfile);

apiRouter.post("/photos/upload-zip", upload.single("file"), workflow.uploadPhotosZip);
apiRouter.post("/photos/validate", workflow.validatePhotos);

apiRouter.post("/generate", workflow.startGenerate);
apiRouter.get("/jobs/:id", workflow.getJob);
apiRouter.get("/jobs/:id/events", workflow.jobEvents);

apiRouter.get("/history", workflow.listHistory);
apiRouter.get("/history/:id", workflow.getHistory);

apiRouter.get("/settings", workflow.getSettings);
apiRouter.put("/settings", workflow.updateSettings);
