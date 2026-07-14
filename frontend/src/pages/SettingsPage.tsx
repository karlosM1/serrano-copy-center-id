import { useEffect, useState } from "react";
import type { AppSettings, MissingPhotoPolicy, PhotoMatchMethod, CropMode } from "@id-formatter/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui/form";
import { api } from "@/services/api";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<AppSettings>("/settings").then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const next = await api.put<AppSettings>("/settings", settings);
      setSettings(next);
      setMessage("Settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="text-[var(--color-muted)]">Loading settings...</p>;

  const print = settings.defaultPrintSettings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-[var(--color-muted)]">Defaults for printing, photos, and operator name.</p>
      </div>

      {(message || error) && (
        <p className={error ? "text-sm text-[var(--color-danger)]" : "text-sm text-[var(--color-ok)]"}>
          {error ?? message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Operator</CardTitle>
        </CardHeader>
        <CardContent>
          <Label>Operator name</Label>
          <Input
            className="mt-1 max-w-md"
            value={settings.operatorName}
            onChange={(e) => setSettings({ ...settings, operatorName: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>Matching and missing-photo behavior</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Photo matching method</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-3"
              value={settings.photoMatchMethod}
              onChange={(e) =>
                setSettings({ ...settings, photoMatchMethod: e.target.value as PhotoMatchMethod })
              }
            >
              <option value="student_number">LRN Number (filename = LRN)</option>
              <option value="photo_filename">Photo Filename column</option>
            </select>
          </div>
          <div>
            <Label>Missing photo policy</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-3"
              value={settings.missingPhotoPolicy}
              onChange={(e) =>
                setSettings({ ...settings, missingPhotoPolicy: e.target.value as MissingPhotoPolicy })
              }
            >
              <option value="placeholder">Use Placeholder Image</option>
              <option value="blank">Leave Blank</option>
              <option value="skip">Skip Student</option>
            </select>
          </div>
          <div>
            <Label>Crop mode</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-3"
              value={settings.cropMode}
              onChange={(e) => setSettings({ ...settings, cropMode: e.target.value as CropMode })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
          <div>
            <Label>Output DPI</Label>
            <Input
              type="number"
              className="mt-1"
              value={settings.dpi}
              onChange={(e) => setSettings({ ...settings, dpi: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Image quality</Label>
            <Input
              type="number"
              className="mt-1"
              value={settings.quality}
              onChange={(e) => setSettings({ ...settings, quality: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={settings.roundPhotoCorners}
              onChange={(e) => setSettings({ ...settings, roundPhotoCorners: e.target.checked })}
            />
            <Label>Rounded photo corners</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Print layout (A4)</CardTitle>
          <CardDescription>2 columns × 5 rows by default (10 IDs per sheet)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Num
            label="Columns"
            value={print.columns}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, columns: v },
              })
            }
          />
          <Num
            label="Rows"
            value={print.rows}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, rows: v },
              })
            }
          />
          <Num
            label="ID width (mm)"
            value={print.idWidthMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, idWidthMm: v },
              })
            }
          />
          <Num
            label="ID height (mm)"
            value={print.idHeightMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, idHeightMm: v },
              })
            }
          />
          <Num
            label="Margin (mm)"
            value={print.marginMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, marginMm: v },
              })
            }
          />
          <Num
            label="Gap X (mm)"
            value={print.gapXMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, gapXMm: v },
              })
            }
          />
          <Num
            label="Gap Y (mm)"
            value={print.gapYMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, gapYMm: v },
              })
            }
          />
          <Num
            label="Bleed (mm)"
            value={print.bleedMm}
            onChange={(v) =>
              setSettings({
                ...settings,
                defaultPrintSettings: { ...print, bleedMm: v },
              })
            }
          />
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={print.cropMarks}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultPrintSettings: { ...print, cropMarks: e.target.checked },
                })
              }
            />
            <Label>Crop marks</Label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" className="mt-1" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
