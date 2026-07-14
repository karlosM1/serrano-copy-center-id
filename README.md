# ID Formatter

Production-ready local Student ID generator for copy-center workflows.

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, react-konva, pdf.js
- **Backend:** Node.js, Express, TypeScript, SQLite (better-sqlite3), pdf-lib, Sharp, JSZip

## Quick start

```bash
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001

## Workflow

1. **Templates** — create a template and open the designer
2. Upload front (and optional back) PDF designs
3. Place placeholders (`{{full_name}}`, `{{photo}}`, `{{qr}}`, etc.)
4. **Generate IDs** — upload CSV, map columns, upload photo ZIP
5. Validate photo matches, generate A4 duplex print PDF (2×5 / 10 IDs per page)
6. Download PDF / PNG ZIP and review **History**

## Settings

Configure operator name, missing-photo policy, crop mode, DPI, and print layout under **Settings**.

## Sample fixtures

```bash
npm run smoke
```

Creates sample PDFs, CSV, and photos under `backend/fixtures/` and runs a headless generation smoke test (PDF + PNG ZIP).
