// Baut aus den Einzelteilen in src/ die eine fertige Datei PDF-Baukasten.html.
// Aufruf: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ordner = dirname(fileURLToPath(import.meta.url));
const lies = (...teile) => readFileSync(join(ordner, ...teile), 'utf8');
const paket = (name) => JSON.parse(lies('node_modules', ...name.split('/'), 'package.json'));
const version = JSON.parse(lies('package.json')).version;

// Text, der in einem <script>-Block steht, darf diesen nicht versehentlich beenden.
function sicher(code, name) {
  if (/<!--/.test(code)) throw new Error(`${name} enthält "<!--" und lässt sich so nicht einbetten`);
  return code.replace(/<\/script/gi, '<\\/script');
}
const ohneKarte = (code) => code.replace(/\/\/# sourceMappingURL=.*$/m, '');

const schrift = readFileSync(join(ordner, 'node_modules', '@fontsource-variable', 'geist', 'files', 'geist-latin-wght-normal.woff2')).toString('base64');

const teile = {
  '/*STYLE*/': lies('src', 'style.css').replace('/*SCHRIFT*/', () => schrift),
  '/*PDFLIB*/': sicher(ohneKarte(lies('node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js')), 'pdf-lib'),
  '/*PDFJS*/': sicher(ohneKarte(lies('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.min.mjs')), 'pdf.js'),
  '/*PDFJS_HELFER*/': sicher(ohneKarte(lies('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs')), 'pdf.js-Helfer'),
  '/*APP*/': sicher(lies('src', 'app.js'), 'app.js'),
  '/*VERSION*/': version,
  '/*PDFJS_VERSION*/': paket('pdfjs-dist').version,
};

let seite = lies('src', 'index.html');
for (const [marke, inhalt] of Object.entries(teile)) {
  if (!seite.includes(marke)) throw new Error(`Platzhalter ${marke} fehlt in src/index.html`);
  seite = seite.replace(marke, () => inhalt);
}

const ziel = join(ordner, 'PDF-Baukasten.html');
writeFileSync(ziel, seite);
console.log(`${ziel} geschrieben, ${(seite.length / 1024 / 1024).toFixed(2)} MB, Version ${version}`);
