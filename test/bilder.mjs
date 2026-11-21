// Macht Bildschirmfotos des Baukastens mit Beispieldaten (hell und dunkel), zum Beurteilen der Gestaltung.
// Aufruf: node test/bilder.mjs [chromium|firefox|webkit]
import { chromium, firefox, webkit } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const browserName = process.argv[2] || 'chromium';
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(wurzel, 'test', 'daten-demo');
const ausgabe = join(wurzel, 'test', 'ausgabe');
const seiteUrl = pathToFileURL(join(wurzel, 'PDF-Baukasten.html')).href;

// Erfundene Beispieldokumente (keine echten Daten)
const TEXT = 'Sehr geehrte Damen und Herren, anbei erhalten Sie die gewünschten Unterlagen zur Durchsicht. Bitte prüfen Sie die Angaben und geben Sie uns bis zum Monatsende eine kurze Rückmeldung. Für Rückfragen stehen wir Ihnen gern zur Verfügung.';
const DOKUMENTE = [
  ['scan_0001.pdf', 'Angebot Dachsanierung', 3], ['scan_0002.pdf', 'Protokoll Eigentümerversammlung', 6], ['scan_0003.pdf', 'Wartungsvertrag Heizung', 4],
  ['scan_0004.pdf', 'Lageplan Grundstück', 1, true], ['scan_0005.pdf', 'Rechnung Elektro März', 2], ['scan_0006.pdf', 'Energieausweis', 5],
  ['scan_0007.pdf', 'Hausordnung', 2], ['scan_0008.pdf', 'Versicherungsschein Gebäude', 8], ['scan_0009.pdf', 'Abnahmeprotokoll Aufzug', 3],
  ['scan_0010.pdf', 'Wirtschaftsplan 2027', 4, true], ['scan_0011.pdf', 'Brandschutzkonzept', 12], ['scan_0012.pdf', 'Rechnung Gartenpflege', 1],
  ['scan_0013.pdf', 'Mietvertrag Stellplatz 4', 3], ['scan_0014.pdf', 'Prüfbericht Spielplatz', 2],
];

function umbrich(text, schrift, groesse, breite) {
  const zeilen = [];
  let zeile = '';
  for (const wort of text.split(' ')) {
    const probe = zeile ? `${zeile} ${wort}` : wort;
    if (schrift.widthOfTextAtSize(probe, groesse) > breite) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

async function erzeugeDemo() {
  rmSync(demo, { recursive: true, force: true });
  mkdirSync(demo, { recursive: true });
  mkdirSync(ausgabe, { recursive: true });
  for (const [datei, titel, seiten, quer] of DOKUMENTE) {
    const doc = await PDFDocument.create();
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const fett = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let s = 0; s < seiten; s++) {
      const seite = doc.addPage(quer ? [841.89, 595.28] : [595.28, 841.89]);
      const b = seite.getWidth();
      let y = seite.getHeight() - 78;
      if (s === 0) {
        seite.drawRectangle({ x: 56, y: y + 8, width: 46, height: 46, color: rgb(0.12, 0.2, 0.42) });
        seite.drawText('Hausverwaltung Beispiel GmbH', { x: 114, y: y + 36, size: 11, font: fett, color: rgb(0.12, 0.2, 0.42) });
        seite.drawText('Musterweg 1, 12345 Beispielstadt', { x: 114, y: y + 20, size: 9, font: normal, color: rgb(0.4, 0.4, 0.4) });
        y -= 44;
        seite.drawText(titel, { x: 56, y, size: 22, font: fett, color: rgb(0.1, 0.1, 0.1) });
        y -= 34;
      } else {
        seite.drawText(titel, { x: 56, y: y + 30, size: 9, font: normal, color: rgb(0.45, 0.45, 0.45) });
        seite.drawLine({ start: { x: 56, y: y + 20 }, end: { x: b - 56, y: y + 20 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
      }
      for (let absatz = 0; absatz < 9 && y > 120; absatz++) {
        if (absatz % 3 === 1) { seite.drawText(`${s + 1}.${absatz} Abschnitt`, { x: 56, y, size: 12, font: fett, color: rgb(0.1, 0.1, 0.1) }); y -= 20; }
        if (absatz === 4 && y > 260) {
          for (let r = 0; r < 5; r++) {
            seite.drawRectangle({ x: 56, y: y - 14, width: b - 112, height: 20, color: r === 0 ? rgb(0.9, 0.92, 0.95) : undefined, borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 0.6 });
            seite.drawText(r === 0 ? 'Position' : `Leistung ${r}`, { x: 64, y: y - 8, size: 9, font: r === 0 ? fett : normal });
            seite.drawText(r === 0 ? 'Betrag' : `${(r * 137.5).toFixed(2)} EUR`, { x: b - 140, y: y - 8, size: 9, font: r === 0 ? fett : normal });
            y -= 20;
          }
          y -= 14;
          continue;
        }
        for (const zeile of umbrich(TEXT, normal, 10, b - 112)) { seite.drawText(zeile, { x: 56, y, size: 10, font: normal, color: rgb(0.2, 0.2, 0.2) }); y -= 15; }
        y -= 10;
      }
    }
    writeFileSync(join(demo, datei), await doc.save());
  }
}

await erzeugeDemo();
const browser = await { chromium, firefox, webkit }[browserName].launch();

for (const ansicht of ['hell']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: ansicht === 'dunkel' ? 'dark' : 'light', locale: 'de-DE' });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${ansicht}] ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => console.log(`[${ansicht}] Seitenfehler: ${e}`));
  const bild = (name, optionen = {}) => page.screenshot({ path: join(ausgabe, `bild-${browserName}-${ansicht}-${name}.png`), ...optionen });

  await page.goto(seiteUrl);
  await page.waitForSelector('#leer:not([hidden])');
  await page.waitForTimeout(400);
  await bild('1-leer');

  await page.setInputFiles('#datei-wahl', readdirSync(demo).map((n) => join(demo, n)));
  await page.waitForFunction(() => document.querySelector('#import-lauf').hidden, null, { timeout: 60000 });
  // Namen vergeben wie ein Mensch
  for (const [datei, titel] of DOKUMENTE) {
    const feld = page.locator(`#liste input.name[aria-label="Name für ${datei}"]`);
    await feld.fill(titel);
    await feld.blur();
  }
  await page.selectOption('#sortierung', 'neu');
  await page.selectOption('#sortierung', 'name');
  await page.waitForFunction(() => document.querySelectorAll('#liste .daumen img').length === 14, null, { timeout: 60000 });
  await bild('2-bestand');

  for (const titel of ['Angebot Dachsanierung', 'Energieausweis', 'Brandschutzkonzept', 'Lageplan Grundstück', 'Wartungsvertrag Heizung']) {
    await page.locator('#liste > li', { has: page.locator(`input.name[aria-label^="Name für"]`) }).filter({ has: page.locator(`.nur-vorlesen:text-is("${titel} in die Mappe")`) }).locator('input[type="checkbox"]').check();
  }
  await page.fill('#mappe-name', 'Unterlagen Eigentümerversammlung');
  await page.locator('#mappe-name').blur();
  await page.selectOption('#format', 'von');
  await page.locator('#mappe-liste li').nth(0).click({ position: { x: 120, y: 20 } });
  await page.mouse.move(700, 880);
  await page.waitForTimeout(900);
  await bild('3-mappe');
  await bild('3-mappe-ausschnitt', { clip: { x: 988, y: 50, width: 452, height: 560 } });

  await page.locator('.punkt-or').click();
  await page.click('#blatt-vor');
  await page.waitForTimeout(900);
  await bild('4-oben-rechts-ausschnitt', { clip: { x: 988, y: 50, width: 452, height: 560 } });

  await page.locator('.punkt-um').click();
  await page.locator('#liste > li').nth(3).hover();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(700);
  await bild('5-1280x720');
  await context.close();
}

await browser.close();
console.log('Bilder liegen in', ausgabe);
