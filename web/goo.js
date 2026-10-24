// Mochi in pixels: the same little goo as the Mochi app (rounded top, flat bottom, ink eyes, shine, blush).
// She breathes, blinks, glances around, hops when she does something, and wiggles while she's thinking.
// She also wears whatever you dressed her in (Dress up Mochi): pieces are tiny pixel pictures placed on her grid,
// and she shrinks a touch in small spots so a tall hat still fits.

// the wardrobe: [name, x, y, pixel rows], x/y from Mochi's top-left; '.' is see-through
window.MOCHI_WARDROBE = {
  hat: {
    party: ['Party hat', 3, -7, ['...y...', '..yYy..', '...P...', '..PpP..', '..PRP..', '.PpPRP.', 'PRPPPRP']],
    crown: ['Crown', 3, -5, ['Y.....Y', 'YY.Y.YY', 'YyYYYyY', 'YRYTYRY', 'OOOOOOO']],
    witch: ['Witch hat', -1, -7, ['.........VV....', '........LLV....', '.......LLL.....', '......LLLL.....', '.....LlLLLL....', '.....LLLLLL....', '....LPPPPPPL...', '....LLLLLLLL...', 'VVVVVVVVVVVVVVV']],
    beanie: ['Beanie', 2, -6, ['....W....', '...WaW...', '..CCCCC..', '.CCcCCCC.', 'CCCCCCCCC', 'cFcFcFcFc']],
    bow: ['Big bow', 7, -3, ['PP...PP', 'PpP.PpP', 'PPPMPPP', 'PpP.PPP', 'PP...PP']],
    daisy: ['Daisy', 8, -3, ['..W..', '.WWW.', 'WWYWW', '.WWW.', '..W..']],
    chef: ['Chef hat', 2, -7, ['.WW.WWW..', 'WWWWWWWW.', 'WaWWWWaWW', 'WWWWWWWWW', '.WWWWWWW.', '.AAAAAAA.', '.aaaaaaa.']],
    frog: ['Froggy', 1, -3, ['..GGG...GGG..', '.GWKG..GWKGG', 'GGGGGGGGGGGGG']],
  },
  face: {
    round: ['Round glasses', 0, 4, ['..XXX...XXX..', 'XXX.XXXXX.XXX', '..X.X...X.X..', '..XXX...XXX..']],
    hearts: ['Heart shades', 0, 4, ['.KK.KK.KK.KK.', '.KPKKKKKPKKK.', '..KKK...KKK..', '...K.....K...']],
    star: ['Star shades', 1, 4, ['..Y.....Y..', '.YKY...YKY.', 'YYKYYYYYKYY', '.Y.Y...Y.Y.']],
    stache: ['Mustache', 2, 8, ['K.......K', '.KKK.KKK.']],
    cheeks: ['Heart cheeks', 1, 7, ['R.R.....R.R', '.R.......R.']],
  },
  neck: {
    bowtie: ['Bow tie', 4, 8, ['R...R', 'RRQRR', 'R...R']],
    scarf: ['Cozy scarf', -1, 8, ['RRRRRRRRRRRRRRR', 'rRrRrRrRrRrRrRr', '...RR..........', '...rR..........']],
    pearls: ['Pearls', 1, 8, ['W.........W', '.W.W.W.W.W.']],
    bell: ['Kitty bell', 3, 8, ['RRRRRRR', '...Y...', '..YyY..', '..YKY..']],
  },
  held: {
    balloon: ['Balloon', 13, -8, ['.RRR.', 'RrRRR', 'RRRRR', 'RRRRR', '.RRR.', '..Q..', '..K..', '..K..', '...K.', '...K.', '..K..', '.K...', 'K....']],
    wand: ['Magic wand', -4, 1, ['..Y...', '.YYY..', 'YYyYY.', '.YYY..', '.Y.Y..', '....K.', '.....K']],
    boba: ['Boba tea', 13, 1, ['....P.', '...P..', 'aaaaaa', 'AnnnnA', '.nnnn.', '.nKnK.', '.KnKn.', '.nnnn.']],
    heart: ['Love note', -3, 4, ['RR.RR', 'RrRRR', 'RRRRR', '.RRR.', '..R..']],
  },
};
window.MOCHI_PAL = {
  K: '#081f3d', W: '#ffffff', X: '#3d3640', a: '#f1edf5', A: '#cfc8d8',
  R: '#ff5a7a', r: '#ffa3b8', Q: '#d63a62', P: '#ff8fc2', p: '#ffd3e6', M: '#e0559a',
  Y: '#ffd84d', y: '#fff2a8', O: '#f0a52a', G: '#5fdba0', E: '#2fae73',
  L: '#b89bff', V: '#8a6cf0', C: '#ff8a5c', c: '#ffc7ab', F: '#e0603a', n: '#ebbd92', T: '#7fd3ff',
};
// what she's wearing (window.MochiOutfit) plus anything being tried on (window.MochiPreview)
window.mochiWearing = () => Object.assign({}, window.MochiOutfit || {}, window.MochiPreview || {});

window.Goo = (canvas, opts = {}) => {
  const W = canvas.width, H0 = canvas.height, px0 = Math.floor(Math.min(W / 14, H0 / 13));
  // opts.headroom: rows of room above her for hats. The canvas grows upward and shifts up by the same amount, so the page doesn't move
  if (opts.headroom) {
    const cs = getComputedStyle(canvas), k = (parseFloat(cs.height) || H0) / H0, extra = opts.headroom * px0;
    canvas.height = H0 + extra; canvas.style.height = (H0 + extra) * k + 'px'; canvas.style.marginTop = `calc(${cs.marginTop || '0px'} - ${extra * k}px)`;
  }
  const g = canvas.getContext('2d'), H = canvas.height;
  const BODY = ['....BBBBB....', '..BBSSBBBBB..', '.BBSSBBBBBBB.', '.BSBBBBBBBBB.', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'DBBBBBBBBBBBD', 'DDDDDDDDDDDDD'];
  const WARD = window.MOCHI_WARDROBE, PAL = window.MOCHI_PAL;
  let col = opts.colors || { B: '#33c7ff', S: '#ccf5ff', D: '#1480db' };
  let hopT = -9, thinking = false, look = 0, lookTo = 0, nextLook = 0;
  // opts.outfit: 'all' (default), 'wear' (no held things, for the tiniest spots) or 'none'
  const kinds = opts.outfit === 'none' ? [] : opts.outfit === 'wear' ? ['neck', 'face', 'hat'] : ['neck', 'face', 'hat', 'held'];
  let fitKey = '', fit = null;
  function layout(f) {   // how big she can be, and where, so everything she's wearing fits
    const worn = kinds.map(k => f[k] && WARD[k]?.[f[k]]).filter(Boolean), key = worn.map(p => p[0]).join('|');
    if (key === fitKey && fit) return fit;
    let x0 = 0, x1 = 13, y0 = 0, y1 = 11;
    worn.forEach(([, dx, dy, rows]) => { x0 = Math.min(x0, dx); x1 = Math.max(x1, dx + Math.max(...rows.map(r => r.length))); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy + rows.length); });
    const px = worn.length ? Math.max(1, Math.min(px0, Math.floor(Math.min(W / (x1 - x0 + 1), H / (y1 - y0 + 1.5))))) : px0;
    fitKey = key; return fit = { px, worn, ox: (W - (x1 - x0) * px) / 2 - x0 * px, oy: H - y1 * px };
  }
  function piece(sp, ox, oy, px) {
    const [, dx, dy, rows] = sp;
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && PAL[ch]) { g.fillStyle = mute(PAL[ch]); g.fillRect(ox + (dx + x) * px, oy + (dy + y) * px, px, px); } }));
  }
  // Calmest: her colors softened toward a gentle gray (kept light so she still reads as her color)
  const mutedCache = new Map();
  const mute = hex => { if (!window.mochiMuted || !/^#[0-9a-f]{6}$/i.test(hex)) return hex; if (mutedCache.has(hex)) return mutedCache.get(hex);
    const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, gg = n >> 8 & 255, b = n & 255, y = .3 * r + .59 * gg + .11 * b, k = .7;   // 70% of the way to her own brightness in gray
    const out = '#' + [r, gg, b].map(v => Math.round(v + (y + (238 - y) * .25 - v) * k).toString(16).padStart(2, '0')).join(''); mutedCache.set(hex, out); return out; };
  function frame(now) {
    const t = now / 1000; g.clearRect(0, 0, W, H);
    const f = kinds.length ? (opts.wearing || window.mochiWearing)() : {}, L = layout(f), px = L.px;   // opts.wearing: her own outfit (the website's dress-up stage), instead of the app-wide one
    if (t > nextLook) { lookTo = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; nextLook = t + 1.5 + Math.random() * 2.5; }
    look += (lookTo - look) * .2;
    const calm = window.mochiCalm, hp = t - hopT, lift = !calm && hp < .45 ? Math.sin(hp / .45 * Math.PI) * 3 : 0;   // calm: she sits still (she still blinks)
    const wig = thinking && !calm ? Math.sin(t * 14) * .6 : 0, breathe = calm ? 0 : Math.sin(t * 2.4) * .04;
    if (calm) look = 0;
    const ox = L.ox + wig * px * .5, oy = L.oy - Math.round(lift) * px;
    g.save(); g.translate(W / 2, H); g.scale(1 - breathe * .5, 1 + breathe); g.translate(-W / 2, -H);
    const wears = k => kinds.includes(k) && f[k] && WARD[k]?.[f[k]];
    if (wears('held') && f.held === 'balloon') piece(WARD.held.balloon, ox, oy, px);   // the string goes behind her
    BODY.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = mute(col[ch]); g.fillRect(ox + x * px, oy + y * px, px, px); } }));
    const blink = (t % 3.3) > 3.15, ex = wears('face') ? 0 : Math.round(look);   // glasses on: she looks straight ahead
    g.fillStyle = mute('#081f3d');
    [3, 9].forEach(c => g.fillRect(ox + (c + ex) * px, oy + (blink ? 5.5 : 5) * px, px, blink ? px * .4 : px * 2));
    if (!(wears('face') && f.face === 'cheeks')) { g.fillStyle = mute('#ff8fc2'); [2, 10].forEach(c => g.fillRect(ox + c * px, oy + 7 * px, px, px)); }
    ['neck', 'face', 'hat'].forEach(k => { if (wears(k)) piece(WARD[k][f[k]], ox, oy, px); });
    if (wears('held') && f.held !== 'balloon') piece(WARD.held[f.held], ox, oy, px);
    g.restore();
  }
  // she only draws while she's on screen, and 30 times a second is plenty for chunky pixels (half the work of 60, which matters on a busy Mac)
  let seen = true, lastDraw = 0;
  if (!opts.manual && window.IntersectionObserver) new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; }).observe(canvas);
  const loop = now => { if (seen && now - lastDraw >= 32) { lastDraw = now; frame(now); } requestAnimationFrame(loop); };
  if (!opts.manual) requestAnimationFrame(loop);   // manual: the caller draws her (the favicon runs on a timer, which keeps going in background tabs)
  return { hop() { hopT = performance.now() / 1000; }, think(on) { thinking = on; }, setColors(c) { col = c; }, draw() { frame(performance.now()); } };
};
