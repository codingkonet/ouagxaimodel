// PDF building helpers (Node-safe; covered by pdfbuild.test.mjs).
// Reading PDFs lives in pdfread.js (browser-only, needs the pdf.js worker).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export function replaceExtension(name, ext) {
  return `${String(name || 'document').replace(/\.[^.]+$/, '')}.${ext}`;
}

function sanitizeForPdf(text) {
  return String(text).replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function wrapLine(line, font, size, maxWidth) {
  if (line === '') return [''];
  const words = line.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        // One very long word: hard-split it.
        let chunk = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) <= maxWidth) {
            chunk += char;
          } else {
            lines.push(chunk);
            chunk = char;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function textToPdfBytes(text) {
  const clean = sanitizeForPdf(text);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const margin = 50;
  const lineHeight = 16;
  const width = 595;
  const height = 842;
  let page = doc.addPage([width, height]);
  let y = height - margin;
  for (const rawLine of clean.split('\n')) {
    for (const line of wrapLine(rawLine, font, size, width - margin * 2)) {
      if (y < margin) {
        page = doc.addPage([width, height]);
        y = height - margin;
      }
      page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
  }
  return doc.save();
}

export async function imagesToPdfBytes(images) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) throw new Error('Add at least one image.');
  const doc = await PDFDocument.create();
  const MAX_SIDE = 1440;
  for (const image of list) {
    let embedded = null;
    if (image.mime === 'image/jpeg') embedded = await doc.embedJpg(image.bytes);
    else if (image.mime === 'image/png') embedded = await doc.embedPng(image.bytes);
    if (!embedded) throw new Error(`${image.name || 'An image'} must be PNG or JPEG.`);
    const size = embedded.scale(1);
    const scale = Math.min(1, MAX_SIDE / Math.max(size.width, size.height));
    const page = doc.addPage([size.width * scale, size.height * scale]);
    page.drawImage(embedded, { x: 0, y: 0, width: size.width * scale, height: size.height * scale });
  }
  return doc.save();
}

// Browser-only: triggers a file download. Not called by tests.
export function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
