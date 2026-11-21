// Produziert den Demo-Film zum PDF-Baukasten (1920 x 1080, MP4).
// Eine Bühnen-Seite zeigt Texttafeln und das echte Werkzeug in einem Fenster; die "Kamera" fährt per
// Vergrößerung an die Stellen heran. Bedient wird das echte Werkzeug mit 300 erfundenen Beispiel-PDFs.
// Aufruf: node test/demo-video.mjs <Ordner mit Beispiel-PDFs> <Zieldatei.mp4>
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const daten = resolve(process.argv[2] || join(wurzel, 'test', 'daten-demo300'));
const zielVideo = resolve(process.argv[3] || join(wurzel, 'test', 'ausgabe', 'PDF-Baukasten-Demo.mp4'));
const arbeit = join(wurzel, 'test', 'ausgabe', 'demo');
const bilderOrdner = join(arbeit, 'bilder');
rmSync(arbeit, { recursive: true, force: true });
mkdirSync(bilderOrdner, { recursive: true });

const LEISTE = 40;                       // Höhe der Fensterleiste über dem Werkzeug
const APP = { b: 1280, h: 720 };         // Größe des Werkzeugs im Fenster
const schrift = readFileSync(join(wurzel, 'node_modules', '@fontsource-variable', 'geist', 'files', 'geist-latin-wght-normal.woff2')).toString('base64');
const MARKE = '<svg viewBox="0 0 28 28"><rect width="28" height="28" rx="7.5" fill="#0F1217"/><path d="M9 6.2h6.6L19.5 10v11.8H9z" fill="#fff"/><rect x="11.3" y="16.6" width="5.9" height="2.9" rx="1.45" fill="#E2372E"/></svg>';
const LUPE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#E2372E"/><circle cx="11" cy="11" r="4.2" fill="none" stroke="#fff" stroke-width="2"/><path d="M14.2 14.2l3.4 3.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
const ZEILEN = 'linear-gradient(#D5D9DF,#D5D9DF) 26px 34px/96px 7px no-repeat,' + [58, 76, 94, 112, 130, 166, 184, 202, 220].map((y, i) => `linear-gradient(#E7E9ED,#E7E9ED) 26px ${y}px/${[198, 198, 150, 198, 120, 198, 198, 170, 90][i]}px 5px no-repeat`).join(',');

// ---------------------------------------------------------------------------
// Die Bühne
// ---------------------------------------------------------------------------
const buehne = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bühne</title><style>
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${schrift}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#E9EBEF;color:#0F1217;font-family:Geist,sans-serif;-webkit-font-smoothing:antialiased}
.grund{position:absolute;inset:0;background:radial-gradient(1300px 760px at 50% 40%,#fff 0%,rgba(255,255,255,0) 72%),radial-gradient(rgba(15,18,23,.11) 1.5px,transparent 1.9px) 0 0/30px 30px,#E7E9ED}
.kamera{position:absolute;left:0;top:0;transform-origin:0 0;opacity:0;transition:transform 1s cubic-bezier(.7,0,.2,1),opacity .7s ease}
.fenster{width:${APP.b}px;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(15,18,23,.08),0 34px 90px rgba(15,18,23,.24),0 8px 22px rgba(15,18,23,.10)}
.fensterleiste{position:relative;height:${LEISTE}px;display:flex;align-items:center;gap:8px;padding:0 15px;background:#F6F7F9;border-bottom:1px solid #E7E9ED}
.fensterleiste i{width:11px;height:11px;border-radius:50%;background:#D2D6DD}
.adresse{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:24px;padding:0 14px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px #E7E9ED;font-size:12px;color:#5B6370}
.adresse b{font-weight:560;color:#0F1217}
iframe{display:block;width:${APP.b}px;height:${APP.h}px;border:0;background:#fff}

.tafel,.ergebnis{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;pointer-events:none;transition:opacity .45s ease,transform .6s cubic-bezier(.7,0,.2,1)}
.tafel{padding:0 170px;gap:26px}
.tafel.links{padding-right:930px}
.tafel.an,.ergebnis.an{opacity:1}
.tafel.raus,.ergebnis.raus{opacity:0;transform:translateY(-34px)}
.zeile{margin:0}
.klein{font-size:32px;font-weight:520;color:#5B6370;letter-spacing:-.01em}
.gross{font-size:104px;font-weight:660;line-height:1.02;letter-spacing:-.045em}
.mittel{font-size:50px;font-weight:580;line-height:1.2;letter-spacing:-.03em;color:#5B6370}
.mittel em,.gross em{font-style:normal;color:#E2372E}
.mitte{align-items:center;text-align:center}
.w{display:inline-block;opacity:0;transform:translateY(.45em);filter:blur(8px);animation:wort .7s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes wort{to{opacity:1;transform:none;filter:none}}
.logo{display:flex;align-items:center;gap:30px;opacity:0;transform:scale(.9);animation:logo .8s cubic-bezier(.2,.9,.2,1) forwards}
.logo svg{width:132px;height:132px;filter:drop-shadow(0 16px 30px rgba(15,18,23,.22))}
.logo span{font-size:124px;font-weight:680;letter-spacing:-.05em}
@keyframes logo{to{opacity:1;transform:none}}
.fakten{display:flex;gap:18px;margin-top:6px}
.fakten span{opacity:0;transform:translateY(16px);animation:wort .6s cubic-bezier(.2,.8,.2,1) forwards;padding:16px 30px;border-radius:40px;background:#fff;box-shadow:0 0 0 1px rgba(15,18,23,.07),0 10px 26px rgba(15,18,23,.10);font-size:36px;font-weight:600;letter-spacing:-.02em}

/* Einstieg: ein Stapel Blätter fällt ins Bild, die Lupe zählt bis 300 */
.papier{position:absolute;left:1410px;top:486px;width:0;height:0;transition:opacity .45s ease,transform .6s cubic-bezier(.7,0,.2,1)}
.papier.raus{opacity:0;transform:translateY(-34px) scale(.94)}
.papier i{position:absolute;left:-125px;top:-177px;width:250px;height:354px;border-radius:4px;background:${ZEILEN},#fff;box-shadow:0 0 0 1px rgba(15,18,23,.06),0 2px 5px rgba(15,18,23,.08),0 16px 36px rgba(15,18,23,.16);opacity:0;animation:fall .8s cubic-bezier(.2,.9,.25,1) forwards}
@keyframes fall{from{opacity:0;transform:translate(var(--x),calc(var(--y) - 320px)) rotate(calc(var(--r) + 30deg)) scale(1.14)}to{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r))}}
.zaehler{position:absolute;left:-160px;top:168px;width:320px;height:108px;border-radius:26px;background:#fff;box-shadow:0 0 0 4px #E2372E,0 20px 46px rgba(15,18,23,.28);display:flex;align-items:baseline;justify-content:center;gap:14px;padding-top:20px;font-size:62px;font-weight:680;letter-spacing:-.04em;font-variant-numeric:tabular-nums;opacity:0;transform:scale(.6);animation:lupe .5s cubic-bezier(.3,1.5,.5,1) forwards}
.zaehler small{font-size:32px;font-weight:560;color:#5B6370;letter-spacing:-.02em}
.zaehler svg{position:absolute;left:-18px;top:-18px;width:44px;height:44px;filter:drop-shadow(0 3px 6px rgba(15,18,23,.25))}
@keyframes lupe{to{opacity:1;transform:none}}

.spruch{position:absolute;left:50%;bottom:24px;display:flex;align-items:center;gap:16px;height:68px;padding:0 30px 0 14px;border-radius:34px;background:#0F1217;color:#fff;box-shadow:0 16px 40px rgba(15,18,23,.28);font-size:31px;font-weight:600;letter-spacing:-.02em;white-space:nowrap;opacity:0;transform:translate(-50%,20px);transition:opacity .3s ease,transform .45s cubic-bezier(.2,.9,.2,1)}
.spruch.an{opacity:1;transform:translate(-50%,0)}
.spruch b{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#E2372E;font-size:23px;font-weight:700;font-variant-numeric:tabular-nums}
.spruch small{font-size:24px;font-weight:480;color:#B9BEC8;letter-spacing:-.01em}

/* Ergebnis: die echte PDF wird durchgeblättert, die Lupe zeigt die echte Seitenzahl */
.ergebnis{flex-direction:row;align-items:center;justify-content:center;gap:120px}
.ergebnis .worte{display:flex;flex-direction:column;gap:6px;width:760px}
.stoss{position:relative;width:520px;height:735px;opacity:0;transform:translateY(60px) rotate(1.5deg);animation:blatt .9s cubic-bezier(.2,.9,.2,1) .15s forwards}
@keyframes blatt{to{opacity:1;transform:none}}
.stoss u{position:absolute;inset:0;background:#fff;border-radius:4px;box-shadow:0 0 0 1px rgba(15,18,23,.07),0 2px 5px rgba(15,18,23,.08)}
.stoss u:nth-child(1){transform:translate(18px,16px);background:#F1F2F4}
.stoss u:nth-child(2){transform:translate(9px,8px);background:#F8F9FA}
.stoss img.seite{position:absolute;inset:0;width:100%;height:100%;background:#fff;border-radius:4px;box-shadow:0 0 0 1px rgba(15,18,23,.06),0 3px 6px rgba(15,18,23,.08),0 26px 60px rgba(15,18,23,.22)}
.stoss .glas{position:absolute;left:50%;bottom:-30px;width:440px;margin-left:-220px;opacity:0;transform:scale(.7);animation:lupe .5s cubic-bezier(.3,1.5,.5,1) .9s forwards}
.stoss .glas img{display:block;width:100%;border-radius:22px;background:#fff;box-shadow:0 0 0 4px #E2372E,0 18px 44px rgba(15,18,23,.30)}
.stoss .glas svg{position:absolute;left:-18px;top:-18px;width:44px;height:44px;filter:drop-shadow(0 3px 6px rgba(15,18,23,.25))}

.zeiger{position:absolute;left:0;top:0;width:30px;height:40px;z-index:50;pointer-events:none;opacity:0;transition:opacity .3s}
.welle{position:absolute;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:rgba(226,55,46,.32);opacity:0;z-index:49;pointer-events:none}
</style></head><body>
<div class="grund"></div>
<div class="kamera" id="kamera"><div class="fenster">
  <div class="fensterleiste"><i></i><i></i><i></i><div class="adresse"><svg viewBox="0 0 24 24" width="13" height="13"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>Lokale Datei<b>PDF-Baukasten.html</b></div></div>
  <iframe id="app" src="${pathToFileURL(join(wurzel, 'PDF-Baukasten.html')).href}"></iframe>
</div></div>
<div class="tafel" id="tafel"></div>
<div class="papier" id="papier"></div>
<div class="ergebnis" id="ergebnis"></div>
<div class="spruch" id="spruch"></div>
<div class="welle" id="welle"></div>
<div class="zeiger" id="zeiger"><svg viewBox="0 0 22 30" width="30" height="40"><path d="M2 2v22l5.6-5.2 3.9 9 3.6-1.6-3.9-8.8H19z" fill="#0F1217" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
<script>
const $ = (id) => document.getElementById(id);
const LUPE = ${JSON.stringify(LUPE)};
window.B = {
  kamera(tx, ty, s, dauer) { const k = $('kamera'); k.style.transitionDuration = dauer + 'ms, 700ms'; k.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; },
  fenster(an) { $('kamera').style.opacity = an ? 1 : 0; },
  zeiger(x, y) { $('zeiger').style.transform = 'translate(' + x + 'px,' + y + 'px)'; $('welle').style.left = x + 'px'; $('welle').style.top = y + 'px'; },
  zeigerAn(an) { $('zeiger').style.opacity = an ? 1 : 0; },
  welle() { $('welle').animate([{ opacity: 1, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 460, easing: 'ease-out' }); },
  // Texttafel: Zeilen erscheinen Wort für Wort
  tafel(zeilen, art) {
    const t = $('tafel');
    t.className = 'tafel ' + (art || '');
    t.replaceChildren();
    let zeit = 80;
    for (const z of zeilen) {
      if (z.pause) { zeit += z.pause; continue; }
      const p = document.createElement('p');
      p.className = 'zeile ' + z.k;
      if (z.logo) { p.className = 'logo'; p.innerHTML = z.logo + '<span></span>'; p.querySelector('span').textContent = z.t; p.style.animationDelay = zeit + 'ms'; zeit += 500; t.append(p); continue; }
      if (z.fakten) { p.className = 'fakten'; for (const f of z.fakten) { const s = document.createElement('span'); s.textContent = f; s.style.animationDelay = zeit + 'ms'; zeit += 170; p.append(s); } t.append(p); continue; }
      for (const teil of z.t.split(' ')) {
        const rot = teil.startsWith('*');
        const w = document.createElement(rot ? 'em' : 'span');
        w.className = 'w';
        w.textContent = (rot ? teil.slice(1) : teil).replace(/_/g, '\\u00A0');
        w.style.animationDelay = zeit + 'ms';
        zeit += z.tempo || 70;
        p.append(w, ' ');
      }
      zeit += z.danach ?? 140;
      t.append(p);
    }
    requestAnimationFrame(() => t.classList.add('an'));
  },
  tafelAus() { $('tafel').classList.add('raus'); $('papier').classList.add('raus'); },
  // Blätter fallen auf einen Stapel, die Lupe zählt mit
  papier(ab, bis) {
    const p = $('papier');
    p.className = 'papier';
    p.replaceChildren();
    let saat = 11;
    const z = () => (saat = (saat * 16807) % 2147483647) / 2147483647;
    const anzahl = 24;
    for (let i = 0; i < anzahl; i++) {
      const blatt = document.createElement('i');
      const letztes = i === anzahl - 1;
      blatt.style.setProperty('--x', (letztes ? 0 : Math.round((z() - 0.5) * 360)) + 'px');
      blatt.style.setProperty('--y', (letztes ? -6 : Math.round((z() - 0.5) * 210)) + 'px');
      blatt.style.setProperty('--r', (letztes ? -3 : Math.round((z() - 0.5) * 38)) + 'deg');
      blatt.style.animationDelay = (ab + i * 58) + 'ms';
      p.append(blatt);
    }
    const zaehler = document.createElement('div');
    zaehler.className = 'zaehler';
    zaehler.style.animationDelay = ab + 'ms';
    zaehler.innerHTML = LUPE + '<span>1</span><small>PDFs</small>';
    p.append(zaehler);
    const zahl = zaehler.querySelector('span');
    const start = performance.now() + ab + 150;
    const dauer = anzahl * 58 + 500;
    const tick = (jetzt) => {
      const t = Math.min(1, Math.max(0, (jetzt - start) / dauer));
      zahl.textContent = Math.max(1, Math.round(bis * (1 - Math.pow(1 - t, 2.2))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  spruch(nr, text, klein) {
    const s = $('spruch');
    if (!text) { s.classList.remove('an'); return; }
    const neu = () => {
      s.replaceChildren();
      const b = document.createElement('b'); b.textContent = nr; s.append(b, text);
      if (klein) { const k = document.createElement('small'); k.textContent = klein; s.append(k); }
      s.classList.add('an');
    };
    if (s.classList.contains('an')) { s.classList.remove('an'); setTimeout(neu, 260); } else neu();
  },
  // Ergebnis: die Seiten der erzeugten PDF werden durchgeblättert
  ergebnis(d) {
    const e = $('ergebnis');
    e.className = 'ergebnis';
    e.replaceChildren();
    const worte = document.createElement('div');
    worte.className = 'worte';
    d.worte.forEach((wort, i) => { const p = document.createElement('p'); p.className = 'zeile gross'; const w = document.createElement(wort.startsWith('*') ? 'em' : 'span'); w.className = 'w'; w.textContent = wort.replace('*', ''); w.style.animationDelay = (300 + i * 430) + 'ms'; p.append(w); worte.append(p); });
    const stoss = document.createElement('div');
    stoss.className = 'stoss';
    stoss.innerHTML = '<u></u><u></u><img class="seite"><div class="glas"><img>' + LUPE + '</div>';
    const seite = stoss.querySelector('img.seite');
    const fuss = stoss.querySelector('.glas img');
    seite.src = d.seiten[0];
    fuss.src = d.fuesse[0];
    e.append(worte, stoss);
    requestAnimationFrame(() => e.classList.add('an'));
    // Blättern: langsam anfangen, schnell werden, auf der letzten Seite stehen bleiben
    const n = d.seiten.length;
    const start = performance.now() + 1700;
    const dauer = 2300;
    let gezeigt = 0;
    const tick = (jetzt) => {
      const t = Math.min(1, Math.max(0, (jetzt - start) / dauer));
      const weich = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const i = Math.min(n - 1, Math.round(weich * (n - 1)));
      if (i !== gezeigt) {
        gezeigt = i;
        seite.src = d.seiten[i];
        fuss.src = d.fuesse[i];
        seite.animate([{ transform: 'translateY(-12px) rotate(-.7deg)', opacity: .75 }, { transform: 'none', opacity: 1 }], { duration: 150, easing: 'ease-out' });
      }
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  ergebnisAus() { $('ergebnis').classList.add('raus'); },
};
</script></body></html>`;
writeFileSync(join(arbeit, 'buehne.html'), buehne);

// ---------------------------------------------------------------------------
// Aufnahme
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'de-DE', acceptDownloads: true });
// Das Werkzeug zeichnet Vorschau und Lupe dreifach fein, damit Nahaufnahmen scharf bleiben
await context.addInitScript(() => { try { Object.defineProperty(window, 'devicePixelRatio', { get: () => 3 }); } catch (e) { /* bleibt beim Standard */ } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('Seitenfehler:', String(e)));
await page.goto(pathToFileURL(join(arbeit, 'buehne.html')).href);
const app = page.frames().find((f) => f.url().includes('PDF-Baukasten.html'));
await app.waitForSelector('#leer:not([hidden])');
if (!(await app.locator('#speicher-hinweis').isHidden())) throw new Error('Das Werkzeug kann im Fenster der Bühne nicht speichern');

const bilder = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', (e) => {
  const datei = `b${String(bilder.length).padStart(6, '0')}.jpg`;
  writeFileSync(join(bilderOrdner, datei), Buffer.from(e.data, 'base64'));
  bilder.push({ datei, zeit: e.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
});

const warte = (ms) => page.waitForTimeout(ms);
const B = (name, ...werte) => page.evaluate(([n, w]) => window.B[n](...w), [name, werte]);
let kam = { tx: 0, ty: 0, s: 1 };
let maus = { x: 1500, y: 900 };
const marke = [];                                             // Zeitmarken der Szenen, zur Kontrolle
const szene = (name) => marke.push({ name, bild: bilder.length });

// Kamera auf einen Ausschnitt des Werkzeugs richten (Angaben in dessen Pixeln)
async function schuss(r, { fx = 0.88, fy = 0.74, my = 500, dauer = 950, max = 1.95 } = {}) {
  const s = Math.min(max, (1920 * fx) / r.w, (1080 * fy) / r.h);
  kam = { s, tx: 960 - s * (r.x + r.w / 2), ty: my - s * (r.y + LEISTE + r.h / 2) };
  await B('kamera', kam.tx, kam.ty, kam.s, dauer);
  await warte(dauer + 100);
}
const weit = (dauer) => schuss({ x: 0, y: -LEISTE, w: APP.b, h: APP.h + LEISTE }, { fx: 0.94, fy: 0.86, my: 506, dauer });
const kasten = (auswahl) => app.locator(auswahl).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

async function ort(ziel, versatz = {}) {
  const k = await (typeof ziel === 'string' ? app.locator(ziel).first() : ziel).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const x = k.x + (versatz.x ?? k.w / 2);
  const y = k.y + (versatz.y ?? k.h / 2);
  return { x: kam.tx + kam.s * x, y: kam.ty + kam.s * (y + LEISTE) };
}
// Zeiger weich bewegen; die Dauer gilt in echter Zeit
async function fahre(x, y, dauer = 520) {
  const von = { ...maus };
  const start = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - start) / dauer);
    const weich = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const px = von.x + (x - von.x) * weich;
    const py = von.y + (y - von.y) * weich;
    await page.mouse.move(px, py);
    await B('zeiger', px, py);
    if (t >= 1) break;
  }
  maus = { x, y };
}
async function zu(ziel, versatz, dauer) { const p = await ort(ziel, versatz); await fahre(p.x, p.y, dauer); }
async function klick(ziel, versatz, dauer) {
  await zu(ziel, versatz, dauer);
  await warte(90);
  await B('welle');
  await page.mouse.down();
  await warte(60);
  await page.mouse.up();
  await warte(140);
}
const tippe = (text, tempo = 34) => page.keyboard.type(text, { delay: tempo });

await page.mouse.move(maus.x, maus.y);
await B('zeiger', maus.x, maus.y);
await weit(0);
await warte(400);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await warte(300);

// ---- Einstieg: der Wunsch aus dem Forum, daneben fällt der Stapel ----
szene('Einstieg');
await B('tafel', [
  { k: 'klein', t: 'Wunsch aus einem Forum' },
  { k: 'gross', t: 'Ein Programm für über *300_PDFs.', tempo: 85, danach: 500 },
  { k: 'mittel', t: 'Benennen. Per_Häkchen neu zusammenstellen. Seitenzahlen drauf. Alles_lokal.', tempo: 190 },
], 'links');
await B('papier', 650, 300);
await warte(4900);
await B('tafelAus');
await warte(470);

szene('Name');
await B('tafel', [{ logo: MARKE, t: 'PDF-Baukasten' }, { k: 'mittel', t: 'Häkchen setzen statt Seiten schieben.', tempo: 80 }], 'mitte');
await warte(2300);
await B('tafelAus');
await warte(280);

// ---- Das Werkzeug ----
szene('Werkzeug');
await B('fenster', true);
await B('zeigerAn', true);
await warte(800);

// 1. 300 PDFs hineinlegen
await B('spruch', 1, '300 PDFs hineinlegen');
const alle = readdirSync(daten).filter((n) => n.endsWith('.pdf')).map((n) => join(daten, n));
const [wahl] = await Promise.all([page.waitForEvent('filechooser'), klick('#leer-hinzu', undefined, 800)]);
await wahl.setFiles(alle);
await app.waitForFunction(() => document.querySelector('#import-lauf').hidden && document.querySelectorAll('#liste > li').length >= 300, null, { timeout: 120000 });
await schuss({ x: 0, y: 52, w: 828, h: 470 }, { dauer: 900 });
await fahre(700, 540, 400);
await app.waitForFunction(() => document.querySelectorAll('#liste .daumen img').length >= 10, null, { timeout: 60000 }).catch(() => {});
await warte(450);
for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 50); await warte(16); }
await warte(700);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -100); await warte(14); }
await warte(250);

// 2. Namen vergeben
szene('Namen');
await B('spruch', 2, 'Namen vergeben');
await klick('#suche', undefined, 500);
await tippe('scan');
await warte(700);
await klick(app.locator('#liste > li').first().locator('input.name'), { x: 110 }, 500);
await page.keyboard.press('Control+A');
await tippe('Vollmacht Hausverwaltung');
await warte(250);
await page.keyboard.press('Enter');
await warte(150);
await page.keyboard.press('Escape');
await warte(550);

// 3. Suchen und anhaken
szene('Anhaken');
await B('spruch', 3, 'Suchen und anhaken');
await weit(900);
await klick('#suche', undefined, 450);
await page.keyboard.press('Control+A');
await tippe('protokoll');
await warte(450);
await klick('.tabelle-kopf .haken', undefined, 500);
await warte(1300);
await klick('#suche', undefined, 400);
await page.keyboard.press('Control+A');
await tippe('wartungsvertrag');
await warte(450);
const treffer = await app.locator('#liste > li').count();
for (let i = 0; i < Math.min(3, treffer); i++) {
  await klick(app.locator('#liste > li').nth(i).locator('.haken'), undefined, i ? 260 : 450);
  await warte(520);
}
await warte(250);

// 4. Reihenfolge ziehen
szene('Reihenfolge');
await B('spruch', 4, 'Reihenfolge ziehen');
const vor = await kasten('.vorschau');
const unten = { x: 836, y: vor.y + vor.h - 70, w: 436, h: APP.h - (vor.y + vor.h - 70) };
await schuss(unten, { fy: 0.7, my: 450, dauer: 900 });
const von = await ort(app.locator('#mappe-liste li').nth(2), { x: 170 });
const nach = await ort(app.locator('#mappe-liste li').nth(0), { x: 170, y: 6 });
await fahre(von.x, von.y, 500);
await warte(120);
await page.mouse.down();
await fahre(von.x + 6, von.y - 14, 140);
await fahre(nach.x, nach.y, 750);
await warte(250);
await page.mouse.up();
await warte(750);

// 5. Seitenzahl setzen
szene('Seitenzahl');
await B('spruch', 5, 'Seitenzahl setzen', 'Die Lupe zeigt sie in echter Größe');
await schuss({ x: 836, y: vor.y - 76, w: 436, h: vor.h + 84 }, { fy: 0.78, my: 470, dauer: 950 });
await klick('#zonen i[data-position="unten-rechts"]', undefined, 600);
await warte(950);
await klick('#zonen i[data-position="unten-mitte"]', undefined, 450);
await warte(650);
await zu('#format', undefined, 500);
await app.locator('#format').focus();
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await warte(520); }
await warte(200);
for (let i = 0; i < 3; i++) { await klick('#blatt-vor', undefined, i ? 30 : 500); await warte(400); }
await warte(250);

// 6. Benennen und erstellen
szene('Erstellen');
await B('spruch', 6, 'Ein Klick');
await klick('#mappe-name', { x: 150 }, 500);
await page.keyboard.press('Control+A');
await tippe('Unterlagen Versammlung 2027');
await page.keyboard.press('Enter');
await warte(350);
const summe = await app.locator('#summe strong').innerText();
await schuss(unten, { fy: 0.7, my: 450, dauer: 900 });
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), klick('#erstellen', undefined, 550)]);
const mappePfad = join(arbeit, 'mappe.pdf');
await download.saveAs(mappePfad);
await app.waitForFunction(() => !document.querySelector('#ergebnis').hidden);
await fahre(maus.x + 240, maus.y - 170, 450);

// Seiten der erzeugten PDF für die Ergebnis-Szene zeichnen (14 Stück, gleichmäßig verteilt)
const python = `
import pymupdf, sys
d = pymupdf.open(sys.argv[1]); n = len(d); aus = sys.argv[2]; m = 14
for i in range(m):
    s = d[round(i * (n - 1) / (m - 1))]
    s.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(f"{aus}/seite{i}.png")
    r = s.rect
    s.get_pixmap(matrix=pymupdf.Matrix(3.2, 3.2), clip=pymupdf.Rect(r.width / 2 - 92, r.height - 53, r.width / 2 + 92, r.height - 11)).save(f"{aus}/fuss{i}.png")
print(n)
`;
const seitenzahl = Number(execFileSync('python', ['-I', '-c', python, mappePfad, arbeit], { encoding: 'utf8' }).trim());
const alsBild = (name) => `data:image/png;base64,${readFileSync(join(arbeit, name)).toString('base64')}`;
const reihe = Array.from({ length: 14 }, (_, i) => i);
await warte(500);

// ---- Das Ergebnis ----
szene('Ergebnis');
await B('spruch', 0, '');
await B('zeigerAn', false);
await B('fenster', false);
await warte(420);
await B('ergebnis', { worte: ['Eine PDF.', `*${seitenzahl} Seiten.`, 'Durchnummeriert.'], seiten: reihe.map((i) => alsBild(`seite${i}.png`)), fuesse: reihe.map((i) => alsBild(`fuss${i}.png`)) });
await warte(5600);
await B('ergebnisAus');
await warte(470);

// ---- Schluss ----
szene('Schluss');
await B('tafel', [
  { logo: MARKE, t: 'PDF-Baukasten' },
  { fakten: ['Kostenlos', 'Läuft lokal', 'Kein Upload'] },
  { pause: 200 },
  { k: 'mittel', t: 'Eine einzige Datei. Im Browser öffnen, loslegen.', tempo: 75 },
  { k: 'klein', t: 'An einem Abend mit KI gebaut.', tempo: 60 },
], 'mitte');
await warte(4800);
await cdp.send('Page.stopScreencast');
await warte(300);
await browser.close();

// ---------------------------------------------------------------------------
// Aus den Einzelbildern den Film bauen: jedes Bild bleibt stehen, bis das nächste kam
// ---------------------------------------------------------------------------
const zeilen = [];
for (let i = 0; i < bilder.length; i++) {
  const dauer = i + 1 < bilder.length ? Math.max(0.001, bilder[i + 1].zeit - bilder[i].zeit) : 0.8;
  zeilen.push(`file 'bilder/${bilder[i].datei}'`, `duration ${dauer.toFixed(4)}`);
}
zeilen.push(`file 'bilder/${bilder[bilder.length - 1].datei}'`);
writeFileSync(join(arbeit, 'liste.txt'), zeilen.join('\n'));
mkdirSync(dirname(zielVideo), { recursive: true });
execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'liste.txt', '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-movflags', '+faststart', zielVideo], { cwd: arbeit, stdio: 'inherit' });
const start = bilder[0].zeit;
console.log(`${bilder.length} Einzelbilder, ${(bilder[bilder.length - 1].zeit - start).toFixed(1)} s, Mappe: ${summe}, ${seitenzahl} Seiten`);
console.log(marke.map((m) => `${m.name} ${((bilder[Math.min(m.bild, bilder.length - 1)].zeit - start)).toFixed(1)}s`).join(' | '));
console.log(zielVideo);
