import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import { STORAGE_ROOT } from "../database";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(STORAGE_ROOT, "uploads"));
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuid()}-${file.originalname}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});
