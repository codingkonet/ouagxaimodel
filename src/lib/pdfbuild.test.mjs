// Tests for the PDF builders. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { imagesToPdfBytes, replaceExtension, textToPdfBytes } from './pdfbuild.js';

// A valid 1x1 PNG.
const PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

function header(bytes) {
  return Buffer.from(bytes.slice(0, 5)).toString('ascii');
}

describe('replaceExtension', () => {
  it('swaps the file extension', () => {
    assert.equal(replaceExtension('report.pdf', 'txt'), 'report.txt');
    assert.equal(replaceExtension('archive.tar.pdf', 'png'), 'archive.tar.png');
    assert.equal(replaceExtension('', 'pdf'), 'document.pdf');
  });
});

describe('textToPdfBytes', () => {
  it('makes a one-page PDF for short text', async () => {
    const bytes = await textToPdfBytes('Hello\nWorld');
    assert.equal(header(bytes), '%PDF-');
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
  });

  it('flows long text onto more pages and survives unicode', async () => {
    const bytes = await textToPdfBytes(`${'Hello world, this is a long line. '.repeat(20)}\n`.repeat(60) + 'emoji here: \u{1F600}');
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() > 1);
  });
});

describe('imagesToPdfBytes', () => {
  it('makes one page per image', async () => {
    const bytes = await imagesToPdfBytes([
      { bytes: PIXEL_PNG, mime: 'image/png', name: 'a.png' },
      { bytes: PIXEL_PNG, mime: 'image/png', name: 'b.png' },
    ]);
    assert.equal(header(bytes), '%PDF-');
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 2);
  });

  it('rejects empty lists and unsupported types', async () => {
    await assert.rejects(() => imagesToPdfBytes([]), /at least one image/);
    await assert.rejects(
      () => imagesToPdfBytes([{ bytes: PIXEL_PNG, mime: 'image/gif', name: 'a.gif' }]),
      /must be PNG or JPEG/,
    );
  });
});
