// Mochi in pixels: the same little goo as the Mochi app (rounded top, flat bottom, ink eyes, shine, blush).
// She breathes, blinks, glances around, hops when she does something, and wiggles while she's thinking.
window.Goo = (canvas, opts = {}) => {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const BODY = ['....BBBBB....', '..BBSSBBBBB..', '.BBSSBBBBBBB.', '.BSBBBBBBBBB.', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'DBBBBBBBBBBBD', 'DDDDDDDDDDDDD'];
  let col = opts.colors || { B: '#33c7ff', S: '#ccf5ff', D: '#1480db' };
  let hopT = -9, thinking = false, look = 0, lookTo = 0, nextLook = 0;
  const px = Math.floor(Math.min(W / 14, H / 13));
  function frame(now) {
    const t = now / 1000; g.clearRect(0, 0, W, H);
    if (t > nextLook) { lookTo = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; nextLook = t + 1.5 + Math.random() * 2.5; }
    look += (lookTo - look) * .2;
    const hp = t - hopT, lift = hp < .45 ? Math.sin(hp / .45 * Math.PI) * 3 : 0;
    const wig = thinking ? Math.sin(t * 14) * .6 : 0, breathe = Math.sin(t * 2.4) * .04;
    const ox = (W - 13 * px) / 2 + wig * px * .5, oy = H - 11 * px - Math.round(lift) * px + 0;
    g.save(); g.translate(W / 2, H); g.scale(1 - breathe * .5, 1 + breathe); g.translate(-W / 2, -H);
    BODY.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = col[ch]; g.fillRect(ox + x * px, oy + y * px, px, px); } }));
    const blink = (t % 3.3) > 3.15, ex = Math.round(look);
    g.fillStyle = '#081f3d';
    [3, 9].forEach(c => g.fillRect(ox + (c + ex) * px, oy + (blink ? 5.5 : 5) * px, px, blink ? px * .4 : px * 2));
    g.fillStyle = '#ff8fc2'; [2, 10].forEach(c => g.fillRect(ox + c * px, oy + 7 * px, px, px));
    g.restore();
    if (!opts.manual) requestAnimationFrame(frame);
  }
  if (!opts.manual) requestAnimationFrame(frame);   // manual: the caller draws her (the favicon runs on a timer, which keeps going in background tabs)
  return { hop() { hopT = performance.now() / 1000; }, think(on) { thinking = on; }, setColors(c) { col = c; }, draw() { frame(performance.now()); } };
};
