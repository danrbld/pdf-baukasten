(() => {
'use strict';

const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState } = PDFLib;
const $ = (s) => document.querySelector(s);
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const grenze = (wert, min, max) => Math.min(Math.max(wert, min), max);
const sortierer = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Speicher: Der Bestand liegt in der Datenbank des Browsers (IndexedDB).
// Erlaubt der Browser das nicht, arbeitet der Baukasten ohne Speichern weiter.
// ---------------------------------------------------------------------------
const LAGER = ['bestand', 'dateien', 'bilder', 'einstellungen'];
let db = null;
const ersatz = Object.fromEntries(LAGER.map((name) => [name, new Map()]));

function dbOeffnen() {
  return new Promise((fertig) => {
    try {
      const anfrage = indexedDB.open('pdf-baukasten', 1);
      anfrage.onupgradeneeded = () => {
        for (const name of LAGER) {
          if (!anfrage.result.objectStoreNames.contains(name)) anfrage.result.createObjectStore(name);
        }
      };
      anfrage.onsuccess = () => fertig(anfrage.result);
      anfrage.onerror = () => fertig(null);
      anfrage.onblocked = () => fertig(null);
    } catch (e) {
      fertig(null);
    }
  });
}

function dbLauf(lager, schreiben, arbeit) {
  return new Promise((fertig, fehler) => {
    const t = db.transaction(lager, schreiben ? 'readwrite' : 'readonly');
    const anfrage = arbeit(t.objectStore(lager));
    t.oncomplete = () => fertig(anfrage ? anfrage.result : undefined);
    t.onerror = () => fehler(t.error);
    t.onabort = () => fehler(t.error);
  });
}
const lege = (lager, schluessel, wert) => db ? dbLauf(lager, true, (s) => s.put(wert, schluessel)) : Promise.resolve(void ersatz[lager].set(schluessel, wert));
const hole = (lager, schluessel) => db ? dbLauf(lager, false, (s) => s.get(schluessel)) : Promise.resolve(ersatz[lager].get(schluessel));
const holeAlle = (lager) => db ? dbLauf(lager, false, (s) => s.getAll()) : Promise.resolve([...ersatz[lager].values()]);
const entferne = (lager, schluessel) => db ? dbLauf(lager, true, (s) => s.delete(schluessel)) : Promise.resolve(void ersatz[lager].delete(schluessel));
const leere = (lager) => db ? dbLauf(lager, true, (s) => s.clear()) : Promise.resolve(void ersatz[lager].clear());

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
const bestand = new Map();   // id -> { id, name, datei, groesse, seiten, hinzu }
const bilder = new Map();    // id -> kleines Bild der ersten Seite (Data-URL), '' = nicht darstellbar
let auswahl = [];            // ids in der Reihenfolge der Mappe
const STANDARD = { name: 'Mappe', sortierung: 'name', an: true, position: 'unten-mitte', format: 'zahl', start: 1, groesse: 10, rand: 10 };
let mappe = { ...STANDARD };
let importLaeuft = false;
let bauLaeuft = false;
let letzteDatei = null;      // { url, dateiname }

const el = {
  zahl: $('#bestand-zahl'), suche: $('#suche'), sortierung: $('#sortierung'),
  tabelle: $('#tabelle'), liste: $('#liste'), alle: $('#alle'), keineTreffer: $('#keine-treffer'), leer: $('#leer'),
  importLauf: $('#import-lauf'), importText: $('#import-text'), importBalken: $('#import-balken'),
  bericht: $('#import-bericht'), berichtText: $('#bericht-text'), speicherHinweis: $('#speicher-hinweis'),
  abwurf: $('#abwurf'),
  mappeName: $('#mappe-name'), mappeListe: $('#mappe-liste'), mappeLeer: $('#mappe-leer'), auswahlLeeren: $('#auswahl-leeren'),
  zahlen: $('#zahlen'), zahlenAn: $('#zahlen-an'), format: $('#format'), start: $('#start'), groesse: $('#groesse'), rand: $('#rand'),
  summe: $('#summe'), erstellen: $('#erstellen'), erstellenText: $('#erstellen-text'), bauBalken: $('#bau-balken'), ergebnis: $('#ergebnis'),
  blatt: $('#blatt'), blattBild: $('#blatt-bild'), lupe: $('#lupe'), lupeBild: $('#lupe-bild'), lupeZahl: $('#lupe-zahl'),
  blattNr: $('#blatt-nr'), blattZurueck: $('#blatt-zurueck'), blattVor: $('#blatt-vor'),
  toast: $('#toast'), toastText: $('#toast-text'), toastKnopf: $('#toast-knopf'),
  info: $('#info'), speicherZeile: $('#speicher-zeile'),
  dateiWahl: $('#datei-wahl'), ordnerWahl: $('#ordner-wahl'),
};

const SYMBOL = {
  weg: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  hoch: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  runter: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  griff: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>',
};

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------
const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const ohneEndung = (name) => name.replace(/\.pdf$/i, '');
const mehrzahl = (n, eins, viele) => `${n.toLocaleString('de-DE')} ${n === 1 ? eins : viele}`;
const gesamtSeiten = () => auswahl.reduce((summe, id) => summe + (bestand.has(id) ? bestand.get(id).seiten : 0), 0);

function groesseText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('de-DE')} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

function schreibweise(format, nummer, letzte) {
  switch (format) {
    case 'seite': return `Seite ${nummer}`;
    case 'bruch': return `${nummer} / ${letzte}`;
    case 'von': return `Seite ${nummer} von ${letzte}`;
    case 'strich': return `– ${nummer} –`;
    default: return String(nummer);
  }
}

function dateiname(name) {
  const sauber = (name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (sauber || 'Mappe') + '.pdf';
}

let toastUhr = null;
function toast(text, knopfText, knopfTat, dauer = 6000) {
  clearTimeout(toastUhr);
  el.toastText.textContent = text;
  el.toastKnopf.hidden = !knopfText;
  el.toastKnopf.textContent = knopfText || '';
  el.toastKnopf.onclick = knopfTat ? () => { el.toast.hidden = true; knopfTat(); } : null;
  el.toast.hidden = true;
  void el.toast.offsetWidth;   // startet die Einblendung neu
  el.toast.hidden = false;
  toastUhr = setTimeout(() => { el.toast.hidden = true; }, dauer);
}

let speicherUhr = null;
function merkeMappe() {
  clearTimeout(speicherUhr);
  speicherUhr = setTimeout(() => {
    lege('einstellungen', 'mappe', { ...mappe, auswahl }).catch(() => {});
  }, 250);
}

// ---------------------------------------------------------------------------
// Seiten zeichnen (PDF.js). Der Baustein liegt als Text in dieser Datei und wird
// erst geladen, wenn das erste Seitenbild gebraucht wird.
// ---------------------------------------------------------------------------
let pdfjsLaden = null;
let zeichenHelfer = null;   // ein Hintergrund-Helfer für alle Seitenbilder
function ladePdfjs() {
  if (!pdfjsLaden) {
    pdfjsLaden = (async () => {
      const alsAdresse = (id) => URL.createObjectURL(new Blob([document.getElementById(id).textContent], { type: 'text/javascript' }));
      const pdfjs = await import(alsAdresse('pdfjs-quelle'));
      pdfjs.GlobalWorkerOptions.workerSrc = alsAdresse('pdfjs-helfer');
      // Safari erlaubt einer lokal geöffneten Datei keinen Hintergrund-Helfer. PDF.js zeichnet
      // dann von selbst im Vordergrund. Mit einem gemeinsamen Helfer passiert der Versuch nur einmal.
      zeichenHelfer = new pdfjs.PDFWorker();
      return pdfjs;
    })();
  }
  return pdfjsLaden;
}

async function oeffneZumZeichnen(id) {
  const pdfjs = await ladePdfjs();
  const bytes = await hole('dateien', id);
  if (!bytes) throw new Error('Datei fehlt');
  const aufgabe = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), worker: zeichenHelfer, isEvalSupported: false, verbosity: 0 });
  return { aufgabe, pdf: await aufgabe.promise };
}

// Kleine Seitenbilder für die Listen, eines nach dem anderen im Hintergrund
const DAUMEN_KANTE = 120;
const daumenSchlange = [];
let daumenLaeuft = false;

async function maleDaumen(id) {
  const { aufgabe, pdf } = await oeffneZumZeichnen(id);
  try {
    const seite = await pdf.getPage(1);
    const roh = seite.getViewport({ scale: 1 });
    const sicht = seite.getViewport({ scale: DAUMEN_KANTE / Math.max(roh.width, roh.height) });
    const bild = document.createElement('canvas');
    bild.width = Math.max(1, Math.round(sicht.width));
    bild.height = Math.max(1, Math.round(sicht.height));
    await seite.render({ canvasContext: bild.getContext('2d'), viewport: sicht }).promise;
    return bild.toDataURL('image/jpeg', 0.84);
  } finally {
    aufgabe.destroy().catch(() => {});
  }
}

function fordereDaumen() {
  const wartend = new Set(daumenSchlange);
  for (const id of bestand.keys()) {
    if (!bilder.has(id) && !wartend.has(id)) daumenSchlange.push(id);
  }
  bevorzugeSichtbare();
  if (!daumenLaeuft && daumenSchlange.length) daumenSchleife();
}

// Zieht die Zeilen, die gerade im Bestand zu sehen sind, in der Warteschlange nach vorn.
function bevorzugeSichtbare() {
  const zeilen = el.liste.children;
  if (!daumenSchlange.length || !zeilen.length) return;
  const hoehe = zeilen[0].offsetHeight || 50;
  const von = Math.max(0, Math.floor(el.liste.scrollTop / hoehe) - 2);
  const bis = Math.min(zeilen.length, von + Math.ceil(el.liste.clientHeight / hoehe) + 6);
  const wartend = new Set(daumenSchlange);
  const vorn = [];
  for (let i = von; i < bis; i++) if (wartend.has(zeilen[i].dataset.id)) vorn.push(zeilen[i].dataset.id);
  if (!vorn.length) return;
  const nachVorn = new Set(vorn);
  const rest = daumenSchlange.filter((id) => !nachVorn.has(id));
  daumenSchlange.length = 0;
  daumenSchlange.push(...vorn, ...rest);
}

async function daumenSchleife() {
  daumenLaeuft = true;
  while (daumenSchlange.length) {
    if (bauLaeuft || importLaeuft) { await pause(250); continue; }
    const id = daumenSchlange.shift();
    if (!bestand.has(id) || bilder.has(id)) continue;
    let bild = '';
    try { bild = await maleDaumen(id); } catch (e) { bild = ''; }
    if (!bestand.has(id)) continue;
    bilder.set(id, bild);
    lege('bilder', id, bild).catch(() => {});
    for (const platz of document.querySelectorAll(`.daumen[data-daumen="${CSS.escape(id)}"]`)) fuelleDaumen(platz, id, true);
    await pause();
  }
  daumenLaeuft = false;
}

function fuelleDaumen(platz, id, frisch) {
  const bild = bilder.get(id);
  if (bild) {
    const img = document.createElement('img');
    if (frisch) img.className = 'frisch';   // nur beim ersten Erscheinen einblenden
    img.src = bild;
    img.alt = '';
    img.draggable = false;
    platz.replaceChildren(img);
  } else {
    platz.replaceChildren(document.createElement('i'));
  }
}

function daumen(id) {
  const platz = document.createElement('span');
  platz.className = 'daumen';
  platz.dataset.daumen = id;
  fuelleDaumen(platz, id);
  return platz;
}

// ---------------------------------------------------------------------------
// Bestand anzeigen
// ---------------------------------------------------------------------------
function sichtbareDocs() {
  const frage = el.suche.value.trim().toLocaleLowerCase('de');
  let docs = [...bestand.values()];
  if (frage) docs = docs.filter((d) => d.name.toLocaleLowerCase('de').includes(frage) || d.datei.toLocaleLowerCase('de').includes(frage));
  const nachName = (a, b) => sortierer.compare(a.name, b.name) || sortierer.compare(a.datei, b.datei);
  if (mappe.sortierung === 'neu') docs.sort((a, b) => b.hinzu - a.hinzu);
  else if (mappe.sortierung === 'auswahl') {
    const platz = new Map(auswahl.map((id, i) => [id, i]));
    docs.sort((a, b) => {
      const pa = platz.has(a.id) ? platz.get(a.id) : Infinity;
      const pb = platz.has(b.id) ? platz.get(b.id) : Infinity;
      return pa === pb ? nachName(a, b) : pa - pb;
    });
  } else docs.sort(nachName);
  return docs;
}

function zeileBauen(doc) {
  const li = document.createElement('li');
  li.className = 'zeile';
  li.dataset.id = doc.id;
  li.innerHTML =
    '<label class="haken"><input type="checkbox"><span class="kasten"></span><span class="nur-vorlesen"></span></label>' +
    '<span class="daumen-platz"></span>' +
    '<div class="benennung"><input class="name" type="text" maxlength="160" spellcheck="false" autocomplete="off"><span class="datei"></span></div>' +
    '<span class="seiten"></span><span class="groesse"></span>' +
    `<button type="button" class="mini" title="Aus dem Bestand entfernen" aria-label="Aus dem Bestand entfernen">${SYMBOL.weg}</button>`;
  li.querySelector('.nur-vorlesen').textContent = `${doc.name} in die Mappe`;
  li.querySelector('.daumen-platz').replaceWith(daumen(doc.id));
  const name = li.querySelector('.name');
  name.value = doc.name;
  name.setAttribute('aria-label', `Name für ${doc.datei}`);
  const datei = li.querySelector('.datei');
  datei.textContent = doc.datei;
  datei.title = doc.datei;
  li.classList.toggle('umbenannt', doc.name !== ohneEndung(doc.datei));
  li.querySelector('.seiten').textContent = doc.seiten.toLocaleString('de-DE');
  li.querySelector('.groesse').textContent = groesseText(doc.groesse);
  return li;
}

function zeichneBestand() {
  const anzahl = bestand.size;
  el.leer.hidden = anzahl > 0;
  el.tabelle.hidden = anzahl === 0;
  el.zahl.textContent = anzahl ? anzahl.toLocaleString('de-DE') : '';
  el.zahl.title = anzahl ? mehrzahl(anzahl, 'PDF', 'PDFs') : '';
  const docs = sichtbareDocs();
  const teil = document.createDocumentFragment();
  for (const doc of docs) teil.appendChild(zeileBauen(doc));
  el.liste.replaceChildren(teil);
  el.keineTreffer.hidden = docs.length > 0 || anzahl === 0;
  el.liste.hidden = docs.length === 0;
  if (!docs.length && anzahl) el.keineTreffer.textContent = `Keine PDF im Bestand passt zu „${el.suche.value.trim()}“.`;
  zeichneAuswahl();
  bevorzugeSichtbare();
}

// Aktualisiert nur Häkchen, Platznummern und die Mappe. Die Liste bleibt stehen,
// damit beim Anhaken nichts springt.
function zeichneAuswahl() {
  auswahl = auswahl.filter((id) => bestand.has(id));
  const platz = new Map(auswahl.map((id, i) => [id, i + 1]));
  let sichtbar = 0;
  let gewaehlt = 0;
  for (const li of el.liste.children) {
    const nummer = platz.get(li.dataset.id);
    li.classList.toggle('gewaehlt', !!nummer);
    li.querySelector('input[type="checkbox"]').checked = !!nummer;
    li.querySelector('.kasten').textContent = nummer || '';
    sichtbar++;
    if (nummer) gewaehlt++;
  }
  el.alle.checked = sichtbar > 0 && gewaehlt === sichtbar;
  el.alle.indeterminate = gewaehlt > 0 && gewaehlt < sichtbar;
  zeichneMappe();
}

// ---------------------------------------------------------------------------
// Mappe anzeigen
// ---------------------------------------------------------------------------
function zeichneMappe() {
  const docs = auswahl.map((id) => bestand.get(id));
  const seiten = docs.reduce((s, d) => s + d.seiten, 0);
  const start = mappe.start;
  const letzte = start + seiten - 1;
  vorschau.seite = grenze(vorschau.seite, 1, Math.max(1, seiten));
  const gezeigt = seiten ? ortInMappe(vorschau.seite) : null;

  const teil = document.createDocumentFragment();
  let nummer = start;
  docs.forEach((doc, i) => {
    const li = document.createElement('li');
    li.dataset.id = doc.id;
    li.draggable = true;
    li.classList.toggle('aktiv', !!gezeigt && gezeigt.doc.id === doc.id);
    li.innerHTML =
      `<span class="griff" title="Ziehen, um die Reihenfolge zu ändern">${SYMBOL.griff}</span>` +
      '<span class="daumen-platz"></span>' +
      '<div class="mappe-eintrag"><strong></strong></div>' +
      '<span class="reiter"></span>' +
      '<div class="mappe-knoepfe">' +
      `<button type="button" class="mini" data-tat="hoch" title="Nach oben" aria-label="Nach oben">${SYMBOL.hoch}</button>` +
      `<button type="button" class="mini" data-tat="runter" title="Nach unten" aria-label="Nach unten">${SYMBOL.runter}</button>` +
      `<button type="button" class="mini" data-tat="weg" title="Aus der Mappe nehmen" aria-label="Aus der Mappe nehmen">${SYMBOL.weg}</button>` +
      '</div>';
    li.querySelector('.daumen-platz').replaceWith(daumen(doc.id));
    li.querySelector('strong').textContent = doc.name;
    li.querySelector('strong').title = `${doc.name} (${mehrzahl(doc.seiten, 'Seite', 'Seiten')})`;
    const bis = nummer + doc.seiten - 1;
    const reiter = li.querySelector('.reiter');
    reiter.textContent = doc.seiten === 1 ? `${nummer}` : `${nummer}–${bis}`;
    reiter.title = doc.seiten === 1 ? `Seite ${nummer} der Mappe` : `Seiten ${nummer} bis ${bis} der Mappe`;
    li.querySelector('[data-tat="hoch"]').disabled = i === 0;
    li.querySelector('[data-tat="runter"]').disabled = i === docs.length - 1;
    nummer = bis + 1;
    teil.appendChild(li);
  });
  el.mappeListe.replaceChildren(teil);
  el.mappeListe.hidden = docs.length === 0;
  el.mappeLeer.hidden = docs.length > 0;
  el.auswahlLeeren.hidden = docs.length === 0;

  el.summe.replaceChildren();
  if (docs.length) {
    const fett = document.createElement('strong');
    fett.textContent = `${mehrzahl(docs.length, 'PDF', 'PDFs')}, ${mehrzahl(seiten, 'Seite', 'Seiten')}`;
    el.summe.append(fett);
    if (mappe.an) el.summe.append(seiten === 1 ? `, nummeriert mit ${start}` : `, nummeriert von ${start} bis ${letzte}`);
  } else {
    el.summe.textContent = 'Noch keine PDF ausgewählt';
  }
  el.erstellen.disabled = docs.length === 0 || bauLaeuft || importLaeuft;
  el.blatt.classList.toggle('stapel', seiten > 1);

  for (const wahl of el.format.options) wahl.textContent = schreibweise(wahl.value, start, seiten ? letzte : start + 11);
  zeigeBlattNr();
  setzeLupe();
  fordereVorschau();
}

function zeigeEinstellungen() {
  el.mappeName.value = mappe.name;
  el.sortierung.value = mappe.sortierung;
  el.zahlenAn.checked = mappe.an;
  el.zahlen.classList.toggle('aus', !mappe.an);
  el.format.value = mappe.format;
  el.start.value = mappe.start;
  el.groesse.value = String(mappe.groesse);
  el.rand.value = String(mappe.rand);
  const punkt = document.querySelector(`input[name="position"][value="${mappe.position}"]`);
  if (punkt) punkt.checked = true;
}

// ---------------------------------------------------------------------------
// Vorschau: echte Seite der Mappe, dazu eine Lupe auf die Seitenzahl
// ---------------------------------------------------------------------------
const LUPE = { b: 138, h: 64 };
const vorschau = {
  seite: 1,                                      // gezeigte Seite der Mappe
  mass: { bPt: 595.28, hPt: 841.89, k: 184 / 595.28, bPx: 184, hPx: 260 },
  offen: null,                                   // { id, aufgabe, pdf }
  gemalt: '', lupeGemalt: '',
  laeuft: false, offenstehend: false,
};
let messSchrift = null;                          // Helvetica zum Ausmessen der Seitenzahl

function ortInMappe(nummer) {
  let rest = nummer;
  for (const id of auswahl) {
    const doc = bestand.get(id);
    if (!doc) continue;
    if (rest <= doc.seiten) return { doc, blatt: rest };
    rest -= doc.seiten;
  }
  return null;
}

function ersteSeiteVon(id) {
  let nummer = 1;
  for (const andere of auswahl) {
    if (andere === id) return nummer;
    nummer += bestand.get(andere).seiten;
  }
  return 1;
}

// Wie groß das Blatt höchstens sein darf, legt das Aussehen fest (kleiner bei niedrigen Fenstern).
function blattMax() {
  const stil = getComputedStyle(document.documentElement);
  return { b: parseFloat(stil.getPropertyValue('--blatt-b')) || 184, h: parseFloat(stil.getPropertyValue('--blatt-h')) || 260 };
}

function setzeMass(bPt, hPt) {
  const max = blattMax();
  const k = Math.min(max.b / bPt, max.h / hPt);
  vorschau.mass = { bPt, hPt, k, bPx: Math.round(bPt * k), hPx: Math.round(hPt * k) };
  el.blatt.style.width = `${vorschau.mass.bPx}px`;
  el.blatt.style.height = `${vorschau.mass.hPx}px`;
}

// Wo die Seitenzahl auf der sichtbaren Seite steht (in Punkt, Ursprung oben links).
// Rechnet genauso wie stempel() weiter unten.
function zahlOrt() {
  const { bPt, hPt } = vorschau.mass;
  const gesamt = gesamtSeiten();
  const text = gesamt
    ? schreibweise(mappe.format, mappe.start + vorschau.seite - 1, mappe.start + gesamt - 1)
    : schreibweise(mappe.format, mappe.start, mappe.start + 11);
  const pt = mappe.groesse;
  const rand = (mappe.rand * 72) / 25.4;
  const breite = messSchrift ? messSchrift.widthOfTextAtSize(text, pt) : text.length * pt * 0.52;
  const [vertikal, horizontal] = mappe.position.split('-');
  let x = rand;
  if (horizontal === 'mitte') x = (bPt - breite) / 2;
  if (horizontal === 'rechts') x = bPt - rand - breite;
  const grund = vertikal === 'oben' ? rand + pt * 0.72 : hPt - rand;   // Grundlinie der Schrift
  const zoom = Math.min(1.1, (LUPE.b - 30) / breite);
  // Mitte der Lupe: bei der Zahl, aber zur Blattkante gerückt, damit man die Kante sieht
  const hb = LUPE.b / 2 / zoom;
  const hh = LUPE.h / 2 / zoom;
  const luft = 9 / zoom;
  let mx = x + breite / 2;
  if (horizontal === 'links') mx = Math.max(hb - luft, x + breite + luft - hb);
  if (horizontal === 'rechts') mx = Math.min(bPt - hb + luft, x - luft + hb);
  const my = vertikal === 'oben'
    ? Math.max(hh - luft, grund + pt * 0.3 + luft - hh)
    : Math.min(hPt - hh + luft, grund - pt * 0.8 - luft + hh);
  return { text, pt, x, grund, breite, zoom, mx, my };
}

// Setzt die Lupe sofort an ihren Platz. Ihr Inhalt wird danach gezeichnet.
function setzeLupe() {
  el.lupe.hidden = !mappe.an;
  el.blatt.classList.toggle('ohne-zahlen', !mappe.an);
  if (!mappe.an) return;
  const ort = zahlOrt();
  const { k, bPx, hPx } = vorschau.mass;
  el.lupe.style.left = `${grenze(ort.mx * k - LUPE.b / 2, -22, bPx - LUPE.b + 22)}px`;
  el.lupe.style.top = `${grenze(ort.my * k - LUPE.h / 2, -12, hPx - LUPE.h + 16)}px`;
  el.lupeZahl.textContent = ort.text;
  el.lupeZahl.style.fontSize = `${ort.pt * ort.zoom}px`;
  el.lupeZahl.style.left = `${LUPE.b / 2 + (ort.x - ort.mx) * ort.zoom}px`;
  el.lupeZahl.style.top = `${LUPE.h / 2 + (ort.grund - ort.my) * ort.zoom - 0.846 * ort.pt * ort.zoom}px`;
}

function fordereVorschau() {
  vorschau.offenstehend = true;
  if (!vorschau.laeuft) vorschauSchleife();
}

async function vorschauSchleife() {
  vorschau.laeuft = true;
  while (vorschau.offenstehend) {
    vorschau.offenstehend = false;
    try { await zeichneVorschau(); } catch (e) { console.warn('Vorschau:', e); }
  }
  vorschau.laeuft = false;
}

function schliesseVorschauPdf() {
  if (vorschau.offen) vorschau.offen.aufgabe.destroy().catch(() => {});
  vorschau.offen = null;
}

async function zeichneVorschau() {
  const gesamt = gesamtSeiten();
  vorschau.seite = grenze(vorschau.seite, 1, Math.max(1, gesamt));
  const ort = gesamt ? ortInMappe(vorschau.seite) : null;
  zeigeBlattNr();

  let seite = null;
  if (ort && !bauLaeuft) {
    try {
      if (!vorschau.offen || vorschau.offen.id !== ort.doc.id) {
        schliesseVorschauPdf();
        vorschau.offen = { id: ort.doc.id, ...(await oeffneZumZeichnen(ort.doc.id)) };
      }
      seite = await vorschau.offen.pdf.getPage(ort.blatt);
    } catch (e) {
      schliesseVorschauPdf();
      seite = null;
    }
  } else if (!ort) {
    schliesseVorschauPdf();
  }

  // Mindestens doppelt so fein wie der Bildschirm, damit Vorschau und Lupe auch beim Vergrößern scharf bleiben
  const dichte = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
  if (seite) {
    const roh = seite.getViewport({ scale: 1 });
    setzeMass(roh.width, roh.height);
    const schluessel = `${ort.doc.id}/${ort.blatt}/${dichte}/${vorschau.mass.bPx}`;
    if (vorschau.gemalt !== schluessel) {
      const sicht = seite.getViewport({ scale: vorschau.mass.k * dichte });
      const bild = document.createElement('canvas');
      bild.width = Math.round(sicht.width);
      bild.height = Math.round(sicht.height);
      await seite.render({ canvasContext: bild.getContext('2d'), viewport: sicht }).promise;
      el.blattBild.width = bild.width;
      el.blattBild.height = bild.height;
      el.blattBild.getContext('2d').drawImage(bild, 0, 0);
      vorschau.gemalt = schluessel;
    }
    el.blatt.classList.add('echt');
  } else if (!ort) {
    setzeMass(595.28, 841.89);
    vorschau.gemalt = '';
    el.blatt.classList.remove('echt');
  }
  setzeLupe();
  if (mappe.an) await maleLupe(seite, dichte);
}

async function maleLupe(seite, dichte) {
  const ort = zahlOrt();
  const { bPt, hPt } = vorschau.mass;
  const schluessel = [seite ? vorschau.gemalt : 'leer', ort.mx.toFixed(1), ort.my.toFixed(1), ort.zoom.toFixed(3), dichte].join('|');
  if (vorschau.lupeGemalt === schluessel) return;

  const bild = document.createElement('canvas');
  bild.width = LUPE.b * dichte;
  bild.height = LUPE.h * dichte;
  const stift = bild.getContext('2d');
  const massstab = ort.zoom * dichte;
  const links = bild.width / 2 - ort.mx * massstab;
  const oben = bild.height / 2 - ort.my * massstab;
  stift.fillStyle = '#fff';
  stift.fillRect(0, 0, bild.width, bild.height);
  if (seite) {
    await seite.render({ canvasContext: stift, viewport: seite.getViewport({ scale: massstab, offsetX: links, offsetY: oben }) }).promise;
    stift.setTransform(1, 0, 0, 1, 0, 0);
  }
  // Alles neben dem Blatt in der Farbe der Bühne, damit man die Blattkante sieht
  stift.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--buehne').trim() || '#E6E8EC';
  const rechts = links + bPt * massstab;
  const unten = oben + hPt * massstab;
  if (oben > 0) stift.fillRect(0, 0, bild.width, oben);
  if (unten < bild.height) stift.fillRect(0, unten, bild.width, bild.height - unten);
  if (links > 0) stift.fillRect(0, 0, links, bild.height);
  if (rechts < bild.width) stift.fillRect(rechts, 0, bild.width - rechts, bild.height);
  stift.strokeStyle = 'rgba(15, 18, 23, .22)';
  stift.lineWidth = dichte;
  stift.strokeRect(links, oben, bPt * massstab, hPt * massstab);

  el.lupeBild.width = bild.width;
  el.lupeBild.height = bild.height;
  el.lupeBild.getContext('2d').drawImage(bild, 0, 0);
  vorschau.lupeGemalt = schluessel;
}

// Seitenanzeige, Pfeile und Markierung in der Reihenfolge. Läuft sofort, das Bild folgt.
function zeigeBlattNr() {
  const gesamt = gesamtSeiten();
  const ort = gesamt ? ortInMappe(vorschau.seite) : null;
  el.blattNr.textContent = gesamt ? `Seite ${vorschau.seite} von ${gesamt}` : 'Beispielseite';
  el.blattZurueck.disabled = vorschau.seite <= 1;
  el.blattVor.disabled = vorschau.seite >= gesamt;
  for (const li of el.mappeListe.children) li.classList.toggle('aktiv', !!ort && li.dataset.id === ort.doc.id);
}

function zeigeSeite(nummer) {
  vorschau.seite = grenze(nummer, 1, Math.max(1, gesamtSeiten()));
  zeigeBlattNr();
  setzeLupe();
  fordereVorschau();
}

// ---------------------------------------------------------------------------
// PDFs in den Bestand aufnehmen
// ---------------------------------------------------------------------------
// Prüft, ob eine der gespeicherten Dateien (gleicher Name, gleiche Größe) Byte für Byte gleich ist.
async function schonDa(bytes, ids) {
  if (!ids) return false;
  const neu = new Uint8Array(bytes);
  for (const id of ids) {
    const alt = await hole('dateien', id).catch(() => null);
    if (!alt) continue;
    const a = new Uint8Array(alt);
    if (a.length !== neu.length) continue;
    let gleich = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== neu[i]) { gleich = false; break; }
    if (gleich) return true;
  }
  return false;
}

async function nimmAuf(dateien) {
  await gestartet;   // erst aufnehmen, wenn der Speicher geöffnet und der Bestand geladen ist
  if (importLaeuft) { toast('Es werden gerade PDFs aufgenommen. Danach geht es weiter.'); return; }
  const pdfs = dateien.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  const keinePdf = dateien.length - pdfs.length;
  if (!pdfs.length) {
    toast(dateien.length ? 'Darunter war keine PDF.' : 'Es wurde keine Datei gewählt.');
    return;
  }

  importLaeuft = true;
  el.bericht.hidden = true;
  el.importLauf.hidden = false;
  el.erstellen.disabled = true;
  // Gleicher Name und gleiche Größe: Kandidat für ein Doppel, der Inhalt entscheidet.
  const bekannt = new Map();
  for (const d of bestand.values()) {
    const k = `${d.datei}\n${d.groesse}`;
    bekannt.set(k, [...(bekannt.get(k) || []), d.id]);
  }
  const uebersprungen = [];
  let neu = 0;
  let doppelt = 0;
  let voll = false;
  const zeit = Date.now();

  for (let i = 0; i < pdfs.length; i++) {
    const datei = pdfs[i];
    el.importText.textContent = `Nehme ${i + 1} von ${pdfs.length} auf: ${datei.name}`;
    el.importBalken.style.width = `${Math.round((i / pdfs.length) * 100)}%`;
    await pause();

    const kennung = `${datei.name}\n${datei.size}`;
    let bytes;
    let seiten = 0;
    try {
      bytes = await datei.arrayBuffer();
      if (await schonDa(bytes, bekannt.get(kennung))) { doppelt++; continue; }
      const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
      seiten = pdf.getPageCount();
    } catch (fehler) {
      const geschuetzt = /encrypt/i.test(String(fehler && fehler.message));
      uebersprungen.push(`${datei.name}: ${geschuetzt ? 'ist passwortgeschützt' : 'lässt sich nicht als PDF lesen'}`);
      continue;
    }
    if (!seiten) { uebersprungen.push(`${datei.name}: enthält keine Seiten`); continue; }

    const doc = { id: neueId(), name: ohneEndung(datei.name), datei: datei.name, groesse: datei.size, seiten, hinzu: zeit + i };
    try {
      await lege('dateien', doc.id, bytes);
      await lege('bestand', doc.id, doc);
    } catch (fehler) {
      await entferne('dateien', doc.id).catch(() => {});
      voll = true;
      break;
    }
    bestand.set(doc.id, doc);
    bekannt.set(kennung, [...(bekannt.get(kennung) || []), doc.id]);
    neu++;
    if (neu % 25 === 0) zeichneBestand();
  }

  importLaeuft = false;
  el.importLauf.hidden = true;
  el.importBalken.style.width = '0';
  zeichneBestand();
  fordereDaumen();

  const zeilen = [];
  if (voll) zeilen.push('Der Speicher dieses Browsers ist voll. Die restlichen PDFs wurden nicht aufgenommen.');
  if (doppelt) zeilen.push(`${mehrzahl(doppelt, 'PDF war', 'PDFs waren')} schon im Bestand.`);
  if (keinePdf) zeilen.push(`${mehrzahl(keinePdf, 'Datei war', 'Dateien waren')} keine PDF.`);
  if (zeilen.length || uebersprungen.length) {
    el.berichtText.replaceChildren();
    const kopf = document.createElement('div');
    kopf.textContent = [`${mehrzahl(neu, 'PDF', 'PDFs')} aufgenommen.`, ...zeilen].join(' ') + (uebersprungen.length ? ' Nicht aufgenommen:' : '');
    el.berichtText.append(kopf);
    if (uebersprungen.length) {
      const liste = document.createElement('ul');
      for (const text of uebersprungen.slice(0, 8)) { const li = document.createElement('li'); li.textContent = text; liste.append(li); }
      if (uebersprungen.length > 8) { const li = document.createElement('li'); li.textContent = `und ${uebersprungen.length - 8} weitere`; liste.append(li); }
      el.berichtText.append(liste);
    }
    el.bericht.hidden = false;
  } else {
    toast(`${mehrzahl(neu, 'PDF', 'PDFs')} aufgenommen.`);
  }
}

async function nimmAbwurf(transfer) {
  const dateien = [];
  const ordner = [];
  for (const posten of transfer.items ? [...transfer.items] : []) {
    if (posten.kind !== 'file') continue;
    const eintrag = posten.webkitGetAsEntry ? posten.webkitGetAsEntry() : null;
    if (eintrag && eintrag.isDirectory) ordner.push(eintrag);
    else { const datei = posten.getAsFile(); if (datei) dateien.push(datei); }
  }
  if (!dateien.length && !ordner.length) dateien.push(...transfer.files);

  let ordnerFehler = false;
  async function durchsuche(eintrag) {
    if (eintrag.isFile) {
      dateien.push(await new Promise((ok, nein) => eintrag.file(ok, nein)));
    } else if (eintrag.isDirectory) {
      const leser = eintrag.createReader();
      for (;;) {
        const teil = await new Promise((ok, nein) => leser.readEntries(ok, nein));
        if (!teil.length) break;
        for (const kind of teil) await durchsuche(kind);
      }
    }
  }
  for (const eintrag of ordner) {
    try { await durchsuche(eintrag); } catch (e) { ordnerFehler = true; }
  }
  if (ordnerFehler && !dateien.length) {
    toast('Dieser Browser kann gezogene Ordner hier nicht lesen. Bitte „Ordner“ benutzen.', 'Ordner wählen', () => el.ordnerWahl.click(), 10000);
    return;
  }
  await nimmAuf(dateien);
}

// ---------------------------------------------------------------------------
// Mappe erstellen
// ---------------------------------------------------------------------------
function stempel(pdf, seite, text, schrift) {
  // Den vorhandenen Seiteninhalt einklammern. Sonst verschiebt eine PDF, die ihr
  // Koordinatensystem verstellt hinterlässt, auch unsere Seitenzahl.
  seite.node.normalize();
  const auf = pdf.context.register(pdf.context.contentStream([pushGraphicsState()]));
  const zu = pdf.context.register(pdf.context.contentStream([popGraphicsState()]));
  seite.node.wrapContentStreams(auf, zu);

  const kasten = seite.getCropBox();
  const drehung = ((seite.getRotation().angle % 360) + 360) % 360;
  const quer = drehung === 90 || drehung === 270;
  const breite = quer ? kasten.height : kasten.width;   // so, wie man die Seite sieht
  const hoehe = quer ? kasten.width : kasten.height;
  const punkt = mappe.groesse;
  const rand = (mappe.rand * 72) / 25.4;
  const textBreite = schrift.widthOfTextAtSize(text, punkt);
  const [vertikal, horizontal] = mappe.position.split('-');

  let sx = rand;
  if (horizontal === 'mitte') sx = (breite - textBreite) / 2;
  if (horizontal === 'rechts') sx = breite - rand - textBreite;
  const sy = vertikal === 'oben' ? hoehe - rand - punkt * 0.72 : rand;

  // Sichtbare Position in die Koordinaten der (vielleicht gedrehten) Seite umrechnen
  let x = sx;
  let y = sy;
  if (drehung === 90) { x = kasten.width - sy; y = sx; }
  else if (drehung === 180) { x = kasten.width - sx; y = kasten.height - sy; }
  else if (drehung === 270) { x = sy; y = kasten.height - sx; }

  seite.drawText(text, { x: kasten.x + x, y: kasten.y + y, size: punkt, font: schrift, color: rgb(0.1, 0.1, 0.1), rotate: degrees(drehung) });
}

async function erstelleMappe() {
  if (bauLaeuft || importLaeuft || !auswahl.length) return;
  bauLaeuft = true;
  const docs = auswahl.map((id) => bestand.get(id));
  const schritte = docs.length + 2;
  const zeige = (i, text) => {
    el.bauBalken.style.width = `${Math.round((i / schritte) * 100)}%`;
    el.erstellenText.textContent = text;
  };
  el.erstellen.disabled = true;
  el.erstellen.classList.add('laeuft');
  el.ergebnis.hidden = true;
  el.ergebnis.classList.remove('fehler');

  let aktuell = null;
  try {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < docs.length; i++) {
      aktuell = docs[i];
      zeige(i, `Füge ${i + 1} von ${docs.length} ein`);
      await pause();
      const bytes = await hole('dateien', aktuell.id);
      if (!bytes) throw new Error('fehlt');
      const quelle = await PDFDocument.load(bytes, { updateMetadata: false });
      const seiten = await pdf.copyPages(quelle, quelle.getPageIndices());
      for (const seite of seiten) pdf.addPage(seite);
    }
    aktuell = null;

    const seiten = pdf.getPages();
    if (mappe.an) {
      zeige(docs.length, 'Schreibe Seitenzahlen');
      await pause();
      const schrift = await pdf.embedFont(StandardFonts.Helvetica);
      const letzte = mappe.start + seiten.length - 1;
      seiten.forEach((seite, i) => stempel(pdf, seite, schreibweise(mappe.format, mappe.start + i, letzte), schrift));
    }

    zeige(docs.length + 1, 'Speichere');
    await pause();
    pdf.setTitle(mappe.name || 'Mappe');
    pdf.setCreator('PDF-Baukasten');
    const fertig = await pdf.save();
    if (letzteDatei) URL.revokeObjectURL(letzteDatei.url);
    letzteDatei = { url: URL.createObjectURL(new Blob([fertig], { type: 'application/pdf' })), dateiname: dateiname(mappe.name) };
    zeige(schritte, 'Fertig');
    ladeHerunter();

    const fett = document.createElement('strong');
    fett.textContent = letzteDatei.dateiname;
    const nochmal = document.createElement('button');
    nochmal.type = 'button';
    nochmal.className = 'textknopf';
    nochmal.textContent = 'Noch einmal speichern';
    nochmal.onclick = ladeHerunter;
    el.ergebnis.replaceChildren(fett, ` liegt im Download-Ordner: ${mehrzahl(seiten.length, 'Seite', 'Seiten')} aus ${mehrzahl(docs.length, 'PDF', 'PDFs')}. `, nochmal);
    await pause(350);
  } catch (fehler) {
    el.ergebnis.classList.add('fehler');
    el.ergebnis.textContent = aktuell
      ? `Die Mappe wurde nicht erstellt: „${aktuell.name}“ lässt sich nicht einfügen. Diese PDF aus der Mappe nehmen und noch einmal versuchen.`
      : 'Die Mappe wurde nicht erstellt. Für so viele Seiten reicht der Arbeitsspeicher des Browsers nicht. Mit weniger PDFs noch einmal versuchen.';
    console.error(fehler);
  }

  bauLaeuft = false;
  el.erstellen.classList.remove('laeuft');
  el.bauBalken.style.width = '0';
  el.erstellenText.textContent = 'Mappe erstellen';
  el.ergebnis.hidden = false;
  el.erstellen.disabled = auswahl.length === 0;
  fordereVorschau();
}

function ladeHerunter() {
  if (!letzteDatei) return;
  const a = document.createElement('a');
  a.href = letzteDatei.url;
  a.download = letzteDatei.dateiname;
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------
// Bedienung
// ---------------------------------------------------------------------------
function setzeAuswahl(id, an) {
  const drin = auswahl.includes(id);
  if (an && !drin) auswahl.push(id);
  if (!an && drin) auswahl = auswahl.filter((x) => x !== id);
  if (an) vorschau.seite = ersteSeiteVon(id);   // die Vorschau springt zur neu gewählten PDF
  el.ergebnis.hidden = true;
  zeichneAuswahl();
  merkeMappe();
}

async function entferneAusBestand(id) {
  const doc = bestand.get(id);
  if (!doc) return;
  const bild = bilder.get(id);
  const platz = auswahl.indexOf(id);
  // Erst die Anzeige, dann der Speicher: so verschwindet die Zeile sofort.
  bestand.delete(id);
  bilder.delete(id);
  zeichneBestand();
  merkeMappe();
  const bytes = await hole('dateien', id).catch(() => null);
  await Promise.all([entferne('bestand', id), entferne('dateien', id), entferne('bilder', id)]).catch(() => {});
  toast(`„${doc.name}“ ist aus dem Bestand entfernt.`, 'Rückgängig', async () => {
    try {
      if (!bytes) throw new Error('Datei fehlt');
      await lege('dateien', id, bytes);
      await lege('bestand', id, doc);
      bestand.set(id, doc);
      if (bild !== undefined) { bilder.set(id, bild); lege('bilder', id, bild).catch(() => {}); }
      if (platz >= 0) auswahl.splice(Math.min(platz, auswahl.length), 0, id);
      zeichneBestand();
      fordereDaumen();
      merkeMappe();
    } catch (e) {
      toast('Rückgängig hat nicht geklappt. Bitte die PDF neu hinzufügen.');
    }
  }, 8000);
}

el.liste.addEventListener('change', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  if (e.target.type === 'checkbox') {
    setzeAuswahl(li.dataset.id, e.target.checked);
    const kasten = li.querySelector('.kasten');
    kasten.classList.remove('frisch');
    if (e.target.checked) { void kasten.offsetWidth; kasten.classList.add('frisch'); }
    return;
  }
  if (e.target.classList.contains('name')) {
    const doc = bestand.get(li.dataset.id);
    const neu = e.target.value.trim() || ohneEndung(doc.datei);
    e.target.value = neu;
    if (neu === doc.name) return;
    doc.name = neu;
    li.classList.toggle('umbenannt', neu !== ohneEndung(doc.datei));
    li.querySelector('.nur-vorlesen').textContent = `${neu} in die Mappe`;
    lege('bestand', doc.id, doc).catch(() => toast('Der Name ließ sich nicht speichern.'));
    zeichneMappe();
  }
});
el.liste.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('name')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    const naechste = e.target.closest('li').nextElementSibling;
    if (naechste) { const feld = naechste.querySelector('.name'); feld.focus(); feld.select(); }
    else e.target.blur();
  } else if (e.key === 'Escape') {
    e.target.value = bestand.get(e.target.closest('li').dataset.id).name;
    e.target.blur();
  }
});
el.liste.addEventListener('click', (e) => {
  const knopf = e.target.closest('button.mini');
  if (knopf) entferneAusBestand(knopf.closest('li').dataset.id);
});

el.alle.addEventListener('change', () => {
  const ids = [...el.liste.children].map((li) => li.dataset.id);
  if (el.alle.checked) { const drin = new Set(auswahl); for (const id of ids) if (!drin.has(id)) auswahl.push(id); }
  else { const weg = new Set(ids); auswahl = auswahl.filter((id) => !weg.has(id)); }
  el.ergebnis.hidden = true;
  zeichneAuswahl();
  merkeMappe();
});

el.suche.addEventListener('input', zeichneBestand);
let rollUhr = null;
el.liste.addEventListener('scroll', () => { clearTimeout(rollUhr); rollUhr = setTimeout(bevorzugeSichtbare, 90); }, { passive: true });
el.sortierung.addEventListener('change', () => { mappe.sortierung = el.sortierung.value; zeichneBestand(); merkeMappe(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || el.info.open) return;
  e.preventDefault();
  el.suche.focus();
});

for (const knopf of [$('#hinzu'), $('#leer-hinzu')]) knopf.addEventListener('click', () => el.dateiWahl.click());
for (const knopf of [$('#hinzu-ordner'), $('#leer-ordner')]) knopf.addEventListener('click', () => el.ordnerWahl.click());
for (const wahl of [el.dateiWahl, el.ordnerWahl]) {
  wahl.addEventListener('change', async () => {
    const dateien = [...wahl.files];
    wahl.value = '';
    await nimmAuf(dateien);
  });
}
$('#bericht-zu').addEventListener('click', () => { el.bericht.hidden = true; });

// Dateien aus dem Explorer hereinziehen
let ziehTiefe = 0;
const sindDateien = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (!sindDateien(e)) return; e.preventDefault(); ziehTiefe++; el.abwurf.hidden = false; });
window.addEventListener('dragover', (e) => { if (!sindDateien(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', (e) => { if (!sindDateien(e)) return; ziehTiefe = Math.max(0, ziehTiefe - 1); if (!ziehTiefe) el.abwurf.hidden = true; });
window.addEventListener('drop', (e) => {
  if (!sindDateien(e)) return;
  e.preventDefault();
  ziehTiefe = 0;
  el.abwurf.hidden = true;
  nimmAbwurf(e.dataTransfer);
});

// Mappe: Name, Reihenfolge, Seitenzahlen
el.mappeName.addEventListener('input', () => { mappe.name = el.mappeName.value; merkeMappe(); });
el.mappeName.addEventListener('change', () => { if (!el.mappeName.value.trim()) { mappe.name = STANDARD.name; el.mappeName.value = mappe.name; merkeMappe(); } });
el.mappeName.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.mappeName.blur(); });
el.auswahlLeeren.addEventListener('click', () => {
  const vorher = auswahl;
  auswahl = [];
  el.ergebnis.hidden = true;
  zeichneAuswahl();
  merkeMappe();
  toast('Die Auswahl ist geleert.', 'Rückgängig', () => { auswahl = vorher; zeichneAuswahl(); merkeMappe(); });
});

function verschiebe(id, ziel) {
  const von = auswahl.indexOf(id);
  if (von < 0) return;
  auswahl.splice(von, 1);
  auswahl.splice(grenze(ziel, 0, auswahl.length), 0, id);
  vorschau.seite = ersteSeiteVon(id);
  el.ergebnis.hidden = true;
  zeichneAuswahl();
  merkeMappe();
}
el.mappeListe.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const id = li.dataset.id;
  const knopf = e.target.closest('button[data-tat]');
  if (!knopf) { zeigeSeite(ersteSeiteVon(id)); return; }   // Klick auf den Eintrag zeigt ihn in der Vorschau
  const platz = auswahl.indexOf(id);
  if (knopf.dataset.tat === 'weg') { setzeAuswahl(id, false); return; }
  verschiebe(id, knopf.dataset.tat === 'hoch' ? platz - 1 : platz + 1);
  const wieder = el.mappeListe.querySelector(`li[data-id="${CSS.escape(id)}"] [data-tat="${knopf.dataset.tat}"]`);
  if (wieder && !wieder.disabled) wieder.focus();
});

let ziehId = null;
let ziehZiel = null;
const raeumeZielAuf = () => { for (const li of el.mappeListe.children) li.classList.remove('ziel-oben', 'ziel-unten'); };
el.mappeListe.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  ziehId = li.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ziehId);
  setTimeout(() => li.classList.add('zieht'), 0);
});
el.mappeListe.addEventListener('dragover', (e) => {
  if (!ziehId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  raeumeZielAuf();
  ziehZiel = null;
  const li = e.target.closest('li');
  if (!li || li.dataset.id === ziehId) return;
  const kasten = li.getBoundingClientRect();
  const oben = e.clientY < kasten.top + kasten.height / 2;
  li.classList.add(oben ? 'ziel-oben' : 'ziel-unten');
  ziehZiel = { id: li.dataset.id, oben };
});
el.mappeListe.addEventListener('drop', (e) => {
  if (!ziehId) return;
  e.preventDefault();
  if (ziehZiel) {
    const id = ziehId;
    auswahl = auswahl.filter((x) => x !== id);
    auswahl.splice(auswahl.indexOf(ziehZiel.id) + (ziehZiel.oben ? 0 : 1), 0, id);
    vorschau.seite = ersteSeiteVon(id);
    el.ergebnis.hidden = true;
    merkeMappe();
  }
  ziehId = null;
  ziehZiel = null;
  zeichneAuswahl();
});
el.mappeListe.addEventListener('dragend', () => { ziehId = null; ziehZiel = null; zeichneAuswahl(); });

function einstellungGeaendert() {
  mappe.an = el.zahlenAn.checked;
  mappe.format = el.format.value;
  mappe.groesse = Number(el.groesse.value);
  mappe.rand = Number(el.rand.value);
  const start = Math.floor(Number(el.start.value));
  if (Number.isFinite(start) && start >= 1 && start <= 99999) mappe.start = start;
  const punkt = document.querySelector('input[name="position"]:checked');
  if (punkt) mappe.position = punkt.value;
  el.zahlen.classList.toggle('aus', !mappe.an);
  el.ergebnis.hidden = true;
  zeichneMappe();
  merkeMappe();
}
el.zahlen.addEventListener('change', einstellungGeaendert);
// Ein Klick auf die Seite setzt die Seitenzahl in diese Ecke.
$('#zonen').addEventListener('click', (e) => {
  const zone = e.target.closest('[data-position]');
  if (!zone || !mappe.an) return;
  document.querySelector(`input[name="position"][value="${zone.dataset.position}"]`).checked = true;
  einstellungGeaendert();
});
el.start.addEventListener('input', einstellungGeaendert);
el.start.addEventListener('blur', () => { el.start.value = mappe.start; });
el.erstellen.addEventListener('click', erstelleMappe);
el.blattZurueck.addEventListener('click', () => zeigeSeite(vorschau.seite - 1));
el.blattVor.addEventListener('click', () => zeigeSeite(vorschau.seite + 1));
let fensterUhr = null;
window.addEventListener('resize', () => { clearTimeout(fensterUhr); fensterUhr = setTimeout(fordereVorschau, 120); });

// Fenster „Über das Werkzeug“
$('#info-auf').addEventListener('click', () => {
  const belegt = [...bestand.values()].reduce((s, d) => s + d.groesse, 0);
  el.speicherZeile.textContent = bestand.size ? `Im Bestand liegen ${mehrzahl(bestand.size, 'PDF', 'PDFs')} mit zusammen ${groesseText(belegt)}.` : '';
  el.info.showModal();
});
$('#alles-loeschen').addEventListener('click', async () => {
  if (importLaeuft) { toast('Es werden gerade PDFs aufgenommen. Bitte danach löschen.'); return; }
  if (!confirm('Wirklich alle PDFs, Namen und Einstellungen aus diesem Browser löschen? Die Originale auf der Festplatte bleiben.')) return;
  clearTimeout(speicherUhr);
  daumenSchlange.length = 0;
  await Promise.all(LAGER.map((lager) => leere(lager))).catch(() => {});
  bestand.clear();
  bilder.clear();
  auswahl = [];
  mappe = { ...STANDARD };
  vorschau.seite = 1;
  el.suche.value = '';
  el.ergebnis.hidden = true;
  el.bericht.hidden = true;
  zeigeEinstellungen();
  zeichneBestand();
  el.info.close();
  toast('Der Bestand ist gelöscht.');
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const gestartet = (async () => {
  db = await dbOeffnen();
  let gemerkt = null;
  try {
    for (const doc of await holeAlle('bestand')) bestand.set(doc.id, doc);
    gemerkt = await hole('einstellungen', 'mappe');
    if (db) {
      const schluessel = await dbLauf('bilder', false, (s) => s.getAllKeys());
      const werte = await holeAlle('bilder');
      schluessel.forEach((id, i) => { if (bestand.has(id)) bilder.set(id, werte[i]); });
    }
  } catch (e) {
    db = null;
  }
  if (!db) el.speicherHinweis.hidden = false;
  if (gemerkt) {
    const { auswahl: ids, ...rest } = gemerkt;
    mappe = { ...STANDARD, ...rest };
    auswahl = Array.isArray(ids) ? ids : [];
  }
  zeigeEinstellungen();
  zeichneBestand();
  fordereDaumen();
  // Bittet den Browser, den Bestand nicht von sich aus aufzuräumen.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* nicht überall vorhanden */ }
  // Schrift zum Ausmessen der Seitenzahl (dieselbe, mit der später gestempelt wird)
  try {
    messSchrift = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    setzeLupe();
    fordereVorschau();
  } catch (e) { /* dann wird die Breite geschätzt */ }
})();

})();
