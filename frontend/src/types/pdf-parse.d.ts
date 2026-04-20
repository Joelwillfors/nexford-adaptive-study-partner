declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export = pdfParse;
}
