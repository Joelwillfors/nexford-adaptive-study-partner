/**
 * Generic Markdown → PDF using the same md-to-pdf + stylesheet stack as the one-pager.
 * Usage: node scripts/build-md-pdf.mjs --in Docs/DEMO_SCRIPT.md --out Docs/DEMO_SCRIPT.pdf
 * Paths are relative to the repo root.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mdToPdf } from "md-to-pdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const stylesheet = path.join(repoRoot, "scripts", "onepager-pdf.css");

function parseArgs(argv) {
  let input;
  let output;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--in" && argv[i + 1]) {
      input = argv[++i];
    } else if (argv[i] === "--out" && argv[i + 1]) {
      output = argv[++i];
    }
  }
  return { input, output };
}

async function main() {
  const { input, output } = parseArgs(process.argv);
  if (!input || !output) {
    console.error(
      "Usage: node scripts/build-md-pdf.mjs --in <path.md> --out <path.pdf>",
    );
    process.exitCode = 1;
    return;
  }

  const inPath = path.isAbsolute(input)
    ? input
    : path.join(repoRoot, input);
  const outPath = path.isAbsolute(output)
    ? output
    : path.join(repoRoot, output);

  if (!existsSync(inPath)) {
    console.error("Missing input file:", inPath);
    process.exitCode = 1;
    return;
  }

  await mdToPdf(
    { path: inPath },
    {
      dest: outPath,
      stylesheet: [stylesheet],
      pdf_options: {
        format: "A4",
        margin: "0.75in",
        printBackground: true,
      },
    },
  );

  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
