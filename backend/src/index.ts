import express from "express";
import cors from "cors";
import path from "path";
import { ensureStorageDirs, STORAGE_ROOT, getDb } from "./database";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

const PORT = Number(process.env.PORT ?? 3001);

ensureStorageDirs();
getDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/storage", express.static(STORAGE_ROOT));
app.use("/api", apiRouter);
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "ID Formatter API" });
});
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`ID Formatter API listening on http://localhost:${PORT}`);
  console.log(`Storage: ${path.resolve(STORAGE_ROOT)}`);
});
