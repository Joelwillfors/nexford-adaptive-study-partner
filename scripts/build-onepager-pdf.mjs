/**
 * Builds Docs/PRODUCT_BRIEF_ONE_PAGER.pdf from Docs/PRODUCT_BRIEF_ONE_PAGER.md.
 * Renders ```mermaid``` blocks to SVG via @mermaid-js/mermaid-cli, then md-to-pdf.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mdToPdf } from "md-to-pdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const docsDir = path.join(repoRoot, "Docs");
const sourceMd = path.join(docsDir, "PRODUCT_BRIEF_ONE_PAGER.md");
const outPdf = path.join(docsDir, "PRODUCT_BRIEF_ONE_PAGER.pdf");
const tmpDir = path.join(docsDir, ".onepager-pdf-tmp");
const intermediateMd = path.join(docsDir, ".onepager-pdf-input.md");
const stylesheet = path.join(repoRoot, "scripts", "onepager-pdf.css");

const MERMAID_RE = /```mermaid\n([\s\S]*?)```/g;

function mmdcBin() {
  const unix = path.join(repoRoot, "node_modules", ".bin", "mmdc");
  if (existsSync(unix)) return unix;
  const win = path.join(repoRoot, "node_modules", ".bin", "mmdc.cmd");
  if (existsSync(win)) return win;
  throw new Error(
    "mmdc not found. Run `npm install` at the repo root from package.json.",
  );
}

function runMmdc(inputPath, outputPath) {
  const bin = mmdcBin();
  const isWin = process.platform === "win32";
  execFileSync(bin, ["-i", inputPath, "-o", outputPath], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: isWin,
  });
}

async function main() {
  if (!existsSync(sourceMd)) {
    console.error("Missing:", sourceMd);
    process.exitCode = 1;
    return;
  }

  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  let md = readFileSync(sourceMd, "utf-8");
  let n = 0;

  md = md.replace(MERMAID_RE, (_full, inner) => {
    n += 1;
    const body = String(inner).trimEnd();
    const mmdPath = path.join(tmpDir, `diagram-${n}.mmd`);
    const svgPath = path.join(tmpDir, `diagram-${n}.svg`);
    writeFileSync(mmdPath, body + "\n", "utf-8");
    runMmdc(mmdPath, svgPath);
    return `![Production architecture — headless embed](.onepager-pdf-tmp/diagram-${n}.svg)\n\n`;
  });

  if (n === 0) {
    console.warn("No ```mermaid``` blocks found; PDF will omit diagrams.");
  }

  writeFileSync(intermediateMd, md, "utf-8");

  await mdToPdf(
    { path: intermediateMd },
    {
      dest: outPdf,
      stylesheet: [stylesheet],
      pdf_options: {
        format: "A4",
        margin: "0.75in",
        printBackground: true,
      },
    },
  );

  rmSync(intermediateMd, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });

  console.log("Wrote", outPdf);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
