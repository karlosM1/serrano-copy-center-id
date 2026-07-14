import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createCanvas } from "@napi-rs/canvas";

async function main(): Promise<void> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = path.resolve(__dirname, "../../../node_modules/pdfjs-dist");
  const outDir = path.resolve(__dirname, "../../../samples/id-templates/previews");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of ["FRONT.pdf", "BACK.pdf"]) {
    const file = path.resolve(__dirname, "../../../samples/id-templates", name);
    const data = new Uint8Array(fs.readFileSync(file));
    const pdf = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: pathToFileURL(path.join(root, "standard_fonts") + path.sep).href,
      cMapUrl: pathToFileURL(path.join(root, "cmaps") + path.sep).href,
      cMapPacked: true,
      disableFontFace: true,
    }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    console.log(name, "viewport", viewport.width, "x", viewport.height, "rotate", page.rotate);
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const out = path.join(outDir, name.replace(".pdf", ".png"));
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("wrote", out);
    await pdf.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
