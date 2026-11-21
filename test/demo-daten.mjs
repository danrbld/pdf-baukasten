// Erzeugt 300 erfundene Beispiel-PDFs zum Vorführen (keine echten Daten, alle Namen ausgedacht).
// Aufruf: node test/demo-daten.mjs <Zielordner>
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ziel = resolve(process.argv[2] || 'test/daten-demo300');

// Fester Zufall: jeder Lauf erzeugt dieselben Dateien
let saat = 20261121;
const zufall = () => { saat = (saat + 0x6D2B79F5) | 0; let t = Math.imul(saat ^ (saat >>> 15), 1 | saat); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const wahl = (liste) => liste[Math.floor(zufall() * liste.length)];
const zwischen = (a, b) => a + Math.floor(zufall() * (b - a + 1));

const FIRMEN = ['Elektro Nordlicht', 'Malerbetrieb Sonnenhof', 'Gartenbau Lindenweg', 'Sanitär Hafenkante', 'Dachdeckerei Firstblick', 'Schlosserei Eisenwerk', 'Reinigung Glanzpunkt', 'Aufzugtechnik Hochauf', 'Heizungsbau Warmwerk', 'Tischlerei Astrein'];
const THEMEN = ['Treppenhaus', 'Tiefgarage', 'Dach Haus A', 'Dach Haus B', 'Heizungsanlage', 'Aufzug Haus C', 'Spielplatz', 'Außenanlage', 'Fassade Nord', 'Fassade Süd', 'Kellerabgang', 'Müllplatz', 'Fahrradraum', 'Waschküche', 'Hofbeleuchtung', 'Briefkastenanlage'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const SATZ = [
  'Die Arbeiten wurden wie vereinbart ausgeführt und am Ende gemeinsam mit dem Auftraggeber abgenommen.',
  'Bei der Begehung wurden keine sicherheitsrelevanten Mängel festgestellt. Kleinere Hinweise sind in der Liste vermerkt.',
  'Die Kosten verteilen sich nach dem vereinbarten Schlüssel auf alle Einheiten des Hauses.',
  'Für Rückfragen steht das Büro werktags zwischen neun und sechzehn Uhr zur Verfügung.',
  'Die nächste Prüfung ist für das kommende Frühjahr vorgesehen und wird rechtzeitig angekündigt.',
  'Alle Beträge verstehen sich in Euro. Diese Unterlage ist ein Beispiel und enthält keine echten Daten.',
  'Die Beschlussfassung erfolgte einstimmig. Enthaltungen wurden nicht abgegeben.',
  'Der Zugang zu den betroffenen Räumen wird am Vortag durch den Hausmeister sichergestellt.',
];

const ARTEN = [
  { art: 'Rechnung', farbe: [0.13, 0.27, 0.53], seiten: [1, 2], gewicht: 30, name: (n) => `Rechnung ${2026}-${String(n).padStart(4, '0')} ${wahl(FIRMEN)}` },
  { art: 'Angebot', farbe: [0.05, 0.42, 0.43], seiten: [2, 4], gewicht: 14, name: () => `Angebot ${wahl(THEMEN)} ${wahl(FIRMEN)}` },
  { art: 'Protokoll', farbe: [0.33, 0.25, 0.55], seiten: [3, 7], gewicht: 14, name: (n) => `Protokoll ${wahl(['Begehung', 'Beiratssitzung', 'Versammlung', 'Abnahme'])} ${wahl(MONATE)} ${zwischen(2023, 2026)}` },
  { art: 'Vertrag', farbe: [0.15, 0.17, 0.2], seiten: [4, 8], gewicht: 9, name: () => `${wahl(['Wartungsvertrag', 'Dienstleistungsvertrag', 'Mietvertrag Stellplatz', 'Rahmenvertrag'])} ${wahl(THEMEN)}` },
  { art: 'Lieferschein', farbe: [0.72, 0.38, 0.05], seiten: [1, 1], gewicht: 10, name: (n) => `Lieferschein ${String(40000 + n * 7)} ${wahl(FIRMEN)}` },
  { art: 'Prüfbericht', farbe: [0.12, 0.45, 0.25], seiten: [2, 5], gewicht: 12, name: () => `Prüfbericht ${wahl(THEMEN)} ${zwischen(2022, 2026)}` },
  { art: 'Plan', farbe: [0.35, 0.38, 0.42], seiten: [1, 2], gewicht: 6, quer: true, name: () => `${wahl(['Lageplan', 'Grundriss', 'Schnitt', 'Fluchtwegplan'])} ${wahl(THEMEN)}` },
  { art: 'Scan', farbe: [0.5, 0.5, 0.5], seiten: [1, 3], gewicht: 5, name: (n) => `scan_2026${String(zwischen(1, 11)).padStart(2, '0')}${String(zwischen(1, 28)).padStart(2, '0')}_${String(n).padStart(4, '0')}` },
];
const topf = ARTEN.flatMap((a) => Array(a.gewicht).fill(a));

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

async function baue(art, titel) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const farbe = rgb(...art.farbe);
  const seiten = zwischen(...art.seiten);
  for (let s = 0; s < seiten; s++) {
    const seite = doc.addPage(art.quer ? [841.89, 595.28] : [595.28, 841.89]);
    const b = seite.getWidth();
    const h = seite.getHeight();
    let y = h - 70;
    if (s === 0) {
      seite.drawRectangle({ x: 0, y: h - 14, width: b, height: 14, color: farbe });
      seite.drawRectangle({ x: 56, y: y - 6, width: 40, height: 40, color: farbe });
      seite.drawText('Hausverwaltung Beispiel GmbH', { x: 108, y: y + 18, size: 11, font: fett, color: farbe });
      seite.drawText('Musterweg 1, 12345 Beispielstadt', { x: 108, y: y + 3, size: 9, font: normal, color: rgb(0.45, 0.45, 0.45) });
      seite.drawText(art.art.toUpperCase(), { x: b - 56 - fett.widthOfTextAtSize(art.art.toUpperCase(), 10), y: y + 18, size: 10, font: fett, color: farbe });
      y -= 58;
      for (const zeile of umbrich(titel, fett, 20, b - 112)) { seite.drawText(zeile, { x: 56, y, size: 20, font: fett, color: rgb(0.1, 0.1, 0.1) }); y -= 26; }
      y -= 12;
    } else {
      seite.drawText(titel, { x: 56, y: y + 22, size: 9, font: normal, color: rgb(0.45, 0.45, 0.45) });
      seite.drawLine({ start: { x: 56, y: y + 12 }, end: { x: b - 56, y: y + 12 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
      y -= 14;
    }

    if (art.art === 'Plan') {
      // Ein einfacher Grundriss aus Rechtecken
      const x0 = 70, y0 = 80, bb = b - 140, hh = y - 100;
      seite.drawRectangle({ x: x0, y: y0, width: bb, height: hh, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.6 });
      for (let i = 1; i < 5; i++) seite.drawLine({ start: { x: x0 + (bb / 5) * i, y: y0 }, end: { x: x0 + (bb / 5) * i, y: y0 + hh * (0.4 + zufall() * 0.6) }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
      for (let i = 1; i < 3; i++) seite.drawLine({ start: { x: x0, y: y0 + (hh / 3) * i }, end: { x: x0 + bb * (0.5 + zufall() * 0.5), y: y0 + (hh / 3) * i }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
      for (let i = 0; i < 6; i++) seite.drawText(`R ${s + 1}.${i + 1}`, { x: x0 + 14 + (bb / 5) * (i % 5), y: y0 + 16 + (hh / 3) * (i % 3), size: 9, font: normal, color: rgb(0.4, 0.4, 0.4) });
      continue;
    }

    let absatz = 0;
    while (y > 130) {
      if ((art.art === 'Rechnung' || art.art === 'Lieferschein' || art.art === 'Angebot') && absatz === 1 && y > 300) {
        const zeilen = zwischen(4, 9);
        for (let r = 0; r <= zeilen && y > 130; r++) {
          seite.drawRectangle({ x: 56, y: y - 14, width: b - 112, height: 20, color: r === 0 ? rgb(0.92, 0.93, 0.95) : undefined, borderColor: rgb(0.82, 0.83, 0.86), borderWidth: 0.6 });
          seite.drawText(r === 0 ? 'Position' : `${r}  ${wahl(['Material', 'Arbeitszeit', 'Anfahrt', 'Kleinteile', 'Entsorgung', 'Wartung'])} ${wahl(THEMEN)}`, { x: 64, y: y - 8, size: 9, font: r === 0 ? fett : normal });
          if (art.art !== 'Lieferschein') {
            const betrag = r === 0 ? 'Betrag' : `${(zwischen(20, 900) + zufall()).toFixed(2).replace('.', ',')} EUR`;
            seite.drawText(betrag, { x: b - 64 - (r === 0 ? fett : normal).widthOfTextAtSize(betrag, 9), y: y - 8, size: 9, font: r === 0 ? fett : normal });
          }
          y -= 20;
        }
        y -= 16;
      } else {
        if (absatz % 3 === 0 && art.art !== 'Scan') { seite.drawText(`${s + 1}.${absatz / 3 + 1}  ${wahl(['Ausgangslage', 'Feststellungen', 'Leistungen', 'Termine', 'Hinweise', 'Beschluss', 'Zuständigkeit'])}`, { x: 56, y, size: 12, font: fett, color: rgb(0.1, 0.1, 0.1) }); y -= 20; }
        const text = Array.from({ length: zwischen(2, 4) }, () => wahl(SATZ)).join(' ');
        for (const zeile of umbrich(text, normal, 10, b - 112)) { if (y < 120) break; seite.drawText(zeile, { x: 56, y, size: 10, font: normal, color: rgb(0.2, 0.2, 0.2) }); y -= 15; }
        y -= 12;
      }
      absatz++;
      if (art.art === 'Lieferschein' && absatz > 2) break;
    }
    if (art.art === 'Vertrag' && s === seiten - 1) {
      seite.drawLine({ start: { x: 56, y: 100 }, end: { x: 236, y: 100 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      seite.drawLine({ start: { x: b - 236, y: 100 }, end: { x: b - 56, y: 100 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      seite.drawText('Auftraggeber', { x: 56, y: 86, size: 8, font: normal, color: rgb(0.45, 0.45, 0.45) });
      seite.drawText('Auftragnehmer', { x: b - 236, y: 86, size: 8, font: normal, color: rgb(0.45, 0.45, 0.45) });
    }
  }
  return { bytes: await doc.save(), seiten };
}

rmSync(ziel, { recursive: true, force: true });
mkdirSync(ziel, { recursive: true });
const vergeben = new Set();
let gesamt = 0;
for (let n = 1; n <= 300; n++) {
  const art = wahl(topf);
  let titel = art.name(n);
  while (vergeben.has(titel)) titel = `${art.name(n)} ${zwischen(2, 9)}`;
  vergeben.add(titel);
  const { bytes, seiten } = await baue(art, art.art === 'Scan' ? 'Eingescanntes Dokument' : titel);
  gesamt += seiten;
  writeFileSync(join(ziel, `${titel}.pdf`), bytes);
}
console.log(`300 Beispiel-PDFs mit zusammen ${gesamt} Seiten in ${ziel}`);
