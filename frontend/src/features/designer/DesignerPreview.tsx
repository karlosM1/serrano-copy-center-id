import { useMemo } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from "react-konva";
import type { PlaceholderMapping, TemplateSide } from "@id-formatter/shared";
import { IMAGE_PLACEHOLDERS } from "@id-formatter/shared";
import { useHtmlImage } from "./useHtmlImage";

const SAMPLE_DATA: Record<string, string> = {
  school_name: "Crimson School",
  student_no: "104423080181",
  first_name: "Maria",
  middle_name: "Antoniette",
  last_name: "Olivar",
  full_name: "Maria Antoniette B. Olivar",
  course: "",
  year: "6",
  grade: "6",
  section: "A",
  birthday: "2013-05-12",
  address: "123 Mabini St, Quezon City",
  guardian: "Maria Dela Cruz",
  contact: "09171234567",
  qr: "104423080181",
  barcode: "104423080181",
  signature: "Maria Antoniette B. Olivar",
  photo: "",
};

interface DesignerPreviewProps {
  side: TemplateSide;
  pageWidth: number;
  pageHeight: number;
  bgUrl: string | null;
  placeholders: PlaceholderMapping[];
  previewScale?: number;
}

export function DesignerPreview({
  side,
  pageWidth,
  pageHeight,
  bgUrl,
  placeholders,
  previewScale = 2,
}: DesignerPreviewProps) {
  const bgImage = useHtmlImage(bgUrl);
  const layers = useMemo(
    () => [...placeholders].filter((p) => p.side === side).sort((a, b) => a.zIndex - b.zIndex),
    [placeholders, side]
  );

  return (
    <div className="flex min-h-[320px] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--color-ink)]">Live preview</p>
          <p className="text-xs text-[var(--color-muted)]">
            Sample data on {side} — updates as you edit
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto rounded-md border border-[var(--color-line)] bg-white p-6">
        <div className="shadow-lg ring-1 ring-black/5">
          <Stage
            width={pageWidth * previewScale}
            height={pageHeight * previewScale}
            scaleX={previewScale}
            scaleY={previewScale}
            listening={false}
          >
            <Layer listening={false}>
              {bgImage ? (
                <KonvaImage image={bgImage} width={pageWidth} height={pageHeight} />
              ) : (
                <Rect width={pageWidth} height={pageHeight} fill="#f8fafc" />
              )}
              {layers.map((p) => {
                const isImage = IMAGE_PLACEHOLDERS.includes(p.name);
                const value = SAMPLE_DATA[p.name] ?? `{{${p.name}}}`;
                return (
                  <Group key={`preview-${p.id}`} x={p.x} y={p.y} rotation={p.rotation}>
                    {isImage ? (
                      <Rect
                        width={p.width}
                        height={p.height}
                        fill={p.name === "photo" ? "#cbd5e1" : "#ffffff"}
                        stroke="#94a3b8"
                        strokeWidth={0.5}
                      />
                    ) : null}
                    {isImage ? (
                      <Text
                        text={p.name === "photo" ? "PHOTO" : p.name.toUpperCase()}
                        width={p.width}
                        height={p.height}
                        align="center"
                        verticalAlign="middle"
                        fontSize={Math.min(12, Math.max(7, p.width / 8))}
                        fill="#64748b"
                      />
                    ) : (
                      <Text
                        text={value}
                        width={p.width}
                        height={p.height}
                        fontSize={p.fontSize}
                        fill={p.color}
                        fontStyle={p.fontWeight === "bold" ? "bold" : "normal"}
                        align={p.alignment}
                        verticalAlign="middle"
                        wrap="word"
                        ellipsis
                      />
                    )}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
