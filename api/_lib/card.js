// Branded social card generator (Helvaro huisstijl: donker + electric-blue glow,
// vette Archivo headline met blauwe accentwoorden, glowing icon-tiles). Geen AI-foto's,
// geen mensen. Vervangt de fotorealistische beeldgeneratie voor Instagram/Facebook.
//
// Gebruik *sterren* om woorden electric-blue te accentueren, bv:
//   headline: "Your leads don't *wait.* Neither should *you.*"
//   tagline:  "Never miss a *client again.*"
//
// renderCard() geeft een JPEG-buffer terug (IG vereist JPEG, 4:5 = 1080x1350).

const fs = require('fs');
const path = require('path');
const satori = require('satori').default || require('satori');
const sharp = require('sharp');

const FONT_DIR = path.join(__dirname, 'fonts');
const archivo = fs.readFileSync(path.join(FONT_DIR, 'ArchivoBlack.ttf'));
const pMed = fs.readFileSync(path.join(FONT_DIR, 'Poppins-Medium.ttf'));
const pSemi = fs.readFileSync(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'));

const BG = '#05070e', BLUE = '#3a9bff', BLUE2 = '#7cc0ff', INK = '#ffffff';

const FONTS = [
  { name: 'Archivo', data: archivo, weight: 800, style: 'normal' },
  { name: 'Poppins', data: pMed, weight: 500, style: 'normal' },
  { name: 'Poppins', data: pSemi, weight: 600, style: 'normal' }
];

const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

// Splitst een string in woord-spans; woorden binnen *sterren* worden blauw.
function toWords(str, sz) {
  const segs = String(str || '').split('*');
  const out = [];
  segs.forEach((seg, i) => {
    const accent = i % 2 === 1;
    seg.trim().split(/\s+/).filter(Boolean).forEach(w => {
      out.push(h('span', { color: accent ? BLUE : INK, marginRight: Math.round(sz * 0.26) }, w));
    });
  });
  return out;
}

function iconRow(label) {
  return h('div', { display: 'flex', alignItems: 'center', marginBottom: 28 }, [
    h('div', { width: 56, height: 56, borderRadius: 15, backgroundColor: 'rgba(58,155,255,0.15)', border: `2px solid ${BLUE}`, display: 'flex', marginRight: 28, boxShadow: `0 0 26px rgba(58,155,255,0.5)` }, [
      h('div', { width: 18, height: 18, borderRadius: 5, backgroundColor: BLUE2, margin: 'auto', boxShadow: `0 0 14px ${BLUE2}` })
    ]),
    h('div', { fontFamily: 'Poppins', fontSize: 40, color: INK, fontWeight: 500 }, label)
  ]);
}

// { headline, bullets:[..], tagline, width, height } -> JPEG Buffer
async function renderCard({ headline, bullets = [], tagline = '', width = 1080, height = 1350 } = {}) {
  const kids = [
    h('div', { display: 'flex', alignItems: 'center' }, [
      h('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: BLUE, marginRight: 16, boxShadow: `0 0 18px ${BLUE}` }),
      h('div', { fontFamily: 'Poppins', fontSize: 30, color: BLUE2, letterSpacing: 4, fontWeight: 600 }, 'HELVARO.PRO')
    ]),
    h('div', { display: 'flex', flexWrap: 'wrap', fontFamily: 'Archivo', fontSize: 94, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -1 }, toWords(headline, 94))
  ];
  if (bullets.length) {
    kids.push(h('div', { display: 'flex', flexDirection: 'column' }, bullets.slice(0, 4).map(iconRow)));
  }
  kids.push(h('div', { display: 'flex', flexWrap: 'wrap', fontFamily: 'Archivo', fontSize: 46 }, toWords(tagline || 'Helvaro. *Mis nooit meer een klant.*', 46)));

  const tree = h('div', {
    width, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    backgroundColor: BG,
    backgroundImage: `radial-gradient(70% 45% at 50% 0%, rgba(58,155,255,0.30), rgba(5,7,14,0) 72%)`,
    padding: 92, fontFamily: 'Poppins'
  }, kids);

  const svg = await satori(tree, { width, height, fonts: FONTS });
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

// ── Carousel (top-format op Instagram voor SaaS: educatief, saves + shares) ──
// Elke slide is een branded card (1080x1350). Cover = hook, dan tip/point-slides,
// dan een CTA-slide. renderCarousel geeft een array JPEG-buffers terug (1 per slide).

function pageDots(index, total) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    dots.push(h('div', { width: 12, height: 12, borderRadius: 6, marginRight: 10, backgroundColor: i === index ? BLUE : 'rgba(255,255,255,0.22)', boxShadow: i === index ? `0 0 12px ${BLUE}` : '0 0 0 rgba(0,0,0,0)' }));
  }
  return h('div', { display: 'flex', alignItems: 'center' }, dots);
}

function eyebrow(right) {
  return h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
    h('div', { display: 'flex', alignItems: 'center' }, [
      h('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: BLUE, marginRight: 16, boxShadow: `0 0 18px ${BLUE}` }),
      h('div', { fontFamily: 'Poppins', fontSize: 30, color: BLUE2, letterSpacing: 4, fontWeight: 600 }, 'HELVARO.PRO')
    ]),
    h('div', { fontFamily: 'Poppins', fontSize: 28, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }, right || '')
  ]);
}

function frame(children) {
  return h('div', {
    width: 1080, height: 1350, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    backgroundColor: BG, backgroundImage: `radial-gradient(70% 45% at 50% 0%, rgba(58,155,255,0.30), rgba(5,7,14,0) 72%)`,
    padding: 92, fontFamily: 'Poppins'
  }, children);
}

function coverSlide(headline, total) {
  return frame([
    eyebrow(''),
    h('div', { display: 'flex', flexWrap: 'wrap', fontFamily: 'Archivo', fontSize: 96, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -1 }, toWords(headline, 96)),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      pageDots(0, total),
      h('div', { fontFamily: 'Poppins', fontSize: 32, color: BLUE2, fontWeight: 600 }, 'Swipe →')
    ])
  ]);
}

function contentSlide(title, body, index, total) {
  return frame([
    eyebrow(`${index + 1}/${total}`),
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { display: 'flex', flexWrap: 'wrap', fontFamily: 'Archivo', fontSize: 70, lineHeight: 1.08, textTransform: 'uppercase', letterSpacing: -1, marginBottom: 34 }, toWords(title, 70)),
      h('div', { fontFamily: 'Poppins', fontSize: 46, lineHeight: 1.4, color: 'rgba(255,255,255,0.88)', fontWeight: 500 }, String(body || ''))
    ]),
    pageDots(index, total)
  ]);
}

function ctaSlide(headline, sub, total) {
  return frame([
    eyebrow(''),
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { display: 'flex', flexWrap: 'wrap', fontFamily: 'Archivo', fontSize: 86, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -1, marginBottom: 26 }, toWords(headline, 86)),
      h('div', { fontFamily: 'Poppins', fontSize: 42, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }, String(sub || ''))
    ]),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      pageDots(total - 1, total),
      h('div', { fontFamily: 'Archivo', fontSize: 34, color: BLUE }, 'helvaro.pro')
    ])
  ]);
}

// { cover:{headline}, slides:[{title,body}], cta:{headline,sub} } -> [JPEG Buffer, ...]
async function renderCarousel({ cover, slides = [], cta } = {}) {
  const items = slides.slice(0, 6);
  const total = 1 + items.length + (cta ? 1 : 0);
  const built = [coverSlide((cover && cover.headline) || 'Helvaro', total)];
  items.forEach((s, i) => built.push(contentSlide(s.title, s.body, 1 + i, total)));
  if (cta) built.push(ctaSlide(cta.headline, cta.sub, total));
  const buffers = [];
  for (const tree of built) {
    const svg = await satori(tree, { width: 1080, height: 1350, fonts: FONTS });
    buffers.push(await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer());
  }
  return buffers;
}

module.exports = { renderCard, renderCarousel };
