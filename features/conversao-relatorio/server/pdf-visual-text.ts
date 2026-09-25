/** Rebuild reading order and spaces from PDF glyph positions, not stream order. */
export async function extractPdfVisualText(buffer: Buffer): Promise<string> {
  type Item = { str: string; transform: number[]; width: number };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js") as {
    getDocument(data: Uint8Array): { promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{ getTextContent(): Promise<{ items: Item[] }> }>;
      destroy(): Promise<void>;
    }> };
  };
  const document = await pdfjs.getDocument(new Uint8Array(buffer)).promise;
  const output: string[] = [];
  try {
    for (let page = 1; page <= document.numPages; page++) {
      const { items } = await (await document.getPage(page)).getTextContent();
      const lines: Item[][] = [];
      for (const item of items.filter((item) => item.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
        const last = lines.at(-1);
        if (last && Math.abs(last[0].transform[5] - item.transform[5]) < 1) last.push(item);
        else lines.push([item]);
      }
      for (const line of lines) {
        let text = "";
        let right = -Infinity;
        for (const item of line.sort((a, b) => a.transform[4] - b.transform[4])) {
          if (text && item.transform[4] - right > 1) text += " ";
          text += item.str;
          right = item.transform[4] + item.width;
        }
        output.push(text);
      }
    }
    return output.join("\n");
  } finally { await document.destroy(); }
}
