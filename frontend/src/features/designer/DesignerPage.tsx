import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Transformer,
  Image as KonvaImage,
  Group,
} from "react-konva";
import type Konva from "konva";
import type {
  PlaceholderKind,
  PlaceholderMapping,
  TemplateSide,
  TemplateWithPlaceholders,
} from "@id-formatter/shared";
import { PLACEHOLDER_LABELS, TEXT_PLACEHOLDERS, IMAGE_PLACEHOLDERS } from "@id-formatter/shared";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  Save,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Badge } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { DesignerPreview } from "@/features/designer/DesignerPreview";
import { useHtmlImage } from "@/features/designer/useHtmlImage";
import { api } from "@/services/api";
import { uuid } from "@/lib/uuid";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const ALL_KINDS = [...TEXT_PLACEHOLDERS, ...IMAGE_PLACEHOLDERS] as PlaceholderKind[];

export function DesignerPage() {
  const { id = "" } = useParams();
  const [template, setTemplate] = useState<TemplateWithPlaceholders | null>(null);
  const [side, setSide] = useState<TemplateSide>("front");
  const [placeholders, setPlaceholders] = useState<PlaceholderMapping[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const load = useCallback(async () => {
    const t = await api.get<TemplateWithPlaceholders>(`/templates/${id}`);
    setTemplate(t);
    setPlaceholders(t.placeholders);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageWidth = side === "front" ? template?.frontPageWidth ?? 153 : template?.backPageWidth ?? 153;
  const pageHeight = side === "front" ? template?.frontPageHeight ?? 244 : template?.backPageHeight ?? 244;
  const pdfPath = side === "front" ? template?.frontPdfPath : template?.backPdfPath;
  const pageNum = side === "front" ? template?.frontPage ?? 1 : template?.backPage ?? 1;

  useEffect(() => {
    let cancelled = false;
    async function renderBg() {
      if (!pdfPath) {
        setBgUrl(null);
        return;
      }
      const loadingTask = pdfjs.getDocument(pdfPath);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNum);
      // Use unrotated MediaBox size so Konva coords match pdf-lib composition
      const baseViewport = page.getViewport({ scale: 1, rotation: 0 });
      const renderScale = 2;
      const viewport = page.getViewport({ scale: renderScale, rotation: 0 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) {
        // Keep template dimensions in sync with the MediaBox we render against
        setTemplate((prev) => {
          if (!prev) return prev;
          if (side === "front") {
            if (
              Math.abs(prev.frontPageWidth - baseViewport.width) < 0.5 &&
              Math.abs(prev.frontPageHeight - baseViewport.height) < 0.5
            ) {
              return prev;
            }
            return {
              ...prev,
              frontPageWidth: baseViewport.width,
              frontPageHeight: baseViewport.height,
            };
          }
          if (
            Math.abs(prev.backPageWidth - baseViewport.width) < 0.5 &&
            Math.abs(prev.backPageHeight - baseViewport.height) < 0.5
          ) {
            return prev;
          }
          return {
            ...prev,
            backPageWidth: baseViewport.width,
            backPageHeight: baseViewport.height,
          };
        });
        setBgUrl(canvas.toDataURL("image/png"));
      }
    }
    void renderBg().catch((e) => setError(e instanceof Error ? e.message : "PDF preview failed"));
    return () => {
      cancelled = true;
    };
  }, [pdfPath, pageNum, side]);

  const bgImage = useHtmlImage(bgUrl);

  const sidePlaceholders = useMemo(
    () => placeholders.filter((p) => p.side === side).sort((a, b) => a.zIndex - b.zIndex),
    [placeholders, side]
  );

  const selected = placeholders.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    if (node && !(selected?.locked)) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, selected?.locked, sidePlaceholders]);

  const updatePlaceholder = (pid: string, patch: Partial<PlaceholderMapping>) => {
    setPlaceholders((prev) => prev.map((p) => (p.id === pid ? { ...p, ...patch } : p)));
  };

  const addPlaceholder = (name: PlaceholderKind) => {
    const isImage = IMAGE_PLACEHOLDERS.includes(name);
    const next: PlaceholderMapping = {
      id: uuid(),
      templateId: id,
      side,
      name,
      x: 40,
      y: 40,
      width: isImage ? 80 : 140,
      height: isImage ? 100 : 24,
      rotation: 0,
      font: "Helvetica",
      fontSize: 12,
      fontWeight: "normal",
      color: "#000000",
      alignment: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      locked: false,
      zIndex: placeholders.length,
    };
    setPlaceholders((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await api.put<PlaceholderMapping[]>(`/templates/${id}/placeholders`, {
        placeholders,
      });
      setPlaceholders(saved);
      setMessage("Placeholders saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadPdf = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const t = await api.upload<TemplateWithPlaceholders>(`/templates/${id}/pdfs/${side}`, file, {
        page: "1",
      });
      setTemplate({ ...t, placeholders });
      setMessage(`${side} PDF uploaded`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const setPage = async (page: number) => {
    const t = await api.put<TemplateWithPlaceholders>(`/templates/${id}/pages/${side}`, { page });
    setTemplate({ ...t, placeholders });
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...selected, id: uuid(), x: selected.x + 10, y: selected.y + 10, zIndex: placeholders.length };
    setPlaceholders((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    setPlaceholders((prev) => prev.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  };

  const bring = (dir: "forward" | "backward") => {
    if (!selected) return;
    const sorted = [...sidePlaceholders].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((p) => p.id === selected.id);
    if (idx < 0) return;
    const swapWith = dir === "forward" ? idx + 1 : idx - 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[swapWith]!;
    updatePlaceholder(a.id, { zIndex: b.zIndex });
    updatePlaceholder(b.id, { zIndex: a.zIndex });
  };

  if (!template) {
    return <p className="text-[var(--color-muted)]">Loading designer...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-[var(--color-muted)]">
            <Link to="/templates" className="hover:underline">
              Templates
            </Link>{" "}
            / Designer
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">{template.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={side === "front" ? "default" : "secondary"} onClick={() => setSide("front")}>
            Front
          </Button>
          <Button variant={side === "back" ? "default" : "secondary"} onClick={() => setSide("back")}>
            Back
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {(message || error) && (
        <p className={error ? "text-sm text-[var(--color-danger)]" : "text-sm text-[var(--color-ok)]"}>
          {error ?? message}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[220px_1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add placeholder</CardTitle>
          </CardHeader>
          <CardContent className="flex max-h-[70vh] flex-col gap-1 overflow-auto">
            {ALL_KINDS.map((kind) => (
              <Button key={kind} variant="ghost" className="justify-start" onClick={() => addPlaceholder(kind)}>
                {`{{${kind}}}`}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Canvas</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Zoom</Label>
              <Input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="h-8 w-32"
              />
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => void uploadPdf(e.target.files?.[0] ?? null)}
                className="h-8 max-w-[200px] text-xs"
              />
              <Input
                type="number"
                min={1}
                value={pageNum}
                onChange={(e) => void setPage(Number(e.target.value))}
                className="h-8 w-16"
                title="PDF page"
              />
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[70vh] flex-col gap-4 overflow-auto bg-[var(--color-surface)] p-3">
            <div className="shrink-0 overflow-auto rounded-md bg-[#111]/5 p-3">
              <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">Editor</p>
              <Stage
                width={pageWidth * scale}
                height={pageHeight * scale}
                scaleX={scale}
                scaleY={scale}
                ref={stageRef}
                onMouseDown={(e) => {
                  if (e.target === e.target.getStage()) setSelectedId(null);
                }}
                className="bg-white shadow"
              >
                <Layer>
                  {bgImage ? (
                    <KonvaImage image={bgImage} width={pageWidth} height={pageHeight} listening={false} />
                  ) : (
                    <Rect width={pageWidth} height={pageHeight} fill="#f1f5f9" />
                  )}
                  {sidePlaceholders.map((p) => {
                    const isImage = IMAGE_PLACEHOLDERS.includes(p.name);
                    return (
                      <Group
                        key={p.id}
                        id={p.id}
                        x={p.x}
                        y={p.y}
                        width={p.width}
                        height={p.height}
                        rotation={p.rotation}
                        draggable={!p.locked}
                        onClick={() => setSelectedId(p.id)}
                        onTap={() => setSelectedId(p.id)}
                        onDragEnd={(e) => {
                          updatePlaceholder(p.id, { x: e.target.x(), y: e.target.y() });
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          const sx = node.scaleX();
                          const sy = node.scaleY();
                          node.scaleX(1);
                          node.scaleY(1);
                          updatePlaceholder(p.id, {
                            x: node.x(),
                            y: node.y(),
                            rotation: node.rotation(),
                            width: Math.max(10, node.width() * sx),
                            height: Math.max(10, node.height() * sy),
                          });
                        }}
                      >
                        <Rect
                          width={p.width}
                          height={p.height}
                          stroke={selectedId === p.id ? "#0b6e4f" : "#94a3b8"}
                          dash={[4, 4]}
                          fill={isImage ? "rgba(11,110,79,0.12)" : "rgba(255,255,255,0.35)"}
                        />
                        <Text
                          text={PLACEHOLDER_LABELS[p.name]}
                          width={p.width}
                          height={p.height}
                          fontSize={Math.min(p.fontSize, Math.max(8, p.height * 0.7))}
                          fill={p.color}
                          fontStyle={p.fontWeight === "bold" ? "bold" : "normal"}
                          align={p.alignment}
                          verticalAlign="middle"
                          padding={2}
                          listening={false}
                          wrap="none"
                          ellipsis
                        />
                      </Group>
                    );
                  })}
                  <Transformer
                    ref={trRef}
                    rotateEnabled
                    enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                  />
                </Layer>
              </Stage>
            </div>

            <DesignerPreview
              side={side}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              bgUrl={bgUrl}
              placeholders={placeholders}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layers</CardTitle>
            </CardHeader>
            <CardContent className="max-h-48 space-y-1 overflow-auto">
              {[...sidePlaceholders].reverse().map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                    selectedId === p.id ? "bg-[var(--color-brand)]/10" : "hover:bg-black/5"
                  }`}
                >
                  <span>{`{{${p.name}}}`}</span>
                  {p.locked ? <Lock className="h-3 w-3" /> : null}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected && <p className="text-sm text-[var(--color-muted)]">Select a placeholder</p>}
              {selected && (
                <>
                  <Badge>{`{{${selected.name}}}`}</Badge>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={duplicateSelected}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={deleteSelected}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updatePlaceholder(selected.id, { locked: !selected.locked })}
                    >
                      {selected.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bring("forward")}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bring("backward")}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <SliderField
                    label="X"
                    value={selected.x}
                    min={0}
                    max={Math.max(0, pageWidth - selected.width)}
                    onChange={(v) => updatePlaceholder(selected.id, { x: v })}
                  />
                  <SliderField
                    label="Y"
                    value={selected.y}
                    min={0}
                    max={Math.max(0, pageHeight - selected.height)}
                    onChange={(v) => updatePlaceholder(selected.id, { y: v })}
                  />
                  <SliderField
                    label="Width"
                    value={selected.width}
                    min={10}
                    max={Math.max(10, pageWidth - selected.x)}
                    onChange={(v) => updatePlaceholder(selected.id, { width: v })}
                  />
                  <SliderField
                    label="Height"
                    value={selected.height}
                    min={10}
                    max={Math.max(10, pageHeight - selected.y)}
                    onChange={(v) => updatePlaceholder(selected.id, { height: v })}
                  />
                  <Field
                    label="Rotation"
                    value={selected.rotation}
                    onChange={(v) => updatePlaceholder(selected.id, { rotation: v })}
                  />
                  {!IMAGE_PLACEHOLDERS.includes(selected.name) && (
                    <>
                      <Field
                        label="Font size"
                        value={selected.fontSize}
                        onChange={(v) => updatePlaceholder(selected.id, { fontSize: v })}
                      />
                      <div>
                        <Label className="text-xs">Color</Label>
                        <Input
                          type="color"
                          value={selected.color}
                          onChange={(e) => updatePlaceholder(selected.id, { color: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Weight</Label>
                        <select
                          className="h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-2"
                          value={selected.fontWeight}
                          onChange={(e) =>
                            updatePlaceholder(selected.id, {
                              fontWeight: e.target.value as "normal" | "bold",
                            })
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Align</Label>
                        <select
                          className="h-10 w-full rounded-md border border-[var(--color-line)] bg-white px-2"
                          value={selected.alignment}
                          onChange={(e) =>
                            updatePlaceholder(selected.id, {
                              alignment: e.target.value as "left" | "center" | "right",
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                      <Field
                        label="Line height"
                        value={selected.lineHeight}
                        step={0.1}
                        onChange={(v) => updatePlaceholder(selected.id, { lineHeight: v })}
                      />
                      <Field
                        label="Letter spacing"
                        value={selected.letterSpacing}
                        onChange={(v) => updatePlaceholder(selected.id, { letterSpacing: v })}
                      />
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
  step = 0.5,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const safeMax = Math.max(min, max);
  const clamped = Math.min(safeMax, Math.max(min, Number.isFinite(value) ? value : min));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="tabular-nums text-xs text-[var(--color-muted)]">{clamped.toFixed(1)}</span>
      </div>
      <Slider
        min={min}
        max={safeMax}
        step={step}
        value={[clamped]}
        onValueChange={(vals) => onChange(vals[0] ?? min)}
        disabled={safeMax <= min}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
