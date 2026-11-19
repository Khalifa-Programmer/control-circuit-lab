import type { CircuitDoc } from "@/lib/circuit/doc";

export function fileBase(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson(name: string, doc: CircuitDoc) {
  const file = { format: "circuit-lab-diagram", name, doc };
  download(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), `${fileBase(name)}.json`);
}

/** The canvas as a standalone SVG, with the theme's colours written in. */
export function svgMarkup(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const style = getComputedStyle(document.documentElement);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "var(--background)");
  clone.insertBefore(bg, clone.firstChild);
  clone.removeAttribute("class");
  return new XMLSerializer()
    .serializeToString(clone)
    .replace(/var\((--[a-z0-9-]+)\)/g, (_, token: string) => style.getPropertyValue(token).trim() || "currentColor");
}

export function exportSvg(name: string, svg: SVGSVGElement) {
  download(new Blob([svgMarkup(svg)], { type: "image/svg+xml" }), `${fileBase(name)}.svg`);
}

async function rasterize(svg: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
  const markup = svgMarkup(svg);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't draw the diagram"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(svg.width.baseVal.value * scale);
  canvas.height = Math.round(svg.height.baseVal.value * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function exportPng(name: string, svg: SVGSVGElement) {
  const canvas = await rasterize(svg, 2);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
  download(blob, `${fileBase(name)}.png`);
}

/** One landscape A4 page with the diagram as a JPEG image. */
export async function exportPdf(name: string, svg: SVGSVGElement) {
  const canvas = await rasterize(svg, 2);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the page"))), "image/jpeg", 0.92));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  download(new Blob([pdfWithImage(jpeg, canvas.width, canvas.height, name)], { type: "application/pdf" }), `${fileBase(name)}.pdf`);
}

function pdfWithImage(jpeg: Uint8Array, w: number, h: number, title: string): Uint8Array<ArrayBuffer> {
  const pageW = 842;
  const pageH = 595;
  const margin = 28;
  const scale = Math.min((pageW - 2 * margin) / w, (pageH - 2 * margin - 24) / h);
  const dw = w * scale;
  const dh = h * scale;
  const safeTitle = title.replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
  const content = `BT /F1 12 Tf ${margin} ${pageH - margin - 4} Td (${safeTitle}) Tj ET\nq ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${margin} ${(pageH - margin - 24 - dh).toFixed(2)} cm /Im1 Do Q\n`;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  object(5, [`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`]);
  object(6, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(new ArrayBuffer(length));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
