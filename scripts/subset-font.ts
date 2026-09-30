/**
 * Builds the self-hosted JetBrains Mono subset in public/fonts from the official OFL release.
 *
 *   pnpm tsx scripts/subset-font.ts
 *
 * Why a custom subset: stock "latin" webfont subsets drop box-drawing/block glyphs, which then fall
 * back to another font and break column alignment in the terminal UI.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import subsetFont from "subset-font";

const VERSION = "2.304";
const ZIP_SHA256 = "6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf";
const CACHE = ".cache/fonts";
const ZIP = `${CACHE}/JetBrainsMono-${VERSION}.zip`;
const URL = `https://github.com/JetBrains/JetBrainsMono/releases/download/v${VERSION}/JetBrainsMono-${VERSION}.zip`;

const RANGES: [number, number][] = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xff], // Latin-1 (·, °, ±, ×, é …)
  [0x2010, 0x2027], // dashes, quotes, bullet, ellipsis
  [0x2030, 0x203a],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2190, 0x21ff], // arrows
  [0x2212, 0x2212],
  [0x2500, 0x259f], // box drawing + blocks (sim, panels)
  [0x25a0, 0x25ff], // geometric shapes
  [0x2713, 0x2717], // ✓ ✗
  [0x2800, 0x28ff], // braille (glyph-dissolve fragments), if present
];

const text = RANGES.flatMap(([a, b]) =>
  Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)),
).join("");

mkdirSync(CACHE, { recursive: true });
if (!existsSync(ZIP)) execFileSync("curl", ["-sSL", "-o", ZIP, URL], { stdio: "inherit" });
const sha = execFileSync("shasum", ["-a", "256", ZIP], { encoding: "utf8" }).split(" ")[0];
if (sha !== ZIP_SHA256) throw new Error(`checksum mismatch for ${ZIP}: ${sha}`);
execFileSync("unzip", ["-oq", ZIP, "-d", `${CACHE}/jbm`]);

mkdirSync("public/fonts", { recursive: true });
for (const weight of ["Regular", "Bold"]) {
  const src = readFileSync(`${CACHE}/jbm/fonts/ttf/JetBrainsMonoNL-${weight}.ttf`);
  const out = await subsetFont(src, text, { targetFormat: "woff2" });
  const file = `public/fonts/jetbrains-mono-${VERSION}-${weight.toLowerCase()}.woff2`;
  writeFileSync(file, out);
  console.log(`${file}: ${(out.length / 1024).toFixed(1)} KiB`);
}
copyFileSync(`${CACHE}/jbm/OFL.txt`, "public/fonts/OFL.txt");
