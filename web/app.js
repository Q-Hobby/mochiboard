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
  // ---------- the library: projects hold folders, folders hold boards ----------
  // stored as one small file: { projects: [{id, name, color, open}], folders: [{id, name, project, open}] }
  let projects = [], folders = [], boardList = [];
  const saveLib = () => MB.saveFolders({ projects, folders });
  const byName = (arr, name) => arr.find(x => x.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());
  const findFolder = name => byName(folders, name);
  function makeProject(name) { const p = byName(projects, name) || { id: uid(), name: String(name).trim() || 'New project', color: COLOR_NAMES[1 + projects.length % 6], open: true }; if (!projects.includes(p)) projects.push(p); return p; }
  function makeFolder(name, projectId = null) { const f = findFolder(name) || { id: uid(), name: String(name).trim() || 'New folder', project: projectId, open: true }; if (!folders.includes(f)) folders.push(f); return f; }
  const boardsIn = fid => boardList.filter(b => b.folder === fid);
  const foldersIn = pid => folders.filter(f => (f.project || null) === pid && (pid === null || projects.some(p => p.id === pid)));
  const looseFolders = () => folders.filter(f => !f.project || !projects.some(p => p.id === f.project));
  const looseBoards = () => boardList.filter(b => !b.folder || !folders.some(f => f.id === b.folder));
  const tint = c => COLORS[c] && c !== 'white' ? `var(--${c === 'pink' ? 'pink' : c + '-deep'})` : 'var(--pink)';
  async function moveBoard(id, folderId) {
    if (board && board.id === id) { board.folder = folderId; await MB.save(board); return; }
    const b = await MB.load(id); if (!b) return; b.folder = folderId; await MB.save(b);
  }
  async function loadLib() {
    const [list, lib] = await Promise.all([MB.list(), MB.folders().catch(() => null)]);
    boardList = list;
    if (Array.isArray(lib)) { projects = []; folders = lib; }   // folders saved before projects existed
    else { projects = (lib && lib.projects) || []; folders = (lib && lib.folders) || []; }
  }
  // drag and drop between rows and tiles: boards go into folders, folders go into projects
  const dropZone = (el, kind, onDrop) => {
    el.addEventListener('dragover', e => { if (!e.dataTransfer.types.includes('mb/' + kind)) return; e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', async e => { const id = e.dataTransfer.getData('mb/' + kind); if (!id) return; e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); await onDrop(id); await saveLib(); refreshBoards(); });
  };
  const draggable = (el, kind, id) => { el.draggable = true; el.ondragstart = e => { e.stopPropagation(); e.dataTransfer.setData('mb/' + kind, id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); }; el.ondragend = () => el.classList.remove('dragging'); };
  function inlineRename(el, obj, after) {
    el.contentEditable = 'true'; el.focus(); getSelection().selectAllChildren(el);
    el.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } if (ev.key === 'Escape') { el.textContent = obj.name; el.blur(); } ev.stopPropagation(); };
    el.onblur = async () => { el.contentEditable = 'false'; const v = el.textContent.trim(); if (v) obj.name = v; await (after ? after(v) : saveLib()); refreshBoards(); };
  }
  async function newBoardIn(folderId) { const b = newBoard(); b.folder = folderId; await MB.save(b); closeHome(); await openBoard(b.id); $('boardName').focus(); $('boardName').select(); }

  // the left box: a small tree (projects ▸ folders ▸ boards)
  function boardRow(b) {
    const r = document.createElement('div'); r.className = 'board-row' + (board && b.id === board.id ? ' on' : '');
    r.innerHTML = `<i style="background:${tint(b.color)}"></i><span></span>`; r.querySelector('span').textContent = b.name;
    r.onclick = () => { closeHome(); openBoard(b.id); }; draggable(r, 'board', b.id); return r;
  }
  function treeNode(obj, kind, count, kids, btns) {
    const wrap = document.createElement('div'); wrap.className = 'node ' + kind + (obj.open ? ' open' : '');
    wrap.innerHTML = `<div class="node-head"><span class="chev">▶</span><span class="${kind === 'project' ? 'pic' : 'fic'}"></span><span class="fname"></span><small>${count}</small>${btns.map(([a, t, s]) => `<button class="f-btn" data-a="${a}" title="${t}">${s}</button>`).join('')}</div><div class="node-body"></div>`;
    if (kind === 'project') wrap.querySelector('.pic').style.background = tint(obj.color);
    const name = wrap.querySelector('.fname'), body = wrap.querySelector('.node-body'); name.textContent = obj.name;
    kids.forEach(k => body.appendChild(k));
    if (!kids.length) body.innerHTML = `<div class="folder-empty">${kind === 'project' ? 'No folders yet' : 'Drag boards in here'}</div>`;
    name.ondblclick = e => { e.stopPropagation(); inlineRename(name, obj); };
    return { wrap, name };
  }
  function folderNode(f) {
    const inside = boardsIn(f.id); if (board && inside.some(b => b.id === board.id)) f.open = true;
    const { wrap, name } = treeNode(f, 'folder', inside.length, inside.map(boardRow), [['add', 'New board in this folder', '+'], ['ren', 'Rename', '✎'], ['del', 'Remove folder (keeps its boards)', '×']]);
    wrap.querySelector('.node-head').onclick = async e => {
      const a = e.target.closest('.f-btn')?.dataset.a;
      if (a === 'add') return newBoardIn(f.id);
      if (a === 'ren') return inlineRename(name, f);
      if (a === 'del') { for (const b of inside) await moveBoard(b.id, null); folders = folders.filter(x => x !== f); await saveLib(); return refreshBoards(); }
      if (name.isContentEditable) return;
      f.open = !f.open; wrap.classList.toggle('open', f.open); saveLib();
    };
    draggable(wrap.querySelector('.node-head'), 'folder', f.id);
    dropZone(wrap.querySelector('.node-head'), 'board', id => moveBoard(id, f.id).then(() => { f.open = true; }));
    return wrap;
  }
  function projectNode(p) {
    const fs = foldersIn(p.id); if (board && fs.some(f => boardsIn(f.id).some(b => b.id === board.id))) p.open = true;
    const { wrap, name } = treeNode(p, 'project', fs.length, fs.map(folderNode), [['add', 'New folder in this project', '+'], ['ren', 'Rename', '✎'], ['del', 'Remove project (keeps its folders)', '×']]);
    wrap.querySelector('.node-head').onclick = async e => {
      const a = e.target.closest('.f-btn')?.dataset.a;
      if (a === 'add') { const f = makeFolder(uniqueName(folders, 'New folder'), p.id); p.open = true; await saveLib(); await refreshBoards(); return renameNewest('.node.folder', f); }
      if (a === 'ren') return inlineRename(name, p);
      if (a === 'del') { fs.forEach(f => f.project = null); projects = projects.filter(x => x !== p); await saveLib(); return refreshBoards(); }
      if (name.isContentEditable) return;
      p.open = !p.open; wrap.classList.toggle('open', p.open); saveLib();
    };
    dropZone(wrap.querySelector('.node-head'), 'folder', id => { const f = folders.find(x => x.id === id); if (f) { f.project = p.id; p.open = true; } });
    return wrap;
  }
  const uniqueName = (arr, base) => { let n = base, k = 2; while (byName(arr, n)) n = base + ' ' + k++; return n; };
  function renameNewest(sel, obj) { const el = [...document.querySelectorAll(`#boards ${sel}`)].find(n => n.querySelector('.fname').textContent === obj.name); if (el) inlineRename(el.querySelector('.fname'), obj); }
  async function refreshBoards() {
    await loadLib();
    const el = $('boards'); el.innerHTML = '';
    // inside a project (on Home or on one of its boards) the left box shows just that project; in All projects it shows everything
    const sf = homeAt ? (homeAt.level === 'folder' ? folders.find(x => x.id === homeAt.id) : null) : folders.find(x => x.id === board?.folder);
    const sp = homeAt?.level === 'project' ? projects.find(x => x.id === homeAt.id) : sf && projects.find(x => x.id === sf.project);
    const scoped = homeAt?.level !== 'all' && (sp || sf);
    $('treeLabel').textContent = scoped ? 'In this project' : 'Everything';
    if (scoped) { if (sp) { sp.open = true; el.appendChild(projectNode(sp)); } else { sf.open = true; el.appendChild(folderNode(sf)); } $('homeBtn').classList.add('out'); renderCrumbs(); if (homeAt) renderHome(); return; }
    $('homeBtn').classList.remove('out');
    projects.forEach(p => el.appendChild(projectNode(p)));
    looseFolders().forEach(f => el.appendChild(folderNode(f)));
    const loose = document.createElement('div'); loose.className = 'loose-zone';
    looseBoards().forEach(b => loose.appendChild(boardRow(b)));
    el.appendChild(loose);
    dropZone(loose, 'board', id => moveBoard(id, null));
    dropZone(el, 'folder', id => { const f = folders.find(x => x.id === id); if (f) f.project = null; });
    renderCrumbs(); if (homeAt) renderHome();
  }

  // ---------- home: zoom out to see every project, then a project's folders, then a folder's boards ----------
  let homeAt = null;   // null = closed, { level: 'all' } | { level: 'project', id } | { level: 'folder', id }
  const where = () => { const f = folders.find(x => x.id === board?.folder), p = f && projects.find(x => x.id === f.project); return { f, p }; };
  function renderCrumbs() {
    if (!board) return; const { f, p } = where(), el = $('crumbs');
    el.innerHTML = `<button data-go="all" title="All projects">⌂</button>` + (p ? `<i>/</i><button data-go="project:${p.id}"></button>` : '') + (f ? `<i>/</i><button data-go="folder:${f.id}"></button>` : '');
    const btns = el.querySelectorAll('button'); if (p) { btns[1].textContent = p.name; btns[1].title = p.name; } if (f) { btns[btns.length - 1].textContent = f.name; btns[btns.length - 1].title = f.name; }
  }
  $('crumbs').onclick = e => { const g = e.target.closest('[data-go]')?.dataset.go; if (g) openHome(g); };
  $('homeBtn').onclick = () => openHome('all');
  $('brand').onclick = () => openHome('all');
  $('homeBack').onclick = () => { if (!homeAt) return; const f = homeAt.level === 'folder' && folders.find(x => x.id === homeAt.id); openHome(f && f.project && projects.some(p => p.id === f.project) ? 'project:' + f.project : 'all'); };
  function openHome(go = 'all') { const [level, id] = go.split(':'); homeAt = { level, id }; $('home').classList.add('on'); refreshBoards(); }
  function closeHome() { if (!homeAt) return; homeAt = null; $('home').classList.remove('on'); refreshBoards(); }
  const miniCache = new Map();
  async function mini(id) {
    // a tiny map of the board: every card as a little colored block
    if (!miniCache.has(id)) miniCache.set(id, MB.load(id).then(b => {
      const cs = (b && b.cards) || []; if (!cs.length) return '';
      const x0 = Math.min(...cs.map(c => c.x)), y0 = Math.min(...cs.map(c => c.y)), x1 = Math.max(...cs.map(c => c.x + c.w)), y1 = Math.max(...cs.map(c => c.y + c.h));
      const fill = c => c.type === 'swatch' ? c.hex : c.type === 'image' ? '#d9cfe0' : c.type === 'title' ? 'transparent' : (COLORS[c.color] || '#fff');
      return `<svg viewBox="${x0 - 40} ${y0 - 40} ${x1 - x0 + 80} ${y1 - y0 + 80}" preserveAspectRatio="xMidYMid meet">` + cs.map(c => c.type === 'title'
        ? `<rect x="${c.x}" y="${c.y + c.h * .25}" width="${Math.min(c.w, 260)}" height="${c.h * .5}" rx="8" fill="#494848" opacity=".75"/>`
        : `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="${fill(c)}" stroke="rgba(120,80,120,.12)" stroke-width="3" transform="rotate(${c.r || 0} ${c.x + c.w / 2} ${c.y + c.h / 2})"/>`).join('') + '</svg>';
    }));
    return miniCache.get(id);
  }
  function tile(kind, obj, sub, onOpen, btns = []) {
    const t = document.createElement('div'); t.className = 'tile ' + kind; t.style.rotate = (((obj.id.charCodeAt(0) + obj.id.charCodeAt(1)) % 5) - 2) * .6 + 'deg';
    t.innerHTML = `<div class="tile-art"></div><div class="tile-meta"><b></b><small>${sub}</small>${btns.map(([a, tt, s]) => `<button class="f-btn" data-a="${a}" title="${tt}">${s}</button>`).join('')}</div>`;
    t.querySelector('b').textContent = obj.name;
    t.onclick = e => { if (e.target.closest('.f-btn') || t.querySelector('b').isContentEditable) return; onOpen(); };
    return t;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function renderHome() {
    const { level, id } = homeAt, grid = $('homeGrid'), crumbs = $('homeCrumbs'); grid.innerHTML = ''; miniCache.clear();
    const p = level === 'project' ? projects.find(x => x.id === id) : level === 'folder' ? projects.find(x => x.id === folders.find(f => f.id === id)?.project) : null;
    const f = level === 'folder' ? folders.find(x => x.id === id) : null;
    if ((level === 'project' && !p) || (level === 'folder' && !f)) { homeAt = { level: 'all' }; return renderHome(); }
    crumbs.innerHTML = `<button data-go="all">All projects</button>` + (p ? `<i>/</i><button data-go="project:${p.id}"></button>` : '') + (f ? `<i>/</i><button data-go="folder:${f.id}"></button>` : '');
    const cb = crumbs.querySelectorAll('button'); if (p) cb[1].textContent = p.name; if (f) cb[cb.length - 1].textContent = f.name;
    $('home').classList.toggle('deep', level !== 'all');
    $('homeTitle').textContent = f ? f.name : p ? p.name : 'Your projects';
    $('homeSub').textContent = f ? plural(boardsIn(f.id).length, 'board') : p ? plural(foldersIn(p.id).length, 'folder') : 'Every project, with its folders and boards inside.';
    const add = (label, run) => { const a = document.createElement('button'); a.className = 'tile add'; a.innerHTML = `<span>+</span>${label}`; a.onclick = run; grid.appendChild(a); };
    const del = async (arr, obj, fix) => { fix(); if (arr === 'p') projects = projects.filter(x => x !== obj); else folders = folders.filter(x => x !== obj); await saveLib(); refreshBoards(); };
    const projectTile = pp => {
      const fs = foldersIn(pp.id), nb = fs.reduce((n, x) => n + boardsIn(x.id).length, 0);
      const t = tile('project', pp, `${plural(fs.length, 'folder')} · ${plural(nb, 'board')}`, () => openHome('project:' + pp.id), [['ren', 'Rename', '✎'], ['del', 'Remove (keeps its folders)', '×']]);
      const art = t.querySelector('.tile-art'), chips = `<div class="chips">${fs.slice(0, 3).map(x => `<span class="mf"><i></i>${esc(x.name)}</span>`).join('')}</div>`;
      const first = fs.map(x => boardsIn(x.id)[0]).find(Boolean);
      if (pp.cover) { art.classList.add('cover'); art.style.background = `url('${pp.cover}')`; art.innerHTML = chips; }
      else if (first) { art.classList.add('peekboard'); art.innerHTML = chips; mini(first.id).then(svg => { if (svg) art.insertAdjacentHTML('afterbegin', svg); else { art.classList.remove('peekboard'); art.style.background = COLORS[pp.color] || COLORS.pink; } }); }
      else { art.style.background = COLORS[pp.color] || COLORS.pink; art.innerHTML = fs.length ? chips : '<em>empty project</em>'; }
      const cb = document.createElement('button'); cb.className = 'cover-btn'; cb.textContent = 'Cover'; t.appendChild(cb);
      cb.onclick = e => { e.stopPropagation(); t.querySelector('.cover-menu')?.remove(); const m = document.createElement('div'); m.className = 'cover-menu';
        m.innerHTML = `<button data-c="pick">Choose an image…</button><button data-c="board">Use the first board</button>`; t.appendChild(m);
        m.onclick = ev => { ev.stopPropagation(); const c = ev.target.closest('[data-c]')?.dataset.c; m.remove();
          if (c === 'pick') { coverFor = pp; $('coverPick').value = ''; $('coverPick').click(); }
          if (c === 'board') { delete pp.cover; saveLib().then(refreshBoards); } };
        setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true)); };
      t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('b'), pp);
      t.querySelector('[data-a="del"]').onclick = () => del('p', pp, () => fs.forEach(x => x.project = null));
      dropZone(t, 'folder', fid => { const x = folders.find(y => y.id === fid); if (x) x.project = pp.id; });
      return t;
    };
    const folderTile = ff => {
      const bs = boardsIn(ff.id), t = tile('folder', ff, plural(bs.length, 'board'), () => openHome('folder:' + ff.id), [['ren', 'Rename', '✎'], ['del', 'Remove (keeps its boards)', '×']]);
      const art = t.querySelector('.tile-art'); art.innerHTML = '<div class="back"></div><div class="tab"></div><div class="peek"></div><div class="front"><span class="face"><b></b><i></i><b></b></span></div>';
      bs.slice(0, 3).forEach(async (b, i) => { const d = document.createElement('div'); d.className = 'paper'; d.style.setProperty('--i', i); d.innerHTML = await mini(b.id); art.querySelector('.peek').appendChild(d); });
      t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('b'), ff);
      t.querySelector('[data-a="del"]').onclick = async () => { for (const b of bs) await moveBoard(b.id, null); del('f', ff, () => {}); };
      draggable(t, 'folder', ff.id); dropZone(t, 'board', bid => moveBoard(bid, ff.id));
      return t;
    };
    const boardTile = b => {
      const t = tile('board', b, b.updated ? 'edited ' + ago(b.updated) : '', () => { closeHome(); openBoard(b.id); });
      mini(b.id).then(svg => t.querySelector('.tile-art').innerHTML = svg || '<em>empty board</em>');
      draggable(t, 'board', b.id); return t;
    };
    const section = label => { const h = document.createElement('div'); h.className = 'home-sec'; h.textContent = label; grid.appendChild(h); };
    if (level === 'all') {
      projects.forEach(pp => grid.appendChild(projectTile(pp)));
      add('New project', async () => { const pp = makeProject(uniqueName(projects, 'New project')); await saveLib(); await refreshBoards(); const t = [...grid.querySelectorAll('.tile.project')].pop(); inlineRename(t.querySelector('b'), pp); });
      if (looseFolders().length) { section('Folders not in a project · drag onto a project to file'); looseFolders().forEach(ff => grid.appendChild(folderTile(ff))); }
      if (looseBoards().length) { section('Boards not in a folder'); looseBoards().forEach(b => grid.appendChild(boardTile(b))); }
    } else if (level === 'project') {
      foldersIn(p.id).forEach(ff => grid.appendChild(folderTile(ff)));
      add('New folder', async () => { const ff = makeFolder(uniqueName(folders, 'New folder'), p.id); await saveLib(); await refreshBoards(); const t = [...grid.querySelectorAll('.tile.folder')].pop(); inlineRename(t.querySelector('b'), ff); });
      if (looseBoards().length) { section('Boards not in a folder · drag onto a folder to file'); looseBoards().forEach(b => grid.appendChild(boardTile(b))); }
    } else {
      boardsIn(f.id).forEach(b => grid.appendChild(boardTile(b)));
      add('New board', () => newBoardIn(f.id));
    }
  }
  const ago = t => { const s = (Date.now() / 1000 - t), m = s / 60, h = m / 60, d = h / 24; return s < 90 ? 'just now' : m < 60 ? Math.round(m) + 'm ago' : h < 24 ? Math.round(h) + 'h ago' : Math.round(d) + 'd ago'; };
  $('homeCrumbs').onclick = e => { const g = e.target.closest('[data-go]')?.dataset.go; if (g) openHome(g); };
  $('homeClose').onclick = closeHome;
  // a project's cover image: shrunk to a tidy size and saved with the library
  let coverFor = null;
  $('coverPick').onchange = () => { const file = $('coverPick').files[0], p = coverFor; if (!file || !p) return;
    const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 720 / im.width), cv = document.createElement('canvas'); cv.width = im.width * k; cv.height = im.height * k;
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); p.cover = cv.toDataURL('image/jpeg', .86); saveLib().then(refreshBoards); }; im.src = rd.result; }; rd.readAsDataURL(file); };

  async function openBoard(id) {
    const b = await MB.load(id); if (!b) return;
    board = b; board.palette = board.palette || []; view = Object.assign({ x: 160, y: 140, z: 1 }, b.view); sel.clear(); editing = null; focusSet = null; closeColor(); renderPalette();
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
      case 'swatch': return `<div class="chipcol"></div><div class="hex"><b>${esc(c.label || c.hex.toUpperCase())}</b><span>${esc(c.hex.toUpperCase())}</span></div>`;
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
  // any words on a card can be edited: double-click the bit you want (text, list heading, a list item, the little label, a link's title or note)
  function editField(el, t, set, done) {
    editing = el.dataset.id; el.classList.add('editing'); t.contentEditable = 'true'; t.focus();
    const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const oneLine = !t.matches('.body > .text');   // notes and titles can wrap; labels, headings and list items are one line
    t.oninput = () => { set(oneLine ? t.innerText.replace(/\n/g, ' ').trim() : t.innerText.replace(/\n$/, '')); save(); };
    t.onkeydown = ev => { if (ev.key === 'Enter' && oneLine) { ev.preventDefault(); t.blur(); } };
    t.onblur = () => { endEdit(); done && done(); };
  }
  function editTag(c) {
    const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (!el) return;
    if (!c.tagText) { c.tagText = 'label'; renderCard(c); selectOnly([c.id]); }
    const e2 = cardsEl.querySelector(`[data-id="${c.id}"]`);
    editField(e2, e2.querySelector('.tag'), v => c.tagText = v.trim(), () => { if (!c.tagText) { delete c.tagText; renderCard(c); selectOnly([c.id]); save(); } });
  }
  let lastTap = {};
  function startEdit(id, target) {
    const el = cardsEl.querySelector(`[data-id="${id}"]`), c = byId(id); if (!el || !c) return;
    if (target && target.closest('.tag')) return editTag(c);
    const li = target && target.closest('li');
    if (li && c.type === 'todo') { const i = +li.dataset.i; return editField(el, li.querySelector('span'), v => c.items[i].t = v, () => { if (!c.items[i]?.t.trim()) { c.items.splice(i, 1); renderCard(c); save(); } }); }
    if (c.type === 'link') { const desc = target && target.closest('.meta span'); return editField(el, el.querySelector(desc ? '.meta span' : '.meta b'), v => desc ? c.desc = v : c.title = v); }
    if (c.type === 'image') return editTag(c);
    if (c.type === 'swatch') return openColor(c);
    if (c.type === 'todo') return editField(el, el.querySelector('.head'), v => c.text = v);
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
    if (e.target.closest('.tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home')) return;
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
      else if (d.start.length === 1 && d.start[0].c.type === 'swatch') openColor(d.start[0].c);
      else {   // our own double-click check (pointer events don't count clicks everywhere), on whatever is really under the pointer
        const now = Date.now(), id = d.start[0].c.id, under = document.elementFromPoint(e.clientX, e.clientY);
        if (under && under.matches('.card.todo li span') && !under.isContentEditable) { lastTap = {}; startEdit(id, under); return; }   // list items edit with one click
        if (lastTap.id === id && now - lastTap.t < 420) { lastTap = {}; startEdit(id, document.elementFromPoint(e.clientX, e.clientY)); } else lastTap = { id, t: now };
      }
    }
    if (d.mode === 'resize') save();
    if (d.mode === 'wire') {
      const w = toWorld(e.clientX, e.clientY), t = [...board.cards].reverse().find(c => c.id !== d.id && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h);
      if (t && !board.links.some(l => (l.a === d.id && l.b === t.id) || (l.b === d.id && l.a === t.id))) { board.links.push({ id: uid(), a: d.id, b: t.id }); save(); }
      renderWires();
    }
  });
  stage.addEventListener('dblclick', e => {
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest('.card, .selbar')) return;
    if (e.target.closest('.card, .tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home')) return;
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
      else if (e.target.matches('span') && !e.target.isContentEditable) startEdit(c.id, e.target);
    }
  });
  // trackpad: two fingers pan, pinch (or ⌘/ctrl + scroll) zooms
  stage.addEventListener('wheel', e => {
    if (e.target.closest('.tray-list, .m-bubble, .cpop, .home')) return; e.preventDefault();
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
  // clicking anywhere outside the box closes it (what you typed isn't saved unless you pressed Enter)
  addEventListener('pointerdown', e => { if ($('capture').classList.contains('on') && !e.target.closest('.capture')) capture(false); }, true);
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
    if (e.key === 'Escape' && homeAt) { closeHome(); return; }
    if (e.key === 'Escape') { closeColor(); capture(false); endEdit(); setFocus(false); selectOnly([]); mochiOpen(false); document.activeElement.blur(); return; }
    if (typing || homeAt) return;
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
    if (t === 'swatch') { const c = addAtCenter('swatch', { hex: '#ff9ec4', label: 'Pink' }); return setTimeout(() => openColor(c), 60); }
    addAtCenter(t, t === 'todo' ? { text: '', items: [{ t: 'first thing', done: false }] } : t === 'note' ? { color: COLOR_NAMES[Math.floor(Math.random() * 6) + 1] } : { text: '' }); };
  $('filePick').onchange = e => { addImages([...e.target.files]); e.target.value = ''; };
  $('boardName').oninput = e => { board.name = e.target.value || 'Untitled board'; save(); };
  // + Board / + Folder add into wherever you are: the folder you're in, or the project you're in
  function scope() {
    const f = homeAt ? (homeAt.level === 'folder' ? folders.find(x => x.id === homeAt.id) : null) : folders.find(x => x.id === board?.folder);
    const p = homeAt?.level === 'project' ? projects.find(x => x.id === homeAt.id) : homeAt?.level === 'all' ? null : f && projects.find(x => x.id === f.project);
    return { f, p };
  }
  $('newBoard').onclick = async () => { const { f, p } = scope(), into = f || (p && foldersIn(p.id)[0]); if (into) return newBoardIn(into.id); const b = newBoard(); await MB.save(b); closeHome(); openBoard(b.id); };
  $('newFolder').onclick = async () => { const f = makeFolder(uniqueName(folders, 'New folder'), scope().p?.id || null); await saveLib(); await refreshBoards(); renameNewest('.node.folder', f); };
  $('newProject').onclick = async () => { const p = makeProject(uniqueName(projects, 'New project')); await saveLib(); await refreshBoards(); renameNewest('.node.project', p); };
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
      text: (c.text || c.title || c.label || '').slice(0, 300), desc: c.desc, tag: c.tagText, items: c.items ? c.items.map(i => i.t) : undefined, hex: c.hex, url: c.url, selected: sel.has(c.id) || undefined });
    return { name: board.name, cards: board.cards.map(brief), links: board.links.map(l => [l.a, l.b]), unsorted: board.tray.map(brief), boardColors: board.palette,
      library: { projects: projects.map(p => ({ name: p.name, folders: foldersIn(p.id).map(f => f.name) })), foldersNotInAProject: looseFolders().map(f => f.name), boards: boardList.map(b => ({ id: b.id, name: b.name, folder: (folders.find(f => f.id === b.folder) || {}).name || null, current: b.id === board.id || undefined })) } };
  }
  async function ask(q, confirmed = false) {
    $('mochi').classList.add('thinking'); goo.think(true); say(confirmed ? 'Making it… (this can take a minute)' : 'On it…', 0);
    try { const raw = await MB.ask(q, snapshot(), confirmed); await applyMochi(parse(raw), q); }
    catch (err) { say("Hmm, I couldn't reach Claude: " + err.message); }
    finally { $('mochi').classList.remove('thinking'); goo.think(false); }
  }
  $('mForm').onsubmit = e => { e.preventDefault(); const q = $('mInput').value.trim(); if (!q) return; $('mInput').value = ''; mochiOpen(false); $('mInput').placeholder = 'Ask Mochi… “group these by theme”'; ask(q); };
  const parse = raw => { const s = String(raw), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0) return { say: s.trim() }; try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return { say: s.trim() }; } };
  // her actions: say, add cards, move cards, place unsorted ideas, add titles, connect cards
  async function applyMochi(r, q) {
    // folders first: create, rename, and move boards around the library
    const fo = r.folders, pr = r.projects;
    if (fo || pr) {
      await loadLib();
      ((pr && pr.create) || []).forEach(n => makeProject(n));
      ((pr && pr.rename) || []).forEach(o => { const x = byName(projects, o.from); if (x && o.to) x.name = String(o.to).trim(); });
      ((fo && fo.create) || []).forEach(o => { const n = typeof o === 'string' ? o : o.name, f = makeFolder(n); if (o.project) f.project = makeProject(o.project).id; });
      ((fo && fo.rename) || []).forEach(o => { const f = findFolder(o.from); if (f && o.to) f.name = String(o.to).trim(); });
      ((fo && fo.file) || []).forEach(o => { const f = findFolder(o.folder) || makeFolder(o.folder); f.project = o.project ? makeProject(o.project).id : null; });
      for (const m of (fo && fo.move) || []) { if (!boardList.some(b => b.id === m.board)) continue; const f = m.folder ? makeFolder(m.folder) : null; if (f && m.project) f.project = makeProject(m.project).id; await moveBoard(m.board, f ? f.id : null); }
      [...projects, ...folders].forEach(x => x.open = true);
      await saveLib(); await refreshBoards();
    }
    const center = centerWorld(), added = []; let i = 0;
    const place = o => { if (o.x == null || o.y == null) { o.x = center.x - 300 + (i % 3) * 250; o.y = center.y - 100 + Math.floor(i / 3) * 170; i++; } };
    (r.add || []).forEach(o => { place(o); const c = card(o.type === 'todo' || o.type === 'title' || o.type === 'swatch' ? o.type : 'note', {
      x: o.x, y: o.y, text: o.text || '', color: COLOR_NAMES.includes(o.color) ? o.color : 'white', hex: o.hex, label: o.label,
      items: o.items ? o.items.map(t => ({ t: typeof t === 'string' ? t : t.t, done: false })) : undefined, tagText: o.tag }); addCard(c); added.push(c); });
    (r.titles || []).forEach(o => { place(o); added.push(addCard(card('title', { x: o.x, y: o.y, text: o.text }))); });
    (r.place || []).forEach(o => { const c = board.tray.find(x => x.id === o.id); if (!c) return; place(o); c.x = o.x; c.y = o.y; board.tray = board.tray.filter(x => x !== c); addCard(c); added.push(c); });
    (r.move || []).forEach(o => { const c = byId(o.id); if (!c || o.x == null) return; c.x = o.x; c.y = o.y; if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) { el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)'; renderCard(c); setTimeout(() => el.style.transition = '', 650); } added.push(c); });
    (r.edit || []).forEach(o => { const c = byId(o.id) || board.tray.find(x => x.id === o.id); if (!c) return;
      if (o.text != null) { if (c.type === 'link') c.title = o.text; else c.text = o.text; }
      if (o.desc != null) c.desc = o.desc;
      if (o.items) c.items = o.items.map((t, k) => ({ t: typeof t === 'string' ? t : t.t, done: (typeof t === 'object' && t.done) || (c.items?.[k]?.t === t && c.items[k].done) || false }));
      if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      if (o.tag !== undefined) { if (o.tag) c.tagText = o.tag; else delete c.tagText; }
      if (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) c.hex = o.hex.toLowerCase();
      if (o.label != null) c.label = o.label;
      if (board.cards.includes(c)) { renderCard(c, true); added.push(c); } else renderTray(); });
    if (r.remove && r.remove.length) { const gone = new Set(r.remove); board.cards = board.cards.filter(c => !gone.has(c.id)); board.tray = board.tray.filter(c => !gone.has(c.id)); board.links = board.links.filter(l => !gone.has(l.a) && !gone.has(l.b)); gone.forEach(id => cardsEl.querySelector(`[data-id="${id}"]`)?.remove()); }
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
    if (added.length && (r.add || r.titles || r.place || r.move || imgs.length)) setTimeout(() => fit(board.cards), 300);
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

  // ---------- the bar above the selection ----------
  const FILLABLE = ['note', 'todo', 'link'];
  function selCards() { return [...sel].map(byId).filter(Boolean); }
  function placeSelbar() {
    const bar = $('selbar'), cs = selCards();
    if (!cs.length || editing || homeAt || stage.querySelector('.card.dragging') || $('cpop').classList.contains('on')) { bar.classList.remove('on'); return; }
    let top = Infinity, bot = -Infinity, l = Infinity, rr = -Infinity; const s = stage.getBoundingClientRect();
    cs.forEach(c => { const r = cardsEl.querySelector(`[data-id="${c.id}"]`)?.getBoundingClientRect(); if (!r) return; top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); l = Math.min(l, r.left); rr = Math.max(rr, r.right); });
    if (top === Infinity) return bar.classList.remove('on');
    const fill = cs.filter(c => FILLABLE.includes(c.type)), key = cs.map(c => c.id + c.color).join();
    if (bar.dataset.key !== key) { bar.dataset.key = key;
      $('sbDots').innerHTML = fill.length ? COLOR_NAMES.map(n => `<button data-c="${n}" title="${n}" style="background:${COLORS[n]}" class="${fill.every(c => c.color === n) ? 'on' : ''}"></button>`).join('') : '';
      bar.querySelector('[data-sb="tag"]').style.display = cs.length === 1 ? '' : 'none';
      bar.querySelector('[data-sb="edit"]').style.display = cs.length === 1 && cs[0].type !== 'image' ? '' : 'none';
      bar.querySelector('[data-sb="tag"]').textContent = cs.length === 1 && cs[0].tagText ? 'Label' : '+ Label'; }
    bar.style.left = clamp((l + rr) / 2 - s.left, 300, s.width - 300) + 'px'; bar.style.top = (top - s.top - 22 < 110 ? Math.min(bot - s.top + 62, s.height - 100) : top - s.top - 22) + 'px'; bar.classList.add('on');   // under the cards when they're near the toolbar
  }
  (function tick() { placeSelbar(); requestAnimationFrame(tick); })();
  $('selbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('selbar').onclick = e => {
    const cs = selCards(), dot = e.target.closest('[data-c]'), a = e.target.closest('[data-sb]')?.dataset.sb;
    if (dot) { cs.filter(c => FILLABLE.includes(c.type)).forEach(c => { c.color = dot.dataset.c; renderCard(c); }); selectOnly(cs.map(c => c.id)); $('selbar').dataset.key = ''; save(); }
    if (a === 'tag') editTag(cs[0]);
    if (a === 'edit') startEdit(cs[0].id);
    if (a === 'del') { const gone = new Set(sel); board.cards = board.cards.filter(c => !gone.has(c.id)); board.links = board.links.filter(l => !gone.has(l.a) && !gone.has(l.b)); gone.forEach(id => cardsEl.querySelector(`[data-id="${id}"]`)?.remove()); sel.clear(); renderWires(); save(); }
    if (a === 'mochi') { mochiOpen(true); $('mInput').placeholder = cs.length === 1 ? 'Change this… “make it say…”, “turn it mint”' : `Change these ${cs.length}… “rename to step 1, 2, 3”`; }
  };

  // ---------- colors: the editor beside a color card, and the board's own palette ----------
  // the wheel works in HSV: hue = angle, saturation = distance from the middle, value = the brightness slider
  let colorCard = null, hsv = { h: 330, s: .4, v: 1 };
  const normHex = v => { let h = String(v || '').trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(x => x + x).join(''); return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null; };
  const hsv2rgb = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(x => Math.round(x * 255)); };
  const rgb2hex = c3 => '#' + c3.map(x => x.toString(16).padStart(2, '0')).join('');
  const hex2hsv = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx }; };
  const wheelCv = $('wheelCv'), wg = wheelCv.getContext('2d');
  function drawWheel() {
    const N = wheelCv.width, R = N / 2, img = wg.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - R + .5, dy = y - R + .5, r = Math.hypot(dx, dy), i = (y * N + x) * 4; if (r > R) continue;
      const [cr, cg, cb] = hsv2rgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, r / R), hsv.v);
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = r > R - 1 ? Math.round((R - r) * 255) : 255;
    }
    wg.putImageData(img, 0, 0);
  }
  function showHSV() {
    const W = 220, a = hsv.h * Math.PI / 180, rr = hsv.s * W / 2;
    Object.assign($('wheelRing').style, { left: W / 2 + Math.cos(a) * rr + 'px', top: W / 2 + Math.sin(a) * rr + 'px', background: rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)) });
    $('bright').style.background = `linear-gradient(to right, #000, ${rgb2hex(hsv2rgb(hsv.h, hsv.s, 1))})`;
    Object.assign($('brightRing').style, { left: hsv.v * 100 + '%', background: rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)) });
  }
  function dragOn(el, fn) {
    el.addEventListener('pointerdown', e => { e.stopPropagation(); el.setPointerCapture(e.pointerId); fn(e); const mv = ev => fn(ev), up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); save(); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
  }
  dragOn($('wheel'), e => { const r = $('wheel').getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)); if (hsv.v < .05) hsv.v = 1; drawIfV(); setColor(rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel'); });
  dragOn($('bright'), e => { const r = $('bright').getBoundingClientRect(); hsv.v = clamp((e.clientX - r.left) / r.width, 0, 1); drawIfV(); setColor(rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel'); });
  let drawnV = -1; function drawIfV() { if (Math.abs(drawnV - hsv.v) > .004) { drawnV = hsv.v; drawWheel(); } showHSV(); }
  function placeColorPop(c) {
    const el = cardsEl.querySelector(`[data-id="${c.id}"]`), r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(), pop = $('cpop');
    let x = r.right + 14 - s.left, y = r.top - s.top; if (x + 270 > s.width - 250) x = r.left - 270 - s.left; pop.style.left = Math.max(260, x) + 'px'; pop.style.top = clamp(y, 70, s.height - 470) + 'px';
  }
  function openColor(c) {
    colorCard = c; hsv = hex2hsv(c.hex); drawIfV();
    $('cpHex').value = c.hex.toUpperCase(); $('cpName').value = c.label || ''; $('cpDot').style.background = c.hex;
    $('cpQuick').innerHTML = board.palette.map(p => `<button style="background:${p.hex}" data-hex="${p.hex}" title="${esc(p.name)}"></button>`).join('');
    $('cpSave').textContent = board.palette.some(p => p.hex === c.hex) ? 'Update board color' : 'Save to board colors'; $('cpSave').classList.remove('saved-ok');
    placeColorPop(c); $('cpop').classList.add('on');
  }
  function closeColor() { $('cpop').classList.remove('on'); colorCard = null; }
  function setColor(hex, from) {
    if (!colorCard || !hex) return; colorCard.hex = hex; $('cpDot').style.background = hex;
    if (from !== 'hex') $('cpHex').value = hex.toUpperCase();
    if (from !== 'wheel') { hsv = hex2hsv(hex); drawIfV(); }
    const named = board.palette.find(p => p.hex === hex); if (named && from !== 'name') { colorCard.label = named.name; $('cpName').value = named.name; }
    $('cpSave').textContent = named ? 'Update board color' : 'Save to board colors'; $('cpSave').classList.remove('saved-ok');
    renderCard(colorCard); selectOnly([colorCard.id]); if (from !== 'wheel') save();
  }
  $('cpHex').oninput = e => { const h = normHex(e.target.value); if (h) setColor(h, 'hex'); };
  $('cpName').oninput = e => { if (!colorCard) return; colorCard.label = e.target.value; renderCard(colorCard); selectOnly([colorCard.id]); save(); };
  $('cpQuick').onclick = e => { const b = e.target.closest('[data-hex]'); if (b) setColor(b.dataset.hex, 'quick'); };
  $('cpSave').onclick = () => {
    if (!colorCard) return; const name = (colorCard.label || '').trim() || colorCard.hex.toUpperCase(), hit = board.palette.find(p => p.hex === colorCard.hex);
    if (hit) hit.name = name; else board.palette.push({ hex: colorCard.hex, name });
    colorCard.label = name; renderCard(colorCard); selectOnly([colorCard.id]); renderPalette(); save(); openColor(colorCard);
    $('cpSave').textContent = 'Saved ✓'; $('cpSave').classList.add('saved-ok'); say(`Saved “${name}” to this board's colors ✦`, 3500);
  };
  $('cpDone').onclick = closeColor;
  addEventListener('pointerdown', e => { if ($('cpop').classList.contains('on') && !e.target.closest('.cpop, .card.swatch')) closeColor(); }, true);
  function renderPalette() {
    const el = $('palette'); el.innerHTML = '';
    if (!board.palette.length) { el.innerHTML = '<div class="palette-empty">Click a color card to name it and save it here. Each board keeps its own palette.</div>'; return; }
    board.palette.forEach((p, i) => {
      const r = document.createElement('div'); r.className = 'pal'; r.title = 'Click to add to the board';
      r.innerHTML = `<i style="background:${p.hex}"></i><span></span><small>${p.hex.slice(1)}</small><button class="pal-ed" title="Rename">✎</button><button class="pal-x" title="Remove">×</button>`;
      const name = r.querySelector('span'); name.textContent = p.name;
      r.onclick = e => {
        if (e.target.closest('.pal-x')) { board.palette.splice(i, 1); renderPalette(); save(); return; }
        if (e.target.closest('.pal-ed')) { name.contentEditable = 'true'; name.focus(); getSelection().selectAllChildren(name);
          const done = () => { name.contentEditable = 'false'; const v = name.textContent.trim(); if (v) { p.name = v; board.cards.filter(c => c.type === 'swatch' && c.hex === p.hex).forEach(c => { c.label = v; renderCard(c); }); } renderPalette(); save(); };
          name.onblur = done; name.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); name.blur(); } ev.stopPropagation(); }; return; }
        if (name.isContentEditable) return;
        const c = addAtCenter('swatch', { hex: p.hex, label: p.name });
      };
      el.appendChild(r);
    });
  }

  // ---------- the floating boxes: minimize to their title, remembered between launches ----------
  const boxState = (() => { try { return JSON.parse(localStorage.getItem('mochiboard:boxes') || '{}'); } catch (e) { return {}; } })();
  document.querySelectorAll('.box').forEach(b => {
    const k = b.dataset.box, btn = b.querySelector('.mini:not(.home-btn)');
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
  window.__mb = { get board() { return board; }, applyMochi, fit, lib: () => snapshot().library, openHome, get editing() { return editing; }, get sel() { return [...sel]; }, placeSelbar };   // handy for testing
})();
