import { imagePagesPdf } from "../../pages/reportExport.ts";
import type { DocumentSection, TransactionDocument } from "./documentTypes";

const WIDTH = 1684;
const HEIGHT = 1190;
const MARGIN = 64;
const BOTTOM = 1090;
const ROW_HEIGHT = 43;

export type DocumentBlock =
  | { kind: "section"; y: number; text: string }
  | { kind: "heading"; y: number; text: string }
  | { kind: "note"; y: number; text: string }
  | { kind: "tableHeader"; y: number; section: number }
  | { kind: "row"; y: number; section: number; row: number }
  | { kind: "field"; y: number; label: string; value: string };
export type DocumentPage = { blocks: DocumentBlock[] };

function wrap(value: string, maxLength = 130): string[] {
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if (current && `${current} ${word}`.length > maxLength) {
        result.push(current);
        current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    result.push(current);
  }
  return result;
}

export function documentPages(doc: TransactionDocument): DocumentPage[] {
  const top = 252 + Math.ceil(doc.fields.length / 2) * 31 + 36;
  if (top >= BOTTOM - 180) throw new Error("This document has too many header fields to print.");
  const pages: DocumentPage[] = [{ blocks: [] }];
  let y = top;
  const nextPage = () => { pages.push({ blocks: [] }); y = top; };
  const add = (height: number, block: Omit<DocumentBlock, "y">) => {
    if (y + height > BOTTOM) nextPage();
    pages[pages.length - 1].blocks.push({ ...block, y } as DocumentBlock);
    y += height;
  };
  for (const [sectionIndex, section] of doc.sections.entries()) {
    const tableStart = () => {
      if (y + 92 > BOTTOM) nextPage();
      add(45, { kind: "section", text: section.title } as Omit<DocumentBlock, "y">);
      add(42, { kind: "tableHeader", section: sectionIndex } as Omit<DocumentBlock, "y">);
    };
    tableStart();
    if (!section.rows.length) add(ROW_HEIGHT, { kind: "note", text: "No lines recorded." } as Omit<DocumentBlock, "y">);
    section.rows.forEach((_, rowIndex) => {
      if (y + ROW_HEIGHT > BOTTOM) {
        nextPage();
        tableStart();
      }
      add(ROW_HEIGHT, { kind: "row", section: sectionIndex, row: rowIndex } as Omit<DocumentBlock, "y">);
    });
    for (const field of section.totals ?? []) add(34, { kind: "field", label: field.label, value: field.value } as Omit<DocumentBlock, "y">);
    y += 20;
  }
  if (doc.notes.length) {
    add(44, { kind: "heading", text: "Notes and references" } as Omit<DocumentBlock, "y">);
    for (const field of doc.notes) {
      add(31, { kind: "field", label: field.label, value: "" } as Omit<DocumentBlock, "y">);
      for (const line of wrap(field.value)) add(27, { kind: "note", text: line } as Omit<DocumentBlock, "y">);
    }
  }
  if (doc.audit.length) {
    add(44, { kind: "heading", text: "Document audit" } as Omit<DocumentBlock, "y">);
    for (const field of doc.audit) add(31, { kind: "field", label: field.label, value: field.value } as Omit<DocumentBlock, "y">);
  }
  return pages;
}

function drawHeader(ctx: CanvasRenderingContext2D, doc: TransactionDocument) {
  ctx.fillStyle = "#f5f8fc"; ctx.fillRect(0, 0, WIDTH, 102);
  ctx.fillStyle = "#172b4d"; ctx.fillRect(MARGIN, 30, 7, 57);
  ctx.textAlign = "left"; ctx.fillStyle = "#172b4d";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(doc.company.name, MARGIN + 25, 64, 920);
  ctx.font = "17px sans-serif"; ctx.fillStyle = "#64748b";
  ctx.fillText([doc.company.phone, doc.company.email].filter(Boolean).join("  |  "), MARGIN + 25, 89, 1100);
  const identity = [
    doc.company.legalName && doc.company.legalName !== doc.company.name ? doc.company.legalName : null,
    doc.company.registrationNumber ? `Registration: ${doc.company.registrationNumber}` : null,
    doc.company.taxRegistrationNumber ? `Tax: ${doc.company.taxRegistrationNumber}` : null,
  ].filter(Boolean).join("  |  ");
  if (identity) {
    ctx.font = "15px sans-serif";
    ctx.fillText(identity, MARGIN + 25, 112, 1120);
  }
  ctx.fillStyle = "#172b4d"; ctx.font = "bold 31px sans-serif";
  ctx.fillText(doc.title, MARGIN, 151, 1100);
  ctx.font = "20px sans-serif"; ctx.fillText(`No: ${doc.number}`, MARGIN, 186, 1050);
  ctx.fillStyle = "#52657f"; ctx.font = "18px sans-serif";
  ctx.fillText(`Date: ${doc.date}`, MARGIN, 220, 360);
  ctx.fillText(`Location: ${doc.location}`, 440, 220, 880);
  const alert = ["REVERSED", "CANCELLED"].includes(doc.status);
  ctx.fillStyle = alert ? "#ad2638" : doc.status === "POSTED" || doc.status === "APPROVED" ? "#146b55" : "#275bc5";
  ctx.fillRect(WIDTH - 330, 119, 266, 50);
  ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.font = "bold 23px sans-serif";
  ctx.fillText(doc.status, WIDTH - 197, 152, 230);
  ctx.textAlign = "left";
  doc.fields.forEach((field, index) => {
    const column = index % 2;
    const x = MARGIN + column * 780;
    const y = 261 + Math.floor(index / 2) * 31;
    ctx.fillStyle = "#64748b"; ctx.font = "bold 16px sans-serif";
    ctx.fillText(`${field.label}:`, x, y, 205);
    ctx.fillStyle = "#26364a"; ctx.font = "18px sans-serif";
    ctx.fillText(field.value, x + 205, y, 560);
  });
}

function drawTableHeader(ctx: CanvasRenderingContext2D, section: DocumentSection, y: number) {
  const span = WIDTH - MARGIN * 2;
  const weight = section.columns.reduce((sum, column) => sum + column.weight, 0);
  let x = MARGIN;
  ctx.fillStyle = "#172b4d"; ctx.fillRect(MARGIN, y, span, 42);
  section.columns.forEach(column => {
    const width = span * column.weight / weight;
    ctx.textAlign = column.numeric ? "right" : "left";
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 17px sans-serif";
    ctx.fillText(column.label, column.numeric ? x + width - 12 : x + 12, y + 28, width - 24);
    x += width;
  });
  ctx.textAlign = "left";
}

function drawRow(ctx: CanvasRenderingContext2D, section: DocumentSection, rowIndex: number, y: number) {
  const span = WIDTH - MARGIN * 2;
  const weight = section.columns.reduce((sum, column) => sum + column.weight, 0);
  ctx.fillStyle = rowIndex % 2 ? "#f3f6fa" : "#ffffff";
  ctx.fillRect(MARGIN, y, span, ROW_HEIGHT);
  let x = MARGIN;
  section.columns.forEach((column, index) => {
    const width = span * column.weight / weight;
    ctx.textAlign = column.numeric ? "right" : "left";
    ctx.fillStyle = "#26364a"; ctx.font = "17px sans-serif";
    ctx.fillText(section.rows[rowIndex]?.[index] ?? "", column.numeric ? x + width - 12 : x + 12, y + 29, width - 24);
    x += width;
  });
  ctx.textAlign = "left";
  ctx.strokeStyle = "#e2e8f0"; ctx.beginPath();
  ctx.moveTo(MARGIN, y + ROW_HEIGHT); ctx.lineTo(WIDTH - MARGIN, y + ROW_HEIGHT); ctx.stroke();
}

export async function transactionDocumentPdf(doc: TransactionDocument): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create the PDF in this browser.");
  const pages = documentPages(doc);
  const images: Uint8Array[] = [];
  const generatedAt = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: doc.timeZone }).format(new Date());
  for (const [pageIndex, page] of pages.entries()) {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawHeader(ctx, doc);
    for (const block of page.blocks) {
      if (block.kind === "tableHeader") drawTableHeader(ctx, doc.sections[block.section], block.y);
      else if (block.kind === "row") drawRow(ctx, doc.sections[block.section], block.row, block.y);
      else if (block.kind === "section" || block.kind === "heading") {
        ctx.fillStyle = "#172b4d"; ctx.font = "bold 22px sans-serif";
        ctx.fillText(block.text, MARGIN, block.y + 30, WIDTH - MARGIN * 2);
      } else if (block.kind === "note") {
        ctx.fillStyle = "#26364a"; ctx.font = "17px sans-serif";
        ctx.fillText(block.text, MARGIN + 14, block.y + 20, WIDTH - MARGIN * 2 - 14);
      } else {
        ctx.fillStyle = "#64748b"; ctx.font = "bold 17px sans-serif";
        ctx.fillText(`${block.label}:`, MARGIN + 10, block.y + 23, 320);
        ctx.fillStyle = "#26364a"; ctx.font = "18px sans-serif";
        ctx.fillText(block.value, MARGIN + 330, block.y + 23, WIDTH - MARGIN * 2 - 340);
      }
    }
    ctx.strokeStyle = "#d7dee8"; ctx.beginPath();
    ctx.moveTo(MARGIN, HEIGHT - 72); ctx.lineTo(WIDTH - MARGIN, HEIGHT - 72); ctx.stroke();
    ctx.fillStyle = "#64748b"; ctx.font = "16px sans-serif";
    ctx.textAlign = "left"; ctx.fillText(`Generated from ${doc.company.name}  |  ${generatedAt}`, MARGIN, HEIGHT - 38, 1150);
    ctx.textAlign = "right"; ctx.fillText(`Page ${pageIndex + 1} of ${pages.length}`, WIDTH - MARGIN, HEIGHT - 38);
    ctx.textAlign = "left";
    const encoded = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    images.push(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
  }
  return new Blob([imagePagesPdf(images, WIDTH, HEIGHT)], { type: "application/pdf" });
}
