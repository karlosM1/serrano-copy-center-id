import { useMemo, useState } from "react";
import type { StudentRecord } from "@id-formatter/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/form";

interface PreviewPanelProps {
  previewPages: string[];
  students: StudentRecord[];
  pdfUrl?: string;
}

export function PreviewPanel({ previewPages, students, pdfUrl }: PreviewPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"sheet" | "search">("sheet");

  const match = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return students.find(
      (s) =>
        s.student_no.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q)
    );
  }, [query, students]);

  const current = previewPages[page] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "sheet" ? "default" : "secondary"} onClick={() => setMode("sheet")}>
            A4 sheet
          </Button>
          <Button size="sm" variant={mode === "search" ? "default" : "secondary"} onClick={() => setMode("search")}>
            Search student
          </Button>
        </div>

        {mode === "search" && (
          <div>
            <Label>Search</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Student number or name"
            />
            {match ? (
              <p className="mt-2 text-sm">
                {match.student_no} — {match.full_name}
              </p>
            ) : (
              query && <p className="mt-2 text-sm text-[var(--color-muted)]">No match</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Zoom</Label>
          <Input
            type="range"
            min={0.4}
            max={2}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-8 w-32"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </Button>
          <span className="text-xs text-[var(--color-muted)]">
            {previewPages.length ? `${page + 1}/${previewPages.length}` : "0/0"}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= previewPages.length - 1}
            onClick={() => setPage((p) => Math.min(previewPages.length - 1, p + 1))}
          >
            Next
          </Button>
          {page % 2 === 0 ? (
            <span className="text-xs">Front</span>
          ) : (
            <span className="text-xs">Back</span>
          )}
        </div>

        <div className="max-h-[70vh] overflow-auto rounded-md border border-[var(--color-line)] bg-[#0f172a]/5 p-3">
          {current ? (
            <img
              src={current}
              alt={`Preview page ${page + 1}`}
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="origin-top-left shadow"
            />
          ) : pdfUrl ? (
            <iframe title="PDF preview" src={pdfUrl} className="h-[60vh] w-full rounded bg-white" />
          ) : (
            <p className="text-sm text-[var(--color-muted)]">Preview will appear when generation finishes.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
