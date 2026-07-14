import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Template } from "@id-formatter/shared";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/form";
import { Input } from "@/components/ui/form";
import { api } from "@/services/api";
import { formatDate } from "@/lib/utils";

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setTemplates(await api.get<Template[]>("/templates"));
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<Template>("/templates", { name: name || "Untitled Template" });
      setName("");
      await load();
      window.location.href = `/templates/${t.id}/designer`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (id: string) => {
    await api.post(`/templates/${id}/duplicate`);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Templates</h1>
        <p className="mt-1 text-[var(--color-muted)]">Create and reuse ID designs with placeholder mappings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create template</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => void create()} disabled={busy}>
            <Plus className="h-4 w-4" /> New template
          </Button>
          {error && <p className="w-full text-sm text-[var(--color-danger)]">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                  <Badge tone={t.frontPdfPath ? "ok" : "warn"}>
                    Front {t.frontPdfPath ? "ready" : "missing"}
                  </Badge>
                  <Badge tone={t.backPdfPath ? "ok" : "neutral"}>
                    Back {t.backPdfPath ? "ready" : "optional"}
                  </Badge>
                  <span>Updated {formatDate(t.updatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" asChild>
                  <Link to={`/templates/${t.id}/designer`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => void duplicate(t.id)}>
                  <Copy className="h-4 w-4" /> Duplicate
                </Button>
                <Button variant="danger" onClick={() => void remove(t.id)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No templates yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
