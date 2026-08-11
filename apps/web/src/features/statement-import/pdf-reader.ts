import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { parseStatement, type ParsedStatement, type PdfTextItem } from './statement-parser';

GlobalWorkerOptions.workerSrc = workerSrc;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PAGES = 10;

export async function readStatementPdf(file: File): Promise<{
  documentHash: string;
  statement: ParsedStatement;
}> {
  if (file.size > MAX_FILE_SIZE) throw new Error('PDFは20MB以下にしてください。');
  const buffer = await file.arrayBuffer();
  const documentHash = await sha256(buffer);
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PAGES) {
    await loadingTask.destroy();
    throw new Error('PDFは10ページ以下にしてください。');
  }
  const items: PdfTextItem[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      items.push({ text: item.str, x: item.transform[4], y: item.transform[5] });
    }
  }
  await loadingTask.destroy();
  if (!items.length)
    throw new Error('文字を読み取れませんでした。画像PDFや暗号化PDFには対応していません。');
  return { documentHash, statement: parseStatement(items) };
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
