// Produziert den Hochkant-Kurzfilm zum PDF-Baukasten (1080 x 1920, 60 Bilder/s, MP4, ohne Ton).
// Aufbau wie test/demo-video.mjs: Eine Bühnen-Seite zeigt Tafeln und das echte Werkzeug in einer Karte,
// die "Kamera" fährt per Vergrößerung nah an die Stellen heran. Bedient wird das echte Werkzeug mit
// 300 erfundenen Beispiel-PDFs.
//
// Zwei Dinge sind anders als im Querformat-Film:
// 1. Aufgenommen wird in Zeitlupe und danach beschleunigt. So entstehen echte 60 Bilder pro Sekunde,
//    auch wenn der Browser zwischendurch länger für ein Bild braucht. Nur das Erstellen der Mappe läuft
//    in echter Geschwindigkeit, damit das Werkzeug nicht schneller aussieht, als es ist.
// 2. Schnelle Fahrten bekommen echte Bewegungsunschärfe: Mehrere Zeitlupen-Bilder werden zu einem
//    Filmbild gemittelt (wie eine Kamera mit offenem Verschluss).
//
// Der Einstieg zeigt den Screenshot einer Forumsanfrage. Bild und Lage der Zeilen liegen nicht im
// Repository, sie werden von außen dazugegeben:
//   test/ausgabe/forum-anfrage-anonym.png   (Beitrag, 400 CSS-Pixel breit, Namen bereits unkenntlich)
//   test/ausgabe/forum-anfrage-lage.json    ({ beitrag, kern: [Zeilen], edit: [Zeilen] } in CSS-Pixeln)
//
// Aufruf: node test/short-video.mjs [Ordner mit Beispiel-PDFs] [Zieldatei.mp4] [Forum-Bild.png] [Forum-Lage.json]
// Entwurf zum Prüfen: SHORT_ENTWURF=1 (ohne Zeitlupe, schnell) oder SHORT_ENTWURF=2 (mit Zeitlupe, ohne Unschärfe).
// SHORT_BEHALTEN=1 behält die Einzelbilder in test/ausgabe/short/bilder.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync, linkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const daten = resolve(process.argv[2] || join(wurzel, 'test', 'daten-demo300'));
const zielVideo = resolve(process.argv[3] || join(wurzel, 'test', 'ausgabe', 'PDF-Baukasten-Short.mp4'));
const forumBild = resolve(process.argv[4] || join(wurzel, 'test', 'ausgabe', 'forum-anfrage-anonym.png'));
const forumLage = resolve(process.argv[5] || join(dirname(forumBild), 'forum-anfrage-lage.json'));
for (const [datei, was] of [[forumBild, 'Der anonyme Screenshot der Forumsanfrage'], [forumLage, 'Die Lage der Zeilen im Screenshot']]) {
  if (!existsSync(datei)) {
    console.error(`${was} fehlt: ${datei}\nBitte die Datei dorthin legen oder den Pfad als Argument angeben:\n  node test/short-video.mjs [pdf-ordner] [ziel.mp4] [forum-bild.png] [forum-lage.json]`);
    process.exit(1);
  }
}
if (!existsSync(daten)) { console.error(`Der Ordner mit den Beispiel-PDFs fehlt: ${daten}\nErzeugen mit: node test/demo-daten.mjs`); process.exit(1); }

const ENTWURF = Number(process.env.SHORT_ENTWURF || 0);
// Zeitlupe im Normalfall: achtmal so langsam aufnehmen. Der Screencast liefert bei 1080 x 1920 als PNG
// in schweren Szenen nur etwa 12 Bilder pro Sekunde (gemessen); bei Faktor 5 fehlten noch einzelne Filmbilder.
const ZL = ENTWURF === 1 ? 1 : 8;
const ZL_WISCH = ENTWURF ? ZL : 24;      // Zeitlupe bei schnellen Fahrten: genug Einzelbilder je Filmbild, sonst sieht man Mehrfachbilder statt Unschärfe
const VERSCHLUSS = 0.62;                 // Anteil eines Filmbilds, über den bei Fahrten gemittelt wird
const arbeit = join(wurzel, 'test', 'ausgabe', 'short');
const bilderOrdner = join(arbeit, 'bilder');
rmSync(arbeit, { recursive: true, force: true });
mkdirSync(bilderOrdner, { recursive: true });

const BILD = { b: 1080, h: 1920 };
const APP = { b: 1280, h: 900 };         // Größe des Werkzeugs im Fenster
const KARTE = { x: 50, y: 346, b: 980, h: 900, mx: 540, my: 796 };   // Karte mit Inhalt, Mitte bei mx/my
const schrift = readFileSync(join(wurzel, 'node_modules', '@fontsource-variable', 'geist', 'files', 'geist-latin-wght-normal.woff2')).toString('base64');
const MARKE = '<svg viewBox="0 0 28 28"><rect width="28" height="28" rx="7.5" fill="#0F1217"/><path d="M9 6.2h6.6L19.5 10v11.8H9z" fill="#fff"/><rect x="11.3" y="16.6" width="5.9" height="2.9" rx="1.45" fill="#E2372E"/></svg>';
const LUPE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#E2372E"/><circle cx="11" cy="11" r="4.2" fill="none" stroke="#fff" stroke-width="2"/><path d="M14.2 14.2l3.4 3.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
const PFEIL = '<svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Angedeutete Textzeilen auf den fallenden Blättern (Blatt 330 x 467)
const ZEILEN = 'linear-gradient(#D5D9DF,#D5D9DF) 34px 45px/127px 9px no-repeat,' + [77, 100, 124, 148, 172, 219, 243, 267, 290].map((y, i) => `linear-gradient(#E7E9ED,#E7E9ED) 34px ${y}px/${[261, 261, 198, 261, 158, 261, 261, 224, 119][i]}px 7px no-repeat`).join(',');

// Der Screenshot der Anfrage und die Lage der Zeilen darin
const forumRoh = readFileSync(forumBild);
const forum = { b: forumRoh.readUInt32BE(16), h: forumRoh.readUInt32BE(20) };
const lage = JSON.parse(readFileSync(forumLage, 'utf8'));
if (!Array.isArray(lage.kern) || lage.kern.length < 2 || !Array.isArray(lage.edit) || !lage.edit.length) { console.error(`In ${forumLage} fehlen die Zeilen "kern" (mindestens 2) oder "edit".`); process.exit(1); }

// Die Texte des Films an einer Stelle. "*Wort" wird rot, "_" ist ein fester Zwischenraum, "|" eine neue Zeile, "~" eine Pause.
const TEXT = {
  schild: 'Echte Frage aus einem Forum',
  gesucht: 'Gesucht: ein Programm|für *300_PDFs.',
  lokal: 'Lokal. Keine_KI.',
  tippsKopf: 'Die Tipps im Forum:',
  tipps: ['PDF-Programm', 'Textverarbeitung', 'Frag eine KI'],
  aber: 'Es sind aber',
  gebaut: 'Also gebaut',
  name: 'PDF-Baukasten',
  satz: 'Mit KI gebaut. ~ *Läuft *ohne.',
  schritte: ['Benennen.', 'Suchen. Anhaken.', 'Reihenfolge ziehen.', 'Seitenzahl drauf.', 'Ein Klick.'],
  ergebnis: 'Das Ergebnis',
  eine: 'Eine PDF.',
  einheit: 'Seiten.',
  wort: 'Durchnummeriert.',
  nummer: 'Werkzeug Nr. 1',
  fakten: ['Kostenlos', 'Läuft lokal', 'Kein Upload'],
  link: 'Link im Profil',
  folgen: 'Folgen kostet auch nichts.',
  mappe: 'Unterlagen Versammlung 2027',
  neuerName: 'Vollmacht Hausverwaltung',
};

// Bewegungskurven (Namen wie im Drehbuch)
const KURVE = {
  FAHRT: 'cubic-bezier(.7,0,.2,1)', SANFT: 'cubic-bezier(.25,.4,.3,1)', EIN: 'cubic-bezier(.16,1,.3,1)', AUS: 'cubic-bezier(.6,0,.8,.35)',
  FALL: 'cubic-bezier(.55,0,.9,.5)', LANDEN: 'cubic-bezier(.2,.9,.25,1)', WORT: 'cubic-bezier(.2,.8,.2,1)', FEDER: 'cubic-bezier(.3,1.45,.5,1)',
  TAFEL: 'cubic-bezier(.2,.9,.25,1.12)', MARKER: 'cubic-bezier(.3,.6,.2,1)', TAUCHEN: 'cubic-bezier(.75,0,.85,.35)',
};
const SCHATTEN = {
  karte: '0 0 0 1px rgba(15,18,23,.07),0 36px 90px rgba(15,18,23,.22),0 8px 22px rgba(15,18,23,.10)',
  blatt: '0 0 0 1px rgba(15,18,23,.06),0 2px 6px rgba(15,18,23,.08),0 20px 46px rgba(15,18,23,.16)',
  chip: '0 0 0 1px rgba(15,18,23,.06),0 28px 66px rgba(15,18,23,.16),0 5px 14px rgba(15,18,23,.08)',
  pille: '0 22px 54px rgba(15,18,23,.30),0 4px 12px rgba(15,18,23,.18)',
};

// ---------------------------------------------------------------------------
// Die Bühne
// ---------------------------------------------------------------------------
const stil = `
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${schrift}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}
html,body{margin:0;width:${BILD.b}px;height:${BILD.h}px;overflow:hidden;background:#DCDFE5;color:#0F1217;font-family:Geist,sans-serif;-webkit-font-smoothing:antialiased}
p{margin:0}
#bild{position:fixed;left:0;top:0;width:${BILD.b}px;height:${BILD.h}px;overflow:clip}
#uhr{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none}
/* Grund: Papiergrau mit Punktraster. Das Raster wandert bei Fahrten ein Stück mit (immer um ganze Rasterschritte). */
.grund{position:absolute;inset:0;background:#DCDFE5}
.punkte{position:absolute;left:0;right:0;top:-720px;bottom:-720px;background:radial-gradient(rgba(15,18,23,.13) 1.6px,transparent 2.1px) 0 0/36px 36px}
.licht{position:absolute;inset:0;background:radial-gradient(980px 1180px at 50% 44%,rgba(255,255,255,.78) 0%,rgba(255,255,255,0) 72%)}
.ebene{position:absolute;inset:0;pointer-events:none;transform-origin:540px 800px}
/* Die Anfrage liegt über den Tipps (sie rollt weg und gibt sie frei); Schild, Untertitel und Zeiger immer ganz oben */
#forum{z-index:2}
#welt.vorn{z-index:3}
#akt,#ut,.geist,.welle,.zeiger{z-index:5}
.treibt{animation:treiben 3s cubic-bezier(.2,.5,.4,1) forwards}
@keyframes treiben{from{scale:1}to{scale:1.035}}
em{font-style:normal;color:#E2372E}

/* Wörter und Buchstaben erscheinen einzeln */
.w{display:inline-block;opacity:0;transform:translateY(.42em);filter:blur(7px);animation:wort .5s ${KURVE.WORT} forwards}
.bs{display:inline-block;opacity:0;transform:translateY(.5em) scale(.9);animation:wort .46s ${KURVE.WORT} forwards;white-space:pre}
@keyframes wort{to{opacity:1;transform:none;filter:none}}

/* Akt-Schild oben links */
.schild{position:absolute;left:50px;top:262px;height:66px;display:flex;align-items:center;gap:14px;padding:0 28px 0 22px;border-radius:33px;background:#0F1217;color:#fff;font-size:35px;font-weight:600;letter-spacing:-.02em;white-space:nowrap;box-shadow:${SCHATTEN.pille}}
.schild::before{content:"";flex:none;width:15px;height:15px;border-radius:50%;background:#E2372E}
.schild.mit-marke{padding-left:16px}
.schild.mit-marke::before{display:none}
.schild.mit-marke svg{flex:none;width:34px;height:34px;box-shadow:0 0 0 1.5px rgba(255,255,255,.55);border-radius:9px}
#akt{position:absolute;inset:0;pointer-events:none}

/* Das Werkzeug in der Karte. Die Kamera liegt so, dass ihre Koordinaten die des Bildes sind. */
#welt{opacity:0;transform-origin:${KARTE.mx}px ${KARTE.my}px}
#karte-schatten{position:absolute;left:${KARTE.x}px;top:${KARTE.y}px;width:${KARTE.b}px;height:${KARTE.h}px;border-radius:38px;box-shadow:${SCHATTEN.karte};opacity:0}
#karte{position:absolute;left:${KARTE.x}px;top:${KARTE.y}px;width:${KARTE.b}px;height:${KARTE.h}px;border-radius:38px;overflow:hidden;background:#F5F6F8;pointer-events:auto}
#karte.frei{overflow:visible;border-radius:0}
.kamera{position:absolute;left:${-KARTE.x}px;top:${-KARTE.y}px;transform-origin:0 0}
iframe{display:block;width:${APP.b}px;height:${APP.h}px;border:0;background:#fff}
#weiss{position:absolute;left:${KARTE.x}px;top:${KARTE.y}px;width:${KARTE.b}px;height:${KARTE.h}px;background:#fff;opacity:0;pointer-events:none}

/* Einstieg: der Screenshot der Anfrage in der Karte, die Kernzeilen rot markiert */
.handy{position:absolute;left:${KARTE.x}px;top:${KARTE.y}px;width:${KARTE.b}px;height:${KARTE.h}px;border-radius:38px;overflow:hidden;background:#ECEEF1;box-shadow:${SCHATTEN.karte}}
.beitrag{position:absolute;left:0;top:0;width:400px;transform-origin:0 0}
.beitrag img{display:block;width:400px;height:auto}
.strich{position:absolute;display:block;border-radius:3px 7px 4px 8px/8px 4px 9px 5px;background:rgba(226,55,46,.38);mix-blend-mode:multiply;transform-origin:0 50%;transform:skewX(-7deg) scaleX(0)}

/* Die Tipps aus dem Forum */
.kopf{position:absolute;left:0;right:0;top:312px;text-align:center;font-size:80px;font-weight:650;letter-spacing:-.042em;line-height:1.05}
.tipp{position:absolute;left:540px;height:172px;padding:0 56px;display:flex;align-items:center;border-radius:52px;background:#fff;box-shadow:${SCHATTEN.chip};font-size:84px;font-weight:650;letter-spacing:-.045em;white-space:nowrap;transform:translateX(calc(-50% + var(--dx))) rotate(var(--r));animation:tipp-rein .72s ${KURVE.EIN} backwards}
@keyframes tipp-rein{from{transform:translate(calc(-50% + var(--dx)),1500px) rotate(calc(var(--r) + 9deg))}}

/* Ausmaß: Blätter fallen auf einen Stapel, der Zähler läuft bis 300 */
.haufen{position:absolute;left:540px;top:770px;width:0;height:0}
.haufen i{position:absolute;left:-165px;top:-233px;width:330px;height:467px;border-radius:5px;background:${ZEILEN},#fff;box-shadow:${SCHATTEN.blatt};opacity:0;animation:fall .7s ${KURVE.LANDEN} forwards}
@keyframes fall{from{opacity:1;transform:translate(var(--x),calc(var(--y) - 1500px)) rotate(calc(var(--r) + 34deg)) scale(1.16)}to{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r))}}
.zaehler{position:absolute;left:255px;top:1062px;width:570px;height:192px;border-radius:44px;background:#fff;box-shadow:0 0 0 6px #E2372E,${SCHATTEN.chip};display:flex;align-items:baseline;justify-content:center;gap:22px;padding-top:26px;font-size:132px;font-weight:680;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums;animation:springt .5s ${KURVE.FEDER} backwards}
.zaehler small{font-size:62px;font-weight:580;color:#5B6370;letter-spacing:-.03em}
.zaehler svg{position:absolute;left:-26px;top:-26px;width:68px;height:68px;filter:drop-shadow(0 4px 8px rgba(15,18,23,.25))}
.zaehler.fertig{animation:puls .5s ${KURVE.FEDER}}
@keyframes springt{from{opacity:0;transform:scale(.6)}}
@keyframes puls{0%{transform:scale(1)}35%{transform:scale(1.09)}100%{transform:scale(1)}}

/* Enthüllung und Schluss: Marke, Name, ein Satz */
.logo{position:absolute;animation:logo .62s ${KURVE.FEDER} backwards}
.logo svg{display:block;width:100%;height:100%;filter:drop-shadow(0 18px 34px rgba(15,18,23,.24))}
@keyframes logo{from{opacity:0;transform:scale(.3) rotate(-10deg)}}
#marke .logo{left:415px;top:475px;width:250px;height:250px}
.name{position:absolute;left:0;right:0;text-align:center;font-weight:680;letter-spacing:-.052em;line-height:1}
#marke .name{top:776px;font-size:116px}
.satz{position:absolute;left:0;right:0;top:936px;text-align:center;font-size:62px;font-weight:570;letter-spacing:-.032em;color:#5B6370}
.satz em{color:#0F1217;font-weight:650}

/* Untertitel: dunkle Tafel, Unterkante immer bei y 1480 */
#ut{position:absolute;left:0;right:0;bottom:${BILD.h - 1480}px;display:grid;justify-items:center;align-items:end;pointer-events:none}
.ut-kasten{grid-area:1/1;display:flex;align-items:center;gap:22px;max-width:880px;padding:24px 46px 28px;border-radius:40px;background:#0F1217;color:#fff;font-size:64px;line-height:1.13;font-weight:640;letter-spacing:-.032em;text-align:center;box-shadow:${SCHATTEN.pille};animation:ut-rein .44s ${KURVE.TAFEL} backwards}
.ut-kasten b{flex:none;display:flex;align-items:center;justify-content:center;width:68px;height:68px;margin:3px 0 0 -14px;border-radius:50%;background:#E2372E;font-size:40px;font-weight:700;letter-spacing:0;font-variant-numeric:tabular-nums}
.ut-kasten.fest{animation:none}
.ut-kasten.raus{animation:ut-raus .2s cubic-bezier(.5,0,.9,.4) forwards}
@keyframes ut-rein{from{opacity:0;transform:translateY(34px) scale(.92)}}
@keyframes ut-raus{to{opacity:0;transform:translateY(-22px) scale(.96)}}

/* Beweis: die echte PDF wird durchgeblättert, die Lupe zeigt die echte Seitenzahl */
.stoss{position:absolute;left:270px;top:356px;width:540px;height:764px;perspective:5200px;perspective-origin:50% 0}
.stoss u{position:absolute;inset:0;background:#fff;border-radius:5px;box-shadow:0 0 0 1px rgba(15,18,23,.07),0 2px 5px rgba(15,18,23,.08)}
.stoss u:nth-child(1){transform:translate(20px,18px);background:#F1F2F4}
.stoss u:nth-child(2){transform:translate(10px,9px);background:#F8F9FA}
.stoss img.seite{position:absolute;inset:0;width:100%;height:100%;background:#fff;border-radius:5px;transform-origin:50% 0;box-shadow:0 0 0 1px rgba(15,18,23,.06),0 3px 6px rgba(15,18,23,.08),0 30px 70px rgba(15,18,23,.22)}
.stoss img.flieger{box-shadow:0 0 0 1px rgba(15,18,23,.10),0 18px 40px rgba(15,18,23,.16)}
.glas{position:absolute;right:-30px;bottom:-70px;width:540px;animation:springt .5s ${KURVE.FEDER} .62s backwards}
.glas img{display:block;width:100%;aspect-ratio:124/30;border-radius:28px;background:#fff;box-shadow:0 0 0 5px #E2372E,0 22px 50px rgba(15,18,23,.30)}
.glas svg{position:absolute;left:-26px;top:-26px;width:64px;height:64px;filter:drop-shadow(0 4px 8px rgba(15,18,23,.25))}
.zeile{position:absolute;left:0;right:0;text-align:center;font-weight:680;letter-spacing:-.05em;line-height:1}
.zeile.eine{top:1236px;font-size:112px}
.zeile.zahl{top:1236px;font-size:112px;font-variant-numeric:tabular-nums;animation:ut-rein .4s ${KURVE.TAFEL} backwards}
.zeile.zahl.fertig{animation:puls .5s ${KURVE.FEDER}}
.zeile.wort{top:1362px;font-size:82px;letter-spacing:-.045em}

/* Schluss: Marke, drei Fakten mit den nummerierten Häkchen aus dem Werkzeug, Hinweis auf den Link */
#schluss .logo{left:445px;top:372px;width:190px;height:190px}
#schluss .name{top:596px;font-size:112px}
.fakten{position:absolute;left:215px;top:768px;width:650px;padding:20px 0;border-radius:38px;background:#fff;box-shadow:${SCHATTEN.chip};animation:ut-rein .5s cubic-bezier(.2,.9,.25,1.08) backwards}
.fakten p{display:flex;align-items:center;gap:30px;height:104px;padding:0 48px;font-size:64px;font-weight:630;letter-spacing:-.035em;opacity:0;animation:fakt .46s ${KURVE.EIN} forwards}
.fakten b{flex:none;display:flex;align-items:center;justify-content:center;width:66px;height:66px;border-radius:18px;background:#0F1217;color:#fff;font-size:38px;font-weight:700;letter-spacing:0;animation:plopp .3s ${KURVE.FEDER} backwards}
@keyframes fakt{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}
@keyframes plopp{from{transform:scale(.4)}}
.link{position:absolute;left:540px;top:1160px;height:118px;padding:0 32px 0 56px;display:flex;align-items:center;gap:20px;border-radius:59px;background:#0F1217;color:#fff;font-size:60px;font-weight:650;letter-spacing:-.035em;white-space:nowrap;box-shadow:${SCHATTEN.pille};transform:translateX(-50%);animation:link-rein .5s ${KURVE.TAFEL} backwards,link-puls 1.3s ease-in-out 1 forwards}
.link svg{width:54px;height:54px;padding:8px;border-radius:50%;background:#E2372E}
@keyframes link-rein{from{opacity:0;transform:translateX(-50%) translateY(40px) scale(.88)}}
@keyframes link-puls{0%,100%{scale:1}50%{scale:1.05}}
.folgen{position:absolute;left:0;right:0;top:1312px;text-align:center;font-size:50px;font-weight:600;letter-spacing:-.03em;color:#5B6370}

/* Zeiger, Klick-Welle und das Abbild der gezogenen Zeile */
.zeiger{position:absolute;left:0;top:0;width:62px;height:84px;pointer-events:none;opacity:0;transition:opacity .25s}
.zeiger svg{display:block;width:62px;height:84px;transform-origin:10% 10%;filter:drop-shadow(0 5px 9px rgba(15,18,23,.28))}
.welle{position:absolute;left:0;top:0;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:rgba(226,55,46,.30);opacity:0;pointer-events:none}
.geist{position:absolute;left:0;top:0;display:flex;align-items:center;gap:24px;border-radius:22px;background:#fff;box-shadow:0 0 0 2px rgba(15,18,23,.10),${SCHATTEN.pille};font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .15s}
.geist i{flex:none;border-radius:3px;background:#E7E9ED;box-shadow:0 0 0 1px rgba(15,18,23,.10)}
`;

// Läuft in der Bühnen-Seite. Alle Bewegungen hängen an der Uhr der Seite (document.timeline),
// damit die Zeitlupe der Aufnahme jede Bewegung gleichmäßig verlangsamt.
function buehnenSkript(K) {
  const $ = (id) => document.getElementById(id);
  const neu = (art, klasse, text) => { const e = document.createElement(art); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; };
  const T = () => document.timeline.currentTime;
  const nach = (ms, tat) => { $('uhr').animate([{ opacity: 0 }, { opacity: 0 }], { duration: Math.max(1, ms) }).onfinish = tat; };
  const lauf = (ab, dauer, schritt) => {
    const start = T() + ab;
    const tick = () => { const t = Math.min(1, Math.max(0, (T() - start) / dauer)); schritt(t); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  const KV = K.KURVE;
  // Wörter nacheinander einblenden
  const worte = (ziel, text, ab = 0, tempo = 60, fest = false) => {
    let zeit = ab;
    for (const teil of text.split(' ')) {
      if (teil === '~') { zeit += 200; continue; }
      const rot = teil.startsWith('*');
      const w = neu(rot ? 'em' : 'span', fest ? '' : 'w', (rot ? teil.slice(1) : teil).replace(/_/g, ' '));
      w.style.animationDelay = zeit + 'ms';
      zeit += tempo;
      ziel.append(w, ' ');
    }
    return zeit;
  };
  const buchstaben = (ziel, text, ab, tempo) => { [...text].forEach((b, i) => { const s = neu('span', 'bs', b); s.style.animationDelay = (ab + i * tempo) + 'ms'; ziel.append(s); }); };
  // Eine freie Tafel wächst während der Standzeit ganz leicht, damit das Bild nie tot steht
  const treibe = (e) => { e.classList.remove('treibt'); void e.offsetWidth; e.classList.add('treibt'); };
  // Das Punktraster wandert bei senkrechten Fahrten ein Stück mit. Immer ganze Rasterschritte, damit Anfang und Ende gleich aussehen.
  let rasterY = 0;
  const raster = (schritte, dauer, kurve) => {
    const von = rasterY;
    rasterY = von + schritte * 36;
    $('punkte').animate([{ transform: `translateY(${von}px)` }, { transform: `translateY(${rasterY}px)` }], { duration: dauer, easing: kurve, fill: 'forwards' });
  };

  // ---- Der Screenshot der Anfrage ----
  const kern = K.lage.kern;
  const edit = K.lage.edit;
  const hoehe = 400 * K.forum.h / K.forum.b;
  const kernMitte = { x: kern[0].x + kern[0].w / 2, y: (kern[0].y + kern[1].y + kern[1].h) / 2 };
  const BLICK = {
    anfang: { s: 2.45, x: 0, y: -8 * 2.45 },                                               // Kopf des Beitrags sichtbar
    nah: { s: 2.6, x: 490 - kernMitte.x * 2.6, y: 470 - kernMitte.y * 2.6 },               // näher an die markierten Zeilen
    edit: { s: 2.3, x: 0, y: 872 - hoehe * 2.3 },                                          // Ende des Beitrags mit dem Nachtrag
  };
  const blickText = (b) => `translate(${b.x}px,${b.y}px) scale(${b.s})`;
  const striche = [];
  const strich = (z, anteil = 1) => {
    const s = neu('i', 'strich');
    s.style.left = (z.x - 3) + 'px'; s.style.top = (z.y + 1.5) + 'px'; s.style.width = (z.w * anteil + 6) + 'px'; s.style.height = (z.h - 2.5) + 'px';
    $('beitrag').append(s); striche.push(s);
  };
  strich(kern[0]); strich(kern[1], K.kernAnteil); edit.forEach((z) => strich(z));
  const AN = 'skewX(-7deg) scaleX(1)';
  const AUS = 'skewX(-7deg) scaleX(0)';

  // Akt-Schild oben links wechseln
  const schild = (text, opt = {}) => {
    const a = $('akt');
    for (const alt of [...a.children]) {
      if (alt.dataset.raus) continue;
      alt.dataset.raus = '1';
      alt.animate({ opacity: [1, 0], translate: ['0 0', '-24px 0'] }, { duration: 200, delay: opt.ab || 0, easing: KV.AUS, fill: 'forwards' }).onfinish = () => alt.remove();
    }
    if (!text) return;
    const s = neu('div', 'schild' + (opt.marke ? ' mit-marke' : ''));
    if (opt.marke) s.insertAdjacentHTML('beforeend', K.MARKE);
    s.append(text);
    s.animate({ opacity: [0, 1], translate: ['-30px 0', '0 0'] }, { duration: 320, delay: (opt.ab || 0) + 60, easing: KV.EIN, fill: 'backwards' });
    a.append(s);
  };

  let ziehBild = null;       // Abbild der gezogenen Zeile, hängt am Zeiger

  window.B = {
    // Anfangsbild des Films (und Ende der Schleife): Anfrage, erste Kernzeile schon markiert, Untertitel steht fest
    forumStart(text) {
      const f = $('forum');
      f.style.display = 'block';
      for (const e of [f, $('handy'), $('schild'), $('ut')]) for (const a of e.getAnimations()) a.cancel();
      const b = $('beitrag');
      b.style.transition = 'none'; b.style.transform = blickText(BLICK.anfang);
      striche.forEach((s, i) => { s.style.transition = 'none'; s.style.transform = i === 0 ? AN : AUS; });
      $('ut').replaceChildren();
      window.B.ut(text, { fest: true });
    },
    forumStrich(i, dauer) { const s = striche[i]; s.style.transition = `transform ${dauer}ms ${KV.MARKER}`; s.style.transform = AN; },
    forumBlick(name, dauer, kurve) { const b = $('beitrag'); b.style.transition = `transform ${dauer}ms ${kurve || KV.FAHRT}`; b.style.transform = blickText(BLICK[name]); },
    // Der Beitrag rollt nach oben weg wie beim Weiterblättern im Forum, das Schild hinterher
    forumRaus() {
      $('handy').animate([{ transform: 'none' }, { transform: 'translateY(-1750px) rotate(-3deg)' }], { duration: 540, easing: KV.AUS, fill: 'forwards' });
      $('schild').animate([{ transform: 'none' }, { transform: 'translateY(-460px)' }], { duration: 380, delay: 160, easing: KV.AUS, fill: 'forwards' });
      raster(-5, 900, 'cubic-bezier(.5,0,.2,1)');
      nach(620, () => { $('forum').style.display = 'none'; });
    },
    tipps(kopf, liste) {
      const t = $('tipps');
      t.replaceChildren();
      const k = neu('p', 'kopf');
      worte(k, kopf, 300, 70);
      t.append(k);
      liste.forEach((text, i) => {
        const c = neu('div', 'tipp', text);
        c.style.top = (560 + i * 232) + 'px';
        c.style.setProperty('--r', [-2.2, 1.7, -1.1][i % 3] + 'deg');
        c.style.setProperty('--dx', [-40, 0, 24][i % 3] + 'px');
        c.style.animationDelay = (330 + i * 170) + 'ms';
        t.append(c);
      });
      treibe(t);
    },
    // Die Tipps fallen aus dem Bild, der unterste zuerst
    tippsRaus() {
      const teile = [...$('tipps').children];
      teile.forEach((c, i) => {
        // Die Kopfzeile blendet beim Fallen schnell aus, damit sie die neue Kopfzeile nicht kreuzt
        if (c.classList.contains('kopf')) c.animate({ opacity: [1, 0] }, { duration: 220, easing: 'ease-in', fill: 'forwards' });
        c.animate({ translate: ['0 0', '0 1750px'], rotate: ['0deg', (i % 2 ? -10 : 10) + 'deg'] }, { duration: 460, delay: (teile.length - 1 - i) * 45, easing: KV.FALL, fill: 'forwards' });
      });
      nach(700, () => $('tipps').replaceChildren());
    },
    papier(kopf, bis) {
      const p = $('papier');
      p.replaceChildren();
      const k = neu('p', 'kopf');
      worte(k, kopf, 300, 80);
      const h = neu('div', 'haufen');
      p.append(h, k);
      let saat = 11;
      const z = () => (saat = (saat * 16807) % 2147483647) / 2147483647;
      const anzahl = 24;
      for (let i = 0; i < anzahl; i++) {
        const blatt = neu('i');
        const letztes = i === anzahl - 1;
        blatt.style.setProperty('--x', (letztes ? 0 : Math.round((z() - 0.5) * 400)) + 'px');
        blatt.style.setProperty('--y', (letztes ? -8 : Math.round((z() - 0.5) * 250)) + 'px');
        blatt.style.setProperty('--r', (letztes ? -3 : Math.round((z() - 0.5) * 40)) + 'deg');
        blatt.style.animationDelay = (120 + i * 40) + 'ms';
        h.append(blatt);
      }
      const zaehler = neu('div', 'zaehler');
      zaehler.innerHTML = K.LUPE + '<span>2</span><small>PDFs</small>';
      zaehler.style.animationDelay = '380ms';
      p.append(zaehler);
      const zahl = zaehler.querySelector('span');
      lauf(480, 1280, (t) => {
        zahl.textContent = Math.max(2, Math.round(bis * (1 - Math.pow(1 - t, 2.1))));
        if (t === 1) { zaehler.style.animationDelay = '0ms'; zaehler.classList.add('fertig'); }
      });
      treibe(p);
    },
    // Der Stapel fällt zur Marke zusammen, der Name erscheint
    marke(schildText, name, satz) {
      const p = $('papier');
      p.querySelectorAll('.haufen i').forEach((blatt, i) => {
        blatt.animate([{ transform: getComputedStyle(blatt).transform, opacity: 1 }, { transform: 'translate(0px,-170px) rotate(0deg) scale(.3)', opacity: 1, offset: .8 }, { transform: 'translate(0px,-170px) rotate(0deg) scale(.22)', opacity: 0 }], { duration: 430, delay: i * 4, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
      });
      p.querySelector('.kopf').animate({ opacity: [1, 0], translate: ['0 0', '0 -70px'] }, { duration: 240, easing: 'ease-in', fill: 'forwards' });
      p.querySelector('.zaehler').animate({ opacity: [1, 0], scale: [1, .8], translate: ['0 0', '0 90px'] }, { duration: 260, easing: 'ease-in', fill: 'forwards' });
      schild(schildText, { ab: 140 });
      const m = $('marke');
      m.replaceChildren();
      const logo = neu('div', 'logo');
      logo.innerHTML = K.MARKE;
      logo.style.animationDelay = '330ms';
      const n = neu('p', 'name');
      buchstaben(n, name, 460, 22);
      const s = neu('p', 'satz');
      worte(s, satz, 650, 90);
      m.append(logo, n, s);
      treibe(m);
      nach(700, () => p.replaceChildren());
    },
    // Fahrt in das weiße Blatt der Marke hinein: Das Blatt wächst zur Karte, darin steht das Werkzeug.
    // Weiße Fläche und Werkzeug bekommen denselben wachsenden Ausschnitt; es gibt nie ein ganz weißes Bild.
    eintauchen(dauer, schildText) {
      const m = $('marke');
      const r = m.querySelector('.logo').getBoundingClientRect();
      const x = r.left + r.width * 9 / 28 - K.KARTE.x;
      const y = r.top + r.height * 6.2 / 28 - K.KARTE.y;
      const b = r.width * 10.5 / 28;
      const h = r.height * 15.6 / 28;
      const von = `inset(${y}px ${K.KARTE.b - x - b}px ${K.KARTE.h - y - h}px ${x}px round 8px)`;
      const zu = 'inset(0px 0px 0px 0px round 38px)';
      const opt = { duration: dauer, easing: KV.TAUCHEN, fill: 'both' };
      const w = $('weiss');
      const karte = $('karte');
      $('welt').style.opacity = 1;
      // Das wachsende Blatt liegt über der Marke: Es wächst aus ihr heraus und deckt sie zu
      $('welt').classList.add('vorn');
      nach(dauer + 20, () => $('welt').classList.remove('vorn'));
      w.animate([{ clipPath: von, opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .5 }, { clipPath: zu, opacity: 0 }], opt);
      karte.animate([{ clipPath: von, opacity: 0 }, { opacity: 0, offset: .35 }, { clipPath: zu, opacity: 1 }], opt).onfinish = () => {
        for (const a of [...karte.getAnimations(), ...w.getAnimations()]) a.cancel();
        m.replaceChildren();
      };
      $('karte-schatten').animate({ opacity: [0, 1] }, { duration: 200, delay: dauer - 200, fill: 'both' }).onfinish = (e) => { $('karte-schatten').style.opacity = 1; e.target.cancel(); };
      m.querySelector('.logo').animate({ scale: [1, 4.5] }, opt);
      // Die Marke ist weg, bevor das Werkzeug ganz da ist (sonst liegt ein dunkler Rand halbdurchsichtig darüber)
      m.querySelector('.logo').animate([{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: .8 }, { opacity: 0 }], { duration: dauer, fill: 'forwards' });
      for (const e of m.querySelectorAll('.name,.satz')) e.animate({ opacity: [1, 0], scale: [1, 1.4], filter: ['blur(0px)', 'blur(10px)'] }, { duration: 340, easing: 'ease-in', fill: 'forwards' });
      schild(schildText, { marke: true });
    },
    kamera(tx, ty, s, dauer, kurve) {
      const k = $('kamera');
      k.style.transition = dauer ? `transform ${dauer}ms ${kurve || KV.FAHRT}` : 'none';
      k.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    },
    vorbereitung(an) { $('karte').classList.toggle('frei', an); },
    zeiger(x, y) {
      $('zeiger').style.transform = `translate(${x}px,${y}px)`;
      $('welle').style.left = x + 'px'; $('welle').style.top = y + 'px';
      if (ziehBild) $('geist').style.transform = `translate(${x - ziehBild.x}px,${y - ziehBild.y}px) rotate(-1.4deg)`;
    },
    zeigerAn(an) { $('zeiger').style.opacity = an ? 1 : 0; },
    klick() {
      $('welle').animate([{ opacity: 1, transform: 'scale(.25)' }, { opacity: 0, transform: 'scale(1.35)' }], { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' });
      $('zeiger').firstElementChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(.84)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    },
    // Abbild der gezogenen Zeile (der Browser zeichnet es beim Ziehen selbst, in der Aufnahme fehlt es)
    geist(text, x, y, s) {
      const g = $('geist');
      g.replaceChildren();
      g.style.width = (411 * s) + 'px'; g.style.height = (42 * s) + 'px'; g.style.padding = `0 ${30 * s}px`; g.style.fontSize = (14 * s) + 'px';
      const daumen = neu('i');
      daumen.style.width = (22 * s) + 'px'; daumen.style.height = (30 * s) + 'px';
      g.append(daumen, text);
      ziehBild = { x: 150 * s, y: 21 * s };
      g.style.transform = `translate(${x - ziehBild.x}px,${y - ziehBild.y}px) rotate(-1.4deg)`;
      g.style.opacity = .92;
    },
    geistAus() { ziehBild = null; $('geist').style.opacity = 0; },
    // Untertitel. Mit { fest } steht er sofort da (Anfangsbild), mit { nr } bekommt er eine Schrittnummer.
    ut(text, opt = {}) {
      const u = $('ut');
      let wechsel = false;
      for (const alt of [...u.children]) {
        if (alt.classList.contains('raus')) continue;
        alt.style.animationDelay = '0ms';
        alt.classList.add('raus');
        wechsel = true;
        nach(260, () => alt.remove());
      }
      if (!text) return;
      const k = neu('div', 'ut-kasten' + (opt.fest ? ' fest' : ''));
      // Bei einem Wechsel kommt der neue Kasten erst, wenn der alte fast weg ist (kein Text über Text)
      const ab = wechsel && !opt.fest ? 160 : 0;
      k.style.animationDelay = ab + 'ms';
      if (opt.nr) k.append(neu('b', '', opt.nr));
      const p = neu('p');
      let zeit = ab + 40;                // Wörter fast mit dem Kasten, sonst blitzt ein leerer Kasten auf
      text.split('|').forEach((zeile, i) => { if (i) p.append(document.createElement('br')); zeit = worte(p, zeile, zeit, 55, opt.fest); });
      k.append(p);
      u.append(k);
    },
    // Beweis: Die Karte mit dem Werkzeug geht, das erste Blatt der echten PDF kommt aus dem Knopf
    ergebnis(d) {
      const welt = $('welt');
      welt.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 400, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }).onfinish = (ev) => { welt.style.opacity = 0; ev.target.cancel(); };
      schild(d.schild);
      const e = $('ergebnis');
      e.replaceChildren();
      const stoss = neu('div', 'stoss');
      stoss.innerHTML = '<u></u><u></u><img class="seite"><div class="glas"><img>' + K.LUPE + '</div>';
      const seite = stoss.querySelector('img.seite');
      const glas = stoss.querySelector('.glas');
      const fuss = glas.querySelector('img');
      seite.src = d.seiten[0];
      fuss.src = d.fuesse[0];
      // Mitte des Stoßes: 540 / 738
      stoss.animate([{ transform: `translate(${d.von.x - 540}px,${d.von.y - 738}px) scale(.1)`, opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: 660, easing: KV.EIN, fill: 'backwards' });
      const eine = neu('p', 'zeile eine');
      worte(eine, d.eine, 380, 90);
      const zahlzeile = neu('p', 'zeile zahl');
      const zahl = neu('em', '', d.nummern[0]);
      zahlzeile.append(zahl, ' ' + d.einheit);
      zahlzeile.style.animationDelay = '1130ms';
      const wort = neu('p', 'zeile wort');
      worte(wort, d.wort, 3120, 60);
      e.append(stoss, eine, zahlzeile, wort);
      treibe(e);
      nach(1000, () => eine.animate({ opacity: [1, 0], translate: ['0 0', '0 -46px'] }, { duration: 160, easing: 'ease-in', fill: 'forwards' }));
      // Blättern: langsam anfangen, schnell werden, auf der letzten Seite stehen bleiben.
      // Jedes alte Blatt hebt sich unten ab und klappt nach oben weg.
      const n = d.seiten.length;
      let gezeigt = 0;
      lauf(1180, 1900, (t) => {
        const weich = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const i = Math.min(n - 1, Math.round(weich * (n - 1)));
        if (i !== gezeigt) {
          const alt = neu('img', 'seite flieger');
          alt.src = d.seiten[gezeigt];
          stoss.insertBefore(alt, glas);
          alt.animate([{ transform: 'rotateX(0deg)', opacity: 1, filter: 'brightness(1)' }, { transform: 'rotateX(58deg)', opacity: 1, filter: 'brightness(.9)', offset: .7 }, { transform: 'rotateX(84deg)', opacity: 0, filter: 'brightness(.84)' }], { duration: 300, easing: 'cubic-bezier(.35,0,.75,.6)' }).onfinish = () => alt.remove();
          gezeigt = i;
          seite.src = d.seiten[i];
          fuss.src = d.fuesse[i];
          zahl.textContent = d.nummern[i];
        }
        if (t === 1) { zahlzeile.style.animationDelay = '0ms'; zahlzeile.classList.add('fertig'); }
      });
    },
    // Schluss: Das Blatt wird zur Marke, darunter die drei Fakten, der Hinweis auf den Link und die Folgen-Zeile
    schluss(d) {
      const e = $('ergebnis');
      // Nur Zeilen, die noch zu sehen sind („Eine PDF.“ ist schon weg und darf nicht wieder auftauchen)
      [...e.querySelectorAll('.zeile')].filter((z) => Number(getComputedStyle(z).opacity) > 0.01).forEach((z) => z.animate({ opacity: [1, 0], translate: ['0 0', '0 70px'] }, { duration: 230, easing: 'ease-in', fill: 'forwards' }));
      // Mitte der Marke: 540 / 467
      e.querySelector('.stoss').animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(0px,-271px) scale(.2)', opacity: 1, offset: .8 }, { transform: 'translate(0px,-271px) scale(.15)', opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
      schild(d.schild, { ab: 250 });
      const s = $('schluss');
      for (const a of s.getAnimations()) a.cancel();
      s.replaceChildren();
      const logo = neu('div', 'logo');
      logo.innerHTML = K.MARKE;
      logo.style.animationDelay = '300ms';
      const n = neu('p', 'name');
      buchstaben(n, d.name, 440, 20);
      const fakten = neu('div', 'fakten');
      fakten.style.animationDelay = '680ms';
      d.fakten.forEach((f, i) => {
        const p = neu('p');
        const nr = neu('b', '', i + 1);
        p.append(nr, f);
        p.style.animationDelay = (800 + i * 150) + 'ms';
        nr.style.animationDelay = (860 + i * 150) + 'ms';
        fakten.append(p);
      });
      const link = neu('div', 'link', d.link);
      link.insertAdjacentHTML('beforeend', K.PFEIL);
      link.style.animationDelay = '1300ms, 2150ms';
      const folgen = neu('p', 'folgen');
      worte(folgen, d.folgen, 1750, 55);
      s.append(logo, n, fakten, link, folgen);
      treibe(s);
      nach(700, () => { e.replaceChildren(); e.classList.remove('treibt'); });
    },
    // Schleife: eine durchgehende Fahrt nach unten. Der Schluss verlässt das Bild oben, von unten kommt
    // die Anfrage genau so, wie der Film beginnt. Das letzte Bild ist das erste.
    schleife(text, dauer) {
      const s = $('schluss');
      const a = $('akt');
      window.B.forumStart(text);
      for (const e of [s, a]) {
        e.animate([{ translate: '0 0' }, { translate: '0 -1920px' }], { duration: dauer, easing: KV.FAHRT, fill: 'both' }).onfinish = () => {
          e.replaceChildren(); e.classList.remove('treibt');
          for (const x of e.getAnimations()) x.cancel();
        };
      }
      for (const e of [$('forum'), $('ut')]) e.animate([{ transform: 'translateY(1920px)' }, { transform: 'none' }], { duration: dauer, easing: KV.FAHRT, fill: 'backwards' });
      raster(-10, dauer, KV.FAHRT);
    },
  };
}

const buehne = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bühne</title><style>${stil}</style></head><body><div id="bild">
<div class="grund"><div class="punkte" id="punkte"></div><div class="licht"></div></div>
<div class="ebene" id="welt"><div id="karte-schatten"></div><div id="karte"><div class="kamera" id="kamera">
  <iframe id="app" src="${pathToFileURL(join(wurzel, 'PDF-Baukasten.html')).href}"></iframe>
</div></div><div id="weiss"></div></div>
<div class="ebene" id="forum" style="display:none"><div class="schild" id="schild">${TEXT.schild}</div><div class="handy" id="handy"><div class="beitrag" id="beitrag"><img alt="" src="data:image/png;base64,${forumRoh.toString('base64')}"></div></div></div>
<div class="ebene" id="tipps"></div>
<div class="ebene" id="papier"></div>
<div class="ebene" id="marke"></div>
<div class="ebene" id="ergebnis"></div>
<div class="ebene" id="schluss"></div>
<div id="akt"></div>
<div id="ut"></div>
<div class="geist" id="geist"></div>
<div class="welle" id="welle"></div>
<div class="zeiger" id="zeiger"><svg viewBox="0 0 22 30"><path d="M2 2v22l5.6-5.2 3.9 9 3.6-1.6-3.9-8.8H19z" fill="#0F1217" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
<div id="uhr"></div>
</div><script>(${buehnenSkript.toString()})(${JSON.stringify({ MARKE, LUPE, PFEIL, KURVE, KARTE, lage, forum, kernAnteil: 0.71 })});</script></body></html>`;
writeFileSync(join(arbeit, 'buehne.html'), buehne);

// ---------------------------------------------------------------------------
// Aufnahme
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: BILD.b, height: BILD.h }, deviceScaleFactor: 1, locale: 'de-DE', acceptDownloads: true });
// Das Werkzeug zeichnet Vorschau und Lupe dreifach fein, damit Nahaufnahmen scharf bleiben
await context.addInitScript(() => { try { Object.defineProperty(window, 'devicePixelRatio', { get: () => 3 }); } catch (e) { /* bleibt beim Standard */ } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('Seitenfehler:', String(e)));
await page.goto(pathToFileURL(join(arbeit, 'buehne.html')).href);
const app = page.frames().find((f) => f.url().includes('PDF-Baukasten.html'));
await app.waitForSelector('#leer:not([hidden])');
if (!(await app.locator('#speicher-hinweis').isHidden())) throw new Error('Das Werkzeug kann im Fenster der Bühne nicht speichern');
await page.evaluate(() => document.fonts.ready);

const cdp = await context.newCDPSession(page);
await cdp.send('Animation.enable');

// ---- Filmzeit: Die Aufnahme läuft abschnittsweise verschieden langsam, Wartezeiten werden herausgeschnitten ----
const uhrzeit = () => Date.now() / 1000;
const abschnitte = [];                    // { t: Beginn (Uhrzeit in s), k: Zeitlupe (Infinity = herausgeschnitten), misch: mitteln }
let tempoJetzt = 1;
let filmEnde = null;                      // Uhrzeit, ab der nichts mehr zum Film gehört
function ortImFilm(t) {
  let film = 0;
  let misch = false;
  let echt = false;                       // Abschnitt in echter Geschwindigkeit (Erstellen der Mappe)
  const ende = filmEnde ?? Infinity;
  for (let i = 0; i < abschnitte.length; i++) {
    const a = abschnitte[i].t;
    const b = Math.min(i + 1 < abschnitte.length ? abschnitte[i + 1].t : Infinity, ende);
    if (t <= a) break;
    if (b > a) film += (Math.min(t, b) - a) / abschnitte[i].k;
    misch = abschnitte[i].misch && t < b;
    echt = abschnitte[i].k === 1 && ZL > 1 && t < b;
  }
  return { film, misch, echt };
}
const filmJetzt = () => ortImFilm(uhrzeit()).film;
async function tempo(k, misch = false) {
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / k });
  abschnitte.push({ t: uhrzeit(), k, misch: misch && !ENTWURF });
  tempoJetzt = k;
}
// Schnelle Fahrt: stärkere Zeitlupe, die Bilder werden später gemittelt (Bewegungsunschärfe)
async function wisch(tat) {
  const vorher = tempoJetzt;
  await tempo(ZL_WISCH, true);
  await tat();
  await tempo(vorher, false);
}
// Wartezeit, die nicht in den Film gehört (Speichern, Seiten zeichnen)
async function schnitt(tat) {
  abschnitte.push({ t: uhrzeit(), k: Infinity, misch: false });
  const wert = await tat();
  abschnitte.push({ t: uhrzeit(), k: tempoJetzt, misch: false });
  return wert;
}
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
const warte = (ms) => schlaf(ms * tempoJetzt);                 // Angabe in Filmzeit
const verspaetet = [];
async function bis(ziel, name) {                                // warten, bis der Film bei "ziel" Sekunden steht
  const zuSpaet = filmJetzt() - ziel;
  if (name && zuSpaet > 0.02) verspaetet.push(`${name}: ${zuSpaet.toFixed(2)} s zu spät`);
  for (;;) {
    const rest = ziel - filmJetzt();
    if (rest <= 0.001) return;
    await schlaf(Math.min(rest * tempoJetzt * 1000, 1500));
  }
}

// ---- Einzelbilder mitschreiben ----
const bilder = [];                        // { datei, film, misch }
let versatz = null;                       // Abstand zwischen der Uhr der Bildzeiten und der Uhr hier
let laeuft = true;
cdp.on('Page.screencastFrame', (e) => {
  cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  if (!laeuft) return;
  // Die Bildzeit sollte die Uhrzeit sein. Weicht sie stark ab, zählt stattdessen die Ankunft des Bildes.
  if (versatz === null) versatz = Math.abs(uhrzeit() - e.metadata.timestamp) < 2 ? 0 : uhrzeit() - e.metadata.timestamp;
  const ort = ortImFilm(e.metadata.timestamp + versatz);
  const letztes = bilder[bilder.length - 1];
  // In Fahrten und beim Erstellen werden alle Bilder behalten (Mitteln bzw. Zwischenbilder).
  // Sonst reicht ein Bild pro Filmbild: Das neuere ersetzt das ältere.
  const alleBehalten = ort.misch || ort.echt;
  // Bilder vor dem Filmstart (Filmzeit 0) werden nie durch spätere ersetzt: Das letzte davon ist Bild 1.
  const ersetzt = letztes && !alleBehalten && !letztes.misch && !letztes.echt && (letztes.film > 0) === (ort.film > 0) && Math.round(letztes.film * 60) === Math.round(ort.film * 60);
  const datei = ersetzt ? letztes.datei : `b${String(bilder.length).padStart(6, '0')}.png`;
  writeFileSync(join(bilderOrdner, datei), Buffer.from(e.data, 'base64'));
  if (ersetzt) letztes.film = ort.film; else bilder.push({ datei, film: ort.film, misch: ort.misch, echt: ort.echt });
});

const B = (name, ...werte) => page.evaluate(([n, w]) => window.B[n](...w), [name, werte]);
let kam = { tx: 0, ty: 0, s: 1 };
let maus = { x: 820, y: 1180 };
const marke = [];                                              // Zeitmarken der Szenen, zur Kontrolle
const szene = (name) => marke.push({ name, film: filmJetzt() });

// Kamera: Der Punkt (ax, ay) des Werkzeugs liegt in der Kartenmitte, Vergrößerung s
async function blick(ax, ay, s, { dauer = 600, kurve } = {}) {
  kam = { s, tx: KARTE.mx - s * ax, ty: KARTE.my - s * ay };
  await B('kamera', kam.tx, kam.ty, kam.s, dauer, kurve);
}
const W = {                                                    // Einstellungen aus dem Drehbuch
  W0: [225, 209, 2.2], W1: [160, 195, 3.3], W2: [193, 222, 2.7], W3: [1066, 686, 2.2], W4: [961, 347, 3.4], W6: [1068.5, 695.5, 2.2],
};
// W6 weicht vom Drehbuch ab (dort 1054,5 / 704,5 / 2,3): Damit lagen die roten Seitenbereiche bei x 940-965, also im
// rechten Rand der Plattform-Knöpfe. Jetzt enden sie bei etwa x 916; rechts zeigt die Karte 11 Werkzeug-Pixel über den
// Rand hinaus (wie in W3, gleiche Farbe wie die rechte Spalte), die Unterkante des Werkzeugs liegt weiter auf der Kartenkante.
const kasten = (ziel) => (typeof ziel === 'string' ? app.locator(ziel).first() : ziel).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
// Wo liegt ein Element des Werkzeugs im Bild (bei der zuletzt gestellten Kamera)?
async function ort(ziel, versatzIn = {}) {
  const k = await kasten(ziel);
  const x = k.x + (versatzIn.x ?? k.w / 2);
  const y = k.y + (versatzIn.y ?? k.h / 2);
  return { x: kam.tx + kam.s * x, y: kam.ty + kam.s * y };
}
// Zeiger weich bewegen; die Dauer gilt in Filmzeit
async function fahre(x, y, dauer = 420) {
  const von = { ...maus };
  const start = filmJetzt();
  for (;;) {
    const t = Math.min(1, (filmJetzt() - start) * 1000 / dauer);
    const weich = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const px = von.x + (x - von.x) * weich;
    const py = von.y + (y - von.y) * weich;
    await page.mouse.move(px, py);
    await B('zeiger', px, py);
    if (t >= 1) break;
    await schlaf(4);
  }
  maus = { x, y };
}
async function zu(ziel, versatzIn, dauer) { const p = await ort(ziel, versatzIn); await fahre(p.x, p.y, dauer); }
async function druecke() {
  await B('klick');
  await page.mouse.down();
  await warte(40);
  await page.mouse.up();
}
async function klick(ziel, versatzIn, dauer) {
  await zu(ziel, versatzIn, dauer);
  await warte(30);
  await druecke();
  await warte(60);
}
const tippe = (text, takt = 30) => page.keyboard.type(text, { delay: takt * tempoJetzt });

// ---- Vorbereitung, noch ohne Aufnahme: 300 PDFs aufnehmen, Vorschaubilder fertig zeichnen lassen ----
console.log('Vorbereitung: PDFs aufnehmen …');
await B('vorbereitung', true);
await B('kamera', 0, 400, BILD.b / APP.b, 0);                   // Werkzeug ganz ins Bild, damit es sich bedienen lässt
const alle = readdirSync(daten).filter((n) => n.endsWith('.pdf')).map((n) => join(daten, n));
const [wahl] = await Promise.all([page.waitForEvent('filechooser'), app.locator('#leer-hinzu').click()]);
await wahl.setFiles(alle);
await app.waitForFunction((n) => document.querySelector('#import-lauf').hidden && document.querySelectorAll('#liste > li').length >= n, alle.length, { timeout: 180000 });
await app.waitForFunction((n) => document.querySelectorAll('#liste .daumen img').length >= n, alle.length, { timeout: 180000 });
await app.locator('#mappe-name').fill(TEXT.mappe);
await app.locator('#mappe-name').press('Enter');
await app.locator('#suche').fill('scan');
await app.locator('#suche').evaluate((e) => e.blur());
await app.waitForFunction(() => document.querySelector('#toast').hidden, null, { timeout: 20000 }).catch(() => {});
await page.mouse.move(maus.x, maus.y);
await B('zeiger', maus.x, maus.y);
await B('vorbereitung', false);

// Anfangsbild stellen, erst dann läuft die Aufnahme: Das erste Bild zeigt schon die Anfrage
await B('forumStart', TEXT.gesucht);
await blick(...W.W0, { dauer: 0 });
await schlaf(700);
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: BILD.b, maxHeight: BILD.h, everyNthFrame: 1 });
await schlaf(700);
console.log('Aufnahme läuft …');
await tempo(ZL);                                                // hier beginnt der Film

// ---- 1. Die Anfrage: Kernzeile markieren, dann zum Nachtrag „lokal, keine KI“ ----
szene('1 Anfrage');
await B('forumStrich', 1, 480);
await B('forumBlick', 'nah', 1500, KURVE.SANFT);
await bis(1.40);
await B('ut', '');
await bis(1.48);
await wisch(async () => {
  await B('forumBlick', 'edit', 620);
  await bis(1.84);
  await B('ut', TEXT.lokal);
  await bis(2.12);
});
await B('forumStrich', 2, 500);
await bis(2.55);
await B('forumStrich', 3, 170);
await bis(2.84);
await B('ut', '');
await bis(2.90, 'Tipps');

// ---- 2. Die Tipps aus dem Forum ----
szene('2 Tipps');
await wisch(async () => {
  await B('forumRaus');
  await B('tipps', TEXT.tippsKopf, TEXT.tipps);
  await bis(4.30);
});
await bis(4.60, 'Stapel');

// ---- 3. Das Ausmaß: 300 PDFs ----
szene('3 Stapel');
await wisch(async () => {
  await B('tippsRaus');
  await B('papier', TEXT.aber, 300);
  await bis(6.36);
});
await bis(6.85, 'Marke');

// ---- 4. Also gebaut ----
szene('4 Marke');
await wisch(async () => {
  await B('marke', TEXT.gebaut, TEXT.name, TEXT.satz);
  await bis(7.50);
});
await bis(9.00, 'Eintauchen');

// ---- 5. In das Werkzeug hinein: Fahrt durch das weiße Blatt der Marke ----
szene('5 Eintauchen');
await wisch(async () => {
  await B('eintauchen', 480, TEXT.name);
  await blick(...W.W1, { dauer: 980, kurve: 'cubic-bezier(.3,.3,.2,1)' });
  await bis(9.50);
});
await bis(9.52);
await B('zeigerAn', true);
await bis(9.80, 'Benennen');

// 6. Benennen
szene('6 Benennen');
await B('ut', TEXT.schritte[0], { nr: 1 });
await klick(app.locator('#liste > li').first().locator('input.name'), { x: 150 }, 360);
await page.keyboard.press('Control+A');
await tippe(TEXT.neuerName, 20);
await warte(300);
await bis(11.20, 'Anhaken');

// 7. Suchen und anhaken: Die Kamera geht einen Schritt zurück, der Zeiger zur Suche
szene('7 Anhaken');
await B('ut', TEXT.schritte[1], { nr: 2 });
await wisch(async () => {
  await blick(...W.W2, { dauer: 480 });
  await zu('#suche', { x: 70 }, 440);
  await warte(40);
});
await druecke();
await page.keyboard.press('Control+A');
await tippe('protokoll', 28);
await warte(240);
await klick('.tabelle-kopf .haken', undefined, 300);
await bis(13.50, 'Reihenfolge');

// 8. Reihenfolge ziehen: schneller Schwenk nach rechts, die fünfte Zeile wandert ganz nach oben
szene('8 Reihenfolge');
await B('ut', TEXT.schritte[2], { nr: 3 });
const fuenfter = app.locator('#mappe-liste li').nth(4);
const gezogen = await fuenfter.locator('strong').innerText();
await wisch(async () => {
  await blick(...W.W3, { dauer: 580 });
  await zu(fuenfter, { x: 150 }, 560);
  await warte(20);
});
await B('klick');
await page.mouse.down();
await fahre(maus.x + 6, maus.y - 16, 100);                      // ein kleines Stück, damit das Ziehen beginnt
await B('geist', gezogen, maus.x, maus.y, kam.s);
const oben = await ort(app.locator('#mappe-liste li').nth(0), { x: 150, y: 5 });
await fahre(oben.x, oben.y, 520);
await warte(160);
await page.mouse.up();
await B('geistAus');
await bis(15.45, 'Seitenzahl');

// 9. Seitenzahl setzen: Ecke anklicken, Schreibweise wählen, blättern
szene('9 Seitenzahl');
await B('ut', TEXT.schritte[3], { nr: 4 });
await wisch(async () => {
  await blick(...W.W4, { dauer: 540 });
  await zu('#zonen i[data-position="unten-rechts"]', undefined, 520);
  await warte(20);
});
await druecke();
await warte(380);
const glas = await kasten('#lupe');
const fahrtW5 = filmJetzt();
await blick(glas.x + glas.w / 2, glas.y + glas.h / 2, 5, { dauer: 700, kurve: 'cubic-bezier(.45,0,.2,1)' });
await app.locator('#format').focus();
for (let i = 0; i < 3; i++) { await warte(150); await page.keyboard.press('ArrowDown'); }
await bis(fahrtW5 + 0.70 + 0.12);
await klick('#blatt-vor', undefined, 300);
await bis(filmJetzt() + 0.12);
await druecke();
await warte(250);
await bis(18.35, 'Erstellen');

// 10. Ein Klick: Das Erstellen läuft in echter Geschwindigkeit
szene('10 Erstellen');
await B('ut', TEXT.schritte[4], { nr: 5 });
await wisch(async () => {
  await blick(...W.W6, { dauer: 600 });
  await zu('#erstellen', { y: 30 }, 560);
  await warte(20);
});
await tempo(1);
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), druecke()]);
await app.waitForFunction(() => !document.querySelector('#ergebnis').hidden);
await warte(380);
await tempo(ZL);
const ergebnisText = (await app.locator('#ergebnis').innerText()).replace(/\s+/g, ' ').trim();
const knopf = await ort('#erstellen');

// Seiten der erzeugten PDF für den Beweis zeichnen (gleichmäßig verteilt). Diese Wartezeit fehlt im Film.
const ANZAHL = 26;
const mappePfad = join(arbeit, 'mappe.pdf');
const beweis = await schnitt(async () => {
  await download.saveAs(mappePfad);
  // Ausschnitt für die Lupe: die Ecke unten rechts, dort steht die Seitenzahl
  const python = `
import pymupdf, sys, json
d = pymupdf.open(sys.argv[1]); n = len(d); aus = sys.argv[2]; m = int(sys.argv[3]); nummern = []
for i in range(m):
    nr = round(i * (n - 1) / (m - 1)); nummern.append(nr + 1)
    s = d[nr]
    s.get_pixmap(matrix=pymupdf.Matrix(1.3, 1.3)).save(f"{aus}/seite{i}.png")
    r = s.rect
    s.get_pixmap(matrix=pymupdf.Matrix(4.6, 4.6), clip=pymupdf.Rect(r.width - 132, r.height - 49, r.width - 8, r.height - 19)).save(f"{aus}/fuss{i}.png")
print(json.dumps({"seiten": n, "nummern": nummern}))
`;
  const antwort = JSON.parse(execFileSync('python', ['-I', '-c', python, mappePfad, arbeit, String(ANZAHL)], { encoding: 'utf8' }).trim());
  const alsBild = (name) => `data:image/png;base64,${readFileSync(join(arbeit, name)).toString('base64')}`;
  const reihe = Array.from({ length: ANZAHL }, (_, i) => i);
  // Bilder vorab in der Seite laden, damit beim Blättern nichts nachlädt
  const bilderDaten = reihe.map((i) => alsBild(`seite${i}.png`));
  const fuesse = reihe.map((i) => alsBild(`fuss${i}.png`));
  await page.evaluate(async (liste) => { await Promise.all(liste.map((src) => { const i = new Image(); i.src = src; return i.decode(); })); window.__vorrat = liste; }, [...bilderDaten, ...fuesse]);
  return { ...antwort, bilder: bilderDaten, fuesse };
});
const seitenzahl = beweis.seiten;

// ---- 11. Der Beweis: Die fertige PDF blättert, die Lupe zeigt die echte Seitenzahl ----
await bis(20.15, 'Beweis');
szene('11 Beweis');
const t11 = filmJetzt();
await B('ut', '');
await B('zeigerAn', false);
await wisch(async () => {
  await B('ergebnis', { von: knopf, schild: TEXT.ergebnis, seiten: beweis.bilder, fuesse: beweis.fuesse, nummern: beweis.nummern, eine: TEXT.eine, einheit: TEXT.einheit, wort: TEXT.wort });
  await bis(t11 + 0.66);
});
await bis(t11 + 1.18);
await wisch(async () => { await bis(t11 + 3.08); });            // das Blättern mit Bewegungsunschärfe
await bis(t11 + 3.70);

// ---- 12. Schluss ----
szene('12 Schluss');
const t12 = filmJetzt();
await wisch(async () => {
  await B('schluss', { schild: TEXT.nummer, name: TEXT.name, fakten: TEXT.fakten, link: TEXT.link, folgen: TEXT.folgen });
  await bis(t12 + 0.50);
});
await bis(t12 + 3.50);

// ---- 13. Schleife: zurück zum ersten Bild ----
szene('13 Schleife');
const t13 = filmJetzt();
await wisch(async () => {
  await B('schleife', TEXT.gesucht, 760);
  await bis(t13 + 0.76);
});
await bis(t13 + 0.85);
filmEnde = uhrzeit();
const dauer = filmJetzt();
await schlaf(300);
laeuft = false;
await cdp.send('Page.stopScreencast');
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });

// ---------------------------------------------------------------------------
// Aus den Einzelbildern den Film bauen
// ---------------------------------------------------------------------------
// Für jedes der 60 Filmbilder pro Sekunde: das letzte Einzelbild bis zu diesem Zeitpunkt.
// In Fahrten werden alle Einzelbilder aus dem offenen Verschluss gemittelt; kam im Verschluss kein Bild an,
// zählt das zeitlich nächste. Beim Erstellen (echte Geschwindigkeit, der Screencast schafft dort nur etwa
// 20-35 Bilder pro Sekunde) wird eine Lücke im Bildstrom mit einem Zwischenbild aus den zwei Nachbarn gefüllt,
// aber nur bei kurzen Lücken: Steht das Werkzeug wirklich still, bleibt das Bild stehen.
const anzahl = Math.round(dauer * 60);
const plan = [];                           // je Filmbild: { dateien, gewichte }
const einzeln = (b) => ({ dateien: [b.datei], gewichte: [1] });
let zeigerB = 0;
for (let n = 0; n < anzahl; n++) {
  const zeit = n / 60;
  while (zeigerB + 1 < bilder.length && bilder[zeigerB + 1].film <= zeit + 0.5 / 60) zeigerB++;
  const b = bilder[zeigerB];
  const danach = bilder[zeigerB + 1];
  if (b.misch) {
    const offen = [];
    for (let i = zeigerB; i >= 0 && bilder[i].film >= zeit - VERSCHLUSS / 2 / 60; i--) if (bilder[i].film <= zeit + VERSCHLUSS / 2 / 60) offen.unshift(bilder[i].datei);
    if (offen.length) plan.push({ dateien: offen, gewichte: offen.map(() => 1 / offen.length) });
    else plan.push(einzeln(danach && danach.film - zeit < zeit - b.film ? danach : b));
  } else if ((b.echt || danach?.echt) && zeit - b.film > 0.5 / 60 && danach && danach.film - b.film < 0.09) {
    const w = Math.min(1, Math.max(0, (zeit - b.film) / (danach.film - b.film)));
    plan.push({ dateien: [b.datei, danach.datei], gewichte: [1 - w, w] });
  } else plan.push(einzeln(b));
}
// Das letzte Filmbild ist das Anfangsbild der Schleife: immer das letzte Einzelbild
plan[anzahl - 1] = einzeln(bilder[bilder.length - 1]);
// Das erste Filmbild ist das letzte Bild vor dem Start (Anfangszustand, noch nichts bewegt)
plan[0] = einzeln(bilder.filter((b) => b.film === 0).pop() || bilder[0]);

// Mitteln mit Python (numpy): Bilder laden, Bildpunkte gewichtet aufsummieren, als PNG speichern.
// (Im Browser brach das Laden bei mehreren tausend Einzelbildern gelegentlich mit "Failed to fetch" ab.)
const zuMischen = plan.map((p, n) => ({ n, ...p })).filter((p) => p.dateien.length > 1);
if (zuMischen.length) {
  console.log(`Bewegungsunschärfe: ${zuMischen.length} Filmbilder werden gemittelt …`);
  const auftraege = join(arbeit, 'mischen.json');
  writeFileSync(auftraege, JSON.stringify(zuMischen.map((p) => ({ ziel: `m${String(p.n).padStart(6, '0')}.png`, dateien: p.dateien, gewichte: p.gewichte }))));
  const python = `
import json, sys, numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
ordner = sys.argv[1]
def mische(a):
    summe = None
    for d, g in zip(a["dateien"], a["gewichte"]):
        b = np.asarray(Image.open(ordner + "/" + d).convert("RGB"), dtype=np.float32) * g
        summe = b if summe is None else summe + b
    Image.fromarray(np.clip(np.rint(summe), 0, 255).astype(np.uint8)).save(ordner + "/" + a["ziel"], compress_level=1)
with ThreadPoolExecutor(8) as ex: list(ex.map(mische, json.load(open(sys.argv[2], encoding="utf8"))))
`;
  execFileSync('python', ['-I', '-c', python, bilderOrdner, auftraege], { stdio: 'inherit', maxBuffer: 1 << 26 });
  for (const p of zuMischen) plan[p.n] = { dateien: [`m${String(p.n).padStart(6, '0')}.png`], gewichte: [1] };
}
await browser.close();

// Jedes Filmbild bekommt eine eigene, fortlaufend nummerierte Datei (fester Verweis, keine Kopie).
// So legt ffmpeg die Bilder genau im 60er-Takt hintereinander, ohne Rundung von Dauern.
const filmOrdner = join(arbeit, 'film');
mkdirSync(filmOrdner, { recursive: true });
plan.forEach((p, n) => linkSync(join(bilderOrdner, p.dateien[0]), join(filmOrdner, `f${String(n).padStart(6, '0')}.png`)));
writeFileSync(join(arbeit, 'zeiten.json'), JSON.stringify({
  dauer, seitenzahl, ergebnisText, szenen: marke, verspaetet,
  abschnitte: abschnitte.map((a) => ({ film: ortImFilm(a.t).film, k: a.k, misch: a.misch })),
  bilder: bilder.map((b) => [Math.round(b.film * 10000) / 10000, b.misch ? 1 : b.echt ? 2 : 0]),
  plan: plan.map((p) => p.dateien[0]),
}));
mkdirSync(dirname(zielVideo), { recursive: true });
// Festes Bildraster (cfr): ffmpeg 9 ließ mit dem fps-Filter sonst 120 Bilder weg (Zeitsprünge im Film).
execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-framerate', '60', '-i', join('film', 'f%06d.png'),
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-fps_mode', 'cfr', '-r', '60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', '-movflags', '+faststart', zielVideo], { cwd: arbeit, stdio: 'inherit' });
rmSync(filmOrdner, { recursive: true, force: true });
if (!process.env.SHORT_BEHALTEN && !ENTWURF) rmSync(bilderOrdner, { recursive: true, force: true });

console.log(`${ENTWURF ? `ENTWURF ${ENTWURF} (ohne Unschärfe). ` : ''}${bilder.length} Einzelbilder, ${anzahl} Filmbilder, ${dauer.toFixed(2)} s, ${zuMischen.length} gemittelt`);
console.log(`Ergebniszeile: ${ergebnisText} | Seiten laut Datei: ${seitenzahl}`);
console.log(marke.map((m) => `${m.name} ${m.film.toFixed(2)}s`).join(' | '));
if (verspaetet.length) console.log('Verspätet:', verspaetet.join(' | '));
console.log(zielVideo);
