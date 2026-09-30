/**
 * Renders public/og.png (1200×630 social preview) from the content file with headless Chromium.
 *   pnpm tsx scripts/og-image.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { profile } from "../src/content/index";
import { artToText, lidarArt } from "../src/lib/lidar-art";

const font = readFileSync("public/fonts/jetbrains-mono-2.304-regular.woff2").toString("base64");
const bold = readFileSync("public/fonts/jetbrains-mono-2.304-bold.woff2").toString("base64");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = `<!doctype html><html><head><style>
@font-face{font-family:J;src:url(data:font/woff2;base64,${font})}
@font-face{font-family:J;font-weight:700;src:url(data:font/woff2;base64,${bold})}
html,body{margin:0;width:1200px;height:630px;background:#151923;color:#d9dce3;font-family:J;font-variant-ligatures:none}
.w{padding:64px 72px;display:grid;grid-template-columns:auto 1fr;gap:56px;align-items:center;height:100%;box-sizing:border-box}
pre{margin:0;color:#f5b94c;font-size:22px;line-height:1.2;font-family:J}
.p{color:#8a93a6;font-size:24px}.a{color:#f5b94c}
h1{margin:18px 0 10px;font-size:64px;line-height:1.1}
.r{font-size:28px}.t{margin-top:36px;font-size:24px;line-height:1.5;color:#d9dce3;max-width:34ch}
</style></head><body><div class="w">
<pre>${esc(artToText(lidarArt(18, 12)))}</pre>
<div><div class="p"><span class="a">visitor@geraltheart.com</span>:~$ neofetch</div>
<h1>${esc(profile.name)}</h1><div class="r">${esc(profile.role)}, ${esc(profile.location)}</div>
<div class="t">${esc(profile.pitch)}</div></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
writeFileSync("public/og.png", await page.screenshot({ type: "png" }));
await browser.close();
console.log("wrote public/og.png");
