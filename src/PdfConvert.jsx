// PDF converter tool, lazy-loaded so the pdf.js/pdf-lib chunks only
// download when someone opens #/tools/pdf.
import { useState } from 'react';
import { readFileAs } from './lib/files.js';
import { downloadBytes, imagesToPdfBytes, replaceExtension, textToPdfBytes } from './lib/pdfbuild.js';
import { pdfToPngDataUrls, pdfToText } from './lib/pdfread.js';

async function fileToPngBytes(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export default function PdfConvert() {
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [textPreview, setTextPreview] = useState('');
  const [textPages, setTextPages] = useState(0);
  const [textName, setTextName] = useState('');
  const [pageUrls, setPageUrls] = useState([]);
  const [images, setImages] = useState([]);
  const [textInput, setTextInput] = useState('');

  async function convertToText() {
    setError('');
    setTextPreview('');
    setTextPages(0);
    setTextName('');
    if (!pdfFile) {
      setError('Choose a PDF file first.');
      return;
    }
    setBusy('text');
    try {
      const { text, pages } = await pdfToText(await pdfFile.arrayBuffer());
      setTextPreview(text.slice(0, 2000));
      setTextPages(pages);
      const outName = replaceExtension(pdfFile.name, 'txt');
      setTextName(outName);
      downloadBytes(new TextEncoder().encode(text), outName, 'text/plain');
    } catch (e) {
      setError(`Could not read that PDF: ${e.message || e}`);
    } finally {
      setBusy('');
    }
  }

  async function convertToImages() {
    setError('');
    setPageUrls([]);
    if (!pdfFile) {
      setError('Choose a PDF file first.');
      return;
    }
    setBusy('images');
    try {
      const { urls } = await pdfToPngDataUrls(await pdfFile.arrayBuffer());
      setPageUrls(urls);
    } catch (e) {
      setError(`Could not read that PDF: ${e.message || e}`);
    } finally {
      setBusy('');
    }
  }

  function downloadPage(index) {
    const base = pdfFile.name.replace(/\.[^.]+$/, '');
    const link = document.createElement('a');
    link.href = pageUrls[index];
    link.download = `${base}-page-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function addImages(list) {
    const picked = Array.from(list || []);
    if (picked.length === 0) return;
    setError('');
    const next = [...images];
    for (const file of picked) {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is over 10 MB.`);
        continue;
      }
      try {
        next.push({ name: file.name, bytes: await fileToPngBytes(file) });
      } catch {
        setError(`Could not read ${file.name}.`);
      }
    }
    setImages(next);
  }

  function removeImage(index) {
    setImages(images.filter((_, i) => i !== index));
  }

  async function convertImagesToPdf() {
    setError('');
    if (images.length === 0) {
      setError('Add at least one image.');
      return;
    }
    setBusy('makepdf');
    try {
      const bytes = await imagesToPdfBytes(
        images.map((img) => ({ bytes: img.bytes, mime: 'image/png', name: img.name })),
      );
      downloadBytes(bytes, `images-${new Date().toISOString().slice(0, 10)}.pdf`, 'application/pdf');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy('');
    }
  }

  async function loadTextFile(list) {
    const file = list && list[0];
    if (!file) return;
    setTextInput(String(await readFileAs(file, 'text')));
  }

  async function convertTextToPdf() {
    setError('');
    if (!textInput.trim()) {
      setError('Type or load some text first.');
      return;
    }
    setBusy('textpdf');
    try {
      const bytes = await textToPdfBytes(textInput);
      downloadBytes(bytes, 'document.pdf', 'application/pdf');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <h2 className="section-title">PDF convert</h2>
      <p className="hint">Everything converts inside your browser - files never leave this page.</p>
      {error && <div className="error">{error}</div>}

      <h2 className="section-title">PDF to text</h2>
      <div className="panel">
        <div className="field">
          <label>PDF file</label>
          <input id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={(e) => setPdfFile(e.target.files[0] || null)} />
        </div>
        <div className="hero-actions">
          <button id="pdf-text-btn" className="btn" onClick={convertToText} disabled={busy !== ''}>
            {busy === 'text' ? 'Converting...' : 'Convert to text'}
          </button>
          <button id="pdf-images-btn" className="btn ghost" onClick={convertToImages} disabled={busy !== ''}>
            {busy === 'images' ? 'Rendering...' : 'Convert to images'}
          </button>
        </div>
        {textName && <p className="hint">{textPages} page(s) - downloaded as {textName}.</p>}
        {textPreview && <pre className="text-preview">{textPreview}</pre>}
        {pageUrls.length > 0 && (
          <div className="page-grid">
            {pageUrls.map((url, i) => (
              <div className="page-card" key={i}>
                <img className="thumb" src={url} alt={`Page ${i + 1}`} />
                <button className="mini-btn" onClick={() => downloadPage(i)}>Page {i + 1} PNG</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="section-title">Images to PDF</h2>
      <div className="panel">
        <div className="attach-row">
          <label className="attach-btn">
            Add images
            <input
              id="img-files"
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {
                await addImages(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {images.map((img, i) => (
            <span className="chip" key={i}>
              <span>{img.name}</span>
              <button onClick={() => removeImage(i)} aria-label={`Remove ${img.name}`}>&times;</button>
            </span>
          ))}
        </div>
        <div className="hero-actions">
          <button id="img-pdf-btn" className="btn" onClick={convertImagesToPdf} disabled={busy !== ''}>
            {busy === 'makepdf' ? 'Building...' : 'Convert to PDF'}
          </button>
        </div>
      </div>

      <h2 className="section-title">Text to PDF</h2>
      <div className="panel">
        <div className="field">
          <label>Text</label>
          <textarea id="text-area" rows={6} value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Type or paste text here..." />
        </div>
        <div className="hero-actions">
          <label className="btn ghost">
            Load .txt file
            <input
              id="text-file"
              type="file"
              accept=".txt,.md,text/plain"
              hidden
              onChange={async (e) => {
                await loadTextFile(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <button id="text-pdf-btn" className="btn" onClick={convertTextToPdf} disabled={busy !== ''}>
            {busy === 'textpdf' ? 'Building...' : 'Convert to PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
