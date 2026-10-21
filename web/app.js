// Mochiboard: the canvas. Cards live in "world" coordinates; the view is a pan (x, y) and a zoom (z).
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), world = $('world'), cardsEl = $('cards'), wires = $('wires'), grid = $('grid');
  const COLORS = { white: '#ffffff', pink: '#ffe0ec', butter: '#fff5c8', mint: '#dcf5e7', lilac: '#eadfff', sky: '#dcedff', peach: '#ffe9d6' };
  const COLOR_NAMES = Object.keys(COLORS);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const tilt = () => +(Math.random() * 4 - 2).toFixed(1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let board = null, view = { x: 0, y: 0, z: 1 }, sel = new Set(), editing = null, space = false, focusSet = null;

  // ---------- boards ----------
  const TEMPLATES = {
    'Moodboard': () => ({ cards: [
      card('title', { x: 0, y: -40, text: 'Moodboard' }),
      card('note', { x: 0, y: 60, text: 'The feeling in three words:', color: 'butter' }),
      card('note', { x: 250, y: 60, text: 'References I love (drop images here)', color: 'pink' }),
      card('note', { x: 500, y: 60, text: 'Colors (pull them from an image ✦)', color: 'mint' }),
      card('swatch', { x: 0, y: 260, hex: '#ff9ec4', label: 'blush' }), card('swatch', { x: 130, y: 260, hex: '#fff5c8', label: 'butter' }), card('swatch', { x: 260, y: 260, hex: '#7ad3a3', label: 'mint' }),
      card('todo', { x: 500, y: 240, text: 'next', items: [{ t: 'Find 10 references', done: false }, { t: 'Pick a type pairing', done: false }, { t: 'Share with the team', done: false }] }),
    ], tray: [] }),
    'App plan': () => ({ cards: [
      card('title', { x: 0, y: -40, text: 'App plan' }),
      card('note', { x: 0, y: 60, text: 'Who is it for?', color: 'sky' }), card('note', { x: 250, y: 60, text: 'What problem does it solve?', color: 'pink' }),
      card('note', { x: 500, y: 60, text: 'The one thing it does best', color: 'butter' }),
      card('todo', { x: 0, y: 260, text: 'screens', items: [{ t: 'Onboarding', done: false }, { t: 'Home', done: false }, { t: 'Settings', done: false }] }),
      card('note', { x: 280, y: 260, text: 'Competitors + what they miss', color: 'lilac' }),
    ], tray: [] }),
    'Brain dump': () => ({ cards: [card('title', { x: 0, y: -40, text: 'Brain dump' }), card('note', { x: 0, y: 60, text: 'Dump everything in Unsorted with ⌘K, then ask Mochi to sort it ✦', color: 'butter' })],
      tray: ['call the printer', 'idea: animated logo', 'that font from the cafe menu', 'reply to Sam', 'moodboard for spring'].map(t => card('note', { text: t })) }),
  };
  function card(type, o = {}) {
    const size = { note: [220, 140], title: [320, 50], image: [260, 220], link: [260, 210], todo: [240, 180], swatch: [120, 150] }[type];
    return Object.assign({ id: uid(), type, x: 0, y: 0, w: size[0], h: size[1], r: type === 'title' ? 0 : tilt(), color: 'white' }, o);
  }
  function newBoard(name = 'Untitled board', tpl) {
    const b = { id: uid(), name, color: COLOR_NAMES[1 + Math.floor(Math.random() * 6)], cards: [], links: [], tray: [], view: { x: 160, y: 140, z: 1 } };
    if (tpl) { const t = TEMPLATES[tpl](); b.cards = t.cards; b.tray = t.tray; b.name = tpl; }
    return b;
  }
  async function refreshBoards() {
    const list = await MB.list(); $('boards').innerHTML = '';
    list.forEach(b => { const r = document.createElement('div'); r.className = 'board-row' + (board && b.id === board.id ? ' on' : '');
      r.innerHTML = `<i style="background:${COLORS[b.color] && b.color !== 'white' ? `var(--${b.color === 'pink' ? 'pink' : b.color + '-deep'})` : 'var(--pink)'}"></i><span></span>`;
      r.querySelector('span').textContent = b.name; r.onclick = () => openBoard(b.id); $('boards').appendChild(r); });
  }
  async function openBoard(id) {
    const b = await MB.load(id); if (!b) return;
    board = b; view = Object.assign({ x: 160, y: 140, z: 1 }, b.view); sel.clear(); editing = null; focusSet = null;
    $('boardName').value = board.name; renderAll(); refreshBoards(); try { localStorage.setItem('mochiboard:last', id); } catch (e) {}
  }
  let saveT = 0;
  function save() {
    $('saved').textContent = 'saving…'; clearTimeout(saveT);
    saveT = setTimeout(async () => { board.view = view; await MB.save(board); $('saved').textContent = 'saved'; refreshBoards(); }, 400);
  }

  // ---------- view ----------
  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const s = 26 * view.z; grid.style.backgroundSize = `${s}px ${s}px`; grid.style.backgroundPosition = `${view.x}px ${view.y}px`;
    $('zoom').textContent = Math.round(view.z * 100) + '%';
  }
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
  function zoomAt(cx, cy, z) {
    const r = stage.getBoundingClientRect(), p = toWorld(cx, cy); view.z = clamp(z, .15, 3);
    view.x = cx - r.left - p.x * view.z; view.y = cy - r.top - p.y * view.z; applyView();
  }
  function fit(cards, pad = 120) {
    if (!cards.length) return; const r = stage.getBoundingClientRect();
    const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y)), x1 = Math.max(...cards.map(c => c.x + c.w)), y1 = Math.max(...cards.map(c => c.y + c.h));
    const L = 270, R = 260;   // the open space between the left boxes and the tray
    view.z = clamp(Math.min((r.width - L - R - pad) / (x1 - x0), (r.height - pad * 2) / (y1 - y0)), .2, 1.4);
    view.x = L + (r.width - L - R - (x1 - x0) * view.z) / 2 - x0 * view.z; view.y = (r.height - (y1 - y0) * view.z) / 2 - y0 * view.z;
    world.style.transition = 'transform .5s cubic-bezier(.2,.8,.3,1)'; applyView(); setTimeout(() => world.style.transition = '', 520);
  }

  // ---------- rendering ----------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function inner(c) {
    switch (c.type) {
      case 'note': return `<div class="text">${esc(c.text)}</div>`;
      case 'title': return `<div class="text">${esc(c.text)}</div>`;
      case 'image': return `<img src="${esc(c.src)}" alt=""><button class="chip" data-act="colors">pull colors ✦</button>`;
      case 'link': return `<div class="thumb" style="${c.image ? `background-image:url('${esc(c.image)}')` : ''}"></div><div class="meta"><b>${esc(c.title || c.url)}</b><span>${esc(c.desc || c.url)}</span></div>`;
      case 'todo': return `<div class="head">${esc(c.text)}</div><ul>${(c.items || []).map((it, i) => `<li class="${it.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" ${it.done ? 'checked' : ''}><span>${esc(it.t)}</span></li>`).join('')}</ul><button class="add-item" data-act="item">+ add</button>`;
      case 'swatch': return `<div class="chipcol"></div><div class="hex"><span>${esc(c.hex)}</span><em>${esc(c.label || '')}</em></div>`;
    }
    return '';
  }
  function renderCard(c, pop) {
    let el = cardsEl.querySelector(`[data-id="${c.id}"]`);
    if (!el) { el = document.createElement('div'); el.dataset.id = c.id; cardsEl.appendChild(el); if (pop) el.classList.add('pop'); }
    el.className = `card ${c.type}` + (sel.has(c.id) ? ' sel' : '') + (focusSet && !focusSet.has(c.id) ? ' dim' : '') + (pop ? ' pop' : '');
    Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.type === 'title' ? 'auto' : c.h + 'px' });
    el.style.setProperty('--tilt', c.r + 'deg'); el.style.setProperty('--fill', COLORS[c.color] || '#fff');
    if (c.type === 'swatch') el.style.setProperty('--hex', c.hex);
    el.innerHTML = `<div class="frame"></div><div class="body">${inner(c)}</div>${c.tagText ? `<div class="tag">${esc(c.tagText)}</div>` : ''}<div class="knob"></div><div class="handle"></div>`;
    return el;
  }
  function renderAll() { cardsEl.innerHTML = ''; board.cards.forEach(c => renderCard(c)); renderWires(); renderTray(); applyView(); }
  function renderWires(live) {
    const O = 5000; let h = '';
    const mid = c => ({ x: c.x + c.w / 2 + O, y: c.y + (c.type === 'title' ? 25 : c.h / 2) + O });
    const path = (a, b) => { const dx = Math.max(60, Math.abs(b.x - a.x) * .4); return `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`; };
    board.links.forEach(l => { const a = byId(l.a), b = byId(l.b); if (a && b) h += `<path d="${path(mid(a), mid(b))}"/>`; });
    if (live) h += `<path class="live" d="${path({ x: live.a.x + O, y: live.a.y + O }, { x: live.b.x + O, y: live.b.y + O })}"/>`;
    wires.innerHTML = h;
  }
  const byId = id => board.cards.find(c => c.id === id);
  function renderTray() {
    const list = $('trayList'); list.innerHTML = ''; $('trayCount').textContent = board.tray.length;
    board.tray.forEach(c => { const d = document.createElement('div'); d.className = 'tray-item'; d.dataset.id = c.id; d.style.setProperty('--tilt', (c.r / 2) + 'deg');
      d.innerHTML = c.type === 'image' ? `<img src="${esc(c.src)}">` : esc(c.type === 'link' ? (c.title || c.url) : c.text); list.appendChild(d); });
  }
  function selectOnly(ids) { sel = new Set(ids); board.cards.forEach(c => { const el = cardsEl.querySelector(`[data-id="${c.id}"]`); el && el.classList.toggle('sel', sel.has(c.id)); }); }

  // ---------- adding things ----------
  function addCard(c, pop = true) { board.cards.push(c); renderCard(c, pop); save(); return c; }
  function centerWorld() { const r = stage.getBoundingClientRect(); return toWorld(r.left + 270 + (r.width - 530) / 2, r.top + r.height / 2); }
  function addAtCenter(type, extra = {}) {
    const p = centerWorld(), c = card(type, extra); c.x = p.x - c.w / 2 + (Math.random() * 60 - 30); c.y = p.y - c.h / 2 + (Math.random() * 60 - 30);
    addCard(c); selectOnly([c.id]); if (['note', 'title', 'todo'].includes(type)) startEdit(c.id); return c;
  }
  async function linkCard(url, at, toTray) {
    const c = card('link', { url, title: url, desc: '' });
    if (toTray) board.tray.unshift(c); else { Object.assign(c, at || {}); addCard(c); }
    try { const p = await MB.linkPreview(url); Object.assign(c, { title: p.title || url, desc: p.desc || url, image: p.image || '' }); toTray ? renderTray() : renderCard(c); save(); } catch (e) {}
    if (toTray) { renderTray(); save(); }
    return c;
  }
  // images come in as data URLs, scaled down so boards stay light
  function imageFromFile(file) {
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => {
      const k = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res({ src: cv.toDataURL('image/jpeg', .86), w: cv.width, h: cv.height }); }; im.src = fr.result; }; fr.readAsDataURL(file); });
  }
  async function addImages(files, at, toTray) {
    let i = 0;
    for (const f of files) { if (!f.type.startsWith('image/')) continue; const im = await imageFromFile(f);
      const w = 260, h = Math.round(w * im.h / im.w) + 16, c = card('image', { src: im.src, w, h });
      if (toTray) { board.tray.unshift(c); renderTray(); save(); continue; }
      const p = at || centerWorld(); c.x = p.x - w / 2 + i * 30; c.y = p.y - h / 2 + i * 30; i++; addCard(c); }
  }

  // ---------- pulling colours out of an image ----------
  function pullColors(c) {
    const im = new Image(); im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 60; cv.height = Math.max(1, Math.round(60 * im.height / im.width)); const g = cv.getContext('2d'); g.drawImage(im, 0, 0, cv.width, cv.height);
      const d = g.getImageData(0, 0, cv.width, cv.height).data, buckets = new Map();
      for (let i = 0; i < d.length; i += 4) { const k = [d[i] >> 5, d[i + 1] >> 5, d[i + 2] >> 5].join(','), b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; buckets.set(k, b); }
      const picks = []; [...buckets.values()].sort((a, b) => b.n - a.n).forEach(b => { const c3 = [b.r / b.n, b.g / b.n, b.b / b.n];
        if (picks.length < 5 && picks.every(p => Math.hypot(p[0] - c3[0], p[1] - c3[1], p[2] - c3[2]) > 48)) picks.push(c3); });
      const hex = c3 => '#' + c3.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      picks.forEach((p, i) => addCard(card('swatch', { x: c.x + c.w + 30 + i * 128, y: c.y + (i % 2) * 18, hex: hex(p), label: ['main', 'second', 'accent', 'shadow', 'pop'][i] })));
      board.links.push(...[]); say(`I pulled ${picks.length} colors out of that image ✦`);
    }; im.src = c.src;
  }

  // ---------- editing text ----------
  function startEdit(id) {
    const el = cardsEl.querySelector(`[data-id="${id}"]`), c = byId(id); if (!el || !c) return;
    const t = el.querySelector(c.type === 'todo' ? '.head' : '.text'); if (!t) return;
    editing = id; el.classList.add('editing'); t.contentEditable = 'true'; t.focus();
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    t.oninput = () => { c.text = t.innerText.replace(/\n$/, ''); save(); };
    t.onblur = () => endEdit();
  }
  function endEdit() { if (!editing) return; const el = cardsEl.querySelector(`[data-id="${editing}"]`); if (el) { el.classList.remove('editing'); el.querySelectorAll('[contenteditable]').forEach(n => n.contentEditable = 'false'); } editing = null; }

  // ---------- pointer: drag cards, resize, connect, marquee, pan ----------
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.tools, .tray, .mochi, .top, .capture, .side, .keys')) return;
    const el = e.target.closest('.card'), w = toWorld(e.clientX, e.clientY);
    if (space || e.button === 1) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }
    if (el) {
      const id = el.dataset.id, c = byId(id);
      if (editing === id && !e.target.closest('.handle, .knob')) return;      // clicking inside text you're editing
      if (e.target.closest('input[type=checkbox]')) return;
      if (e.target.closest('[data-act]')) return;
      if (e.target.classList.contains('handle')) { drag = { mode: 'resize', id, sx: w.x, sy: w.y, w0: c.w, h0: c.h }; }
      else if (e.target.classList.contains('knob')) { drag = { mode: 'wire', id, a: { x: c.x + c.w, y: c.y + c.h / 2 } }; }
      else {
        endEdit();
        if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); selectOnly([...sel]); }
        else if (!sel.has(id)) selectOnly([id]);
        drag = { mode: 'move', sx: w.x, sy: w.y, start: [...sel].map(i => ({ c: byId(i), x: byId(i).x, y: byId(i).y })), moved: false };
      }
      stage.setPointerCapture(e.pointerId); return;
    }
    endEdit();
    if (!e.shiftKey) selectOnly([]);
    drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: new Set(sel) }; stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return; const w = toWorld(e.clientX, e.clientY);
    if (drag.mode === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); }
    if (drag.mode === 'move') {
      const dx = w.x - drag.sx, dy = w.y - drag.sy; if (Math.hypot(dx, dy) > 2) drag.moved = true;
      drag.start.forEach(s => { s.c.x = s.x + dx; s.c.y = s.y + dy; const el = cardsEl.querySelector(`[data-id="${s.c.id}"]`); el.style.left = s.c.x + 'px'; el.style.top = s.c.y + 'px'; el.classList.add('dragging'); });
      renderWires();
      $('tray').classList.toggle('drop', overTray(e));
    }
    if (drag.mode === 'resize') { const c = byId(drag.id); c.w = Math.max(80, drag.w0 + w.x - drag.sx); c.h = Math.max(50, drag.h0 + w.y - drag.sy); const el = cardsEl.querySelector(`[data-id="${c.id}"]`); el.style.width = c.w + 'px'; if (c.type !== 'title') el.style.height = c.h + 'px'; renderWires(); }
    if (drag.mode === 'wire') { drag.b = w; renderWires({ a: drag.a, b: w }); }
    if (drag.mode === 'marquee') {
      const m = $('marquee'), r = stage.getBoundingClientRect(), x0 = Math.min(drag.sx, e.clientX), y0 = Math.min(drag.sy, e.clientY), x1 = Math.max(drag.sx, e.clientX), y1 = Math.max(drag.sy, e.clientY);
      Object.assign(m.style, { display: 'block', left: x0 - r.left + 'px', top: y0 - r.top + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
      const a = toWorld(x0, y0), b = toWorld(x1, y1), hit = board.cards.filter(c => c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y).map(c => c.id);
      selectOnly([...new Set([...drag.base, ...hit])]);
    }
  });
  const overTray = e => { const r = $('tray').getBoundingClientRect(); return e.clientX > r.left && e.clientY > r.top && e.clientY < r.bottom && !$('tray').classList.contains('closed'); };
  stage.addEventListener('pointerup', e => {
    if (!drag) return; const d = drag; drag = null; stage.classList.remove('panning'); $('marquee').style.display = 'none'; $('tray').classList.remove('drop');
    if (d.mode === 'move') {
      d.start.forEach(s => cardsEl.querySelector(`[data-id="${s.c.id}"]`)?.classList.remove('dragging'));
      if (d.moved && overTray(e)) {                       // dropped on the tray: back to Unsorted
        d.start.forEach(s => { board.cards = board.cards.filter(c => c !== s.c); board.links = board.links.filter(l => l.a !== s.c.id && l.b !== s.c.id); board.tray.unshift(s.c); cardsEl.querySelector(`[data-id="${s.c.id}"]`)?.remove(); });
        sel.clear(); renderTray(); renderWires(); save(); return;
      }
      if (d.moved) save();
      else if (e.detail >= 2) startEdit(d.start[0].c.id);
    }
    if (d.mode === 'resize') save();
    if (d.mode === 'wire') {
      const w = toWorld(e.clientX, e.clientY), t = [...board.cards].reverse().find(c => c.id !== d.id && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h);
      if (t && !board.links.some(l => (l.a === d.id && l.b === t.id) || (l.b === d.id && l.a === t.id))) { board.links.push({ id: uid(), a: d.id, b: t.id }); save(); }
      renderWires();
    }
  });
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.card, .tools, .tray, .mochi, .top, .capture, .side, .keys')) return;
    const w = toWorld(e.clientX, e.clientY), c = card('note', { color: COLOR_NAMES[Math.floor(Math.random() * 6) + 1] }); c.x = w.x - c.w / 2; c.y = w.y - c.h / 2; addCard(c); selectOnly([c.id]); startEdit(c.id);
  });
  // card buttons: pull colours, checklist items
  cardsEl.addEventListener('click', e => {
    const el = e.target.closest('.card'); if (!el) return; const c = byId(el.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'colors') pullColors(c);
    if (act === 'item') { c.items = c.items || []; c.items.push({ t: 'new thing', done: false }); renderCard(c); save(); }
    const li = e.target.closest('li'); if (li && c.type === 'todo') {
      const i = +li.dataset.i;
      if (e.target.matches('input')) { c.items[i].done = e.target.checked; li.classList.toggle('done', c.items[i].done); save(); }
      else if (e.target.matches('span')) { const s = e.target; s.contentEditable = 'true'; s.focus(); s.oninput = () => { c.items[i].t = s.innerText; save(); }; s.onblur = () => { s.contentEditable = 'false'; if (!c.items[i].t.trim()) { c.items.splice(i, 1); renderCard(c); save(); } }; }
    }
  });
  // trackpad: two fingers pan, pinch (or ⌘/ctrl + scroll) zooms
  stage.addEventListener('wheel', e => {
    if (e.target.closest('.tray-list, .m-bubble')) return; e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, view.z * Math.exp(-e.deltaY * .01));
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }, { passive: false });

  // ---------- the tray: drag ideas out onto the board ----------
  $('tray').querySelector('.tray-head').onclick = () => $('tray').classList.toggle('closed');
  $('trayList').addEventListener('pointerdown', e => {
    const it = e.target.closest('.tray-item'); if (!it) return; e.preventDefault();
    const c = board.tray.find(x => x.id === it.dataset.id), ghost = it.cloneNode(true);
    Object.assign(ghost.style, { position: 'fixed', width: it.offsetWidth + 'px', pointerEvents: 'none', zIndex: 99, left: e.clientX - 40 + 'px', top: e.clientY - 20 + 'px', rotate: '-3deg' });
    document.body.appendChild(ghost); it.style.opacity = .3;
    const mv = ev => { ghost.style.left = ev.clientX - 40 + 'px'; ghost.style.top = ev.clientY - 20 + 'px'; };
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); ghost.remove(); it.style.opacity = '';
      if (!overTray(ev) && !ev.target.closest('.side, .box')) { const w = toWorld(ev.clientX, ev.clientY); c.x = w.x - c.w / 2; c.y = w.y - 20; board.tray = board.tray.filter(x => x !== c); addCard(c); renderTray(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  // ---------- quick capture (⌘K) ----------
  const capture = on => { $('capture').classList.toggle('on', on); if (on) { $('capInput').value = ''; setTimeout(() => $('capInput').focus(), 30); } else $('capInput').blur(); };
  $('capForm').onsubmit = e => { e.preventDefault(); const v = $('capInput').value.trim(); if (v) { if (/^https?:\/\//.test(v)) linkCard(v, null, true); else { board.tray.unshift(card('note', { text: v })); renderTray(); save(); } $('tray').classList.remove('closed'); } capture(false); };

  // ---------- focus mode ----------
  function setFocus(on) {
    focusSet = on && sel.size ? new Set(sel) : null;
    if (focusSet) board.links.forEach(l => { if (focusSet.has(l.a)) focusSet.add(l.b); if (focusSet.has(l.b)) focusSet.add(l.a); });
    board.cards.forEach(c => cardsEl.querySelector(`[data-id="${c.id}"]`)?.classList.toggle('dim', !!focusSet && !focusSet.has(c.id)));
    if (focusSet) { fit(board.cards.filter(c => focusSet.has(c.id)), 160); say('Focus mode: just these. Press Esc when you want everything back.'); }
  }

  // ---------- keys ----------
  addEventListener('keydown', e => {
    const typing = e.target.closest('input, [contenteditable="true"]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); capture(true); return; }
    if (e.key === 'Escape') { capture(false); endEdit(); setFocus(false); selectOnly([]); mochiOpen(false); document.activeElement.blur(); return; }
    if (typing) return;
    if (e.key === ' ') { space = true; stage.classList.add('space'); e.preventDefault(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) { board.cards = board.cards.filter(c => !sel.has(c.id)); board.links = board.links.filter(l => !sel.has(l.a) && !sel.has(l.b)); sel.forEach(id => cardsEl.querySelector(`[data-id="${id}"]`)?.remove()); sel.clear(); renderWires(); save(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectOnly(board.cards.map(c => c.id)); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && sel.size) { e.preventDefault(); const copies = [...sel].map(id => Object.assign(JSON.parse(JSON.stringify(byId(id))), { id: uid(), r: tilt() })); copies.forEach(c => { c.x += 30; c.y += 30; addCard(c); }); selectOnly(copies.map(c => c.id)); }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') setFocus(!focusSet);
    if (k === 'n') addAtCenter('note', { color: COLOR_NAMES[Math.floor(Math.random() * 6) + 1] });
    if (k === 't') addAtCenter('title', { text: '' });
    if (k === 'c') addAtCenter('todo', { text: '', items: [{ t: 'first thing', done: false }] });
    if (k === 'l') addLinkPrompt();
    if (k === 'i') $('filePick').click();
    if (k === '0') fit(board.cards);
    if (k === 'm') { e.preventDefault(); mochiOpen(true); }
  });
  addEventListener('keyup', e => { if (e.key === ' ') { space = false; stage.classList.remove('space'); } });
  function addLinkPrompt() { const u = prompt('Paste a link'); if (u) linkCard(/^https?:/.test(u) ? u : 'https://' + u, centerWorld()); }

  // ---------- toolbar ----------
  $('tools').onclick = e => { const b = e.target.closest('[data-add]'); if (!b) return; const t = b.dataset.add;
    if (t === 'image') return $('filePick').click(); if (t === 'link') return addLinkPrompt();
    if (t === 'swatch') return addAtCenter('swatch', { hex: '#ff9ec4', label: 'pink' });
    addAtCenter(t, t === 'todo' ? { text: '', items: [{ t: 'first thing', done: false }] } : t === 'note' ? { color: COLOR_NAMES[Math.floor(Math.random() * 6) + 1] } : { text: '' }); };
  $('filePick').onchange = e => { addImages([...e.target.files]); e.target.value = ''; };
  $('boardName').oninput = e => { board.name = e.target.value || 'Untitled board'; save(); };
  $('newBoard').onclick = async () => { const b = newBoard(); await MB.save(b); openBoard(b.id); };
  Object.keys(TEMPLATES).forEach(name => { const r = document.createElement('div'); r.className = 'board-row'; r.innerHTML = `<i style="background:var(--butter-deep)"></i><span>${name}</span>`; r.onclick = async () => { const b = newBoard(name, name); await MB.save(b); await openBoard(b.id); fit(board.cards); }; $('templates').appendChild(r); });

  // ---------- paste and drop ----------
  addEventListener('paste', e => {
    if (e.target.closest('input, [contenteditable="true"]')) return;
    const files = [...(e.clipboardData.files || [])]; const intoTray = $('capture').classList.contains('on');
    if (files.length) { e.preventDefault(); addImages(files, null, intoTray); capture(false); return; }
    const t = e.clipboardData.getData('text/plain').trim(); if (!t) return; e.preventDefault();
    if (/^https?:\/\/\S+$/.test(t)) linkCard(t, centerWorld()); else addAtCenter('note', { text: t, color: 'butter' });
  });
  stage.addEventListener('dragover', e => e.preventDefault());
  stage.addEventListener('drop', e => { e.preventDefault(); const files = [...e.dataTransfer.files], w = toWorld(e.clientX, e.clientY);
    if (files.length) return addImages(files, w, overTray(e));
    const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (/^https?:/.test(u)) linkCard(u.trim(), w); });

  // ---------- Mochi on the board ----------
  const goo = Goo($('goo')); Goo($('brandGoo'));
  let sayT = 0;
  function say(text, ms = 6000, acts = []) {
    $('mSay').textContent = text; $('mActs').innerHTML = '';
    acts.forEach(a => { const b = document.createElement('button'); b.textContent = a.label; if (a.ghost) b.className = 'ghost'; b.onclick = () => { $('mBubble').classList.remove('on'); a.run(); }; $('mActs').appendChild(b); });
    $('mBubble').classList.add('on'); goo.hop(); clearTimeout(sayT); if (ms) sayT = setTimeout(() => $('mBubble').classList.remove('on'), ms);
  }
  function mochiOpen(on) { $('mochi').classList.toggle('open', on); if (on) setTimeout(() => $('mInput').focus(), 30); }
  $('mPill').onclick = e => { if (!$('mochi').classList.contains('open')) mochiOpen(true); };
  // what Mochi sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
  function snapshot() {
    const brief = c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h), color: c.color,
      text: (c.text || c.title || c.label || '').slice(0, 300), items: c.items ? c.items.map(i => i.t) : undefined, hex: c.hex, url: c.url, selected: sel.has(c.id) || undefined });
    return { name: board.name, cards: board.cards.map(brief), links: board.links.map(l => [l.a, l.b]), unsorted: board.tray.map(brief) };
  }
  async function ask(q, confirmed = false) {
    $('mochi').classList.add('thinking'); goo.think(true); say(confirmed ? 'Making it… (this can take a minute)' : 'On it…', 0);
    try { const raw = await MB.ask(q, snapshot(), confirmed); await applyMochi(parse(raw), q); }
    catch (err) { say("Hmm, I couldn't reach Claude: " + err.message); }
    finally { $('mochi').classList.remove('thinking'); goo.think(false); }
  }
  $('mForm').onsubmit = e => { e.preventDefault(); const q = $('mInput').value.trim(); if (!q) return; $('mInput').value = ''; mochiOpen(false); ask(q); };
  const parse = raw => { const s = String(raw), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0) return { say: s.trim() }; try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return { say: s.trim() }; } };
  // her actions: say, add cards, move cards, place unsorted ideas, add titles, connect cards
  async function applyMochi(r, q) {
    const center = centerWorld(), added = []; let i = 0;
    const place = o => { if (o.x == null || o.y == null) { o.x = center.x - 300 + (i % 3) * 250; o.y = center.y - 100 + Math.floor(i / 3) * 170; i++; } };
    (r.add || []).forEach(o => { place(o); const c = card(o.type === 'todo' || o.type === 'title' || o.type === 'swatch' ? o.type : 'note', {
      x: o.x, y: o.y, text: o.text || '', color: COLOR_NAMES.includes(o.color) ? o.color : 'white', hex: o.hex, label: o.label,
      items: o.items ? o.items.map(t => ({ t: typeof t === 'string' ? t : t.t, done: false })) : undefined, tagText: o.tag }); addCard(c); added.push(c); });
    (r.titles || []).forEach(o => { place(o); added.push(addCard(card('title', { x: o.x, y: o.y, text: o.text }))); });
    (r.place || []).forEach(o => { const c = board.tray.find(x => x.id === o.id); if (!c) return; place(o); c.x = o.x; c.y = o.y; board.tray = board.tray.filter(x => x !== c); addCard(c); added.push(c); });
    (r.move || []).forEach(o => { const c = byId(o.id); if (!c || o.x == null) return; c.x = o.x; c.y = o.y; if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) { el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)'; renderCard(c); setTimeout(() => el.style.transition = '', 650); } added.push(c); });
    (r.connect || []).forEach(p => { const [a, b] = Array.isArray(p) ? p : [p.a, p.b]; if (byId(a) && byId(b)) board.links.push({ id: uid(), a, b }); });
    // pictures (Mobbin screens, Higgsfield images): fetched and saved into the board, laid out in a row of tilted cards
    const imgs = r.images || [];
    if (imgs.length) {
      const base = { x: Math.max(...board.cards.map(c => c.x + c.w), center.x - 300) + 80, y: Math.min(...board.cards.map(c => c.y), center.y) };
      let k = 0;
      for (const im of imgs) {
        try {
          const data = await MB.fetchImage(im.url), dims = await new Promise(res => { const t = new Image(); t.onload = () => res([t.width, t.height]); t.onerror = () => res([3, 4]); t.src = data; });
          const w = 240, h = Math.min(520, Math.round(w * dims[1] / dims[0])) + 16;
          const c = card('image', { src: data, w, h, x: im.x ?? base.x + (k % 4) * 270, y: im.y ?? base.y + Math.floor(k / 4) * 560, tagText: im.caption || '' });
          addCard(c); added.push(c); k++;
        } catch (e) {}
      }
    }
    renderTray(); renderWires(); save();
    if (added.length) setTimeout(() => fit(board.cards), 300);
    const acts = r.confirm ? [{ label: (r.confirm || 'Yes, make it') + ' ✦', run: () => ask(q, true) }, { label: 'Not now', ghost: true, run: () => {} }] : [];
    say(r.say || (added.length ? `Done! I touched ${added.length} cards.` : 'Done!'), acts.length ? 0 : 9000, acts);
  }

  // ---------- Mochi's helpers: Claude Code, Mobbin, Higgsfield ----------
  let lastConn = 0;
  async function showConnections(force) {
    if (!force && Date.now() - lastConn < 5 * 60 * 1000) return; lastConn = Date.now();
    const el = $('conns');
    if (!el.children.length) el.innerHTML = ['Claude Code', 'Mobbin', 'Higgsfield'].map(n => `<div class="conn"><span class="dot"></span>${n}<em style="color:var(--ink-faint)">checking…</em></div>`).join('');
    const c = await MB.connections().catch(() => ({}));
    const rows = [['claude', 'Claude Code', 'https://claude.com/claude-code', 'Install'], ['mobbin', 'Mobbin', 'https://claude.ai/settings/connectors', 'Connect'], ['higgsfield', 'Higgsfield', 'https://claude.ai/settings/connectors', 'Connect']];
    el.innerHTML = '';
    rows.forEach(([k, name, url, verb]) => { const r = document.createElement('div'); r.className = 'conn' + (c[k] ? ' on' : ''); r.innerHTML = `<span class="dot"></span>${name}`;
      if (c[k]) r.insertAdjacentHTML('beforeend', '<em>ready</em>');
      else if (!c.browser) { const b = document.createElement('button'); b.textContent = verb; b.onclick = () => { MB.openURL(url); say(k === 'claude' ? 'Install Claude Code, then reopen Mochiboard and I can think on your boards!' : `Connect ${name} in your Claude settings (Connectors), then come back. I'll check again when you reopen me ✦`, 9000); }; r.appendChild(b); }
      el.appendChild(r); });
  }
  addEventListener('focus', () => showConnections());

  // ---------- the floating boxes: minimize to their title, remembered between launches ----------
  const boxState = (() => { try { return JSON.parse(localStorage.getItem('mochiboard:boxes') || '{}'); } catch (e) { return {}; } })();
  document.querySelectorAll('.box').forEach(b => {
    const k = b.dataset.box, btn = b.querySelector('.mini');
    const set = min => { b.classList.toggle('min', min); btn.textContent = min ? '+' : '–'; btn.title = min ? 'Open' : 'Minimize'; boxState[k] = min; try { localStorage.setItem('mochiboard:boxes', JSON.stringify(boxState)); } catch (e) {} };
    set(!!boxState[k]); btn.onclick = () => set(!b.classList.contains('min'));
  });
  try { if (localStorage.getItem('mochiboard:keys') === 'hide') $('keys').classList.add('hide'); } catch (e) {}
  $('keysX').onclick = () => { $('keys').classList.add('hide'); try { localStorage.setItem('mochiboard:keys', 'hide'); } catch (e) {} };

  // ---------- start ----------
  (async () => {
    let list = await MB.list();
    if (!list.length) { const b = newBoard('Brain dump', 'Brain dump'); b.name = 'My first board'; await MB.save(b); list = await MB.list(); }
    let last = null; try { last = localStorage.getItem('mochiboard:last'); } catch (e) {}
    await openBoard(list.some(b => b.id === last) ? last : list[0].id);
    setTimeout(() => { fit(board.cards); say("Hi, I'm Mochi! Dump ideas with ⌘K, then ask me to sort them ✦", 7000); }, 400);
    showConnections(true);
  })();
  window.__mb = { get board() { return board; }, applyMochi, fit };   // handy for testing
})();
