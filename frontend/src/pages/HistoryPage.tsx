import { useEffect, useState } from "react";
import type { GenerationHistoryRecord } from "@id-formatter/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/form";
import { api } from "@/services/api";
import { formatDate } from "@/lib/utils";

export function HistoryPage() {
  const [rows, setRows] = useState<GenerationHistoryRecord[]>([]);

  useEffect(() => {
    void api.get<GenerationHistoryRecord[]>("/history").then(setRows);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">History</h1>
        <p className="mt-1 text-[var(--color-muted)]">Past generation batches and downloads.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generation history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Operator</th>
                <th className="px-2 py-2">Template</th>
                <th className="px-2 py-2">CSV</th>
                <th className="px-2 py-2">IDs</th>
                <th className="px-2 py-2">Export</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-line)]">
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-2 py-2">{r.operator}</td>
                  <td className="px-2 py-2">{r.templateName}</td>
                  <td className="px-2 py-2">{r.csvFilename}</td>
                  <td className="px-2 py-2">{r.generatedCount}</td>
                  <td className="px-2 py-2 uppercase">{r.exportType}</td>
                  <td className="px-2 py-2">
                    <Badge tone={r.status === "completed" ? "ok" : "warn"}>{r.status}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.outputPaths.pdf && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={r.outputPaths.pdf} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        </Button>
                      )}
                      {r.outputPaths.zip && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={r.outputPaths.zip} download>
                            ZIP
                          </a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-[var(--color-muted)]">No history yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
