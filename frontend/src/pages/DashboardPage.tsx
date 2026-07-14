import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GenerationHistoryRecord, Template } from "@id-formatter/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui/form";
import { api } from "@/services/api";
import { formatDate } from "@/lib/utils";

export function DashboardPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<GenerationHistoryRecord[]>([]);

  useEffect(() => {
    void Promise.all([
      api.get<Template[]>("/templates"),
      api.get<GenerationHistoryRecord[]>("/history"),
    ]).then(([t, h]) => {
      setTemplates(t.slice(0, 5));
      setHistory(h.slice(0, 5));
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[var(--color-muted)]">Upload templates, map CSV data, and print IDs in minutes.</p>
        </div>
        <Button asChild>
          <Link to="/generate">Generate IDs</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Templates</CardDescription>
            <CardTitle className="text-3xl">{templates.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Recent jobs</CardDescription>
            <CardTitle className="text-3xl">{history.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Workflow</CardDescription>
            <CardTitle className="text-base font-medium">
              Templates → Designer → CSV → Photos → Export
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent templates</CardTitle>
            <CardDescription>Reuse saved front/back designs and mappings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.length === 0 && <p className="text-sm text-[var(--color-muted)]">No templates yet.</p>}
            {templates.map((t) => (
              <Link
                key={t.id}
                to={`/templates/${t.id}/designer`}
                className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2 hover:bg-[var(--color-surface)]"
              >
                <span className="font-medium">{t.name}</span>
                <Badge>{formatDate(t.updatedAt)}</Badge>
              </Link>
            ))}
            <Button variant="secondary" asChild className="mt-2">
              <Link to="/templates">Manage templates</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation history</CardTitle>
            <CardDescription>Latest print batches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length === 0 && <p className="text-sm text-[var(--color-muted)]">No generations yet.</p>}
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2"
              >
                <div>
                  <div className="font-medium">{h.templateName}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {h.generatedCount} IDs · {h.exportType} · {h.operator}
                  </div>
                </div>
                <Badge tone={h.status === "completed" ? "ok" : "warn"}>{h.status}</Badge>
              </div>
            ))}
            <Button variant="secondary" asChild className="mt-2">
              <Link to="/history">View history</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
