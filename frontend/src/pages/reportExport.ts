type Cell = string | number | boolean | null | undefined;
export type ReportExport = { title: string; metadata: string[]; headers: string[]; rows: Cell[][] };

export function reportCsv(headers: string[], rows: Cell[][]): string {
  const cell = (value: Cell) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

// Embed canvas-rendered tables as JPEG pages, preserving browser font support for Unicode.
export function imagePagesPdf(images: Uint8Array[], width: number, height: number): Uint8Array<ArrayBuffer> {
  const pageHeight = 595.28;
  const pageWidth = Math.max(841.89, pageHeight * width / height).toFixed(2);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let length = 0;
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes); length += bytes.length;
  };
  const object = (id: number, body: string) => { offsets[id] = length; append(`${id} 0 obj\n${body}\nendobj\n`); };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  object(3 + images.length * 3, '<< /Producer (Bakery Reports) >>');
  images.forEach((bytes, index) => {
    const id = 3 + index * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    offsets[id + 1] = length;
    append(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
    append(bytes); append('\nendstream\nendobj\n');
    const stream = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im Do Q`;
    object(id + 2, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < offsets.length; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

export async function reportPdf(report: ReportExport): Promise<Blob> {
  await document.fonts.ready;
  const margin = 50, height = 1190, rowHeight = 40, padding = 16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create the PDF. Please try another browser.');
  const singleLine = (value: Cell) => String(value ?? '').replace(/\r?\n/g, ' ');
  const headers = report.headers.map(singleLine);
  const rows = report.rows.map(row => report.headers.map((_, i) => singleLine(row[i])));
  // Measure complete values rather than splitting columns or wrapping cell text.
  ctx.font = 'bold 19px sans-serif';
  const columnWidths = headers.map(header => ctx.measureText(header).width + padding * 2);
  ctx.font = '19px sans-serif';
  for (const row of rows) row.forEach((value, i) => {
    columnWidths[i] = Math.max(columnWidths[i], ctx.measureText(value).width + padding * 2);
  });
  const naturalWidth = columnWidths.reduce((sum, value) => sum + value, 0);
  const width = Math.min(14000, Math.max(1684, Math.ceil(naturalWidth + margin * 2)));
  canvas.width = width; canvas.height = height;
  const tableWidth = width - margin * 2;
  const scale = naturalWidth > tableWidth ? tableWidth / naturalWidth : 1;
  const extra = naturalWidth < tableWidth && headers.length ? (tableWidth - naturalWidth) / headers.length : 0;
  const widths = columnWidths.map(value => value * scale + extra);
  const fontSize = 19 * scale;
  const starts: number[] = [];
  let cursor = margin;
  for (const cellWidth of widths) { starts.push(cursor); cursor += cellWidth; }
  const metadata = report.metadata.map(singleLine);
  const metaLineHeight = Math.min(28, 330 / Math.max(1, metadata.length));
  const tableTop = 126 + metadata.length * metaLineHeight;
  const headerHeight = 46;
  const rowsPerPage = Math.max(1, Math.floor((height - 90 - tableTop - headerHeight) / rowHeight));
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const images: Uint8Array[] = [];
  const numeric = (value: string) => /^[-+]?\d[\d,]*(?:\.\d+)?%?$/.test(value.trim());
  for (let page = 0; page < pageCount; page++) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#172b4d'; ctx.fillRect(margin, 34, 6, 48);
    ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(singleLine(report.title), margin + 20, 65, tableWidth - 20);
    ctx.fillStyle = '#64748b'; ctx.font = '16px sans-serif';
    ctx.fillText('REPORTS & ANALYTICS', margin + 20, 90);
    ctx.font = '19px sans-serif';
    metadata.forEach((line, index) => ctx.fillText(line, margin, 119 + index * metaLineHeight, tableWidth));
    ctx.fillStyle = '#172b4d'; ctx.fillRect(margin, tableTop, tableWidth, headerHeight);
    ctx.fillStyle = '#ffffff'; ctx.font = `bold ${fontSize}px sans-serif`;
    headers.forEach((header, i) => ctx.fillText(header, starts[i] + padding * scale, tableTop + 29, widths[i] - padding * 2 * scale));
    let y = tableTop + headerHeight;
    const start = page * rowsPerPage;
    const end = Math.min(rows.length, start + rowsPerPage);
    ctx.font = `${fontSize}px sans-serif`;
    for (let rowIndex = start; rowIndex < end; rowIndex++) {
      ctx.fillStyle = rowIndex % 2 ? '#f5f7fa' : '#ffffff';
      ctx.fillRect(margin, y, tableWidth, rowHeight);
      ctx.fillStyle = '#26364a';
      rows[rowIndex].forEach((value, i) => {
        const right = numeric(value);
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(value, right ? starts[i] + widths[i] - padding * scale : starts[i] + padding * scale, y + 26, widths[i] - padding * 2 * scale);
      });
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(margin, y + rowHeight); ctx.lineTo(width - margin, y + rowHeight); ctx.stroke();
      y += rowHeight;
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#64748b'; ctx.font = '17px sans-serif';
    ctx.strokeStyle = '#d7dee8'; ctx.beginPath(); ctx.moveTo(margin, height - 65); ctx.lineTo(width - margin, height - 65); ctx.stroke();
    ctx.fillText(`${rows.length} records | ${headers.length} columns`, margin, height - 35);
    ctx.textAlign = 'right'; ctx.fillText(`Page ${page + 1} of ${pageCount}`, width - margin, height - 35);
    ctx.textAlign = 'left';
    const encoded = canvas.toDataURL('image/jpeg', 0.96).split(',')[1];
    images.push(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Blob([imagePagesPdf(images, width, height)], { type: 'application/pdf' });
}
