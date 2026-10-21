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
    const size = { note: [220, 140], title: [320, 50], image: [260, 220], link: [260, 210], todo: [240, 180], swatch: [120, 150], coll: [288, 200], doc: [240, 52], canvas: [260, 180], shape: [160, 160], stamp: [56, 56] }[type] || [220, 140];
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
  // canvases (boards inside boards) live under their parent board, not loose in a folder
  const topLevel = b => !b.parent || !boardList.some(x => x.id === b.parent);
  const boardsIn = fid => boardList.filter(b => b.folder === fid && topLevel(b));
  const foldersIn = pid => folders.filter(f => (f.project || null) === pid && (pid === null || projects.some(p => p.id === pid)));
  const looseFolders = () => folders.filter(f => !f.project || !projects.some(p => p.id === f.project));
  const looseBoards = () => boardList.filter(b => (!b.folder || !folders.some(f => f.id === b.folder)) && topLevel(b));
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

  // ---------- right-click in the left box: duplicate or delete a board, folder or project ----------
  // copying a board also copies the canvases inside it, so the copy doesn't share them
  async function copyBoard(id, into = {}) {
    const b = await MB.load(id); if (!b) return null;
    const c = JSON.parse(JSON.stringify(b)); c.id = uid(); Object.assign(c, into);
    for (const k of c.cards) if (k.type === 'canvas' && k.board) { const kid = await copyBoard(k.board, { parent: c.id, folder: c.folder || null }); if (kid) k.board = kid.id; }
    await MB.save(c); return c;
  }
  async function dropBoard(id) { for (const k of boardList.filter(x => x.parent === id)) await dropBoard(k.id); await MB.remove(id); }
  async function duplicate(kind, obj) {
    if (kind === 'board') { const c = await copyBoard(obj.id, { name: obj.name + ' copy' }); await refreshBoards(); if (c) say(`Made “${c.name}” ✦`, 3500); return; }
    if (kind === 'folder') { const f = { id: uid(), name: obj.name + ' copy', project: obj.project || null, open: true }; folders.push(f); await saveLib(); for (const b of boardsIn(obj.id)) await copyBoard(b.id, { folder: f.id }); }
    if (kind === 'project') { const p = { id: uid(), name: obj.name + ' copy', color: obj.color, open: true }; projects.push(p); await saveLib();
      for (const f0 of foldersIn(obj.id)) { const f = { id: uid(), name: f0.name, project: p.id, open: true }; folders.push(f); await saveLib(); for (const b of boardsIn(f0.id)) await copyBoard(b.id, { folder: f.id }); } }
    await refreshBoards(); say(`Made “${obj.name} copy” ✦`, 3500);
  }
  async function destroy(kind, obj) {
    const ids = kind === 'board' ? [obj.id] : kind === 'folder' ? boardsIn(obj.id).map(b => b.id) : foldersIn(obj.id).flatMap(f => boardsIn(f.id).map(b => b.id));
    for (const id of ids) await dropBoard(id);
    if (kind === 'folder') folders = folders.filter(f => f !== obj);
    if (kind === 'project') { const fs = foldersIn(obj.id); folders = folders.filter(f => !fs.includes(f)); projects = projects.filter(p => p !== obj); }
    await saveLib(); await refreshBoards();
    if (board && ids.includes(board.id)) { let list = await MB.list(); if (!list.length) { const b = newBoard('My first board'); await MB.save(b); list = await MB.list(); } await openBoard(list[0].id); }
  }
  function rowMenu(e, kind, obj) {
    e.preventDefault(); e.stopPropagation(); $('rowMenu')?.remove();
    const n = kind === 'board' ? 1 + boardList.filter(x => x.parent === obj.id).length : kind === 'folder' ? boardsIn(obj.id).length : foldersIn(obj.id).reduce((t, f) => t + boardsIn(f.id).length, 0);
    const m = document.createElement('div'); m.id = 'rowMenu'; m.className = 'row-menu'; m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
    m.innerHTML = `<button data-m="dup">Duplicate</button><button data-m="del" class="danger">Delete</button>`;
    document.body.appendChild(m);
    const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 10) m.style.top = innerHeight - r.height - 10 + 'px';
    m.onclick = async ev => {
      const a = ev.target.closest('[data-m]')?.dataset.m; if (!a) return;
      if (a === 'dup') { m.remove(); return duplicate(kind, obj); }
      if (a === 'del') { // ask first: deleting can't be undone
        const what = kind === 'board' ? (n > 1 ? `and the ${n - 1} canvas${n > 2 ? 'es' : ''} inside it` : '') : n ? `and the ${n} board${n === 1 ? '' : 's'} inside it` : '';
        m.innerHTML = `<p>Delete “${esc(obj.name)}” ${what}? This can't be undone.</p><div><button data-m="yes" class="danger solid">Delete</button><button data-m="no">Cancel</button></div>`; return; }
      if (a === 'yes') { m.remove(); return destroy(kind, obj); }
      if (a === 'no') m.remove();
    };
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true));
  }

  // the left box: a small tree (projects ▸ folders ▸ boards)
  function boardRow(b) {
    const r = document.createElement('div'); r.className = 'board-row' + (board && b.id === board.id ? ' on' : '');
    r.innerHTML = `<i style="background:${tint(b.color)}"></i><span></span>`; r.querySelector('span').textContent = b.name;
    // one click opens the board; a double-click renames it right here (so wait a beat to tell them apart)
    let tap = 0; const name = r.querySelector('span');
    r.onclick = () => { if (name.isContentEditable) return; clearTimeout(tap); tap = setTimeout(() => { closeHome(); openBoard(b.id); }, 230); };
    r.ondblclick = e => { e.stopPropagation(); clearTimeout(tap); inlineRename(name, b, async v => { if (!v) return;
      if (board && board.id === b.id) { board.name = v; $('boardName').value = v; save(); }
      else { const bb = await MB.load(b.id); if (bb) { bb.name = v; await MB.save(bb); } } }); };
    draggable(r, 'board', b.id); r.oncontextmenu = e => rowMenu(e, 'board', b);
    const kids = boardList.filter(x => x.parent === b.id); if (!kids.length) return r;
    const frag = document.createDocumentFragment(), sub = document.createElement('div'); sub.className = 'sub-boards';
    kids.forEach(k => sub.appendChild(boardRow(k))); frag.appendChild(r); frag.appendChild(sub); return frag;
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
    draggable(wrap.querySelector('.node-head'), 'folder', f.id); wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'folder', f);
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
    wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'project', p);
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
    el.innerHTML = (p ? `<button data-go="project:${p.id}"></button>` : '') + (f ? `${p ? '<i>/</i>' : ''}<button data-go="folder:${f.id}"></button>` : '');
    const btns = el.querySelectorAll('button'); if (p) { btns[0].textContent = p.name; btns[0].title = p.name; } if (f) { btns[btns.length - 1].textContent = f.name; btns[btns.length - 1].title = f.name; }
    // inside a canvas: the boards it lives in, so you can climb back out
    const chain = []; let up = board.parent; while (up && chain.length < 4) { const pb = boardList.find(x => x.id === up); if (!pb) break; chain.unshift(pb); up = pb.parent; }
    chain.forEach(pb => { el.insertAdjacentHTML('beforeend', `${el.children.length ? '<i>/</i>' : ''}<button data-board="${pb.id}"></button>`); const bt = el.lastElementChild; bt.textContent = pb.name; bt.title = 'Back to ' + pb.name; });
  }
  $('crumbs').onclick = async e => { const pb = e.target.closest('[data-board]')?.dataset.board; if (pb) { board.view = view; await MB.save(board); return openBoard(pb); } const g = e.target.closest('[data-go]')?.dataset.go; if (g) openHome(g); };
  $('homeBtn').onclick = () => openHome('all');
  $('brand').onclick = () => openHome('all');
  $('homeBack').onclick = () => { if (!homeAt) return; const f = homeAt.level === 'folder' && folders.find(x => x.id === homeAt.id); openHome(f && f.project && projects.some(p => p.id === f.project) ? 'project:' + f.project : 'all'); };
  function openHome(go = 'all') { const [level, id] = go.split(':'); homeAt = { level, id }; $('home').classList.add('on'); stage.classList.add('at-home'); stopPlacing(); refreshBoards(); }
  function closeHome() { if (!homeAt) return; homeAt = null; $('home').classList.remove('on'); stage.classList.remove('at-home'); refreshBoards(); }
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
    miniCache.clear(); board = b; board.palette = board.palette || []; view = Object.assign({ x: 160, y: 140, z: 1 }, b.view); sel.clear(); editing = null; focusSet = null; closeColor(); renderPalette();
    board.cards.forEach(c => { if (c.type === 'canvas' && c.board) { const kb = boardList.find(x => x.id === c.board); if (kb && kb.name !== c.text) c.text = kb.name; } });
    $('boardName').value = board.name; renderAll(); refreshBoards(); try { localStorage.setItem('mochiboard:last', id); } catch (e) {}
  }
  let saveT = 0;
  function save() {
    if (!drag && board) layoutAll();
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
      case 'note': return `${c.name !== undefined ? `<div class="nname">${esc(c.name)}</div>` : ''}<div class="text">${esc(c.text)}</div>`;
      case 'doc': return `<div class="pill">${CIC.doc}<span class="text">${esc(c.text)}</span></div>`;
      case 'canvas': return `<div class="cv-head">${CIC.canvas}<span class="text">${esc(c.text)}</span></div><div class="cv-prev"><em>empty canvas</em></div>`;
      case 'shape': return shapeSVG(c) + `<div class="text">${esc(c.text || '')}</div>`;
      case 'stamp': return `<div class="st">${c.src ? `<img src="${esc(c.src)}" alt="">` : `<span>${esc(c.emoji || '⭐')}</span>`}</div>`;
      case 'coll': return `<div class="coll-head"><span class="text">${esc(c.text)}</span></div><div class="coll-frame"></div>${(c.kids || []).length ? '' : '<div class="coll-empty">Drop cards here</div>'}`;
      case 'title': return `<div class="text">${esc(c.text)}</div>`;
      case 'image': return `<img src="${esc(c.src)}" alt=""><button class="chip" data-act="colors">pull colors ✦</button>`;
      case 'link': return !c.url ? `<div class="link-in${c.loading ? ' loading' : ''}">${CIC.link}<input placeholder="Add a link…" value="${esc(c.draft || '')}" spellcheck="false"></div>`
        : `<div class="thumb" style="${c.image ? `background-image:url('${esc(c.image)}')` : ''}"></div><div class="meta"><i class="fav" style="background-image:url('https://www.google.com/s2/favicons?sz=64&domain=${esc(host(c.url))}')"></i><div><b>${esc(c.title || c.url)}</b><span>${esc(c.desc || host(c.url))}</span></div></div>`;
      case 'todo': return `<div class="head">${esc(c.text)}</div><ul>${(c.items || []).map((it, i) => `<li class="${it.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" ${it.done ? 'checked' : ''}><span>${esc(it.t)}</span></li>`).join('')}</ul><button class="add-item" data-act="item">+ add</button>`;
      case 'swatch': return `<div class="chipcol"></div><div class="hex">${c.hideName ? '' : `<b>${esc(c.label || c.hex.toUpperCase())}</b>`}${c.hideHex ? '' : `<span>${esc(c.hex.toUpperCase())}</span>`}</div>`;
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
    if (c.type === 'doc') el.classList.toggle('has-body', !!(c.body || '').trim());
    if (c.type === 'stamp') { el.style.setProperty('--sz', c.w + 'px'); if (c.mv) el.classList.add('mv-' + c.mv); }
    if (c.type === 'link') el.classList.toggle('compact', !c.url || !c.image);
    if (c.type === 'canvas' && c.board) mini(c.board).then(svg => { const p = el.querySelector('.cv-prev'); if (p && svg) p.innerHTML = svg; });
    if (c.type === 'link' && !c.url) setTimeout(() => wireLinkInput(c), 0);
    if (c.type === 'coll') { const t = COLL[c.color] || COLL.pink; el.style.setProperty('--chead', t[0]); el.style.setProperty('--cframe', t[1]); el.classList.toggle('nohead', c.head === false); el.style.height = c.h + 'px'; }
    else if (parentOf(c.id)) el.classList.add('inside');
    el.innerHTML = `<div class="frame"></div><div class="body">${inner(c)}</div>${c.tagText ? `<div class="tag">${esc(c.tagText)}</div>` : ''}<div class="knob"></div><div class="handle"></div>`;
    return el;
  }
  function renderAll() { cardsEl.innerHTML = ''; board.cards.filter(c => c.type === 'coll').forEach(c => renderCard(c)); board.cards.filter(c => c.type !== 'coll').forEach(c => renderCard(c)); layoutAll(); renderWires(); renderTray(); applyView(); }

  // ---------- round 2 pieces: icons, shapes, link hosts ----------
  const CI = d => `<svg class="cic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const CIC = {
    doc: CI('<path d="M5.5 2.5h6l3.5 3.5v10.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/><path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5"/>'),
    canvas: CI([5, 10, 15].map(y => [5, 10, 15].map(x => `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`).join('')).join('')),
    link: CI('<path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-.9.9"/><path d="M11.5 8.5a3.2 3.2 0 0 0-4.5 0l-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/>'),
  };
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const SHAPE_FILL = { gray: '#e4dfe7', pink: '#ffb8d2', butter: '#f8e08a', mint: '#a8e6c3', sky: '#aed3ff', lilac: '#cdb8ff', peach: '#ffc8a6', ink: '#494848' };
  function shapeSVG(c) {
    const f = SHAPE_FILL[c.fill] || c.fill || SHAPE_FILL.gray, P = { stroke: 'none', fill: f };
    const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
    const body = {
      rect: `<rect x="0" y="0" width="100" height="100" rx="10" ${attrs(P)}/>`,
      circle: `<ellipse cx="50" cy="50" rx="50" ry="50" ${attrs(P)}/>`,
      tri: `<path d="M50 2 L98 98 L2 98 Z" stroke-linejoin="round" ${attrs(P)}/>`,
      star: `<path d="M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z" ${attrs(P)}/>`,
      heart: `<path d="M50 92 C20 72 3 55 3 33 C3 15 17 4 31 4 C40 4 47 9 50 16 C53 9 60 4 69 4 C83 4 97 15 97 33 C97 55 80 72 50 92 Z" ${attrs(P)}/>`,
      line: `<line x1="0" y1="50" x2="100" y2="50" stroke="${f === SHAPE_FILL.gray ? '#494848' : f}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
    }[c.shape || 'rect'];
    return `<svg class="sh" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`;
  }

  // ---------- collections: a named header over a frame; cards inside stack in columns and the frame grows to fit ----------
  const COLL = { pink: ['#ffb8d2', '#ffe3ee'], butter: ['#f8e08a', '#fff6cf'], mint: ['#a8e6c3', '#dff6ea'], lilac: ['#cdb8ff', '#eee6ff'], sky: ['#aed3ff', '#e2efff'], peach: ['#ffc8a6', '#ffeee0'], white: ['#e7e1ea', '#f5f1f6'] };
  const CW = 260, CPAD = 14, CGAP = 12, CHEAD = 52;
  const colls = () => board.cards.filter(c => c.type === 'coll');
  const parentOf = id => board.cards.find(s => s.type === 'coll' && (s.kids || []).includes(id));
  function naturalHeight(c, el) {
    if (c.type === 'image') return Math.round(CW * (c.h / c.w));
    if (!['note', 'todo'].includes(c.type)) return c.h;
    const was = el.style.height; el.style.height = 'auto'; const b = el.querySelector('.body'); b.style.height = 'auto';
    const h = Math.max(64, b.offsetHeight); el.style.height = was; b.style.height = ''; return h;
  }
  function layoutColl(s) {
    s.kids = (s.kids || []).filter(id => byId(id) && id !== s.id); s.cols = Math.max(1, s.cols || 1);
    s.w = s.cols * CW + (s.cols - 1) * CGAP + CPAD * 2;
    const top = s.head === false ? 0 : CHEAD, colH = Array(s.cols).fill(0), slot = [];
    s.kids.forEach(id => {
      const c = byId(id), el = cardsEl.querySelector(`[data-id="${id}"]`); if (!el) return;
      const h = naturalHeight(c, el); if (c.type === 'image') { c.h = h; }
      // each card remembers its column (where you dropped it); new ones go in the shortest
      let k = s.colOf?.[id]; if (k == null || k >= s.cols) { k = colH.indexOf(Math.min(...colH)); (s.colOf = s.colOf || {})[id] = k; }
      c.x = s.x + CPAD + k * (CW + CGAP); c.y = s.y + top + CPAD + colH[k]; c.w = CW; if (['note', 'todo'].includes(c.type)) c.h = h; c.r = 0;
      colH[k] += c.h + CGAP;
      Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.type === 'title' ? 'auto' : c.h + 'px' }); el.classList.add('inside');
    });
    s.h = top + CPAD * 2 + Math.max(90, Math.max(...colH) - CGAP);
    const el = cardsEl.querySelector(`[data-id="${s.id}"]`); if (el) { Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' }); el.querySelector('.coll-empty')?.remove(); if (!s.kids.length) el.querySelector('.body').insertAdjacentHTML('beforeend', '<div class="coll-empty">Drop cards here</div>'); }
  }
  function layoutAll() { if (!board) return; colls().forEach(layoutColl); cardsEl.querySelectorAll('.card.inside').forEach(el => { if (!parentOf(el.dataset.id)) el.classList.remove('inside'); }); }
  // which collection is under a point (or just to its right: dropping there adds a column)
  function collAt(w, skip) {
    for (const s of [...colls()].reverse()) { if (skip.has(s.id)) continue;
      if (w.y > s.y && w.y < s.y + s.h + 70) { if (w.x > s.x && w.x < s.x + s.w) return { s, side: false }; if (w.y < s.y + s.h && w.x >= s.x + s.w && w.x < s.x + s.w + 70) return { s, side: true }; } }   // a little below the frame adds to the end
    return null;
  }
  function dropInto(t, ids, w) {
    ids.forEach(id => { const from = parentOf(id); if (from) { from.kids = from.kids.filter(k => k !== id); if (from.colOf) delete from.colOf[id]; } });
    const s = t.s; s.kids = s.kids || []; s.colOf = s.colOf || {};
    let col;
    if (t.side) { s.cols = (s.cols || 1) + 1; col = s.cols - 1; }
    else col = clamp(Math.floor((w.x - s.x - CPAD) / (CW + CGAP)), 0, (s.cols || 1) - 1);
    // within that column, slot it after the cards that sit above where you let go
    const inCol = s.kids.filter(k => s.colOf[k] === col), above = inCol.filter(k => { const c = byId(k); return c && c.y + c.h / 2 < w.y; });
    const at = above.length ? s.kids.indexOf(above[above.length - 1]) + 1 : inCol.length ? s.kids.indexOf(inCol[0]) : s.kids.length;
    s.kids.splice(at, 0, ...ids); ids.forEach(id => s.colOf[id] = col);
  }

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
    if (target && target.closest('.nname')) return editField(el, el.querySelector('.nname'), v => c.name = v);
    if (c.type === 'coll') return editField(el, el.querySelector('.coll-head .text'), v => c.text = v);
    if ((c.type === 'doc' || c.type === 'canvas') && target && !target.closest('.text')) return c.type === 'doc' ? openDoc(c) : openCanvas(c);
    if (c.type === 'doc') return editField(el, el.querySelector('.text'), v => c.text = v);
    if (c.type === 'canvas') return editField(el, el.querySelector('.text'), v => c.text = v, () => renameChild(c));
    if (c.type === 'link' && !c.url) return wireLinkInput(c);
    const li = target && target.closest('li');
    if (li && c.type === 'todo') { const i = +li.dataset.i; return editField(el, li.querySelector('span'), v => c.items[i].t = v, () => { if (!c.items[i]?.t.trim()) { c.items.splice(i, 1); renderCard(c); save(); } }); }
    if (c.type === 'link') { const desc = target && target.closest('.meta span'); return editField(el, el.querySelector(desc ? '.meta span' : '.meta b'), v => desc ? c.desc = v : c.title = v); }
    if (c.type === 'image') return editTag(c);
    if (c.type === 'swatch') return openColor(c);
    if (c.type === 'todo') return editField(el, el.querySelector('.head'), v => c.text = v);
    const t = el.querySelector(c.type === 'todo' ? '.head' : '.text'); if (!t) return;
    editing = id; el.classList.add('editing'); t.contentEditable = 'true'; t.focus();
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    t.oninput = () => { c.text = t.innerText.replace(/\n$/, '');
      if (c.type === 'note' && !parentOf(c.id)) { const b = el.querySelector('.body'); if (b.scrollHeight > c.h) { c.h = b.scrollHeight + 4; el.style.height = c.h + 'px'; } }   // notes grow as you type
      save(); };
    t.onblur = () => endEdit();
  }
  function endEdit() { if (!editing) return; const el = cardsEl.querySelector(`[data-id="${editing}"]`); if (el) { el.classList.remove('editing'); el.querySelectorAll('[contenteditable]').forEach(n => n.contentEditable = 'false'); } editing = null; }

  // ---------- pointer: drag cards, resize, connect, marquee, pan ----------
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home, .linkbox, .selbar, .dock, .docview, .shapepick')) return;
    const el = e.target.closest('.card'), w = toWorld(e.clientX, e.clientY);
    if (placing && e.button === 0) { e.preventDefault(); placeAt(w); return; }
    if (space || e.button === 1) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }
    if (el) {
      const id = el.dataset.id, c = byId(id);
      if (editing === id && !e.target.closest('.handle, .knob')) return;      // clicking inside text you're editing
      if (e.target.closest('input[type=checkbox], .link-in input')) return;
      if (e.target.closest('[data-act]')) return;
      if (e.target.classList.contains('handle')) { drag = { mode: 'resize', id, sx: w.x, sy: w.y, w0: c.w, h0: c.h }; }
      else if (e.target.classList.contains('knob')) { drag = { mode: 'wire', id, a: { x: c.x + c.w, y: c.y + c.h / 2 } }; }
      else {
        endEdit();
        if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); selectOnly([...sel]); }
        else if (!sel.has(id)) selectOnly([id]);
        const ids = new Set(sel); [...sel].forEach(i => { const c = byId(i); if (c?.type === 'coll') (c.kids || []).forEach(k => ids.add(k)); });
        drag = { mode: 'move', sx: w.x, sy: w.y, start: [...ids].map(i => byId(i)).filter(Boolean).map(c => ({ c, x: c.x, y: c.y })), moved: false };
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
      const loose = drag.start.filter(s => s.c.type !== 'coll'), skip = new Set(drag.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      const dt = loose.length && !skip.size && docTarget(e, w, loose); $('docview').classList.toggle('drop', dt === 'page');
      if (dt && dt !== 'page') { cardsEl.querySelector(`[data-id="${dt.id}"]`)?.classList.add('drop-in'); }
      else if (loose.length && !skip.size) { const t = collAt(w, skip); if (t) cardsEl.querySelector(`[data-id="${t.s.id}"]`)?.classList.add(t.side ? 'drop-col' : 'drop-in'); }
    }
    if (drag.mode === 'resize' && byId(drag.id).type === 'coll') { const c = byId(drag.id); c.cols = Math.max(1, Math.round((drag.w0 + w.x - drag.sx - CPAD * 2 + CGAP) / (CW + CGAP))); layoutColl(c); renderWires(); return; }
    if (drag.mode === 'resize' && byId(drag.id).type === 'stamp') { const c = byId(drag.id); c.w = c.h = clamp(drag.w0 + Math.max(w.x - drag.sx, w.y - drag.sy), 24, 400); const el = cardsEl.querySelector(`[data-id="${c.id}"]`); Object.assign(el.style, { width: c.w + 'px', height: c.h + 'px' }); el.style.setProperty('--sz', c.w + 'px'); return; }
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
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      if (d.moved) {
        const w = toWorld(e.clientX, e.clientY), skip = new Set(d.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
        const dt = !skip.size && docTarget(e, w, d.start); $('docview').classList.remove('drop');
        if (dt) { d.start.forEach(s2 => { s2.c.x = s2.x; s2.c.y = s2.y; renderCard(s2.c); }); dropIntoDoc(dt, d.start.map(s2 => s2.c), e); return; }   // the card slides home; its words go into the doc
        if (!skip.size) {
          const ids = d.start.map(s => s.c.id), t = collAt(w, skip);
          if (t) dropInto(t, ids, w);
          else ids.forEach(id => { const from = parentOf(id); if (from) { from.kids = from.kids.filter(k => k !== id); const el = cardsEl.querySelector(`[data-id="${id}"]`); el?.classList.remove('inside'); byId(id).r = tilt(); renderCard(byId(id)); } });
        }
        save(); renderWires();
      }
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
    if (e.target.closest('.card, .tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home, .linkbox, .selbar')) return;
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
    if (e.key === 'Escape' && docCard) { closeDoc(); return; }
    if (e.key === 'Escape' && (placing || $('shapePick').classList.contains('on') || $('stampWheel').classList.contains('on') || $('stampPick').classList.contains('on'))) { stopPlacing(); return; }
    if (e.key === 'Escape') { closeColor(); capture(false); endEdit(); setFocus(false); selectOnly([]); mochiOpen(false); document.activeElement.blur(); return; }
    if (typing || homeAt) return;
    if (e.key === ' ') { space = true; stage.classList.add('space'); e.preventDefault(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) removeSelected();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectOnly(board.cards.map(c => c.id)); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && sel.size) { e.preventDefault(); const copies = [...sel].map(id => Object.assign(JSON.parse(JSON.stringify(byId(id))), { id: uid(), r: tilt() })); copies.forEach(c => { c.x += 30; c.y += 30; addCard(c); }); selectOnly(copies.map(c => c.id)); }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') setFocus(!focusSet);
    if (k === 'n') startPlacing('note');
    if (k === 't') startPlacing('title');
    if (k === 'c') startPlacing('todo');
    if (k === 'g') startPlacing('coll');
    if (k === 'd') startPlacing('doc');
    if (k === 's') $('tools').querySelector('[data-add="shape"]').click();
    if (k === 'e') $('tools').querySelector('[data-add="stamp"]').click();
    if (k === 'l') startPlacing('link');
    if (k === 'i') $('filePick').click();
    if (k === '0') fit(board.cards);
    if (k === 'm') { e.preventDefault(); mochiOpen(true); }
  });
  addEventListener('keyup', e => { if (e.key === ' ') { space = false; stage.classList.remove('space'); } });
  // links get a little paste box under the toolbar (the app can't show the browser's prompt)
  function addLinkPrompt() { $('linkbox').classList.add('on'); $('linkInput').value = ''; setTimeout(() => $('linkInput').focus(), 30); }
  const closeLink = () => $('linkbox').classList.remove('on');
  $('linkbox').onsubmit = e => { e.preventDefault(); const u = $('linkInput').value.trim(); closeLink(); if (u) linkCard(/^https?:/i.test(u) ? u : 'https://' + u, centerWorld()); };
  $('linkInput').onkeydown = e => { if (e.key === 'Escape') { closeLink(); e.stopPropagation(); } };
  addEventListener('pointerdown', e => { if ($('linkbox').classList.contains('on') && !e.target.closest('.linkbox, [data-add="link"]')) closeLink(); }, true);

  // ---------- toolbar ----------
  $('tools').onclick = e => { const b = e.target.closest('[data-add]'); if (!b) return; const t = b.dataset.add;
    if (t === 'image') return $('filePick').click();
    if (t === 'stamp') { const on = !$('stampWheel').classList.contains('on'); stopPlacing(); const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); ['stampWheel', 'stampPick'].forEach(id => $(id).style.left = (r.left + r.width / 2 - sr.left) + 'px'); renderWheel(); $('stampWheel').classList.toggle('on', on); b.classList.toggle('on', on); $('mBubble').classList.remove('on'); return; }
    if (t === 'shape') { const on = !$('shapePick').classList.contains('on'); stopPlacing(); const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); $('shapePick').style.left = (r.left + r.width / 2 - sr.left) + 'px'; $('shapePick').classList.toggle('on', on); b.classList.toggle('on', on); $('mBubble').classList.remove('on'); return; }
    startPlacing(t); };
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
  // clicking Mochi opens her text box; clicking her again (not the box itself) closes it
  $('mPill').onclick = e => { if (e.target.closest('#mForm')) return; mochiOpen(!$('mochi').classList.contains('open')); };
  // what Mochi sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
  function snapshot() {
    const brief = c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h), color: c.color,
      text: (c.text || c.title || c.label || '').slice(0, 300), name: c.name, kids: c.kids, desc: c.desc, body: c.body ? c.body.slice(0, 600) : undefined, shape: c.shape, tag: c.tagText, items: c.items ? c.items.map(i => i.t) : undefined, hex: c.hex, url: c.url, selected: sel.has(c.id) || undefined });
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
    (r.add || []).forEach(o => { place(o); const c = card(['todo', 'title', 'swatch', 'doc'].includes(o.type) ? o.type : 'note', { body: o.type === 'doc' ? (o.body || '') : undefined,
      x: o.x, y: o.y, text: o.text || '', color: COLOR_NAMES.includes(o.color) ? o.color : 'white', hex: o.hex, label: o.label,
      items: o.items ? o.items.map(t => ({ t: typeof t === 'string' ? t : t.t, done: false })) : undefined, tagText: o.tag, name: o.name }); addCard(c); added.push(c); if (o.in) file(c, o.in); });
    // collections Mochi makes, and cards she files into them (by collection id, or by the name of one she just made)
    const made = {};
    (r.collections || []).forEach(o => { place(o); const s2 = card('coll', { x: o.x, y: o.y, text: o.name || o.text || '', color: COLL[o.color] ? o.color : 'pink', kids: [], cols: o.cols || 1, r: 0 }); addCard(s2); made[(o.name || '').toLowerCase()] = s2; added.push(s2); });
    const collFor = k => k && (byId(k)?.type === 'coll' ? byId(k) : made[String(k).toLowerCase()] || colls().find(s2 => s2.text.toLowerCase() === String(k).toLowerCase()));
    const file = (c, k) => { const s2 = collFor(k); if (!s2 || c.id === s2.id) return; const from = parentOf(c.id); if (from) from.kids = from.kids.filter(x => x !== c.id); s2.kids.push(c.id); };
    (r.titles || []).forEach(o => { place(o); added.push(addCard(card('title', { x: o.x, y: o.y, text: o.text }))); });
    (r.place || []).forEach(o => { const c = board.tray.find(x => x.id === o.id); if (!c) return; place(o); c.x = o.x; c.y = o.y; board.tray = board.tray.filter(x => x !== c); addCard(c); added.push(c); });
    (r.move || []).forEach(o => { const c = byId(o.id); if (!c || o.x == null) return; c.x = o.x; c.y = o.y; if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) { el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)'; renderCard(c); setTimeout(() => el.style.transition = '', 650); } added.push(c); });
    (r.edit || []).forEach(o => { const c = byId(o.id) || board.tray.find(x => x.id === o.id); if (!c) return;
      if (o.text != null) { if (c.type === 'link') c.title = o.text; else c.text = o.text; }
      if (o.desc != null) c.desc = o.desc;
      if (o.body != null && c.type === 'doc') c.body = o.body;
      if (o.items) c.items = o.items.map((t, k) => ({ t: typeof t === 'string' ? t : t.t, done: (typeof t === 'object' && t.done) || (c.items?.[k]?.t === t && c.items[k].done) || false }));
      if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      if (o.tag !== undefined) { if (o.tag) c.tagText = o.tag; else delete c.tagText; }
      if (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) c.hex = o.hex.toLowerCase();
      if (o.label != null) c.label = o.label;
      if (o.name != null && c.type === 'note') c.name = o.name;
      if (o.in !== undefined) { if (o.in) file(c, o.in); else { const from = parentOf(c.id); if (from) from.kids = from.kids.filter(x => x !== c.id); } }
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
    layoutAll();
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

  function removeSelected() {
    const gone = new Set(sel); board.cards = board.cards.filter(c => !gone.has(c.id)); board.links = board.links.filter(l => !gone.has(l.a) && !gone.has(l.b));
    gone.forEach(id => cardsEl.querySelector(`[data-id="${id}"]`)?.remove()); sel.clear();
    cardsEl.querySelectorAll('.card.inside').forEach(el => { if (!parentOf(el.dataset.id)) { el.classList.remove('inside'); } });
    renderWires(); save();
  }

  // ---------- placing: pick a tool, the new thing rides on your cursor, click to drop it, then type ----------
  let placing = null, mouse = { x: 0, y: 0 };
  const PLACE = { note: ['Note', [220, 120]], todo: ['Checklist', [240, 170]], title: ['Title', [300, 56]], coll: ['Collection', [288, 200]], swatch: ['Color', [120, 150]], doc: ['Doc', [240, 52]], canvas: ['Canvas', [260, 180]], link: ['Paste a link', [260, 52]], shape: ['', [160, 160]], stamp: ['', [56, 56]] };
  function startPlacing(type, extra = {}) {
    if (placing?.type === type && placing.extra?.shape === extra.shape) return stopPlacing();
    stopPlacing(); placing = { type, extra }; selectOnly([]);
    const g = $('ghost'), [label, [w, h]] = PLACE[type]; g.className = 'ghost on ' + type; g.innerHTML = `<span>${label}</span>`;
    g.style.width = w + 'px'; g.style.height = (extra.shape === 'line' ? 24 : h) + 'px'; if (type === 'shape') g.innerHTML = shapeSVG({ shape: extra.shape });
    if (type === 'stamp') { const st = extra.stamp; g.innerHTML = st.src ? `<img src="${st.src}">` : `<span>${st.emoji}</span>`; g.style.width = g.style.height = '56px'; } moveGhost(); stage.classList.add('placing');
    $('tools').querySelector(`[data-add="${type}"]`)?.classList.add('on');
  }
  function stopPlacing() { $('shapePick').classList.remove('on'); $('stampWheel').classList.remove('on'); $('stampPick').classList.remove('on'); placing = null; $('ghost').className = 'ghost'; stage.classList.remove('placing'); $('tools').querySelectorAll('.on').forEach(b => b.classList.remove('on')); }
  function moveGhost() { if (!placing) return; const r = stage.getBoundingClientRect(), g = $('ghost'), o = placing.type === 'stamp' ? 28 * view.z : 14; g.style.left = mouse.x - r.left - o + 'px'; g.style.top = mouse.y - r.top - o + 'px'; g.style.transform = `scale(${view.z})`; }
  addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; moveGhost(); }, true);
  function placeAt(w) {
    if (placing.type === 'stamp') return stampAt(w, placing.extra.stamp);
    const type = placing.type, more = placing.extra || {}; stopPlacing();
    const extra = type === 'doc' ? { text: '', body: '' } : type === 'canvas' ? { text: '' } : type === 'link' ? { url: '' } : type === 'shape' ? { shape: more.shape, fill: 'gray', text: '', r: 0 } : type === 'note' ? { name: '', color: 'white' } : type === 'todo' ? { text: '', items: [{ t: 'first thing', done: false }] } : type === 'title' ? { text: '' }
      : type === 'coll' ? { text: '', color: 'pink', kids: [], cols: 1 } : type === 'swatch' ? { hex: '#ff9ec4', label: 'Pink' } : {};
    const c = card(type, extra); c.x = w.x - 14 / view.z; c.y = w.y - 14 / view.z;
    if (type === 'coll') c.r = 0;
    if (type === 'link') c.h = 52;
    if (type === 'shape' && more.shape === 'line') { c.w = 200; c.h = 24; }
    if (type === 'swatch') { c.label = colorName(c.hex); c.autoName = true; }
    if (type === 'canvas') { const child = newBoard('Untitled canvas'); child.parent = board.id; child.folder = board.folder || null; c.board = child.id; MB.save(child).then(refreshBoards); }
    addCard(c); selectOnly([c.id]);
    const t = type !== 'coll' && collAt(w, new Set([c.id])); if (t) { dropInto(t, [c.id], w); save(); }
    if (['note', 'todo', 'title', 'doc', 'canvas'].includes(type)) setTimeout(() => startEdit(c.id), 30);
    if (type === 'coll') setTimeout(() => startEdit(c.id), 30);
    if (type === 'swatch') setTimeout(() => openColor(c), 60);
  }

  // ---------- stamps: Mochi's emojis, moving Mochis and regular emoji, stamped with a little burst ----------
  const M = n => 'stamps/mochi' + (n ? '-' + n : '') + '.png';
  const STAMPS = {
    mochi: [['Mochi', M('')], ['Happy', M('happy')], ['Love', M('love')], ['Party', M('party')], ['Wave', M('wave')], ['Shook', M('shook')], ['Sleepy', M('sleepy')], ['Cry', M('cry')], ['Sigh', M('sigh')]].map(([n, src]) => ({ n, src })),
    moving: [{ n: 'Bounce', src: 'stamps/mochi-bounce.gif' }, { n: 'Sigh', src: 'stamps/mochi-sigh.gif' }, { n: 'Hi!', src: M('wave'), mv: 'wiggle' }, { n: 'Love', src: M('love'), mv: 'pulse' },
      { n: 'Party', src: M('party'), mv: 'spin' }, { n: 'Shook', src: M('shook'), mv: 'shake' }, { n: 'Sleepy', src: M('sleepy'), mv: 'float' }, { n: 'Happy', src: M('happy'), mv: 'squish' }, { n: 'Hop', src: M(''), mv: 'hop' }],
    emoji: [...'❤️ 👍 👎 ⭐ ✨ 🌈 🔥 🎉 💯 ✅ ❌ ❓ ❗ 💡 👀 🙌 👏 🤔 😍 😂 🥹 😭 😅 🫶 💖 🩷 💜 💙 🌸 🌷 🍓 🍑 🧁 ☕ 🚀 📌 📍 🎯 🏆 🧠 💬 🗓️ ⏰ 🔗 🎨 🖍️ 📸 🎧'.split(' ')].map(e => ({ n: e, emoji: e })),
  };
  const WHEEL_DEFAULT = [{ emoji: '❤️' }, { emoji: '👍' }, { src: M('love') }, { emoji: '⭐' }, { src: 'stamps/mochi-bounce.gif' }, { emoji: '❓' }, { emoji: '🌈' }, { src: M('happy'), mv: 'squish' }];
  // the wheel keeps your favorites; anything you pick from the full list joins it
  let wheel = WHEEL_DEFAULT; try { const w0 = JSON.parse(localStorage.getItem('mochiboard:wheel') || 'null'); if (Array.isArray(w0) && w0.length === 8) wheel = w0; } catch (e) {}
  const stampHTML = st => st.src ? `<img src="${esc(st.src)}" alt="">` : esc(st.emoji);
  function renderWheel() {
    $('wsRing').innerHTML = wheel.map((st, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, x = 110 + Math.cos(a) * 76, y = 110 + Math.sin(a) * 76;
      return `<button data-w="${i}" class="${st.mv ? 'mv-' + st.mv : ''}" style="left:${x}px;top:${y}px">${stampHTML(st)}</button>`; }).join('');
  }
  function renderPick(tab = 'mochi') {
    $('stampPick').querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('spGrid').innerHTML = STAMPS[tab].map((st, i) => `<button data-p="${tab}:${i}" title="${esc(st.n)}" class="${st.mv ? 'mv-' + st.mv : ''}">${stampHTML(st)}</button>`).join('');
  }
  const pickStamp = st => { $('stampWheel').classList.remove('on'); $('stampPick').classList.remove('on'); startPlacing('stamp', { stamp: st }); $('tools').querySelector('[data-add="stamp"]').classList.add('on'); };
  $('wsRing').onclick = e => { const b = e.target.closest('[data-w]'); if (b) pickStamp(wheel[+b.dataset.w]); };
  $('wsMid').onclick = () => { $('stampWheel').classList.remove('on'); renderPick(); $('stampPick').classList.add('on'); };
  $('stampPick').onclick = e => {
    const t = e.target.closest('[data-tab]'); if (t) return renderPick(t.dataset.tab);
    const b = e.target.closest('[data-p]'); if (!b) return; const [tab, i] = b.dataset.p.split(':'), st = STAMPS[tab][+i], clean = { src: st.src, emoji: st.emoji, mv: st.mv };
    if (!wheel.some(w2 => w2.src === clean.src && w2.emoji === clean.emoji && w2.mv === clean.mv)) { wheel = [clean, ...wheel].slice(0, 8); try { localStorage.setItem('mochiboard:wheel', JSON.stringify(wheel)); } catch (e2) {} }
    pickStamp(clean);
  };
  ['stampWheel', 'stampPick'].forEach(id => $(id).addEventListener('pointerdown', e => e.stopPropagation()));
  function stampAt(w, st) {
    const c = card('stamp', { src: st.src, emoji: st.emoji, mv: st.mv, r: Math.round(Math.random() * 16 - 8) }); c.x = w.x - 28; c.y = w.y - 28;
    addCard(c);
    const r = stage.getBoundingClientRect(), b = document.createElement('div'); b.className = 'burst'; b.style.left = mouse.x - r.left + 'px'; b.style.top = mouse.y - r.top + 'px';
    b.innerHTML = [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<i style="--a:${a}deg"></i>`).join(''); stage.appendChild(b); setTimeout(() => b.remove(), 500);
  }

  // ---------- shapes: pick one from the little row, then place it ----------
  $('shapePick').onclick = e => { const b = e.target.closest('[data-shape]'); if (!b) return; startPlacing('shape', { shape: b.dataset.shape }); $('tools').querySelector('[data-add="shape"]').classList.add('on'); };

  // ---------- links: type or paste right into the card, then it fills in the site's name and picture ----------
  function wireLinkInput(c) {
    const el = cardsEl.querySelector(`[data-id="${c.id}"]`), inp = el?.querySelector('.link-in input'); if (!inp || inp.dataset.wired) return; inp.dataset.wired = 1;
    if (!c.loading) setTimeout(() => { inp.focus(); inp.select(); }, 20);
    inp.oninput = () => { c.draft = inp.value; };
    inp.onkeydown = async ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { inp.blur(); if (!inp.value.trim() && !c.title) { sel = new Set([c.id]); removeSelected(); } return; }
      if (ev.key !== 'Enter' || !inp.value.trim()) return;
      const u = inp.value.trim(), url = /^https?:/i.test(u) ? u : 'https://' + u;
      c.loading = true; renderCard(c); selectOnly([c.id]);
      let p = {}; try { p = await MB.linkPreview(url); } catch (e2) {}
      Object.assign(c, { url, title: p.title || host(url), desc: p.desc || host(url), image: p.image || '', loading: false, draft: '' });
      c.h = c.image ? 210 : 52; renderCard(c); selectOnly([c.id]); save();
    };
  }

  // ---------- docs: open beside the board (or full page); back is always one click ----------
  let docCard = null;
  function openDoc(c) {
    docCard = c; $('dvTitle').value = c.text || ''; $('dvBody').innerText = c.body || '';
    $('dvWhere').textContent = `${board.name} › ${c.text || 'Untitled'}`;
    $('docview').classList.add('on'); stage.classList.add('doc-open'); selectOnly([]);
    setTimeout(() => (c.text ? $('dvBody') : $('dvTitle')).focus(), 250);
  }
  function closeDoc() { if (!docCard) return; const c = docCard; docCard = null; $('docview').classList.remove('on', 'wide'); stage.classList.remove('doc-open'); document.activeElement.blur(); renderCard(c); selectOnly([c.id]); save(); }
  $('dvTitle').oninput = () => { if (!docCard) return; docCard.text = $('dvTitle').value; $('dvWhere').textContent = `${board.name} › ${docCard.text || 'Untitled'}`; renderCard(docCard); save(); };
  $('dvTitle').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('dvBody').focus(); } };
  $('dvBody').oninput = () => { if (!docCard) return; docCard.body = $('dvBody').innerText; save(); };
  $('dvBack').onclick = closeDoc; $('dvClose').onclick = closeDoc;
  $('dvWide').onclick = () => { const w = $('docview').classList.toggle('wide'); $('dvWide').textContent = w ? '⤡' : '⤢'; $('dvWide').title = w ? 'Half page' : 'Full page'; };

  // ---------- dropping cards into a doc: their words join the doc ----------
  const WORDY = ['note', 'todo', 'title', 'link', 'swatch', 'doc', 'shape'];
  function cardWords(c) {
    if (c.type === 'note') return [c.name, c.text].filter(x => (x || '').trim()).join('\n');
    if (c.type === 'todo') return [(c.text || '').trim(), ...(c.items || []).map(i => (i.done ? '☑ ' : '☐ ') + i.t)].filter(Boolean).join('\n');
    if (c.type === 'link') return [c.title, c.url].filter(Boolean).join('\n');
    if (c.type === 'swatch') return `${c.label || ''} ${c.hex.toUpperCase()}`.trim();
    if (c.type === 'doc') return [c.text, c.body].filter(x => (x || '').trim()).join('\n');
    return c.text || '';
  }
  // the open doc page, or a doc card on the board, under the pointer (only for cards that have words)
  function docTarget(e, w, moving) {
    const cs = moving.map(m => m.c || m); if (!cs.length || !cs.every(c => WORDY.includes(c.type))) return null;
    if (docCard && !cs.includes(docCard)) { const r = $('docview').getBoundingClientRect(); if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return 'page'; }
    return [...board.cards].reverse().find(c => c.type === 'doc' && !cs.includes(c) && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h) || null;
  }
  function dropIntoDoc(t, cs, e) {
    const doc = t === 'page' ? docCard : t, before = doc.body || '', words = cs.map(cardWords).filter(Boolean).join('\n\n');
    if (t === 'page') {
      // drop the words right where you let go on the page
      const body = $('dvBody'), r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (r && body.contains(r.startContainer)) { r.insertNode(document.createTextNode((r.startOffset ? '\n' : '') + words + '\n')); }
      else body.innerText = (body.innerText.trim() ? body.innerText.replace(/\s+$/, '') + '\n\n' : '') + words;
      doc.body = body.innerText;
    } else doc.body = (before.trim() ? before.replace(/\s+$/, '') + '\n\n' : '') + words;
    selectOnly(cs.map(c => c.id)); renderCard(doc); renderWires(); save();
    say(`Copied ${cs.length === 1 ? 'that' : cs.length + ' cards'} into “${doc.text || 'Untitled'}” ✦`, 6000, [{ label: 'Undo', run: () => {
      doc.body = before; if (docCard === doc) $('dvBody').innerText = before; renderCard(doc); save(); } }]);
  }

  // ---------- canvases: a board inside this board, like a folder you can open ----------
  async function openCanvas(c) {
    if (!c.board) { const child = newBoard(c.text || 'Untitled canvas'); child.parent = board.id; child.folder = board.folder || null; c.board = child.id; await MB.save(child); }
    board.view = view; await MB.save(board); miniCache.delete(c.board); await openBoard(c.board); fit(board.cards);
  }
  async function renameChild(c) { if (!c.board) return; const b = await MB.load(c.board); if (b && c.text && b.name !== c.text) { b.name = c.text; await MB.save(b); refreshBoards(); } }

  // ---------- colors name themselves (until you name one yourself) ----------
  const NAMED = { 'Black': '#000000', 'Charcoal': '#36454f', 'Slate': '#708090', 'Gray': '#808080', 'Silver': '#c0c0c0', 'Cloud': '#ecebef', 'White': '#ffffff', 'Ivory': '#fffff0', 'Cream': '#fff5c8', 'Butter': '#f3d96a', 'Lemon': '#fff44f', 'Gold': '#ffd700', 'Mustard': '#e1ad01', 'Amber': '#ffbf00', 'Tangerine': '#f28500', 'Orange': '#ff8c00', 'Peach': '#ffcba4', 'Apricot': '#fbceb1', 'Coral': '#ff7f50', 'Salmon': '#fa8072', 'Tomato': '#ff6347', 'Red': '#e0303a', 'Cherry': '#c2185b', 'Crimson': '#dc143c', 'Brick': '#b22222', 'Maroon': '#800000', 'Wine': '#722f37', 'Rose': '#ff66a3', 'Bubblegum': '#ff9ec4', 'Blush': '#ffd1dc', 'Pink': '#ffc0cb', 'Hot Pink': '#ff69b4', 'Magenta': '#ff00ff', 'Fuchsia': '#c154c1', 'Orchid': '#da70d6', 'Lilac': '#c8a2c8', 'Lavender': '#e6e6fa', 'Periwinkle': '#ccccff', 'Violet': '#8f00ff', 'Purple': '#800080', 'Plum': '#8e4585', 'Grape': '#6f2da8', 'Indigo': '#4b0082', 'Navy': '#000080', 'Midnight': '#191970', 'Royal Blue': '#4169e1', 'Cobalt': '#0047ab', 'Blue': '#1e6fff', 'Steel Blue': '#4682b4', 'Cornflower': '#6495ed', 'Sky': '#87ceeb', 'Baby Blue': '#bfdfff', 'Ice': '#dcedff', 'Powder': '#b0e0e6', 'Teal': '#008080', 'Turquoise': '#40e0d0', 'Aqua': '#00e5e5', 'Mint': '#98ff98', 'Seafoam': '#9fe2bf', 'Sage': '#9caf88', 'Pistachio': '#93c572', 'Lime': '#a4de02', 'Green': '#2e9e4f', 'Emerald': '#50c878', 'Forest': '#228b22', 'Olive': '#808000', 'Khaki': '#c3b091', 'Sand': '#e2c290', 'Tan': '#d2b48c', 'Camel': '#c19a6b', 'Caramel': '#af6f09', 'Brown': '#8b4513', 'Chocolate': '#5c3317', 'Espresso': '#3b2219' };
  function colorName(hex) {
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), [r, g, b] = rgb(hex); let best = 'Color', d = Infinity;
    for (const [n, h] of Object.entries(NAMED)) { const [r2, g2, b2] = rgb(h), rm = (r + r2) / 2, dd = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2; if (dd < d) { d = dd; best = n; } }
    return best;
  }

  // ---------- the dock swaps to tools for whatever is selected ----------
  const FILLABLE = ['note', 'todo', 'link'];
  function selCards() { return [...sel].map(byId).filter(Boolean); }
  const I = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    tag: I('<path d="M3.5 10.2V4.5a1 1 0 0 1 1-1h5.7l6.3 6.3a1 1 0 0 1 0 1.4l-5.3 5.3a1 1 0 0 1-1.4 0z"/><circle cx="7" cy="7" r="1.1"/>'),
    edit: I('<path d="M13.5 3.5l3 3L7 16H4v-3z"/>'),
    mochi: I('<path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"/><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
    del: I('<path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6"/>'),
    head: I('<rect x="3" y="3" width="14" height="4" rx="1.5"/><rect x="3" y="9.5" width="14" height="7.5" rx="1.5" stroke-dasharray="2 2"/>'),
    caption: I('<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M6 12.5h8"/>'),
    color: I('<path d="M10 3a7 7 0 1 0 0 14c1 0 1.6-.7 1.6-1.5 0-.9-.6-1.2-.6-2 0-.9.7-1.5 1.6-1.5H15a2 2 0 0 0 2-2C17 6 13.9 3 10 3z"/>'),
    name: I('<path d="M4 6V4.5h12V6M10 4.5v11M7.5 15.5h5"/>'),
    hex: I('<path d="M7 3.5l-1.5 13M14.5 3.5L13 16.5M3.5 7.5h13M3 12.5h13"/>'),
    open: I('<path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/>'),
    link: I('<path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-.9.9"/><path d="M11.5 8.5a3.2 3.2 0 0 0-4.5 0l-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/>'),
  };
  function placeSelbar() {
    const bar = $('selbar'), dock = $('dock'), cs = selCards();
    const show = cs.length && !homeAt && !stage.querySelector('.card.dragging') && !$('cpop').classList.contains('on');
    dock.classList.toggle('ctx', !!show); bar.classList.toggle('on', !!show); if (!show) { bar.dataset.key = ''; return; }
    const key = cs.map(c => c.id + c.color + c.head + c.tagText + c.hideName + c.hideHex + c.fill + c.url).join();
    if (bar.dataset.key === key) return; bar.dataset.key = key;
    const one = cs.length === 1 ? cs[0] : null, btn = (a, icon, tip, on) => `<button class="sb-ic ${on ? 'on' : ''}" data-sb="${a}" title="${tip}">${ICON[icon]}</button>`;
    let h = `<span class="sb-label">${one ? ({ note: 'Note', todo: 'Checklist', title: 'Title', image: 'Image', link: 'Link', swatch: 'Color', coll: 'Collection', doc: 'Doc', canvas: 'Canvas', shape: 'Shape', stamp: 'Stamp' }[one.type] || 'Card') : cs.length + ' selected'}</span>`;
    const fill = cs.filter(c => FILLABLE.includes(c.type));
    if (one?.type === 'coll') h += `<div class="sb-dots">${Object.keys(COLL).map(n => `<button data-cc="${n}" title="${n}" style="background:${COLL[n][0]}" class="${one.color === n ? 'on' : ''}"></button>`).join('')}</div><span class="sb-sep"></span>` + btn('head', 'head', one.head === false ? 'Show the header' : 'Hide the header', one.head !== false);
    else if (fill.length) h += `<div class="sb-dots">${COLOR_NAMES.map(n => `<button data-c="${n}" title="${n}" style="background:${COLORS[n]}" class="${fill.every(c => c.color === n) ? 'on' : ''}"></button>`).join('')}</div><span class="sb-sep"></span>`;
    if (one?.type === 'swatch') h += btn('pick', 'color', 'Change the color') + btn('hidename', 'name', one.hideName ? 'Show the name' : 'Hide the name', !one.hideName) + btn('hidehex', 'hex', one.hideHex ? 'Show the hex' : 'Hide the hex', !one.hideHex);
    if (one?.type === 'image') h += btn('tag', 'caption', one.tagText ? 'Remove the caption' : 'Add a caption', !!one.tagText);
    else if (one && !['coll', 'swatch', 'stamp'].includes(one.type)) h += btn('tag', 'tag', one.tagText ? 'Remove the label (double-click it to edit)' : 'Add a little label (like “step 1”)', !!one.tagText);
    if (one?.type === 'doc') h += btn('open', 'open', 'Open the doc');
    if (one?.type === 'canvas') h += btn('open', 'open', 'Open this canvas');
    if (one?.type === 'link' && one.url) h += btn('visit', 'open', 'Open the link') + btn('relink', 'link', 'Change the link');
    if (one?.type === 'shape') h += `<div class="sb-dots">${Object.keys(SHAPE_FILL).map(n => `<button data-sf="${n}" title="${n}" style="background:${SHAPE_FILL[n]}" class="${(one.fill || 'gray') === n ? 'on' : ''}"></button>`).join('')}</div><span class="sb-sep"></span>`;
    h += `<span class="sb-sep"></span>` + btn('mochi', 'mochi', 'Ask Mochi to change ' + (one ? 'this' : 'these')) + btn('del', 'del', 'Delete');
    bar.innerHTML = h;
  }
  (function tick() { placeSelbar(); requestAnimationFrame(tick); })();
  $('selbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('selbar').onclick = e => {
    const cs = selCards(), one = cs[0], dot = e.target.closest('[data-c]'), cdot = e.target.closest('[data-cc]'), a = e.target.closest('[data-sb]')?.dataset.sb;
    const redraw = () => { cs.forEach(c => renderCard(c)); selectOnly(cs.map(c => c.id)); $('selbar').dataset.key = ''; save(); };
    if (dot) { cs.filter(c => FILLABLE.includes(c.type)).forEach(c => c.color = dot.dataset.c); redraw(); }
    if (cdot) { one.color = cdot.dataset.cc; redraw(); }
    const sf = e.target.closest('[data-sf]'); if (sf) { one.fill = sf.dataset.sf; redraw(); }
    if (a === 'open') one.type === 'doc' ? openDoc(one) : openCanvas(one);
    if (a === 'visit') MB.openURL(one.url);
    if (a === 'relink') { one.draft = one.url; one.url = ''; one.image = ''; one.h = 52; redraw(); }
    if (a === 'head') { one.head = one.head === false ? true : false; redraw(); }
    if (a === 'hidename') { one.hideName = !one.hideName; redraw(); }
    if (a === 'hidehex') { one.hideHex = !one.hideHex; redraw(); }
    if (a === 'pick') openColor(one);
    if (a === 'tag') { if (one.tagText) { delete one.tagText; redraw(); } else editTag(one); }   // tap again to take the label off
    if (a === 'edit') startEdit(one.id);
    if (a === 'del') removeSelected();
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
    else if (colorCard.autoName !== false && from !== 'name') { colorCard.label = colorName(hex); colorCard.autoName = true; $('cpName').value = colorCard.label; }
    $('cpSave').textContent = named ? 'Update board color' : 'Save to board colors'; $('cpSave').classList.remove('saved-ok');
    renderCard(colorCard); selectOnly([colorCard.id]); if (from !== 'wheel') save();
  }
  $('cpHex').oninput = e => { const h = normHex(e.target.value); if (h) setColor(h, 'hex'); };
  $('cpName').oninput = e => { if (!colorCard) return; colorCard.autoName = false; colorCard.label = e.target.value; renderCard(colorCard); selectOnly([colorCard.id]); save(); };
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
