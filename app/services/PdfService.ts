/**
 * PdfService — JUMARI's PDF generation engine
 *
 * Creates styled, professional PDFs from structured content.
 * Used when JUMARI outputs a <pdf> tag in her response.
 *
 * Supports: titles, sections, bullet lists, numbered lists,
 * tables, bold/italic text, and auto page breaks.
 */

import { jsPDF } from 'jspdf';

export interface PdfSection {
  heading?: string;
  body?: string;
  bullets?: string[];
  numbered?: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface PdfRequest {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  footer?: string;
}

// ─── Brand colors ────────────────────────────────────────────────────────────
const BRAND = {
  dark: [10, 10, 26] as [number, number, number],
  accent: [99, 102, 241] as [number, number, number],
  text: [30, 30, 50] as [number, number, number],
  muted: [120, 120, 140] as [number, number, number],
  light: [245, 245, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

/** Generate a professional PDF and return a blob URL for download */
export function generatePdf(req: PdfRequest): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Helper: check page break ──
  const checkPage = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Title bar ──
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 38, pageW, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...BRAND.white);
  doc.text(req.title, margin, 18);

  if (req.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 200);
    doc.text(req.subtitle, margin, 28);
  }

  // Date
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 160);
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(dateStr, pageW - margin - doc.getTextWidth(dateStr), 28);

  y = 46;

  // ── Sections ──
  for (const section of req.sections) {
    // Section heading
    if (section.heading) {
      checkPage(14);
      doc.setFillColor(...BRAND.accent);
      doc.rect(margin, y, 3, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...BRAND.text);
      doc.text(section.heading, margin + 6, y + 5.5);
      y += 12;
    }

    // Body text
    if (section.body) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.text);
      const lines = doc.splitTextToSize(section.body, contentW);
      for (const line of lines) {
        checkPage(6);
        doc.text(line, margin, y);
        y += 5;
      }
      y += 3;
    }

    // Bullet list
    if (section.bullets && section.bullets.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const bullet of section.bullets) {
        const lines = doc.splitTextToSize(bullet, contentW - 8);
        checkPage(lines.length * 5 + 2);
        // Bullet dot
        doc.setFillColor(...BRAND.accent);
        doc.circle(margin + 2, y - 1.2, 1, 'F');
        doc.setTextColor(...BRAND.text);
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], margin + 7, y);
          y += 5;
        }
        y += 1;
      }
      y += 3;
    }

    // Numbered list
    if (section.numbered && section.numbered.length > 0) {
      doc.setFontSize(10);
      for (let idx = 0; idx < section.numbered.length; idx++) {
        const item = section.numbered[idx];
        const lines = doc.splitTextToSize(item, contentW - 12);
        checkPage(lines.length * 5 + 2);
        // Number badge
        doc.setFillColor(...BRAND.accent);
        doc.roundedRect(margin, y - 3.8, 6, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.white);
        doc.text(String(idx + 1), margin + 3, y - 0.3, { align: 'center' });
        // Item text
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND.text);
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], margin + 10, y);
          y += 5;
        }
        y += 2;
      }
      y += 3;
    }

    // Table
    if (section.table && section.table.headers.length > 0) {
      const { headers, rows } = section.table;
      const colW = contentW / headers.length;

      checkPage(10 + rows.length * 7);

      // Header row
      doc.setFillColor(...BRAND.dark);
      doc.rect(margin, y - 4, contentW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.white);
      for (let c = 0; c < headers.length; c++) {
        doc.text(headers[c], margin + c * colW + 2, y);
      }
      y += 5;

      // Data rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      for (let r = 0; r < rows.length; r++) {
        checkPage(7);
        if (r % 2 === 0) {
          doc.setFillColor(...BRAND.light);
          doc.rect(margin, y - 3.5, contentW, 6, 'F');
        }
        doc.setTextColor(...BRAND.text);
        for (let c = 0; c < rows[r].length; c++) {
          const cellText = doc.splitTextToSize(rows[r][c] || '', colW - 4);
          doc.text(cellText[0] || '', margin + c * colW + 2, y);
        }
        y += 6;
      }
      y += 5;
    }
  }

  // ── Footer ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    const footerText = req.footer || 'Generated by JUMARI — Bleumr';
    doc.text(footerText, margin, pageH - 8);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin - 20, pageH - 8);
    // Bottom accent line
    doc.setFillColor(...BRAND.accent);
    doc.rect(0, pageH - 3, pageW, 3, 'F');
  }

  // Return blob URL
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

/**
 * Parse JUMARI's <pdf> JSON tag into a PdfRequest and generate it.
 * Returns { url, filename } for the download link.
 */
export function parsePdfTag(jsonStr: string): { url: string; filename: string } | null {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.title || !data.sections) return null;

    const url = generatePdf(data as PdfRequest);
    const safeName = data.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
    const filename = `${safeName}.pdf`;

    return { url, filename };
  } catch (e) {
    console.warn('[PdfService] Failed to parse PDF tag:', e);
    return null;
  }
}
