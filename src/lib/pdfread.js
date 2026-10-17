// Browser-only PDF reading via pdf.js. The worker is bundled locally by
// Vite (?url import), so this works offline once the site is loaded.
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function pdfToText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let out = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      out += item.str || '';
      out += item.hasEOL ? '\n' : ' ';
    }
    out += '\n';
  }
  return { text: out.trim(), pages: pdf.numPages };
}

export async function pdfToPngDataUrls(arrayBuffer, scale = 1.5) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const urls = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    urls.push(canvas.toDataURL('image/png'));
  }
  return { urls, pages: pdf.numPages };
}
