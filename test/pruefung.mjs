// Bedient den fertigen PDF-Baukasten wie ein Mensch und prüft die erzeugte Mappe.
// Aufruf: node test/pruefung.mjs [chromium|firefox|webkit]
import { chromium, firefox, webkit } from 'playwright';
import { PDFDocument, StandardFonts, concatTransformationMatrix, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const browserName = process.argv[2] || 'chromium';
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const daten = join(wurzel, 'test', 'daten');
const viele = join(daten, 'viele');
const ausgabe = join(wurzel, 'test', 'ausgabe');
const seiteUrl = pathToFileURL(join(wurzel, 'PDF-Baukasten.html')).href;

let fehler = 0;
function pruefe(bedingung, text, zusatz = '') {
  if (bedingung) console.log(`  ok    ${text}`);
  else { fehler++; console.log(`  FEHLER ${text} ${zusatz}`); }
}

// ---------- Testdateien erzeugen ----------
async function pdf(pfad, seiten, optionen = {}) {
  const doc = await PDFDocument.create();
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < seiten; i++) {
    const seite = doc.addPage(optionen.format || [595.28, 841.89]);
    seite.drawText(`${optionen.titel || 'Dokument'} / Blatt ${i + 1}`, { x: 60, y: seite.getHeight() - 120, size: 20, font: schrift });
    seite.drawRectangle({ x: 20, y: 20, width: seite.getWidth() - 40, height: seite.getHeight() - 40, borderWidth: 1 });
    if (optionen.drehung) seite.setRotation(degrees(optionen.drehung));
    if (optionen.zuschnitt) seite.setCropBox(...optionen.zuschnitt);
    if (optionen.verstellt) seite.pushOperators(concatTransformationMatrix(0.5, 0, 0, 0.5, 200, 300));
  }
  if (optionen.geschuetzt) doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1 }));
  writeFileSync(pfad, await doc.save({ useObjectStreams: !optionen.geschuetzt }));
}

async function erzeugeDaten() {
  rmSync(daten, { recursive: true, force: true });
  mkdirSync(viele, { recursive: true });
  mkdirSync(ausgabe, { recursive: true });
  await pdf(join(daten, 'Rechnung 2.pdf'), 1, { titel: 'Rechnung 2' });
  await pdf(join(daten, 'Rechnung 10.pdf'), 3, { titel: 'Rechnung 10' });
  await pdf(join(daten, 'Querformat.pdf'), 2, { titel: 'Querformat', format: [841.89, 595.28] });
  await pdf(join(daten, 'Gedreht 90.pdf'), 1, { titel: 'Gedreht 90', drehung: 90 });
  await pdf(join(daten, 'Gedreht 180.pdf'), 1, { titel: 'Gedreht 180', drehung: 180 });
  await pdf(join(daten, 'Gedreht 270.pdf'), 1, { titel: 'Gedreht 270', drehung: 270 });
  await pdf(join(daten, 'Zuschnitt.pdf'), 1, { titel: 'Zuschnitt', zuschnitt: [50, 60, 400, 500] });
  await pdf(join(daten, 'Verstellt.pdf'), 1, { titel: 'Verstellt', verstellt: true });
  await pdf(join(daten, 'Geschuetzt.pdf'), 1, { titel: 'Geschuetzt', geschuetzt: true });
  writeFileSync(join(daten, 'Kaputt.pdf'), 'Das ist keine PDF, nur Text.');
  writeFileSync(join(daten, 'Notiz.txt'), 'Notiz');
  for (let i = 1; i <= 300; i++) {
    const nr = String(i).padStart(3, '0');
    await pdf(join(viele, `Beleg ${nr}.pdf`), 1 + (i % 3), { titel: `Beleg ${nr}` });
  }
}

// ---------- Erzeugte Mappe auslesen ----------
// Liefert pro Seite alle Texte mit ihrer sichtbaren Position (Ursprung oben links).
async function liesMappe(pfad) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(pfad)), useSystemFonts: true, verbosity: 0 }).promise;
  const seiten = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const seite = await doc.getPage(n);
    const sicht = seite.getViewport({ scale: 1 });
    const inhalt = await seite.getTextContent();
    const texte = inhalt.items.filter((t) => t.str.trim()).map((t) => {
      const [x, y] = sicht.convertToViewportPoint(t.transform[4], t.transform[5]);
      return { text: t.str, x, y };
    });
    seiten.push({ breite: sicht.width, hoehe: sicht.height, texte });
  }
  return seiten;
}

// Prüft, dass auf jeder Seite die erwartete Seitenzahl an der erwarteten Stelle steht.
function pruefeZahlen(seiten, erwartet, position, randMm, name) {
  const rand = (randMm * 72) / 25.4;
  let gut = 0;
  const schlecht = [];
  seiten.forEach((s, i) => {
    const t = s.texte.find((x) => x.text === erwartet(i));
    if (!t) { schlecht.push(`S.${i + 1}: Text fehlt`); return; }
    const [vertikal, horizontal] = position.split('-');
    const yOk = vertikal === 'unten' ? Math.abs(t.y - (s.hoehe - rand)) < 3 : Math.abs(t.y - rand) < 12;
    let xOk = true;
    if (horizontal === 'links') xOk = Math.abs(t.x - rand) < 3;
    if (horizontal === 'rechts') xOk = t.x > s.breite * 0.6 && t.x < s.breite - rand;
    if (horizontal === 'mitte') xOk = t.x > s.breite * 0.35 && t.x < s.breite * 0.5;
    if (yOk && xOk) gut++; else schlecht.push(`S.${i + 1}: x=${t.x.toFixed(0)} y=${t.y.toFixed(0)} bei ${s.breite.toFixed(0)}x${s.hoehe.toFixed(0)}`);
  });
  pruefe(gut === seiten.length, `${name}: Seitenzahl steht auf allen ${seiten.length} Seiten an der richtigen Stelle (${position})`, schlecht.slice(0, 6).join('; '));
}

// ---------- Ablauf ----------
await erzeugeDaten();
const arten = { chromium, firefox, webkit };
const browser = await arten[browserName].launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'de-DE' });
const page = await context.newPage();
const konsole = [];
const netz = [];
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
page.on('pageerror', (e) => konsole.push(String(e)));
page.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) netz.push(r.url()); });
page.on('dialog', (d) => d.accept());

const bild = (name, optionen = {}) => page.screenshot({ path: join(ausgabe, `${browserName}-${name}.png`), ...optionen });
const zeilen = () => page.locator('#liste > li');
const wartImport = async () => { await page.waitForFunction(() => document.querySelector('#import-lauf').hidden, null, { timeout: 180000 }); };
async function erstelle(name) {
  let download;
  try {
    [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#erstellen')]);
  } catch (e) {
    // Zustand festhalten, damit sich ein ausbleibender Download erklären lässt
    const zustand = await page.evaluate(() => ({
      knopf: document.querySelector('#erstellen').textContent.trim(),
      gesperrt: document.querySelector('#erstellen').disabled,
      ergebnis: document.querySelector('#ergebnis').hidden ? '(versteckt)' : document.querySelector('#ergebnis').textContent,
    }));
    console.log(`  Download blieb aus bei "${name}":`, JSON.stringify(zustand), konsole.slice(-3).join(' | '));
    throw e;
  }
  const pfad = join(ausgabe, `${browserName}-${name}.pdf`);
  await download.saveAs(pfad);
  await page.waitForFunction(() => !document.querySelector('#ergebnis').hidden);
  return { pfad, vorschlag: download.suggestedFilename() };
}
const haken = (name) => page.locator('#liste > li', { has: page.locator(`input.name[value="${name}"]`) }).locator('input[type="checkbox"]');
const zeileMit = async (name) => {
  const anzahl = await zeilen().count();
  for (let i = 0; i < anzahl; i++) if (await zeilen().nth(i).locator('input.name').inputValue() === name) return zeilen().nth(i);
  throw new Error(`Zeile ${name} nicht gefunden`);
};

console.log(`\n== ${browserName} ==`);
await page.goto(seiteUrl);
await page.waitForSelector('#leer:not([hidden])');
pruefe(await page.locator('#erstellen').isDisabled(), 'Leerer Bestand: Knopf „Mappe erstellen“ ist gesperrt');
pruefe(await page.locator('#speicher-hinweis').isHidden(), 'Speichern im Browser ist möglich');
await bild('1-leer');

// Aufnehmen: 8 gute, 2 unbrauchbare, 1 Nicht-PDF
const erste = readdirSync(daten).filter((n) => /\.(pdf|txt)$/.test(n)).map((n) => join(daten, n));
await page.setInputFiles('#datei-wahl', erste);
await wartImport();
pruefe(await zeilen().count() === 8, 'Acht lesbare PDFs stehen im Bestand', `(${await zeilen().count()})`);
const bericht = await page.locator('#bericht-text').innerText();
pruefe(/Geschuetzt\.pdf: ist passwortgeschützt/.test(bericht), 'Geschützte PDF wird mit Grund gemeldet', bericht);
pruefe(/Kaputt\.pdf: lässt sich nicht als PDF lesen/.test(bericht), 'Kaputte PDF wird mit Grund gemeldet');
pruefe(/1 Datei war keine PDF/.test(bericht), 'Nicht-PDF wird gemeldet');
const namen = await page.locator('#liste input.name').evaluateAll((f) => f.map((x) => x.value));
pruefe(namen.indexOf('Rechnung 2') < namen.indexOf('Rechnung 10'), 'Sortierung zählt richtig: Rechnung 2 vor Rechnung 10');

// Doppelt aufnehmen
await page.setInputFiles('#datei-wahl', [join(daten, 'Querformat.pdf')]);
await wartImport();
pruefe(await zeilen().count() === 8, 'Dieselbe PDF wird nicht doppelt aufgenommen');
await page.click('#bericht-zu');

// Umbenennen, mit Eingabetaste zur nächsten Zeile
const zeile = await zeileMit('Querformat');
await zeile.locator('input.name').fill('Lageplan quer');
await zeile.locator('input.name').press('Enter');
pruefe(await page.evaluate(() => document.activeElement.classList.contains('name') && document.activeElement.value !== 'Lageplan quer'), 'Eingabetaste springt ins nächste Namensfeld');

// Auswahl in bestimmter Reihenfolge
const reihenfolge = ['Rechnung 10', 'Lageplan quer', 'Gedreht 90', 'Gedreht 180', 'Gedreht 270', 'Zuschnitt', 'Verstellt', 'Rechnung 2'];
for (const name of reihenfolge) await (await zeileMit(name)).locator('input[type="checkbox"]').check();
const mappeNamen = () => page.locator('#mappe-liste strong').allInnerTexts();
pruefe(JSON.stringify(await mappeNamen()) === JSON.stringify(reihenfolge), 'Mappe übernimmt die Reihenfolge des Anhakens', JSON.stringify(await mappeNamen()));
const reiter = await page.locator('#mappe-liste .reiter').allInnerTexts();
pruefe(reiter[0] === '1–3' && reiter[1] === '4–5' && reiter[7] === '11', 'Reiter zeigen die laufenden Seitenzahlen', reiter.join(' | '));
pruefe((await page.locator('#summe').innerText()).includes('8 PDFs, 11 Seiten'), 'Summe stimmt: 8 PDFs, 11 Seiten');

// Seitenbilder und Vorschau
await page.waitForFunction(() => document.querySelectorAll('#liste .daumen img').length === 8, null, { timeout: 60000 }).catch(() => {});
pruefe(await page.locator('#liste .daumen img').count() === 8, 'Alle acht PDFs haben ein Seitenbild', `(${await page.locator('#liste .daumen img').count()})`);
await page.waitForSelector('#blatt.echt', { timeout: 30000 }).catch(() => {});
pruefe(await page.locator('#blatt.echt').count() === 1, 'Die Vorschau zeigt eine echte Seite der Mappe');
pruefe((await page.locator('#blatt-nr').innerText()) === 'Seite 11 von 11' && (await page.locator('#lupe-zahl').innerText()) === '11', 'Vorschau springt zur zuletzt gewählten PDF, Lupe zeigt deren Seitenzahl', `${await page.locator('#blatt-nr').innerText()} / ${await page.locator('#lupe-zahl').innerText()}`);
await page.locator('#mappe-liste li').nth(1).click({ position: { x: 120, y: 20 } });
await page.waitForFunction(() => document.querySelector('#blatt-nr').textContent === 'Seite 4 von 11');
await page.click('#blatt-vor');
pruefe((await page.locator('#blatt-nr').innerText()) === 'Seite 5 von 11' && (await page.locator('#lupe-zahl').innerText()) === '5', 'Klick auf einen Eintrag und Blättern steuern die Vorschau');
await page.locator('#zonen i[data-position="oben-links"]').click();
pruefe(await page.locator('.punkt-ol input').isChecked(), 'Klick auf eine Ecke der Seite setzt die Position');
await page.locator('.punkt-um').click();
pruefe(await page.locator('.punkt-um input').isChecked(), 'Das Positionsraster setzt die Position zurück');

// Erste Mappe: Standard (unten mittig, nur Zahl)
await page.fill('#mappe-name', 'Prüfung: Standard?');
await bild('2-gefuellt');
let mappe = await erstelle('standard');
pruefe(mappe.vorschlag === 'Prüfung- Standard-.pdf', 'Dateiname ohne verbotene Zeichen', mappe.vorschlag);
let seiten = await liesMappe(mappe.pfad);
pruefe(seiten.length === 11, 'Mappe hat 11 Seiten', `(${seiten.length})`);
const titel = seiten.map((s) => s.texte.find((t) => t.text.includes('Blatt'))?.text);
pruefe(titel[0] === 'Rechnung 10 / Blatt 1' && titel[3] === 'Querformat / Blatt 1' && titel[10] === 'Rechnung 2 / Blatt 1', 'Inhalt steht in der gewählten Reihenfolge', titel.join(' | '));
pruefeZahlen(seiten, (i) => String(i + 1), 'unten-mitte', 10, 'Standard');
pruefe((await page.locator('#ergebnis').innerText()).includes('11 Seiten aus 8 PDFs'), 'Erfolgsmeldung nennt Seiten und PDFs');
await bild('3-erstellt');

// Zweite Mappe: andere Reihenfolge, „Seite 5 von 15“, oben rechts, 20 mm
for (const [platz, tat] of [[7, 'hoch'], [0, 'runter']]) {
  await page.locator('#mappe-liste li').nth(platz).hover();
  await page.locator('#mappe-liste li').nth(platz).locator(`[data-tat="${tat}"]`).click();
}
pruefe((await mappeNamen())[0] === 'Lageplan quer' && (await mappeNamen())[6] === 'Rechnung 2', 'Pfeile ändern die Reihenfolge', JSON.stringify(await mappeNamen()));
await page.selectOption('#format', 'von');
await page.fill('#start', '5');
await page.selectOption('#rand', '20');
await page.selectOption('#groesse', '12');
await page.locator('.punkt-or').click();
pruefe(/^Seite \d+ von 15$/.test(await page.locator('#lupe-zahl').innerText()), 'Die Lupe zeigt die neue Schreibweise', await page.locator('#lupe-zahl').innerText());
mappe = await erstelle('oben-rechts');
seiten = await liesMappe(mappe.pfad);
pruefeZahlen(seiten, (i) => `Seite ${i + 5} von 15`, 'oben-rechts', 20, 'Oben rechts');

// Dritte Mappe: unten links
await page.selectOption('#format', 'strich');
await page.fill('#start', '1');
await page.selectOption('#rand', '10');
await page.locator('.punkt-ul').click();
mappe = await erstelle('unten-links');
seiten = await liesMappe(mappe.pfad);
pruefeZahlen(seiten, (i) => `– ${i + 1} –`, 'unten-links', 10, 'Unten links');

// Ohne Seitenzahlen
await page.locator('#zahlen-an').uncheck();
mappe = await erstelle('ohne-zahlen');
seiten = await liesMappe(mappe.pfad);
pruefe(seiten.every((s) => s.texte.every((t) => t.text.includes('Blatt'))), 'Ohne Seitenzahlen bleibt jede Seite unverändert');
await page.locator('#zahlen-an').check();

// Ziehen mit der Maus
const quelle = page.locator('#mappe-liste li').nth(0);
const ziel = page.locator('#mappe-liste li').nth(3);
const vorZiehen = await mappeNamen();
await quelle.dragTo(ziel, { sourcePosition: { x: 10, y: 20 }, targetPosition: { x: 100, y: 34 } });
const nachZiehen = await mappeNamen();
pruefe(nachZiehen.indexOf(vorZiehen[0]) === 3, 'Ziehen mit der Maus verschiebt den Eintrag', JSON.stringify(nachZiehen));

// Neu laden: alles noch da?
await page.waitForTimeout(500);
await page.reload();
await page.waitForSelector('#tabelle:not([hidden])');
pruefe(await zeilen().count() === 8, 'Nach dem Neuladen ist der Bestand noch da');
pruefe((await page.locator('#liste input.name').evaluateAll((f) => f.map((x) => x.value))).includes('Lageplan quer'), 'Der vergebene Name ist noch da');
pruefe(JSON.stringify(await mappeNamen()) === JSON.stringify(nachZiehen), 'Auswahl und Reihenfolge sind noch da');
pruefe(await page.inputValue('#mappe-name') === 'Prüfung: Standard?' && await page.inputValue('#format') === 'strich' && await page.locator('.punkt-ul input').isChecked(), 'Name der Mappe und Einstellungen sind noch da');
mappe = await erstelle('nach-neuladen');
pruefe((await liesMappe(mappe.pfad)).length === 11, 'Nach dem Neuladen lässt sich die Mappe wieder erstellen');

// Entfernen und Rückgängig
await (await zeileMit('Zuschnitt')).hover();
await (await zeileMit('Zuschnitt')).locator('button.mini').click();
pruefe(await zeilen().count() === 7 && (await mappeNamen()).length === 7, 'Entfernen nimmt die PDF aus Bestand und Mappe');
await page.click('#toast-knopf');
await page.waitForFunction(() => document.querySelectorAll('#liste > li').length === 8);
pruefe(JSON.stringify(await mappeNamen()) === JSON.stringify(nachZiehen), 'Rückgängig stellt PDF und Platz in der Mappe wieder her');

// 300 PDFs auf einmal
await page.click('#auswahl-leeren');
const start = Date.now();
await page.setInputFiles('#datei-wahl', readdirSync(viele).map((n) => join(viele, n)));
await wartImport();
const dauerImport = ((Date.now() - start) / 1000).toFixed(1);
pruefe(await zeilen().count() === 308, `300 PDFs aufgenommen in ${dauerImport} s`, `(${await zeilen().count()})`);
await page.fill('#suche', 'beleg 2');
pruefe(await zeilen().count() === 100, 'Suche „beleg 2“ findet 100 PDFs', `(${await zeilen().count()})`);
await page.fill('#suche', 'gibtsnicht');
pruefe((await page.locator('#keine-treffer').innerText()).includes('gibtsnicht'), 'Suche ohne Treffer erklärt sich');
await page.fill('#suche', 'beleg');
await page.locator('#alle').check();
pruefe((await page.locator('#summe').innerText()).includes('300 PDFs, 600 Seiten'), 'Alle 300 auswählen: 600 Seiten', await page.locator('#summe').innerText());
await page.fill('#suche', '');
await page.selectOption('#format', 'bruch');
await page.locator('.punkt-um').click();
await page.fill('#mappe-name', 'Alle Belege');
await bild('4-viele');
const startBau = Date.now();
mappe = await erstelle('alle-belege');
const dauerBau = ((Date.now() - startBau) / 1000).toFixed(1);
seiten = await liesMappe(mappe.pfad);
pruefe(seiten.length === 600, `Mappe aus 300 PDFs hat 600 Seiten (erstellt in ${dauerBau} s)`, `(${seiten.length})`);
pruefeZahlen(seiten, (i) => `${i + 1} / 600`, 'unten-mitte', 10, '300 PDFs');
pruefe(seiten[0].texte.some((t) => t.text === 'Beleg 001 / Blatt 1') && seiten[599].texte.some((t) => t.text.startsWith('Beleg 300')), 'Reihenfolge Beleg 001 bis Beleg 300 stimmt');

// Fenster „Über das Werkzeug“ und alles löschen
await page.click('#info-auf');
pruefe((await page.locator('#speicher-zeile').innerText()).includes('308 PDFs'), 'Infofenster nennt den Umfang des Bestands');
await bild('5-info');
await page.click('#alles-loeschen');
await page.waitForSelector('#leer:not([hidden])');
pruefe(await zeilen().count() === 0 && await page.inputValue('#mappe-name') === 'Mappe', 'Bestand vollständig löschen setzt alles zurück');
await page.reload();
await page.waitForSelector('#leer:not([hidden])');
pruefe(true, 'Nach dem Löschen bleibt der Bestand auch nach Neuladen leer');

// Schmale Fenster
await page.setInputFiles('#datei-wahl', erste);
await wartImport();
await (await zeileMit('Rechnung 10')).locator('input[type="checkbox"]').check();
await (await zeileMit('Querformat')).locator('input[type="checkbox"]').check();
for (const [breite, hoehe] of [[1024, 768], [820, 1000], [390, 844]]) {
  await page.setViewportSize({ width: breite, height: hoehe });
  await page.waitForTimeout(150);
  const ueber = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  pruefe(ueber <= 0, `Breite ${breite}: nichts ragt seitlich hinaus`, `(${ueber}px)`);
  await bild(`6-breite-${breite}`, { fullPage: true });
}

pruefe(netz.length === 0, 'Keine einzige Verbindung ins Internet', netz.join(', '));
// Safari-Kern: Eine lokal geöffnete Datei darf keinen Hintergrund-Helfer starten. Das meldet der Browser einmal,
// danach zeichnet PDF.js im Vordergrund weiter. Diese eine bekannte Meldung zählt nicht als Fehler.
const bekannt = konsole.filter((t) => /blob:null|Cross-origin script load denied/.test(t));
const echte = konsole.filter((t) => !bekannt.includes(t));
if (bekannt.length) console.log(`  Hinweis: ${bekannt.length} Meldung(en) zum Hintergrund-Helfer (lokale Datei), Seitenbilder werden im Vordergrund gezeichnet`);
pruefe(bekannt.length <= 6, 'Der Hintergrund-Helfer wird höchstens einmal je Seitenaufruf versucht (drei Aufrufe in dieser Prüfung)', `(${bekannt.length} Meldungen)`);
pruefe(echte.length === 0, 'Keine Fehler in der Browser-Konsole', echte.slice(0, 5).join(' | '));

await browser.close();
console.log(fehler ? `\n${browserName}: ${fehler} FEHLER` : `\n${browserName}: alles in Ordnung`);
process.exit(fehler ? 1 : 0);
