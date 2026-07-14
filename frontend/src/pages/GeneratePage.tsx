import { useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  CsvColumnMapping,
  CsvProfile,
  ExportType,
  JobProgress,
  PhotoMatchMethod,
  PhotoValidationRow,
  PrintSettings,
  StudentRecord,
  Template,
} from "@id-formatter/shared";
import { PLACEHOLDER_LABELS, SCHOOL_CSV_FIELDS } from "@id-formatter/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Input, Label } from "@/components/ui/form";
import { api } from "@/services/api";
import { PreviewPanel } from "@/features/preview/PreviewPanel";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const MAP_KEYS = [
  ...SCHOOL_CSV_FIELDS.map((f) => f.key),
  "first_name",
  "middle_name",
  "last_name",
  "course",
  "year",
  "section",
  "qr",
  "barcode",
  "signature",
  "photo_filename",
] as const;

const MAP_LABELS: Record<string, string> = {
  ...Object.fromEntries(SCHOOL_CSV_FIELDS.map((f) => [f.key, f.label])),
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  course: "Course",
  year: "Year",
  section: "Section",
  qr: "QR Value",
  barcode: "Barcode Value",
  signature: "Signature",
  photo_filename: "Photo Filename",
};

export function GeneratePage() {
  const [step, setStep] = useState<Step>(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [csvFilename, setCsvFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [profiles, setProfiles] = useState<CsvProfile[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [photoSessionId, setPhotoSessionId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [matchMethod, setMatchMethod] = useState<PhotoMatchMethod>("student_number");
  const [validation, setValidation] = useState<PhotoValidationRow[]>([]);
  const [photoIndex, setPhotoIndex] = useState<Record<string, string>>({});
  const [exportTypes, setExportTypes] = useState<ExportType[]>(["pdf"]);
  const [printOverrides, setPrintOverrides] = useState<Partial<PrintSettings>>({});
  const [job, setJob] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photosSkipped, setPhotosSkipped] = useState(false);

  useEffect(() => {
    void Promise.all([api.get<Template[]>("/templates"), api.get<AppSettings>("/settings")]).then(
      ([t, s]) => {
        setTemplates(t);
        setSettings(s);
        setMatchMethod(s.photoMatchMethod);
        if (t[0]) setTemplateId(t[0].id);
      }
    );
  }, []);

  useEffect(() => {
    if (!templateId) return;
    void api.get<CsvProfile[]>(`/csv-profiles?templateId=${templateId}`).then(setProfiles);
  }, [templateId]);

  const photoSummary = useMemo(() => {
    const counts = { found: 0, missing: 0, duplicate: 0, unsupported: 0 };
    for (const row of validation) counts[row.status]++;
    return counts;
  }, [validation]);

  const parseCsv = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.upload<{
        filename: string;
        headers: string[];
        rows: Record<string, string>[];
        suggestedMapping: CsvColumnMapping;
      }>("/csv/parse", file);
      setCsvFilename(result.filename);
      setHeaders(result.headers);
      setRows(result.rows);
      setMapping(result.suggestedMapping);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV parse failed");
    } finally {
      setBusy(false);
    }
  };

  const applyMapping = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ students: StudentRecord[]; count: number }>("/csv/map", {
        rows,
        mapping,
      });
      setStudents(result.students);
      setPhotosSkipped(false);
      setPhotoSessionId(null);
      setPhotoCount(0);
      setValidation([]);
      setPhotoIndex({});
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping failed");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const name = prompt("Profile name?", "Default mapping");
    if (!name) return;
    await api.post("/csv-profiles", { templateId, name, mapping });
    setProfiles(await api.get<CsvProfile[]>(`/csv-profiles?templateId=${templateId}`));
  };

  const uploadZip = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.upload<{ sessionId: string; photoCount: number }>(
        "/photos/upload-zip",
        file
      );
      setPhotoSessionId(result.sessionId);
      setPhotoCount(result.photoCount);
      setPhotosSkipped(false);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ZIP upload failed");
    } finally {
      setBusy(false);
    }
  };

  const skipPhotos = () => {
    setError(null);
    setPhotosSkipped(true);
    setPhotoSessionId(null);
    setPhotoCount(0);
    setPhotoIndex({});
    setValidation(
      students.map((s) => ({
        studentNo: s.student_no,
        studentName: s.full_name || `${s.first_name} ${s.last_name}`.trim(),
        status: "missing" as const,
        matchedFilename: null,
      }))
    );
    setStep(5);
  };

  const runValidation = async () => {
    if (!photoSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ rows: PhotoValidationRow[]; photoIndex: Record<string, string> }>(
        "/photos/validate",
        { sessionId: photoSessionId, students, method: matchMethod }
      );
      setValidation(result.rows);
      setPhotoIndex(result.photoIndex);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  };

  const exportValidationCsv = () => {
    const lines = [
      "LRN Number,Student Name,Photo Status,Matched Filename",
      ...validation.map(
        (r) =>
          `${csvEscape(r.studentNo)},${csvEscape(r.studentName)},${r.status},${csvEscape(r.matchedFilename ?? "")}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photo-validation.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const startGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<JobProgress>("/generate", {
        templateId,
        students,
        photoIndex,
        exportTypes,
        printSettings: printOverrides,
        photoMatchMethod: matchMethod,
        missingPhotoPolicy: photosSkipped ? "blank" : settings?.missingPhotoPolicy,
        cropMode: settings?.cropMode,
        csvFilename,
      });
      setJob(created);
      setStep(6);

      const es = new EventSource(`/api/jobs/${created.id}/events`);
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data) as JobProgress;
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          es.close();
          setBusy(false);
        }
      };
      es.onerror = () => {
        es.close();
        setBusy(false);
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
      setBusy(false);
    }
  };

  const toggleExport = (type: ExportType) => {
    setExportTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Generate IDs</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Wizard: template → CSV → photos → validate → export
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Badge key={n} tone={step === n ? "ok" : "neutral"}>
            Step {n}
          </Badge>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select template & CSV</CardTitle>
            <CardDescription>Choose a configured template, then upload student CSV.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Template</Label>
              <select
                className="mt-1 h-10 w-full max-w-md rounded-md border border-[var(--color-line)] bg-white px-3"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Student CSV</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                className="mt-1 max-w-md"
                onChange={(e) => void parseCsv(e.target.files?.[0] ?? null)}
              />
            </div>
            {busy && <p className="text-sm text-[var(--color-muted)]">Parsing...</p>}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Map CSV columns</CardTitle>
            <CardDescription>
              File: {csvFilename} · {rows.length} rows · {headers.length} columns
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profiles.length > 0 && (
              <div>
                <Label>Load saved profile</Label>
                <select
                  className="mt-1 h-10 w-full max-w-md rounded-md border border-[var(--color-line)] bg-white px-3"
                  onChange={(e) => {
                    const p = profiles.find((x) => x.id === e.target.value);
                    if (p) setMapping(p.mapping);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select profile
                  </option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-sm text-[var(--color-muted)]">
              Expected CSV columns: School Name, Student Name, LRN Number, Student Grade Number,
              Birthday, Name of Guardian, Phone Number, Student Address. Photos match by LRN
              (e.g. <code>104423080181.jpg</code>).
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {MAP_KEYS.map((key) => (
                <div key={key}>
                  <Label className="text-xs">
                    {MAP_LABELS[key] ??
                      (key in PLACEHOLDER_LABELS
                        ? PLACEHOLDER_LABELS[key as keyof typeof PLACEHOLDER_LABELS]
                        : key)}{" "}
                    <span className="text-[var(--color-muted)]">{`{{${key}}}`}</span>
                  </Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-sm"
                    value={mapping[key] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[key] = e.target.value;
                        else delete next[key];
                        return next;
                      })
                    }
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="outline" onClick={() => void saveProfile()}>
                Save mapping profile
              </Button>
              <Button onClick={() => void applyMapping()} disabled={busy}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload student photos (ZIP)</CardTitle>
            <CardDescription>
              {students.length} students ready. Upload a ZIP of images, or skip photos for now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Photo matching method</Label>
              <select
                className="mt-1 h-10 w-full max-w-md rounded-md border border-[var(--color-line)] bg-white px-3"
                value={matchMethod}
                onChange={(e) => setMatchMethod(e.target.value as PhotoMatchMethod)}
              >
                <option value="student_number">LRN Number</option>
                <option value="photo_filename">Photo Filename</option>
              </select>
            </div>
            <Input
              type="file"
              accept=".zip,application/zip"
              className="max-w-md"
              onChange={(e) => void uploadZip(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="outline" onClick={skipPhotos}>
                Skip photos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Photos uploaded</CardTitle>
            <CardDescription>{photoCount} images extracted. Run matching validation.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button onClick={() => void runValidation()} disabled={busy}>
              Validate photos
            </Button>
          </CardContent>
        </Card>
      )}

      {step >= 5 && validation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{photosSkipped ? "Photos skipped" : "Photo validation"}</CardTitle>
            <CardDescription>
              {photosSkipped
                ? "Generating without student photos. Photo areas will be left blank."
                : `Found ${photoSummary.found} · Missing ${photoSummary.missing} · Duplicate ${photoSummary.duplicate} · Unsupported ${photoSummary.unsupported}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!photosSkipped && (
              <div className="max-h-72 overflow-auto rounded-md border border-[var(--color-line)]">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface)]">
                    <tr>
                      <th className="px-3 py-2">LRN</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.map((r) => (
                      <tr key={r.studentNo} className="border-t border-[var(--color-line)]">
                        <td className="px-3 py-1.5">{r.studentNo}</td>
                        <td className="px-3 py-1.5">{r.studentName}</td>
                        <td className="px-3 py-1.5">
                          <Badge
                            tone={
                              r.status === "found"
                                ? "ok"
                                : r.status === "missing"
                                  ? "danger"
                                  : "warn"
                            }
                          >
                            {statusLabel(r.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-[var(--color-muted)]">{r.matchedFilename ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!photosSkipped && (
                <Button variant="outline" onClick={exportValidationCsv}>
                  Export validation report
                </Button>
              )}
              {step === 5 && (
                <Button variant="secondary" onClick={() => setStep(photosSkipped ? 3 : 4)}>
                  Back
                </Button>
              )}
            </div>

            {step === 5 && (
              <div className="space-y-4 border-t border-[var(--color-line)] pt-4">
                <h3 className="font-semibold">Export options</h3>
                <div className="flex flex-wrap gap-4">
                  {(["pdf", "png", "zip"] as ExportType[]).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={exportTypes.includes(t)}
                        onChange={() => toggleExport(t)}
                      />
                      {t.toUpperCase()}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <NumField
                    label="ID width (mm)"
                    value={printOverrides.idWidthMm ?? settings?.defaultPrintSettings.idWidthMm}
                    onChange={(v) => setPrintOverrides((p) => ({ ...p, idWidthMm: v }))}
                  />
                  <NumField
                    label="ID height (mm)"
                    value={printOverrides.idHeightMm ?? settings?.defaultPrintSettings.idHeightMm}
                    onChange={(v) => setPrintOverrides((p) => ({ ...p, idHeightMm: v }))}
                  />
                  <NumField
                    label="Margin (mm)"
                    value={printOverrides.marginMm ?? settings?.defaultPrintSettings.marginMm}
                    onChange={(v) => setPrintOverrides((p) => ({ ...p, marginMm: v }))}
                  />
                </div>
                <p className="text-xs text-[var(--color-muted)]">
                  {photosSkipped
                    ? "Photos skipped — photo placeholders will be left blank."
                    : `Missing photos policy: ${settings?.missingPhotoPolicy}. Change in Settings.`}
                </p>
                <Button onClick={() => void startGenerate()} disabled={busy || exportTypes.length === 0}>
                  Generate {students.length} IDs
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 6 && job && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Generation progress</CardTitle>
              <CardDescription>{job.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-[var(--color-brand)] transition-all"
                  style={{ width: `${Math.round(job.progress * 100)}%` }}
                />
              </div>
              <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>
                {job.status}
              </Badge>
              {job.error && <p className="text-sm text-[var(--color-danger)]">{job.error}</p>}
              {job.status === "completed" && job.result && (
                <div className="flex flex-wrap gap-2">
                  {job.result.pdfUrl && (
                    <Button asChild>
                      <a href={job.result.pdfUrl} target="_blank" rel="noreferrer">
                        Download PDF
                      </a>
                    </Button>
                  )}
                  {job.result.zipUrl && (
                    <Button variant="secondary" asChild>
                      <a href={job.result.zipUrl} download>
                        Download ZIP
                      </a>
                    </Button>
                  )}
                  {job.result.pdfUrl && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const w = window.open(job.result?.pdfUrl);
                        w?.print();
                      }}
                    >
                      Print
                    </Button>
                  )}
                  <p className="w-full text-sm text-[var(--color-muted)]">
                    Generated {job.result.generatedCount} IDs
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <PreviewPanel
            previewPages={job.result?.previewPages ?? []}
            students={students}
            pdfUrl={job.result?.pdfUrl}
          />
        </div>
      )}
    </div>
  );
}

function statusLabel(status: PhotoValidationRow["status"]): string {
  switch (status) {
    case "found":
      return "Photo Found";
    case "missing":
      return "Missing Photo";
    case "duplicate":
      return "Duplicate Photo";
    case "unsupported":
      return "Unsupported Format";
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
