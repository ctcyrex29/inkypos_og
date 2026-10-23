/**
 * Report exports, built in the browser from the data a page already shows.
 * CSV opens in Excel and Google Sheets (amounts are plain numbers you can
 * sum); PDF is a branded, printable document. jsPDF is only downloaded when
 * someone actually exports a PDF.
 */

export type Cell = string | number | null;

export interface ExportTable {
  title: string;
  columns: string[];
  rows: Cell[][];
  /** Shown under the table, e.g. "Not a tax return". */
  note?: string;
}

export interface ExportDocument {
  /** e.g. "Sales report" */
  title: string;
  business: string;
  /** e.g. "2026-10-17 to 2026-10-23" */
  period?: string;
  tables: ExportTable[];
  /** File name without extension. */
  filename: string;
}

/** Minor units to a plain decimal number for spreadsheets: 1234 → 12.34. */
export const amount = (minor: number): number => Math.round(minor) / 100;

/** Thousandths to a plain number: 2500 → 2.5. */
export const quantity = (milli: number): number => milli / 1000;

/** A file-name-safe slug: "Kwa Mai Tendai" → "kwa-mai-tendai". */
export function slug(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

/**
 * One CSV field. Text that a spreadsheet would treat as a formula (=, +, -, @,
 * tab, carriage return) is prefixed with an apostrophe so a malicious product or
 * customer name cannot run as a formula when the file is opened (CSV injection).
 */
export function csvField(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole document as CSV: a heading block, then each table separated by a blank line. */
export function toCsv(doc: ExportDocument): string {
  const lines: string[] = [csvField(`${doc.title} · ${doc.business}`)];
  if (doc.period) lines.push(csvField(`Period: ${doc.period}`));
  lines.push(csvField(`Exported: ${new Date().toLocaleString()}`));
  for (const t of doc.tables) {
    lines.push('', csvField(t.title), t.columns.map(csvField).join(','));
    for (const row of t.rows) lines.push(row.map(csvField).join(','));
    if (t.note) lines.push(csvField(t.note));
  }
  return lines.join('\r\n') + '\r\n';
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(doc: ExportDocument) {
  // The byte-order mark makes Excel read the file as UTF-8 (names with accents, "ZWG").
  save(new Blob(['﻿', toCsv(doc)], { type: 'text/csv;charset=utf-8' }), `${doc.filename}.csv`);
}

const INDIGO: [number, number, number] = [79, 70, 229];
const SLATE: [number, number, number] = [100, 116, 139];

const pdfCell = (v: Cell): string => (v === null ? '' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : v);

export async function downloadPdf(doc: ExportDocument) {
  save(await buildPdf(doc), `${doc.filename}.pdf`);
}

/** The PDF file itself (A4, landscape when a table is wide). */
export async function buildPdf(doc: ExportDocument): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const wide = doc.tables.some((t) => t.columns.length > 6);
  const pdf = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 40;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(...INDIGO);
  pdf.text('InkyPOS', margin, 46);
  pdf.setTextColor(15, 23, 42);
  pdf.text(doc.title, margin, 68);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...SLATE);
  pdf.text([doc.business, ...(doc.period ? [`Period: ${doc.period}`] : []), `Exported ${new Date().toLocaleString()}`], margin, 86);
  let y = doc.period ? 130 : 118;

  for (const t of doc.tables) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    if (y > pdf.internal.pageSize.getHeight() - 80) {
      pdf.addPage();
      y = 50;
    }
    pdf.text(t.title, margin, y);
    autoTable(pdf, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      head: [t.columns],
      body: t.rows.length ? t.rows.map((r) => r.map(pdfCell)) : [[{ content: 'Nothing in this period.', colSpan: t.columns.length }]],
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: INDIGO, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      // Right-align columns that hold numbers.
      columnStyles: Object.fromEntries(t.columns.map((_, i) => [i, { halign: t.rows.some((r) => typeof r[i] === 'number') ? 'right' : 'left' }])),
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    if (t.note) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(...SLATE);
      pdf.text(pdf.splitTextToSize(t.note, width - margin * 2), margin, y);
      y += 16;
    }
    y += 12;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...SLATE);
    pdf.text(`InkyPOS by Inkgenius Technologies · page ${i} of ${pages}`, margin, pdf.internal.pageSize.getHeight() - 20);
  }
  return pdf.output('blob');
}
