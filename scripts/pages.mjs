// Демото в интернет (GitHub Pages): копира public/ в _site/ и казва на страницата, че е без сървър (window.CC_WEB).
// Не е build стъпка – файловете остават същите, само index.html получава флага и мета таговете за споделяне.
// usage: node scripts/pages.mjs [outDir]   (по подразбиране _site)
import { cpSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] || '_site');
const URL_ = 'https://rezored.github.io/cubicle-crew/';
const TITLE = 'Cubicle Crew – live demo';
const DESC = 'Your Claude Code, Codex, Gemini CLI and OpenCode agents as pixel-art coworkers in a tiny office. Free desktop widget for Windows, macOS and Linux.';

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, 'public'), OUT, { recursive: true, filter: (f) => !f.endsWith('.psd') });
// картинка за споделяне и трейлърът (ако ги има)
mkdirSync(join(OUT, 'media'), { recursive: true });
for (const f of ['og.png', 'trailer.mp4']) {
  const src = join(ROOT, 'docs', 'media', f);
  if (existsSync(src)) cpSync(src, join(OUT, 'media', f));
}
writeFileSync(join(OUT, '.nojekyll'), '');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const head = [
  '<script>window.CC_WEB = 1;</script>',
  `<meta name="description" content="${esc(DESC)}">`,
  `<link rel="canonical" href="${URL_}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${esc(TITLE)}">`,
  `<meta property="og:description" content="${esc(DESC)}">`,
  `<meta property="og:url" content="${URL_}">`,
  ...(existsSync(join(OUT, 'media', 'og.png')) ? [
    `<meta property="og:image" content="${URL_}media/og.png">`,
    `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${URL_}media/og.png">`,
  ] : []),
  `<meta name="twitter:title" content="${esc(TITLE)}">`,
  `<meta name="twitter:description" content="${esc(DESC)}">`,
].join('\n');
const idx = join(OUT, 'index.html');
let html = readFileSync(idx, 'utf8');
if (!html.includes('<title>')) throw new Error('index.html: no <title>');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>\n${head}`);
writeFileSync(idx, html);
console.log('pages ->', OUT);
