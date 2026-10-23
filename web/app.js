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
    const size = { note: [220, 140], title: [320, 50], image: [260, 220], link: [260, 210], todo: [240, 180], swatch: [120, 150], coll: [288, 200], doc: [240, 52], canvas: [260, 180], shape: [160, 160], stamp: [56, 56], audio: [290, 150], video: [360, 246], ink: [10, 10], frame: [393, 852], box: [160, 100], text: [220, 24], icon: [28, 28], font: [300, 210] }[type] || [220, 140];
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
  // folders can live inside other folders: f.parent is the folder it sits in (its project comes along with it)
  const hasParent = f => !!f.parent && folders.some(x => x.id === f.parent);
  const subFolders = fid => folders.filter(f => f.parent === fid);
  const foldersIn = pid => folders.filter(f => !hasParent(f) && (f.project || null) === pid && (pid === null || projects.some(p => p.id === pid)));
  const looseFolders = () => folders.filter(f => !hasParent(f) && (!f.project || !projects.some(p => p.id === f.project)));
  const folderChain = f => { const out = []; let x = f; while (x && out.length < 30) { out.unshift(x); x = folders.find(y => y.id === x.parent); } return out; };   // outermost first
  const holdsBoard = f => !!board && (boardsIn(f.id).some(b => b.id === board.id) || subFolders(f.id).some(holdsBoard));
  const boardsUnder = f => boardsIn(f.id).length + subFolders(f.id).reduce((n, x) => n + boardsUnder(x), 0);
  const setProject = (f, pid) => { f.project = pid; subFolders(f.id).forEach(x => setProject(x, pid)); };
  // move a folder into another folder, a project, or out to the top level (never into itself)
  function putFolder(fid, into, projectId = null) {
    const x = folders.find(y => y.id === fid); if (!x || (into && folderChain(into).includes(x))) return false;
    if (into) { x.parent = into.id; setProject(x, into.project || null); into.open = true; } else { delete x.parent; setProject(x, projectId); }
    return true;
  }
  const looseBoards = () => boardList.filter(b => (!b.folder || !folders.some(f => f.id === b.folder)) && topLevel(b));
  const tint = c => COLORS[c] && c !== 'white' ? `var(--${c === 'pink' ? 'pink' : c + '-deep'})` : 'var(--pink)';
  // moving a board into a folder (or out of one). A canvas that lived inside another board comes out on its own.
  async function moveBoard(id, folderId) {
    await unhook(id);
    if (board && board.id === id) { board.folder = folderId; delete board.parent; await MB.save(board); renderCrumbsSoon(); return; }
    const b = await MB.load(id); if (!b) return; b.folder = folderId; delete b.parent; await MB.save(b);
  }
  // ---------- canvases can go anywhere: inside another board (as a canvas card there), into a folder, or out on their own ----------
  const insideOf = (id, maybeAncestor) => { let b = boardList.find(x => x.id === id), n = 0; while (b && b.parent && n++ < 40) { if (b.parent === maybeAncestor) return true; b = boardList.find(x => x.id === b.parent); } return false; };
  async function editBoard(id, fn) {
    if (board && board.id === id) { fn(board); renderAll(); save(); return board; }
    const b = await MB.load(id); if (!b) return null; fn(b); await MB.save(b); return b;
  }
  // take a canvas's card off the board it sat inside
  async function unhook(id) {
    const kid = boardList.find(x => x.id === id) || (board && board.id === id ? board : null), p = kid && kid.parent; if (!p) return;
    await editBoard(p, pb => { const gone = new Set(pb.cards.filter(c => c.type === 'canvas' && c.board === id).map(c => c.id)); pb.cards = pb.cards.filter(c => !gone.has(c.id)); pb.links = (pb.links || []).filter(l => !gone.has(l.a) && !gone.has(l.b)); });
  }
  // put a board inside another one, as a canvas card (at a spot, or to the right of what's there)
  async function nestBoard(id, intoId, at) {
    if (id === intoId || insideOf(intoId, id)) { chirp("A board can't go inside itself ✦", 2500); return false; }
    const kid = boardList.find(x => x.id === id) || (board && board.id === id ? board : null); if (!kid || kid.parent === intoId) return false;
    const into = board && board.id === intoId ? board : await MB.load(intoId); if (!into) return false;
    await unhook(id);
    await editBoard(id, b => { b.parent = intoId; b.folder = into.folder || null; });
    await editBoard(intoId, pb => { const x = at ? at.x : pb.cards.length ? Math.max(...pb.cards.map(c => c.x + c.w)) + 60 : 0, y = at ? at.y : pb.cards.length ? Math.min(...pb.cards.map(c => c.y)) : 0; pb.cards.push(card('canvas', { x, y, text: kid.name, board: id })); });
    chirp(`Moved “${kid.name}” inside “${into.name}” ✦`, 3000); return true;
  }
  const renderCrumbsSoon = () => setTimeout(() => typeof renderCrumbs === 'function' && renderCrumbs(), 50);
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
    el.onblur = async () => { el.contentEditable = 'false'; const v = el.textContent.trim();
      // the list may have reloaded while you typed, so rename the current copy (found by id), not the one we started with
      const liveObj = [...projects, ...folders].find(x => x.id === obj.id) || obj; if (v) { liveObj.name = v; obj.name = v; }
      await (after ? after(v) : saveLib()); renamingNow = false; refreshBoards(); };
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
    if (kind === 'board') { const c = await copyBoard(obj.id, { name: obj.name + ' copy' }); await refreshBoards(); if (c) chirp(`Made “${c.name}” ✦`, 3500); return; }
    // copy a folder, the folders inside it and all their boards
    const copyFolder = async (f0, name, project, parent) => { const f = { id: uid(), name, project, open: true }; if (parent) f.parent = parent; folders.push(f); await saveLib();
      for (const b of boardsIn(f0.id)) await copyBoard(b.id, { folder: f.id });
      for (const x of subFolders(f0.id)) await copyFolder(x, x.name, project, f.id); };
    if (kind === 'folder') await copyFolder(obj, obj.name + ' copy', obj.project || null, obj.parent || null);
    if (kind === 'project') { const p = { id: uid(), name: obj.name + ' copy', color: obj.color, open: true }; projects.push(p); await saveLib();
      for (const f0 of foldersIn(obj.id)) await copyFolder(f0, f0.name, p.id, null); }
    await refreshBoards(); chirp(`Made “${obj.name} copy” ✦`, 3500);
  }
  async function destroy(kind, obj) {
    const all = f => [f, ...subFolders(f.id).flatMap(all)];   // a folder and every folder inside it
    const gone = kind === 'folder' ? all(obj) : kind === 'project' ? foldersIn(obj.id).flatMap(all) : [];
    const ids = kind === 'board' ? [obj.id] : gone.flatMap(f => boardsIn(f.id).map(b => b.id));
    for (const id of ids) await dropBoard(id);
    folders = folders.filter(f => !gone.includes(f));
    if (kind === 'project') projects = projects.filter(p => p !== obj);
    await saveLib(); await refreshBoards();
    if (board && ids.includes(board.id)) { let list = await MB.list(); if (!list.length) { const b = newBoard('My first board'); await MB.save(b); list = await MB.list(); } await openBoard(list[0].id); }
  }
  // Move to…: a little map of projects and folders; pick where it goes
  function moveMenu(m, kind, obj) {
    const here = kind === 'board' ? obj.folder || null : obj.parent ? 'f:' + obj.parent : obj.project || null, row = (id, label, depth, icon) =>
      `<button class="mv-row${id === here ? ' here' : ''}" data-to="${id ?? ''}" style="padding-left:${12 + depth * 16}px">${icon}<span>${esc(label)}</span>${id === here ? '<em>here</em>' : ''}</button>`;
    const FIC = '<i class="fic"></i>', PIC = c => `<i class="pic" style="background:${tint(c)}"></i>`;
    let h = `<div class="mv-head">Move “${esc(obj.name)}” to…</div><div class="mv-list">`;
    const tree = (f, d) => { if (kind === 'folder' && f.id === obj.id) return; h += row(kind === 'board' ? f.id : 'f:' + f.id, f.name, d, FIC); subFolders(f.id).forEach(x => tree(x, d + 1)); };
    if (kind === 'board') {
      projects.forEach(p => { h += `<div class="mv-group" style="padding-left:12px">${PIC(p.color)}<span>${esc(p.name)}</span></div>`; foldersIn(p.id).forEach(f => tree(f, 1)); if (!foldersIn(p.id).length) h += '<div class="mv-none">no folders yet</div>'; });
      looseFolders().forEach(f => tree(f, 0));
      h += row(null, 'Not in a folder', 0, '<i class="mv-dot"></i>');
    } else {
      projects.forEach(p => { h += row(p.id, p.name, 0, PIC(p.color)); foldersIn(p.id).forEach(f => tree(f, 1)); });
      looseFolders().forEach(f => tree(f, 0));
      h += row(null, 'Not in a project', 0, '<i class="mv-dot"></i>');
    }
    m.innerHTML = h + '</div>'; m.classList.add('mv');
    const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 10) m.style.top = Math.max(10, innerHeight - r.height - 10) + 'px';
    m.onclick = async ev => { const b = ev.target.closest('[data-to]'); if (!b) return; const to = b.dataset.to || null; m.remove(); if (to === here && !(kind === 'board' && obj.parent)) return;
      if (kind === 'board') { await moveBoard(obj.id, to); const f = folders.find(x => x.id === to); if (f) { f.open = true; const p = projects.find(x => x.id === f.project); if (p) p.open = true; } }
      else if (to && to.startsWith('f:')) { const into = folders.find(x => x.id === to.slice(2)); if (!putFolder(obj.id, into)) return chirp("A folder can't go inside itself ✦", 2500); }
      else { putFolder(obj.id, null, to); const p = projects.find(x => x.id === to); if (p) p.open = true; }
      await saveLib(); await refreshBoards(); const dest = folders.find(x => x.id === to || 'f:' + x.id === to) || projects.find(x => x.id === to); chirp(`Moved “${obj.name}” ${dest ? 'to “' + dest.name + '”' : kind === 'board' ? 'out of its folder' : 'out of its project'} ✦`, 3500); };
  }
  async function renameBoard(b, v) { if (!v) return; if (board && board.id === b.id) { board.name = v; $('boardName').value = v; save(); } else { const bb = await MB.load(b.id); if (bb) { bb.name = v; await MB.save(bb); } } }
  function rowMenu(e, kind, obj, nameEl) {
    e.preventDefault(); e.stopPropagation(); $('rowMenu')?.remove();
    const n = kind === 'board' ? 1 + boardList.filter(x => x.parent === obj.id).length : kind === 'folder' ? boardsUnder(obj) : foldersIn(obj.id).reduce((t, f) => t + boardsUnder(f), 0);
    const m = document.createElement('div'); m.id = 'rowMenu'; m.className = 'row-menu'; m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
    m.innerHTML = `${nameEl ? '<button data-m="ren">Rename</button>' : ''}${kind !== 'project' ? '<button data-m="move">Move to…</button>' : ''}${kind === 'board' && obj.parent ? '<button data-m="out">Make it its own board</button>' : ''}<button data-m="dup">Duplicate</button><span class="rm-sep"></span><button data-m="del" class="danger">Delete</button>`;
    document.body.appendChild(m);
    const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 10) m.style.top = innerHeight - r.height - 10 + 'px';
    m.onclick = async ev => {
      const a = ev.target.closest('[data-m]')?.dataset.m; if (!a) return;
      if (a === 'ren') { m.remove(); return inlineRename(nameEl, obj, kind === 'board' ? v => renameBoard(obj, v) : undefined); }
      if (a === 'dup') { m.remove(); return duplicate(kind, obj); }
      if (a === 'move') return moveMenu(m, kind, obj);
      if (a === 'out') { m.remove(); const pb = boardList.find(x => x.id === obj.parent); await moveBoard(obj.id, pb ? pb.folder || null : null); await refreshBoards(); return chirp(`“${obj.name}” is its own board now ✦`, 3000); }
      if (a === 'del') { // ask first: deleting can't be undone
        const what = kind === 'board' ? (n > 1 ? `and the ${n - 1} canvas${n > 2 ? 'es' : ''} inside it` : '') : n ? `and the ${n} board${n === 1 ? '' : 's'} inside it` : '';
        m.innerHTML = `<p>Delete “${esc(obj.name)}” ${what}? This can't be undone.</p><div><button data-m="yes" class="danger solid">Delete</button><button data-m="no">Cancel</button></div>`; return; }
      if (a === 'yes') { m.remove(); return destroy(kind, obj); }
      if (a === 'no') m.remove();
    };
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true));
  }

  // the little row buttons use the same line icons as the toolbar
  const FB = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const FBTN = { add: FB('<path d="M10 4.5v11M4.5 10h11"/>'), ren: FB('<path d="M13.5 3.5l3 3L8 15l-4 1 1-4z"/><path d="M11.5 5.5l3 3"/>'), del: FB('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>') };
  // the left box: a small tree (projects ▸ folders ▸ boards)
  function boardRow(b) {
    const r = document.createElement('div'); r.className = 'board-row' + (board && b.id === board.id ? ' on' : '');
    r.innerHTML = `<i style="background:${tint(b.color)}"></i><span></span>`; r.querySelector('span').textContent = b.name;
    // one click opens the board; a double-click renames it right here (so wait a beat to tell them apart)
    let tap = 0; const name = r.querySelector('span');
    r.onclick = () => { if (name.isContentEditable) return; clearTimeout(tap); tap = setTimeout(() => { closeHome(); openBoard(b.id); }, 230); };
    r.ondblclick = e => { e.stopPropagation(); clearTimeout(tap); inlineRename(name, b, v => renameBoard(b, v)); };
    const pen = document.createElement('button'); pen.className = 'f-btn'; pen.title = 'Rename'; pen.innerHTML = FBTN.ren; r.appendChild(pen);
    pen.onclick = e => { e.stopPropagation(); clearTimeout(tap); inlineRename(name, b, v => renameBoard(b, v)); };
    draggable(r, 'board', b.id); dropZone(r, 'board', id => nestBoard(id, b.id)); r.oncontextmenu = e => rowMenu(e, 'board', b, name);
    const kids = boardList.filter(x => x.parent === b.id); if (!kids.length) return r;
    const frag = document.createDocumentFragment(), sub = document.createElement('div'); sub.className = 'sub-boards';
    kids.forEach(k => sub.appendChild(boardRow(k))); frag.appendChild(r); frag.appendChild(sub); return frag;
  }
  function treeNode(obj, kind, count, kids, btns) {
    const wrap = document.createElement('div'); wrap.className = 'node ' + kind + (obj.open ? ' open' : '');
    wrap.innerHTML = `<div class="node-head"><span class="chev">▶</span><span class="${kind === 'project' ? 'pic' : 'fic'}"></span><span class="fname"></span><small>${count}</small>${btns.map(([a, t, s]) => `<button class="f-btn" data-a="${a}" title="${t}">${FBTN[a] || s}</button>`).join('')}</div><div class="node-body"></div>`;
    if (kind === 'project') wrap.querySelector('.pic').style.background = tint(obj.color);
    const name = wrap.querySelector('.fname'), body = wrap.querySelector('.node-body'); name.textContent = obj.name;
    kids.forEach(k => body.appendChild(k));
    if (!kids.length) body.innerHTML = `<div class="folder-empty">${kind === 'project' ? 'No folders yet' : 'Drag boards in here'}</div>`;
    name.ondblclick = e => { e.stopPropagation(); inlineRename(name, obj); };
    return { wrap, name };
  }
  function folderNode(f) {
    const inside = boardsIn(f.id), subs = subFolders(f.id); if (holdsBoard(f)) f.open = true;
    const { wrap, name } = treeNode(f, 'folder', inside.length + subs.length, [...subs.map(folderNode), ...inside.map(boardRow)], [['add', 'New board in this folder', '+'], ['ren', 'Rename', '✎']]);
    wrap.querySelector('.node-head').onclick = async e => {
      const a = e.target.closest('.f-btn')?.dataset.a;
      if (a === 'add') return newBoardIn(f.id);
      if (a === 'ren') return inlineRename(name, f);
      if (a === 'del') { for (const b of inside) await moveBoard(b.id, null); subs.forEach(x => { x.parent = f.parent; if (!x.parent) delete x.parent; }); folders = folders.filter(x => x !== f); await saveLib(); return refreshBoards(); }
      if (name.isContentEditable) return;
      f.open = !f.open; wrap.classList.toggle('open', f.open); saveLib();
    };
    draggable(wrap.querySelector('.node-head'), 'folder', f.id); wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'folder', f, name);
    dropZone(wrap.querySelector('.node-head'), 'board', id => moveBoard(id, f.id).then(() => { f.open = true; }));
    dropZone(wrap.querySelector('.node-head'), 'folder', id => { if (!putFolder(id, f)) chirp("A folder can't go inside itself ✦", 2500); });
    return wrap;
  }
  function projectNode(p) {
    const fs = foldersIn(p.id); if (fs.some(holdsBoard)) p.open = true;
    const { wrap, name } = treeNode(p, 'project', fs.length, fs.map(folderNode), [['add', 'New folder in this project', '+'], ['ren', 'Rename', '✎']]);
    wrap.querySelector('.node-head').onclick = async e => {
      const a = e.target.closest('.f-btn')?.dataset.a;
      if (a === 'add') { const f = makeFolder(uniqueName(folders, 'New folder'), p.id); p.open = true; await saveLib(); await refreshBoards(); return renameNewest('.node.folder', f); }
      if (a === 'ren') return inlineRename(name, p);
      if (a === 'del') { fs.forEach(f => f.project = null); projects = projects.filter(x => x !== p); await saveLib(); return refreshBoards(); }
      if (name.isContentEditable) return;
      p.open = !p.open; wrap.classList.toggle('open', p.open); saveLib();
    };
    wrap.querySelector('.node-head').oncontextmenu = e => rowMenu(e, 'project', p, name);
    dropZone(wrap.querySelector('.node-head'), 'folder', id => { putFolder(id, null, p.id); p.open = true; });
    return wrap;
  }
  const uniqueName = (arr, base) => { let n = base, k = 2; while (byName(arr, n)) n = base + ' ' + k++; return n; };
  function renameNewest(sel, obj) { const el = [...document.querySelectorAll(`#boards ${sel}`)].find(n => n.querySelector('.fname').textContent === obj.name); if (el) inlineRename(el.querySelector('.fname'), obj); }
  let renamingNow = false;
  async function refreshBoards() {
    if (document.querySelector('#boards [contenteditable="true"], .home [contenteditable="true"]')) { renamingNow = true; return; }   // don't redraw under someone typing a name
    await loadLib();
    const el = $('boards'); el.innerHTML = '';
    // inside a project (on Home or on one of its boards) the left box shows just that project; in All projects it shows everything
    const sf = homeAt ? (homeAt.level === 'folder' ? folders.find(x => x.id === homeAt.id) : null) : folders.find(x => x.id === board?.folder);
    const sp = homeAt?.level === 'project' ? projects.find(x => x.id === homeAt.id) : sf && projects.find(x => x.id === sf.project);
    const scoped = homeAt?.level !== 'all' && (sp || sf);
    $('treeLabel').textContent = scoped ? 'In this project' : 'Everything';
    if (scoped) { if (sp) { sp.open = true; el.appendChild(projectNode(sp)); } else { const top = folderChain(sf)[0]; top.open = true; el.appendChild(folderNode(top)); } $('homeBtn').classList.add('out'); renderCrumbs(); if (homeAt) renderHome(); return; }
    $('homeBtn').classList.remove('out');
    projects.forEach(p => el.appendChild(projectNode(p)));
    looseFolders().forEach(f => el.appendChild(folderNode(f)));
    const loose = document.createElement('div'); loose.className = 'loose-zone';
    looseBoards().forEach(b => loose.appendChild(boardRow(b)));
    el.appendChild(loose);
    dropZone(loose, 'board', id => moveBoard(id, null));
    dropZone(el, 'folder', id => putFolder(id, null, null));
    renderCrumbs(); if (homeAt) renderHome();
  }

  // a board added from outside the app (Claude Code, a copied file): show it right away, and say where it went if it isn't in view
  window.__boardsChanged = async () => {
    const before = new Set(boardList.map(b => b.id)); await refreshBoards();
    const here = where().p, fresh = boardList.filter(b => !before.has(b.id));
    for (const b of fresh) { const f = folders.find(x => x.id === b.folder), p = f && projects.find(x => x.id === f.project);
      if (p && here && p.id === here.id) say(`“${b.name}” just showed up in this project ✦`);
      else say(`“${b.name}” just showed up. You'll find it in ${p ? `your “${p.name}” project` : f ? `the “${f.name}” folder` : 'All projects'}.`); }
  };
  addEventListener('focus', () => { if (board && !document.querySelector('[contenteditable="true"]')) window.__boardsChanged(); });   // and check again whenever you come back to the app

  // ---------- home: zoom out to see every project, then a project's folders, then a folder's boards ----------
  let homeAt = null;   // null = closed, { level: 'all' } | { level: 'project', id } | { level: 'folder', id }
  const where = () => { const f = folders.find(x => x.id === board?.folder), p = f && projects.find(x => x.id === f.project); return { f, p }; };
  function renderCrumbs() {
    if (!board) return; const { f, p } = where(), el = $('crumbs');
    const chainF = f ? folderChain(f) : [];
    el.innerHTML = (p ? `<button data-go="project:${p.id}"></button>` : '') + chainF.map((x, i) => `${p || i ? '<i>/</i>' : ''}<button data-go="folder:${x.id}"></button>`).join('');
    const btns = [...el.querySelectorAll('button')]; if (p) { btns[0].textContent = p.name; btns[0].title = p.name; } chainF.forEach((x, i) => { const bt = btns[i + (p ? 1 : 0)]; bt.textContent = x.name; bt.title = x.name; });
    // inside a canvas: the boards it lives in, so you can climb back out
    const chain = []; let up = board.parent; while (up && chain.length < 4) { const pb = boardList.find(x => x.id === up); if (!pb) break; chain.unshift(pb); up = pb.parent; }
    chain.forEach(pb => { el.insertAdjacentHTML('beforeend', `${el.children.length ? '<i>/</i>' : ''}<button data-board="${pb.id}"></button>`); const bt = el.lastElementChild; bt.textContent = pb.name; bt.title = 'Back to ' + pb.name; });
  }
  $('crumbs').onclick = async e => { const pb = e.target.closest('[data-board]')?.dataset.board; if (pb) { board.view = view; await MB.save(board); return openBoard(pb); } const g = e.target.closest('[data-go]')?.dataset.go; if (g) openHome(g); };
  $('homeBtn').onclick = () => openHome('all');
  $('brand').onclick = () => openHome('all');
  $('homeBack').onclick = () => { if (!homeAt) return; const f = homeAt.level === 'folder' && folders.find(x => x.id === homeAt.id); openHome(f && hasParent(f) ? 'folder:' + f.parent : f && f.project && projects.some(p => p.id === f.project) ? 'project:' + f.project : 'all'); };
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
    t.innerHTML = `<div class="tile-art"></div><div class="tile-meta"><b></b><small>${sub}</small>${btns.map(([a, tt, s]) => `<button class="f-btn" data-a="${a}" title="${tt}">${FBTN[a] || s}</button>`).join('')}</div>`;
    t.querySelector('.tile-meta b').textContent = obj.name;
    t.onclick = e => { if (e.target.closest('.f-btn') || t.querySelector('.tile-meta b').isContentEditable) return; onOpen(); };
    return t;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function renderHome() {
    const { level, id } = homeAt, grid = $('homeGrid'), crumbs = $('homeCrumbs'); grid.innerHTML = ''; miniCache.clear();
    const p = level === 'project' ? projects.find(x => x.id === id) : level === 'folder' ? projects.find(x => x.id === folders.find(f => f.id === id)?.project) : null;
    const f = level === 'folder' ? folders.find(x => x.id === id) : null;
    if ((level === 'project' && !p) || (level === 'folder' && !f)) { homeAt = { level: 'all' }; return renderHome(); }
    const chainF = f ? folderChain(f) : [];
    crumbs.innerHTML = `<button data-go="all">All projects</button>` + (p ? `<i>/</i><button data-go="project:${p.id}"></button>` : '') + chainF.map(x => `<i>/</i><button data-go="folder:${x.id}"></button>`).join('');
    const cb = crumbs.querySelectorAll('button'); if (p) cb[1].textContent = p.name; chainF.forEach((x, i) => cb[i + (p ? 2 : 1)].textContent = x.name);
    $('home').classList.toggle('deep', level !== 'all');
    $('homeTitle').textContent = f ? f.name : p ? p.name : 'Your projects';
    $('homeSub').textContent = f ? [subFolders(f.id).length ? plural(subFolders(f.id).length, 'folder') : '', plural(boardsIn(f.id).length, 'board')].filter(Boolean).join(' · ') : p ? plural(foldersIn(p.id).length, 'folder') : 'Every project, with its folders and boards inside.';
    const add = (label, run) => { const a = document.createElement('button'); a.className = 'tile add'; a.innerHTML = `<span>+</span>${label}`; a.onclick = run; grid.appendChild(a); };
    const del = async (arr, obj, fix) => { fix(); if (arr === 'p') projects = projects.filter(x => x !== obj); else folders = folders.filter(x => x !== obj); await saveLib(); refreshBoards(); };
    const projectTile = pp => {
      const fs = foldersIn(pp.id), nb = fs.reduce((n, x) => n + boardsUnder(x), 0);
      const t = tile('project', pp, `${plural(fs.length, 'folder')} · ${plural(nb, 'board')}`, () => openHome('project:' + pp.id), [['ren', 'Rename', '✎']]);
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
      t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('.tile-meta b'), pp); t.oncontextmenu = e => rowMenu(e, 'project', pp, t.querySelector('.tile-meta b'));
      dropZone(t, 'folder', fid => putFolder(fid, null, pp.id));
      return t;
    };
    const folderTile = ff => {
      const bs = boardsIn(ff.id), ns = subFolders(ff.id).length, t = tile('folder', ff, [ns ? plural(ns, 'folder') : '', plural(bs.length, 'board')].filter(Boolean).join(' · '), () => openHome('folder:' + ff.id), [['ren', 'Rename', '✎']]);
      const art = t.querySelector('.tile-art'); art.innerHTML = '<div class="back"></div><div class="tab"></div><div class="peek"></div><div class="front"><span class="face"><b></b><i></i><b></b></span></div>';
      const shown = bs.slice(0, 3); art.querySelector('.peek').style.setProperty('--mid', (shown.length - 1) / 2);
      shown.forEach(async (b, i) => { const d = document.createElement('div'); d.className = 'paper'; d.style.setProperty('--i', i); d.style.zIndex = i === Math.floor((shown.length - 1) / 2) ? 3 : 1; d.innerHTML = await mini(b.id); art.querySelector('.peek').appendChild(d); });
      t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('.tile-meta b'), ff); t.oncontextmenu = e => rowMenu(e, 'folder', ff, t.querySelector('.tile-meta b'));
      draggable(t, 'folder', ff.id); dropZone(t, 'board', bid => moveBoard(bid, ff.id)); dropZone(t, 'folder', fid => { if (fid !== ff.id && !putFolder(fid, ff)) chirp("A folder can't go inside itself ✦", 2500); });
      return t;
    };
    const boardTile = b => {
      const t = tile('board', b, b.updated ? 'edited ' + ago(b.updated) : '', () => { closeHome(); openBoard(b.id); }, [['ren', 'Rename', '✎']]);
      t.querySelector('[data-a="ren"]').onclick = () => inlineRename(t.querySelector('.tile-meta b'), b, v => renameBoard(b, v));
      mini(b.id).then(svg => t.querySelector('.tile-art').innerHTML = svg || '<em>empty board</em>');
      draggable(t, 'board', b.id); dropZone(t, 'board', id => nestBoard(id, b.id)); t.oncontextmenu = e => rowMenu(e, 'board', b, t.querySelector('.tile-meta b')); return t;
    };
    const section = label => { const h = document.createElement('div'); h.className = 'home-sec'; h.textContent = label; grid.appendChild(h); };
    if (level === 'all') {
      projects.forEach(pp => grid.appendChild(projectTile(pp)));
      add('New project', async () => { const pp = makeProject(uniqueName(projects, 'New project')); await saveLib(); await refreshBoards(); const t = [...grid.querySelectorAll('.tile.project')].pop(); inlineRename(t.querySelector('.tile-meta b'), pp); });
      if (looseFolders().length) { section('Folders not in a project · drag onto a project to file'); looseFolders().forEach(ff => grid.appendChild(folderTile(ff))); }
      if (looseBoards().length) { section('Boards not in a folder'); looseBoards().forEach(b => grid.appendChild(boardTile(b))); }
    } else if (level === 'project') {
      foldersIn(p.id).forEach(ff => grid.appendChild(folderTile(ff)));
      add('New folder', async () => { const ff = makeFolder(uniqueName(folders, 'New folder'), p.id); await saveLib(); await refreshBoards(); const t = [...grid.querySelectorAll('.tile.folder')].pop(); inlineRename(t.querySelector('.tile-meta b'), ff); });
      if (looseBoards().length) { section('Boards not in a folder · drag onto a folder to file'); looseBoards().forEach(b => grid.appendChild(boardTile(b))); }
    } else {
      subFolders(f.id).forEach(ff => grid.appendChild(folderTile(ff)));
      boardsIn(f.id).forEach(b => grid.appendChild(boardTile(b)));
      add('New board', () => newBoardIn(f.id));
      add('New folder', async () => { const ff = makeFolder(uniqueName(folders, 'New folder'), f.project || null); ff.parent = f.id; await saveLib(); await refreshBoards(); const t = [...grid.querySelectorAll('.tile.folder')].pop(); if (t) inlineRename(t.querySelector('.tile-meta b'), ff); });
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
    // an edit still waiting to save belongs to the board you're leaving: save it first
    if (saveT && board) { clearTimeout(saveT); saveT = 0; board.view = view; await MB.save(board); }
    const b = await MB.load(id); if (!b) return;
    miniCache.clear(); board = b; if (chatOpen()) setTimeout(renderChat, 0); board.palette = board.palette || []; setTimeout(resetHistory, 0); view = Object.assign({ x: 160, y: 140, z: 1 }, b.view); sel.clear(); editing = null; focusSet = null; closeColor(); renderPalette();
    board.cards.forEach(c => { if (c.type === 'audio' && c.rec) { c.rec = false; c.paused = false; if (!c.src) c.txNote = 'This recording got interrupted. Tap Replace to record again.'; } });
    board.cards.forEach(c => { if (c.type === 'canvas' && c.board) { const kb = boardList.find(x => x.id === c.board); if (kb && kb.name !== c.text) c.text = kb.name; } });
    $('boardName').value = board.name; renderAll(); refreshBoards(); try { localStorage.setItem('mochiboard:last', id); } catch (e) {}
  }
  let saveT = 0;
  // ---------- undo / redo: a snapshot of the board after each change settles ----------
  let past = [], future = [], restoring = false, snapT = 0;
  const stateOf = () => JSON.stringify({ cards: board.cards, links: board.links, tray: board.tray, palette: board.palette });
  function remember() { if (restoring || !board) return; const st = stateOf(); if (past[past.length - 1] !== st) { past.push(st); if (past.length > 80) past.shift(); future = []; } }
  function resetHistory() { past = board ? [stateOf()] : []; future = []; }
  function travel(dir) {
    clearTimeout(snapT); remember();                          // catch the very latest change first
    const from = dir < 0 ? past : future, to = dir < 0 ? future : past;
    if (dir < 0 ? past.length < 2 : !future.length) return say(dir < 0 ? 'Nothing left to undo' : 'Nothing to redo', 1800);
    if (dir < 0) future.push(past.pop()); else past.push(future.pop());
    const st = JSON.parse(past[past.length - 1]); restoring = true;
    Object.assign(board, st); sel.clear(); selWire = null; endEdit(); renderAll(); renderPalette(); save(); restoring = false;
  }
  // every card keeps real numbers for its place and size (a bad one would break saving)
  function cleanNumbers() { board.cards.forEach(c => { ['x', 'y'].forEach(k => { if (!Number.isFinite(c[k])) c[k] = 0; }); ['w', 'h'].forEach(k => { if (!Number.isFinite(c[k]) || c[k] <= 0) c[k] = k === 'w' ? 200 : 100; }); ['r', 'rot'].forEach(k => { if (c[k] != null && !Number.isFinite(c[k])) c[k] = 0; }); }); }
  function save() {
    if (!drag && board) { layoutAll(); cleanNumbers(); }
    if (!restoring) { clearTimeout(snapT); snapT = setTimeout(remember, 350); }
    layersSoon(); $('saved').textContent = 'saving…'; clearTimeout(saveT);
    saveT = setTimeout(async () => { board.view = view; await MB.save(board); $('saved').textContent = 'saved'; refreshBoards(); }, 400);
  }

  // after Mochi works: glide to what she made (unless it's already in view) and let it glow for a moment
  function showWhatMochiMade(cs) {
    cs = [...new Set(cs)].filter(c => board.cards.includes(c)); if (!cs.length) return;
    const r = stage.getBoundingClientRect(), L = 270, ch = chatOpen() && $('mChat').getBoundingClientRect(), R = ch && ch.width ? Math.max(260, Math.min(r.right - ch.left + 30, r.width - L - 520)) : 260, a = toWorld(r.left + L, r.top + 60), b = toWorld(r.right - R, r.bottom - 110);
    const inView = cs.every(c => c.x >= a.x && c.y >= a.y && c.x + c.w <= b.x && c.y + c.h <= b.y) && view.z > .45;
    if (!inView) fit(cs, 140, 1);
    const glow = cs.filter(c => !WF.includes(c.type) || c.type === 'frame' || !c.onFrame);   // whole screens glow, not every word on them
    setTimeout(() => glow.forEach(c => { const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (!el) return; el.classList.remove('just-made'); void el.offsetWidth; el.classList.add('just-made'); setTimeout(() => el.classList.remove('just-made'), 1900); }), inView ? 0 : 450);
  }

  // ---------- the grid's shape: plain dots, or a tiny repeating shape in the dot color ----------
  const GRID_SHAPES = {
    dot: ['Dots', '<circle cx="13" cy="13" r="1.6"/>'],
    cross: ['Crosses', '<rect x="9.6" y="12.25" width="6.8" height="1.5" rx=".75"/><rect x="12.25" y="9.6" width="1.5" height="6.8" rx=".75"/>'],
    x: ['X marks', '<g transform="rotate(45 13 13)"><rect x="9.8" y="12.3" width="6.4" height="1.4" rx=".7"/><rect x="12.3" y="9.8" width="1.4" height="6.4" rx=".7"/></g>'],
    heart: ['Hearts', '<path d="M13 16.2c-.2 0-.4-.1-.5-.2-1.4-1.2-3.2-2.6-3.2-4.3 0-1.1.8-2 1.9-2 .8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1 1.1 0 1.9.9 1.9 2 0 1.7-1.8 3.1-3.2 4.3-.1.1-.3.2-.5.2z"/>'],
    tri: ['Triangles', '<path d="M13 10.3l3 5.2h-6z" stroke-linejoin="round"/>'],
    square: ['Squares', '<rect x="10.9" y="10.9" width="4.2" height="4.2" rx=".9"/>'],
    sparkle: ['Sparkles', '<path d="M13 9.4c.3 1.9 1.7 3.3 3.6 3.6-1.9.3-3.3 1.7-3.6 3.6-.3-1.9-1.7-3.3-3.6-3.6 1.9-.3 3.3-1.7 3.6-3.6z"/>'],
  };
  const gridMask = k => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="#000">${(GRID_SHAPES[k] || GRID_SHAPES.dot)[1]}</svg>`)}")`;
  function applyGridShape() {
    const k = GRID_SHAPES[settings.gridShape] ? settings.gridShape : 'dot', on = k !== 'dot';
    grid.classList.toggle('shaped', on); if (on) grid.style.setProperty('--gm', gridMask(k)); else grid.style.removeProperty('--gm');
    const box = $('gridShapes'); if (!box) return;
    if (!box.children.length) { box.innerHTML = Object.entries(GRID_SHAPES).map(([id, [name]]) => `<button type="button" data-gshape="${id}" title="${name}" aria-label="${name}"><i style="--gm:${gridMask(id).replace(/"/g, '&quot;')}"></i></button>`).join('');
      box.onclick = e => { const b = e.target.closest('[data-gshape]'); if (!b) return; settings.gridShape = b.dataset.gshape; if (!settings.grid) settings.grid = true; applySettings(); }; }
    box.querySelectorAll('[data-gshape]').forEach(b => b.classList.toggle('on', b.dataset.gshape === k));
    applyView();
  }

  // ---------- view ----------
  let movingT = 0;
  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    if (typeof rhEl !== 'undefined') rhEl.style.setProperty('--iz', (1 / view.z).toFixed(4));   // the resize corner stays the same size on screen at any zoom (set on it alone: on the whole board, Safari restyled every card each zoom step)
    stage.classList.toggle('far', view.z < .55); stage.classList.add('moving'); clearTimeout(movingT); movingT = setTimeout(() => stage.classList.remove('moving'), 180);
    let s = 26 * view.z; while (s < 20) s *= 2; while (s > 40) s /= 2;   // dots keep their size; zooming out skips every other dot instead of crowding them
    grid.style.backgroundSize = `${s}px ${s}px`; grid.style.backgroundPosition = `${view.x}px ${view.y}px`;
    if (grid.classList.contains('shaped')) { grid.style.webkitMaskSize = grid.style.maskSize = `${s}px ${s}px`; grid.style.webkitMaskPosition = grid.style.maskPosition = `${view.x}px ${view.y}px`; }
    $('zoom').textContent = Math.round(view.z * 100) + '%';
  }
  // ---------- the resize corner lives on its own layer above every card (like Figma), so a neighbor that overlaps can never hide it ----------
  const rh = document.createElement('div'); var rhEl = rh; rh.id = 'rh'; rh.setAttribute('aria-label', 'Resize'); world.appendChild(rh);
  let rhFor = null;
  function syncRH() {
    const ids = board ? [...sel] : [], c = ids.length === 1 ? byId(ids[0]) : null;
    const ok = c && !['ink'].includes(c.type) && editing !== c.id && !drawOn && !(drag && drag.mode === 'move') && !cropping;
    // a whole group selected (a button, an input…): one corner for the group
    const g = !c && ids.length > 1 && byId(ids[0])?.group, grp = g && ids.every(i => byId(i)?.group === g) && !drawOn && !(drag && drag.mode === 'move');
    if (grp) { const cs = ids.map(byId); rhFor = 'g:' + g; rh.classList.add('on'); rh.style.left = Math.max(...cs.map(k => k.x + k.w)) + 'px'; rh.style.top = Math.max(...cs.map(k => k.y + (k.type === 'title' ? (cardsEl.querySelector(`[data-id="${k.id}"]`)?.offsetHeight || k.h) : k.h))) + 'px'; requestAnimationFrame(syncRH); return; }
    rhFor = ok ? c.id : null; rh.classList.toggle('on', !!ok);
    if (ok) { const el = cardsEl.querySelector(`[data-id="${c.id}"]`); const h = c.type === 'title' && el ? el.offsetHeight : c.h;
      // follow the card's own turn (tilt, or a wireframe's rotation) so the corner sits exactly on it
      const deg = (c.rot || 0) + (document.body.classList.contains('neat') ? 0 : (c.r || 0)), a = deg * Math.PI / 180, cx = c.x + c.w / 2, cy = c.y + h / 2, dx = c.w / 2, dy = h / 2;
      rh.style.left = (cx + dx * Math.cos(a) - dy * Math.sin(a)) + 'px'; rh.style.top = (cy + dx * Math.sin(a) + dy * Math.cos(a)) + 'px'; }
    requestAnimationFrame(syncRH);
  }
  requestAnimationFrame(syncRH);   // starts after the rest of the app is set up
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
  function zoomAt(cx, cy, z) {
    const r = stage.getBoundingClientRect(), p = toWorld(cx, cy); view.z = clamp(z, .15, 3);
    view.x = cx - r.left - p.x * view.z; view.y = cy - r.top - p.y * view.z; applyView();
  }
  function fit(cards, pad = 120, maxZ = 1.4) {
    if (!cards.length) return; const r = stage.getBoundingClientRect();
    const x0 = Math.min(...cards.map(c => c.x)), y0 = Math.min(...cards.map(c => c.y)), x1 = Math.max(...cards.map(c => c.x + c.w)), y1 = Math.max(...cards.map(c => c.y + c.h));
    const ph = document.body.classList.contains('phone'), L = ph ? 0 : 270, ch = !ph && chatOpen() && $('mChat').getBoundingClientRect(), R = ph ? 0 : ch && ch.width ? Math.max(260, Math.min(r.right - ch.left + 30, r.width - L - 520)) : 260;   // a phone has no side panels to leave room for   // the open space between the left boxes and the tray (or Mochi's chat, when it's open)
    view.z = clamp(Math.min((r.width - L - R - pad) / (x1 - x0), (r.height - pad * 2) / (y1 - y0)), .2, maxZ);
    view.x = L + (r.width - L - R - (x1 - x0) * view.z) / 2 - x0 * view.z; view.y = (r.height - (ph ? 90 : 0) - (y1 - y0) * view.z) / 2 - y0 * view.z + (ph ? 20 : 0);
    world.style.transition = 'transform .5s cubic-bezier(.2,.8,.3,1)'; applyView(); setTimeout(() => world.style.transition = '', 520);
  }

  // ---------- rendering ----------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function inner(c) {
    switch (c.type) {
      case 'note': return `${c.mochi ? `<div class="nm-head"><img class="nmochi" src="stamps/mochi-wave.png" alt=""><div class="nname">${esc(c.name || '')}</div></div>` : c.name !== undefined ? `<div class="nname">${esc(c.name)}</div>` : ''}<div class="text">${esc(c.text)}</div>`;
      case 'doc': return `<div class="pill">${CIC.doc}<span class="text">${esc(c.text)}</span></div>`;
      case 'canvas': return `<div class="cv-head">${CIC.canvas}<span class="text">${esc(c.text)}</span></div><div class="cv-prev"><em>empty canvas</em></div>`;
      case 'shape': return shapeSVG(c) + `<div class="text">${esc(c.text || '')}</div>`;
      case 'stamp': return `<div class="st">${c.src ? `<img src="${esc(c.src)}" alt="">` : pxSrc(c.emoji || '⭐') ? `<img src="${pxSrc(c.emoji || '⭐')}" alt="">` : `<span>${esc(c.emoji || '⭐')}</span>`}</div>`;
      case 'video': {
        if (c.src) return `<div class="vd-stage"><video class="vd-v"></video><button class="vd-play" data-act="vd-play" aria-label="Play">${PLAY}</button></div><div class="vd-bar"><button class="vd-pp" data-act="vd-play" aria-label="Play or pause">${PLAY}</button><div class="vd-prog" data-act="vd-seek"><i></i></div><span class="vd-time">${fmtT(c.dur || 0)}</span><button class="vd-mute${c.muted ? ' off' : ''}" data-act="vd-mute" aria-label="Sound">${SPK}</button></div>`;
        if (c.saving) return `<div class="vd-stage"><div class="vd-msg"><b>Saving your video…</b><span>${Math.round((c.pct || 0) * 100)}%</span></div></div><div class="vd-bar"><span class="vd-title">${esc(c.title || 'Video')}</span></div>`;
        return `<div class="vd-stage live"><video class="vd-live"></video>${c.camErr ? `<div class="vd-msg"><b>${esc(c.camErr)}</b></div>` : c.camRest ? `<button class="vd-msg vd-wake" data-act="vd-wake"><b>Your camera is resting</b><span>Click to turn it on</span></button>` : ''}${c.count ? `<div class="vd-count">${c.count}</div>` : ''}${c.rec && !c.count ? `<div class="vd-recdot"><i></i><span class="vd-rtime">0:00</span></div>` : ''}${!c.rec && !c.camErr ? `<div class="vd-shape"><button data-act="vd-wide" class="${c.vert ? '' : 'on'}"><i class="w"></i>Wide</button><button data-act="vd-tall" class="${c.vert ? 'on' : ''}"><i class="t"></i>Phone</button></div>` : ''}</div>`
          + `<div class="vd-bar">${c.rec ? `<button class="vd-stop" data-act="vd-stop"><i></i>Stop</button>` : `<button class="vd-start" data-act="vd-start"><span class="au-rec"></span>${c.vert ? 'Record' : 'Start recording'}</button><button class="vd-file" data-act="vd-file" title="Use a video file">${c.vert ? '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 13.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5M10 3.5v9M6.5 7L10 3.5 13.5 7"/></svg>' : 'Use a video file'}</button>`}</div>`;
      }
      case 'audio': return c.ready && !c.rec && !c.src ? `<div class="au-top"><span class="au-mic">${MIC}</span><span class="text">${esc(c.title || 'Voice memo')}</span></div><button class="au-start" data-act="au-start"><span class="au-rec"></span>Start recording</button><div class="au-hint">Press when you’re ready. I’ll count you in ✦</div>`
        : c.rec ? `<div class="au-top"><span class="au-dot${c.count || c.starting ? ' wait' : ''}"></span><b>${c.count === 'connecting' ? 'Mochi is connecting to voice…' : c.count ? 'Start talking in…' : c.starting ? 'Starting…' : c.paused ? 'Paused' : 'Recording…'}</b><span class="au-time">0:00</span></div>${c.count || c.starting ? `<div class="au-count${typeof c.count === 'string' ? ' soft' : ''}">${c.count === 'connecting' ? '<i></i><i></i><i></i>' : c.count || ''}</div>` : '<canvas class="au-live" width="520" height="68"></canvas>'}<div class="au-acts"><button data-act="au-pause">${c.paused ? 'Resume' : 'Pause'}</button><button data-act="au-stop" class="solid">Stop</button></div>`
        : `<div class="au-top"><span class="text">${esc(c.title || 'Voice memo')}</span></div><div class="au-row"><button class="au-play" data-act="au-play">${PLAY}</button><div class="au-wave" data-act="au-seek">${(c.wave || Array(40).fill(.2)).map(v => `<i style="height:${Math.max(8, v * 100)}%"></i>`).join('')}</div><span class="au-time">${fmtT(c.dur || 0)}</span></div>`
          + `<div class="au-tx${c.text ? '' : ' wait'}">${c.text ? esc(c.text) : esc(c.txNote || 'Mochi is writing it out…')}</div><div class="au-acts"><button data-act="au-replace">Replace</button>${c.text ? '<button data-act="au-notes">✦ Turn into notes</button>' : ''}</div>`;
      case 'ink': return `<svg viewBox="0 0 ${c.ow} ${c.oh}" preserveAspectRatio="none">${inkPath(c.pts, c.pen, c.size, c.ink, true)}</svg>`;
      case 'frame': return `<div class="fr-body"></div><div class="fr-name">${esc(c.name || 'Screen')}</div>`;
      case 'box': return `<div class="bx"></div>${c.img && !c.src ? `<div class="bx-ph"><span class="mi">image</span><span class="bx-l">${esc(c.img)}</span></div>` : ''}`;
      case 'font': { const f = esc(c.font || 'DM Sans'); useFont(c.font); return `<div class="fs-aa" style="font-family:'${f}', system-ui">Aa</div><div class="fs-meta"><b>${f}</b><span class="fs-src">${onMac(c.font) ? 'On your Mac' : 'Google Fonts'}</span></div><div class="fs-sample text" style="font-family:'${f}', system-ui">${esc(c.text || 'The quick brown fox jumps over the lazy dog')}</div>`; }
      case 'icon': return `<span class="mi">${esc(c.name || 'star')}</span>`;
      case 'text': return `<div class="text tx">${esc(c.text || '')}</div>`;
      case 'coll': return `<div class="coll-head"><span class="text">${esc(c.text)}</span></div><div class="coll-frame"></div>${(c.kids || []).length ? '' : '<div class="coll-empty">Drop cards here</div>'}`;
      case 'title': return `<div class="text">${esc(c.text)}</div>`;
      case 'image': {
        // a crop shows a window onto the picture: the picture is scaled up and shifted so only the kept part shows
        const k = !c.cropEdit && c.crop, st = k ? `position:absolute;width:${100 / k.w}%;height:${100 / k.h}%;left:${-k.x / k.w * 100}%;top:${-k.y / k.h * 100}%;object-fit:fill;border-radius:0` : '';
        const ui = c.cropEdit && cropping ? `<div class="crop-ui"><div class="crop-box" style="left:${cropping.box.x * 100}%;top:${cropping.box.y * 100}%;width:${cropping.box.w * 100}%;height:${cropping.box.h * 100}%">${['nw', 'ne', 'sw', 'se'].map(h => `<i data-h="${h}"></i>`).join('')}</div></div>` : '';
        return `<div class="imgwrap"><img src="${esc(c.src)}" alt="" style="${st}">${ui}</div>${c.cropEdit ? '' : '<button class="chip" data-act="colors">pull colors ✦</button>'}`; }
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
    el.classList.toggle('ly-off', !!c.hidden); el.classList.toggle('ly-lock', !!c.locked);
    el.style.setProperty('--tilt', c.r + 'deg'); el.style.setProperty('--fill', COLORS[c.color] || '#fff'); el.classList.add('c-' + (COLORS[c.color] && c.color !== 'white' ? c.color : 'white'));
    if (c.type === 'swatch') el.style.setProperty('--hex', c.hex);
    el.style.setProperty('--fs', FS[c.fs] || 1);
    el.classList.toggle('has-font', !!c.font && SIZED.includes(c.type)); if (c.font && SIZED.includes(c.type)) { el.style.setProperty('--cf', `"${String(c.font).replace(/"/g, '')}"`); useFont(c.font); } else el.style.removeProperty('--cf');
    ['bold', 'italic', 'under', 'strike'].forEach(k => { el.classList.toggle('t-' + k, c[k] === true); el.classList.toggle('t-no' + k, c[k] === false); });
    if (c.type === 'doc') el.classList.toggle('has-body', !!(c.body || '').trim());
    if (c.type === 'audio') { el.classList.toggle('paused', !!c.paused); if (!c.rec) requestAnimationFrame(() => fitAudio(c, el)); }
    if (c.type === 'stamp') { el.style.setProperty('--sz', c.w + 'px'); if (c.mv) el.classList.add('mv-' + c.mv); }
    if (c.type === 'link') el.classList.toggle('compact', !c.url || !c.image);
    if (c.type === 'canvas' && c.board) mini(c.board).then(svg => { const p = el.querySelector('.cv-prev'); if (p && svg) p.innerHTML = svg; });
    if (c.type === 'link' && !c.url) setTimeout(() => wireLinkInput(c), 0);
    if (c.type === 'coll') { const t = COLL[c.color] || COLL.pink; el.style.setProperty('--chead', t[0]); el.style.setProperty('--cframe', t[1]); el.classList.toggle('nohead', c.head === false); el.style.height = c.h + 'px'; }
    else if (parentOf(c.id)) el.classList.add('inside');
    el.innerHTML = `<div class="frame"></div><div class="body">${inner(c)}</div>${c.tagText ? `<div class="tag">${esc(c.tagText)}</div>` : ''}<div class="knob"></div><div class="handle"></div>`;
    if (c.type === 'video') setupVideo(c, el);
    if (WF.includes(c.type)) styleWF(c, el);   // after the insides exist
    return el;
  }
  function renderAll() { wireLayers(); layersSoon(); applyColors(); cardsEl.innerHTML = ''; board.cards.filter(c => c.type === 'coll').forEach(c => renderCard(c)); board.cards.filter(c => c.type !== 'coll').forEach(c => renderCard(c)); layoutAll(); renderWires(); renderTray(); applyView(); }

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
    const named = SHAPE_FILL[c.fill || 'gray'], f = named ? `var(--sh-${c.fill || 'gray'})` : c.fill, P = { stroke: 'none', style: `fill:${f}` };
    const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
    const body = {
      rect: `<rect x="0" y="0" width="100" height="100" rx="10" ${attrs(P)}/>`,
      circle: `<ellipse cx="50" cy="50" rx="50" ry="50" ${attrs(P)}/>`,
      tri: `<path d="M50 2 L98 98 L2 98 Z" stroke-linejoin="round" ${attrs(P)}/>`,
      star: `<path d="M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z" ${attrs(P)}/>`,
      heart: `<path d="M50 92 C20 72 3 55 3 33 C3 15 17 4 31 4 C40 4 47 9 50 16 C53 9 60 4 69 4 C83 4 97 15 97 33 C97 55 80 72 50 92 Z" ${attrs(P)}/>`,
      line: `<line x1="0" y1="50" x2="100" y2="50" style="stroke:${(c.fill || 'gray') === 'gray' ? 'var(--pen-ink)' : f}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
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
    const el = cardsEl.querySelector(`[data-id="${s.id}"]`);
    // cards inside always sit on top of their collection (a card made before the collection would otherwise hide under it)
    if (el) { let after = el; s.kids.forEach(id => { const k = cardsEl.querySelector(`[data-id="${id}"]`); if (k && (k.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) { after.after(k); after = k; } }); }
    if (el) { Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' }); el.querySelector('.coll-empty')?.remove(); if (!s.kids.length) el.querySelector('.body').insertAdjacentHTML('beforeend', '<div class="coll-empty">Drop cards here</div>'); }
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

  // ---------- connectors: curved lines from edge to edge; select one to bend it, re-attach it, or restyle it ----------
  let selWire = null;
  const center = c => ({ x: c.x + c.w / 2, y: c.y + (c.type === 'title' ? 25 : c.h / 2) });
  function edgePoint(c, toward) {   // where the line from a card's center toward a point leaves the card
    const m = center(c), dx = toward.x - m.x, dy = toward.y - m.y, hw = c.w / 2 + 6, hh = (c.type === 'title' ? 25 : c.h / 2) + 6;
    const k = Math.min(Math.abs(dx) ? hw / Math.abs(dx) : Infinity, Math.abs(dy) ? hh / Math.abs(dy) : Infinity, 1);
    return { x: m.x + dx * k, y: m.y + dy * k };
  }
  function wireGeom(l, a, b) {
    const ca = center(a), cb = center(b), p0 = edgePoint(a, cb), p2 = edgePoint(b, ca);
    const dx = p2.x - p0.x, dy = p2.y - p0.y, len = Math.hypot(dx, dy) || 1, n = { x: -dy / len, y: dx / len }, mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const bend = l.bend ?? Math.min(80, len * .2);   // a gentle curve unless you've set your own
    const c1 = { x: mid.x + n.x * bend, y: mid.y + n.y * bend }, handle = { x: mid.x + n.x * bend / 2, y: mid.y + n.y * bend / 2 };
    return { p0, p2, c1, handle, mid, n };
  }
  function renderWires(live) {
    const O = 5000; let h = '';
    board.links.forEach(l => { const a = byId(l.a), b = byId(l.b); if (!a || !b) return; const g = wireGeom(l, a, b);
      const d = `M${g.p0.x + O} ${g.p0.y + O} Q${g.c1.x + O} ${g.c1.y + O} ${g.p2.x + O} ${g.p2.y + O}`, on = selWire === l.id;
      let arrow = '';
      if (l.arrow) { const ux = g.p2.x - g.c1.x, uy = g.p2.y - g.c1.y, ul = Math.hypot(ux, uy) || 1, ax = ux / ul, ay = uy / ul, tip = { x: g.p2.x + O, y: g.p2.y + O };
        arrow = `<path class="w-arrow${on ? ' on' : ''}" d="M${tip.x - ax * 11 - ay * 7} ${tip.y - ay * 11 + ax * 7} L${tip.x} ${tip.y} L${tip.x - ax * 11 + ay * 7} ${tip.y - ay * 11 - ax * 7}"/>`; }
      h += `<path class="w${l.dash ? ' dash' : ''}${on ? ' on' : ''}" d="${d}"/>${arrow}<path class="w-hit" data-wire="${l.id}" d="${d}"/>`;
      if (on) h += `<circle class="w-end" data-end="a" data-wire="${l.id}" cx="${g.p0.x + O}" cy="${g.p0.y + O}" r="6"/><circle class="w-end" data-end="b" data-wire="${l.id}" cx="${g.p2.x + O}" cy="${g.p2.y + O}" r="6"/><circle class="w-bend" data-wire="${l.id}" cx="${g.handle.x + O}" cy="${g.handle.y + O}" r="7"/>`;
    });
    if (live) { const a = live.a, b = live.b; h += `<path class="live" d="M${a.x + O} ${a.y + O} Q${(a.x + b.x) / 2 + O} ${(a.y + b.y) / 2 - 30 + O} ${b.x + O} ${b.y + O}"/>`; }
    wires.innerHTML = h;
  }
  const linkById = id => board.links.find(l => l.id === id);
  function selectWire(id) { selWire = id; if (id) selectOnly([]); renderWires(); }
  const byId = id => board.cards.find(c => c.id === id);
  function renderTray() {
    if (window.__phone?.on) setTimeout(window.__phone.count);
    const list = $('trayList'); list.innerHTML = ''; $('trayCount').textContent = board.tray.length;
    board.tray.forEach(c => { const d = document.createElement('div'); d.className = 'tray-item'; d.dataset.id = c.id; d.style.setProperty('--tilt', (c.r / 2) + 'deg');
      d.innerHTML = c.type === 'image' ? `<img src="${esc(c.src)}">` : esc(c.type === 'link' ? (c.title || c.url) : c.text); list.appendChild(d); });
  }
  function selectOnly(ids) { if (ids.length && selWire) { selWire = null; renderWires(); } sel = new Set(ids); LY.reveal = true; layersSoon(); board.cards.forEach(c => { const el = cardsEl.querySelector(`[data-id="${c.id}"]`); el && el.classList.toggle('sel', sel.has(c.id)); }); }

  // ---------- adding things ----------
  function addCard(c, pop = true) { board.cards.push(c); renderCard(c, pop); save(); return c; }
  // ---------- layers: every piece on the board, top of the stack first (like Figma). Frames and collections fold open, groups stay together ----------
  const LY = { open: new Set(), t: 0, drag: null };
  const LI = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const LICON = {
    note: LI('<path d="M4 3.5h12v8.5l-4 4.5H4z"/><path d="M12 16.5V12h4"/>'), todo: LI('<rect x="3.5" y="3.5" width="13" height="13" rx="3"/><path d="M7 10l2.2 2.2L13.5 8"/>'),
    title: LI('<path d="M4.5 5h11M10 5v11"/>'), text: LI('<path d="M5.5 6h9M10 6v9M8 15h4"/>'), image: LI('<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="M3.5 14.5l4-3.5 3 2.5 2.5-2 3.5 3"/>'),
    audio: LI('<rect x="7.5" y="2.5" width="5" height="9" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>'), ink: LI('<path d="M3 14c2.5-6 5-6 6-3s3.5 3 8-4"/>'),
    frame: LI('<path d="M6.5 3v14M13.5 3v14M3 6.5h14M3 13.5h14"/>'), box: LI('<rect x="3.5" y="5" width="13" height="10" rx="2"/>'), font: LI('<path d="M3 16l4.5-11L12 16M4.7 12h5.6M14.5 10.5v5.5M14.5 12.5a2.2 2.2 0 1 1 0 3"/>'),
    coll: LI('<rect x="3" y="3" width="14" height="4" rx="1.5"/><rect x="3" y="9" width="6" height="8" rx="1.5"/><rect x="11" y="9" width="6" height="5" rx="1.5"/>'),
    group: LI('<rect x="3" y="3" width="14" height="14" rx="3" stroke-dasharray="2.6 2.4"/><rect x="6.5" y="6.5" width="7" height="7" rx="1.5"/>'),
    shape: LI('<circle cx="8" cy="8" r="4.5"/><rect x="9" y="9" width="8" height="8" rx="1.5"/>'), icon: LI('<path d="M10 3l2 4.3 4.6.6-3.4 3.2.9 4.6L10 13.4l-4.1 2.3.9-4.6L3.4 7.9 8 7.3z"/>'),
  };
  const lyText = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const SHAPE_N = { rect: 'Rectangle', circle: 'Circle', tri: 'Triangle', star: 'Star', heart: 'Heart', line: 'Line' };
  function layerName(c) {
    if (c.ln) return c.ln;
    const t = {
      frame: c.name || 'Screen', coll: c.name || 'Collection', note: lyText(c.name) || lyText(c.text), text: lyText(c.text), title: lyText(c.text), todo: lyText(c.text) || lyText(c.items?.[0]?.t),
      image: c.tagText || 'Image', link: c.title || (c.url ? host(c.url) : 'Link'), doc: c.text || 'Doc', canvas: c.text || 'Canvas', swatch: c.label || (c.hex || '').toUpperCase(),
      shape: SHAPE_N[c.shape || 'rect'], stamp: 'Stamp', icon: c.name || 'Icon', audio: 'Voice memo', video: 'Video', ink: 'Drawing', box: c.img ? 'Image spot' : 'Box', font: c.font || 'DM Sans',
    }[c.type];
    return t || ({ note: 'Note', text: 'Text', title: 'Title', todo: 'Checklist' })[c.type] || c.type;
  }
  function layerIcon(c) {
    if (c.type === 'stamp') { const s = c.src || pxSrc(c.emoji || '⭐'); return s ? `<img src="${esc(s)}" alt="">` : `<span class="ly-emo">${esc(c.emoji || '⭐')}</span>`; }
    if (c.type === 'swatch') return `<i class="ly-sw" style="background:${esc(c.hex)}"></i>`;
    if (c.type === 'icon') return `<span class="mi">${esc(c.name || 'star')}</span>`;
    return toolIcon(c.type) || LICON[c.type] || CIC[c.type] || LICON.box;
  }
  // the very same icon as the button you made it with (the toolbar, or the wireframe panel), so a piece looks the same in both places
  const TOOL_OF = { ink: '[data-add="draw"]', frame: '[data-wf="frame"]', box: '[data-wf="box"]', icon: '[data-wf="icon"]', text: '[data-wf="text"]' }, toolIc = {};
  function toolIcon(type) {
    if (type in toolIc) return toolIc[type];
    const svg = document.querySelector(`${TOOL_OF[type] || `.tools [data-add="${type}"]`} svg`);
    if (!svg) return toolIc[type] = null; const k = svg.cloneNode(true); k.removeAttribute('width'); k.removeAttribute('height'); return toolIc[type] = k.outerHTML;   // only the outer size: the shapes inside keep theirs
  }
  // the tree: [{ key, ids, kind, c?, kids: [...] }], ordered top of the stack first (collections list their cards in reading order)
  function layerTree() {
    const z = new Map([...cardsEl.children].map((el, i) => [el.dataset.id, i])), zOf = n => Math.max(...n.ids.map(i => z.get(i) ?? -1));
    const inColl = new Set(board.cards.filter(c => c.type === 'coll').flatMap(c => c.kids || [])), frames = new Set(board.cards.filter(c => c.type === 'frame').map(c => c.id));
    const nodesFor = cards => {
      const groups = new Map(), out = [];
      cards.forEach(c => { if (c.group) { if (!groups.has(c.group)) { const g = { key: 'g:' + c.group, kind: 'group', ids: [], kids: [] }; groups.set(c.group, g); out.push(g); } groups.get(c.group).ids.push(c.id); groups.get(c.group).kids.push(nodeOf(c)); }
        else out.push(nodeOf(c)); });
      groups.forEach(g => g.kids.sort((a, b) => zOf(b) - zOf(a)));
      return out.sort((a, b) => zOf(b) - zOf(a));
    };
    const nodeOf = c => {
      const n = { key: c.id, kind: 'card', c, ids: [c.id], kids: [] };
      if (c.type === 'frame') n.kids = nodesFor(board.cards.filter(k => k.id !== c.id && k.type !== 'frame' && k.onFrame === c.id && !inColl.has(k.id)));
      if (c.type === 'coll') n.kids = (c.kids || []).map(byId).filter(Boolean).map(k => ({ key: k.id, kind: 'card', c: k, ids: [k.id], kids: [], inColl: c.id }));
      return n;
    };
    return nodesFor(board.cards.filter(c => !inColl.has(c.id) && !(c.onFrame && frames.has(c.onFrame) && c.type !== 'frame')));
  }
  // a group goes by its own name, or by the words inside it (a button reads "Get started"), so the list never fills up with "Group, Group, Group"
  const groupName = ids => { const cs = ids.map(byId).filter(Boolean); if (cs[0]?.gn) return cs[0].gn; const t = cs.filter(c => ['text', 'title', 'note'].includes(c.type)).map(c => lyText(c.text)).filter(Boolean)[0];
    return t || (cs.some(c => c.type === 'box' && c.img) ? 'Image spot' : 'Group'); };
  const lyAll = n => n.kind === 'group' ? n.ids : [...n.ids, ...n.kids.flatMap(lyAll)];
  function renderLayers() {
    const list = $('layers'); if (!list || !board) return;
    if (list.querySelector('[contenteditable="true"]')) return;   // never rebuild under someone renaming
    const tree = layerTree(); $('layerCount').textContent = board.cards.length || '';
    // open whatever holds the selection, so a picked piece is always visible in the list
    const walk = (ns, up) => ns.forEach(n => { if (n.ids.some(i => sel.has(i)) && !(n.kind === 'group' && n.ids.every(i => sel.has(i)))) up.forEach(k => LY.open.add(k)); walk(n.kids, [...up, n.key]); });
    walk(tree, []);
    const row = (n, depth) => {
      const c = n.c, kids = n.kids.length, open = LY.open.has(n.key), ids = lyAll(n), hidden = ids.length && ids.every(i => byId(i)?.hidden), locked = ids.length && ids.every(i => byId(i)?.locked);
      const name = n.kind === 'group' ? groupName(n.ids) : layerName(c), icon = n.kind === 'group' ? LICON.group : layerIcon(c);
      return `<div class="ly${n.ids.every(i => sel.has(i)) ? ' on' : ''}${hidden ? ' off' : ''}${locked ? ' lk' : ''}${c?.type === 'frame' || c?.type === 'coll' ? ' parent' : ''}" data-key="${esc(n.key)}" draggable="true" style="--d:${depth}">
        <button class="ly-tw${kids ? '' : ' none'}${open ? ' open' : ''}" tabindex="-1" aria-label="${open ? 'Close' : 'Open'}"><svg viewBox="0 0 10 10"><path d="M3.5 2l3 3-3 3"/></svg></button>
        <span class="ly-ic">${icon}</span><span class="ly-n">${esc(name)}</span>
        <button class="ly-b ly-lock" title="${locked ? 'Unlock' : 'Lock'}">${locked ? LI('<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>') : LI('<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 5.8-1"/>')}</button>
        <button class="ly-b ly-eye" title="${hidden ? 'Show' : 'Hide'}">${hidden ? LI('<path d="M3 3l14 14M8.3 5.2A8 8 0 0 1 10 5c4.5 0 7.5 5 7.5 5a14 14 0 0 1-2.2 2.8M12.1 14.7A6 6 0 0 1 10 15c-4.5 0-7.5-5-7.5-5a14 14 0 0 1 3-3.4"/>') : LI('<path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.3"/>')}</button>
      </div>` + (kids && open ? n.kids.map(k => row(k, depth + 1)).join('') : '');
    };
    const st = list.scrollTop;
    list.innerHTML = tree.length ? tree.map(n => row(n, 0)).join('') : '<div class="ly-empty">Nothing on this board yet. Everything you add shows up here.</div>';
    list.scrollTop = st; LY.tree = tree;
    const on = list.querySelector('.ly.on'); if (on && LY.reveal) { LY.reveal = false; const r = on.getBoundingClientRect(), lr = list.getBoundingClientRect(); if (r.top < lr.top || r.bottom > lr.bottom) on.scrollIntoView({ block: 'nearest' }); }
  }
  const layersSoon = () => { cancelAnimationFrame(LY.t); LY.t = requestAnimationFrame(renderLayers); };
  const lyFind = (key, ns = LY.tree || []) => { for (const n of ns) { if (n.key === key) return n; const f = lyFind(key, n.kids); if (f) return f; } return null; };
  const lyHL = (ids, on) => ids.forEach(i => cardsEl.querySelector(`[data-id="${i}"]`)?.classList.toggle('ly-hl', on));
  function wireLayers() {
    const list = $('layers'); if (!list || list.dataset.wired) return; list.dataset.wired = 1;
    list.addEventListener('pointerover', e => { const r = e.target.closest('.ly'); cardsEl.querySelectorAll('.ly-hl').forEach(el => el.classList.remove('ly-hl')); if (r) { const n = lyFind(r.dataset.key); n && lyHL(lyAll(n), true); } });
    list.addEventListener('pointerleave', () => cardsEl.querySelectorAll('.ly-hl').forEach(el => el.classList.remove('ly-hl')));
    list.addEventListener('click', e => {
      const r = e.target.closest('.ly'); if (!r) return; const n = lyFind(r.dataset.key); if (!n) return;
      if (e.target.closest('.ly-tw')) { LY.open.has(n.key) ? LY.open.delete(n.key) : LY.open.add(n.key); return renderLayers(); }
      if (e.target.closest('.ly-eye')) { remember(); const ids = lyAll(n), hide = !ids.every(i => byId(i)?.hidden); ids.forEach(i => { const c = byId(i); if (c) { c.hidden = hide || undefined; renderCard(c); } }); if (hide) selectOnly([...sel].filter(i => !ids.includes(i))); renderWires(); save(); return renderLayers(); }
      if (e.target.closest('.ly-lock')) { remember(); const ids = lyAll(n), lock = !ids.every(i => byId(i)?.locked); ids.forEach(i => { const c = byId(i); if (c) { c.locked = lock || undefined; renderCard(c); } }); if (lock) selectOnly([...sel].filter(i => !ids.includes(i))); save(); return renderLayers(); }
      if (n.ids.some(i => byId(i)?.hidden || byId(i)?.locked)) return;   // hidden or locked pieces can't be picked until they're shown/unlocked
      endEdit();
      if (e.shiftKey || e.metaKey || e.ctrlKey) { const all = n.ids.every(i => sel.has(i)); n.ids.forEach(i => all ? sel.delete(i) : sel.add(i)); selectOnly([...sel]); }
      else selectOnly(n.ids);
      lyBringIntoView(n.ids); lyFlash(lyAll(n)); renderLayers();
    });
    list.addEventListener('dblclick', e => {
      const r = e.target.closest('.ly'), nm = r?.querySelector('.ly-n'); if (!nm || e.target.closest('.ly-b, .ly-tw')) return; const n = lyFind(r.dataset.key); if (!n) return;
      nm.contentEditable = 'true'; nm.focus(); getSelection().selectAllChildren(nm); r.draggable = false;
      const done = ok => { nm.contentEditable = 'false'; r.draggable = true; const v = nm.textContent.trim(); nm.onblur = nm.onkeydown = null;
        if (ok) { remember(); if (n.kind === 'group') n.ids.forEach(i => { const c = byId(i); if (c) c.gn = v || undefined; });
          else { const c = n.c; if (c.type === 'frame' || c.type === 'coll') { c.name = v || c.name; renderCard(c); } else c.ln = v && v !== layerName({ ...c, ln: '' }) ? v : undefined; }   // frames and collections rename on the board too
          save(); }
        renderLayers(); };
      nm.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); done(true); } if (ev.key === 'Escape') done(false); };
      nm.onblur = () => done(true);
    });
    // drag rows to restack (or, inside a collection, to reorder its cards). Only between neighbors that share the same parent
    list.addEventListener('dragstart', e => { const r = e.target.closest('.ly'); if (!r) return; LY.drag = r.dataset.key; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch (er) {} });
    const parentKey = key => { const find = (ns, p) => { for (const n of ns) { if (n.key === key) return p; const f = find(n.kids, n.key); if (f !== undefined) return f; } return undefined; }; return find(LY.tree || [], ''); };
    list.addEventListener('dragover', e => { const r = e.target.closest('.ly'); list.querySelectorAll('.drop-a, .drop-b').forEach(x => x.classList.remove('drop-a', 'drop-b')); if (!r || !LY.drag || r.dataset.key === LY.drag || parentKey(r.dataset.key) !== parentKey(LY.drag)) return;
      e.preventDefault(); const b = r.getBoundingClientRect(); r.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-a' : 'drop-b'); });
    list.addEventListener('dragend', () => { LY.drag = null; list.querySelectorAll('.dragging, .drop-a, .drop-b').forEach(x => x.classList.remove('dragging', 'drop-a', 'drop-b')); });
    list.addEventListener('drop', e => {
      const r = e.target.closest('.drop-a, .drop-b'); if (!r || !LY.drag) return; e.preventDefault(); const above = r.classList.contains('drop-a');
      const mv = lyFind(LY.drag), tg = lyFind(r.dataset.key); if (!mv || !tg) return; remember();
      if (mv.inColl) { const co = byId(mv.inColl), k = (co.kids || []).filter(i => i !== mv.c.id), at = k.indexOf(tg.c.id); k.splice(above ? at : at + 1, 0, mv.c.id); co.kids = k; layoutAll(); }
      else { const ids = lyAll(mv), moving = board.cards.filter(c => ids.includes(c.id)), rest = board.cards.filter(c => !ids.includes(c.id)), tIdx = lyAll(tg).map(i => rest.findIndex(c => c.id === i)).filter(i => i >= 0);
        // the list is top-first, so "above" in the list means higher in the stack: after the target in the cards
        const at = above ? Math.max(...tIdx) + 1 : Math.min(...tIdx); rest.splice(at, 0, ...moving); board.cards = rest; renderAll(); }
      save(); renderLayers();
    });
  }
  // Mochi points it out: a soft pink glow pulses around the piece and she pops up on its corner with a wave, then both fade
  function lyFlash(ids) {
    const cs = ids.map(byId).filter(c => c && !c.hidden); if (!cs.length) return;
    world.querySelectorAll('.ly-flash').forEach(f => f.remove());
    const pad = 10 / view.z, x0 = Math.min(...cs.map(c => c.x)) - pad, y0 = Math.min(...cs.map(c => c.y)) - pad, x1 = Math.max(...cs.map(c => c.x + c.w)) + pad, y1 = Math.max(...cs.map(c => c.y + c.h)) + pad;
    const f = document.createElement('div'); f.className = 'ly-flash'; f.style.setProperty('--iz', (1 / view.z).toFixed(4));
    Object.assign(f.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
    f.innerHTML = '<i class="lf-ring"></i><i class="lf-ring two"></i><img class="lf-mochi" src="stamps/mochi-wave.png" alt=""><b class="lf-spark">✦</b>';
    world.appendChild(f); setTimeout(() => f.classList.add('out'), 1500); setTimeout(() => f.remove(), 1900);
  }
  function lyBringIntoView(ids) {
    const cs = ids.map(byId).filter(Boolean); if (!cs.length) return; const r = stage.getBoundingClientRect();
    const x0 = Math.min(...cs.map(c => c.x)), y0 = Math.min(...cs.map(c => c.y)), x1 = Math.max(...cs.map(c => c.x + c.w)), y1 = Math.max(...cs.map(c => c.y + c.h));
    const sx0 = x0 * view.z + view.x, sy0 = y0 * view.z + view.y, sx1 = x1 * view.z + view.x, sy1 = y1 * view.z + view.y;
    const L = document.body.classList.contains('phone') ? 0 : 270;   // the side panels' room (none on a phone)
    if (sx0 > L + 10 && sx1 < r.width - 40 && sy0 > 60 && sy1 < r.height - 100) return;   // already on screen
    const tx = L + (r.width - L) / 2 - (x0 + x1) / 2 * view.z, ty = r.height / 2 - (y0 + y1) / 2 * view.z, fx = view.x, fy = view.y, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - k, 3); view.x = fx + (tx - fx) * e; view.y = fy + (ty - fy) * e; applyView(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
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
  // GIFs (and animated WebPs) keep their own file so they still move; PNGs stay PNGs so see-through parts stay see-through
  const MOVING = ['image/gif', 'image/webp', 'image/apng'], MOVING_MAX = 12e6;
  function imageFromFile(file) {
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => {
      if (MOVING.includes(file.type) && file.size <= MOVING_MAX) return res({ src: fr.result, w: im.width, h: im.height });
      const k = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      if (MOVING.includes(file.type)) say('That one is too big to keep moving, so I kept a still of it.');
      const png = file.type === 'image/png' || file.type === 'image/svg+xml', out = png ? cv.toDataURL('image/png') : '';
      res({ src: png && out.length < 6e6 ? out : cv.toDataURL('image/jpeg', .86), w: cv.width, h: cv.height }); }; im.src = fr.result; }; fr.readAsDataURL(file); });
  }
  async function addImages(files, at, toTray) {
    files = [...files]; const vfs = files.filter(f => f.type.startsWith('video/')); files = files.filter(f => !f.type.startsWith('video/'));
    vfs.forEach((f, n) => addVideo(f, at ? { x: at.x + n * 30, y: at.y + n * 30 } : null));
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
    if (c.type === 'frame') return editField(el, el.querySelector('.fr-name'), v => c.name = v);
    if (c.type === 'font') return editField(el, el.querySelector('.fs-sample'), v => c.text = v);
    if ((c.type === 'doc' || c.type === 'canvas') && target && !target.closest('.text')) return c.type === 'doc' ? openDoc(c) : openCanvas(c);
    if (c.type === 'doc') return editField(el, el.querySelector('.text'), v => c.text = v);
    if (c.type === 'canvas') return editField(el, el.querySelector('.text'), v => c.text = v, () => renameChild(c));
    if (c.type === 'link' && !c.url) return wireLinkInput(c);
    if (c.type === 'audio') { if (target && target.closest('.au-tx') && c.text) return editField(el, el.querySelector('.au-tx'), v => c.text = v); return editField(el, el.querySelector('.au-top .text'), v => c.title = v); }
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
    if (e.target.closest('.tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home, .linkbox, .selbar, .dock, .docview, .shapepick, .tplpick')) return;
    const el = e.target.closest('.card'), w = toWorld(e.clientX, e.clientY);
    if (e.button === 2) return;   // right-click opens the menu, it doesn't drag
    if (board) { clearTimeout(snapT); remember(); }   // lock in the last change before a new one starts, so undo steps stay separate
    if (drawOn && e.button === 0 && !space) { e.preventDefault(); drawDown(e); return; }
    if (e.target.id === 'rh' && rhFor && rhFor.startsWith('g:') && e.button === 0) { const cs = board.cards.filter(c => c.group === rhFor.slice(2)), bx = Math.min(...cs.map(c => c.x)), by = Math.min(...cs.map(c => c.y));
      drag = { mode: 'gresize', sx: w.x, sy: w.y, bx, by, bw: Math.max(...cs.map(c => c.x + c.w)) - bx, bh: Math.max(...cs.map(c => c.y + c.h)) - by, items: cs.map(c => ({ c, x: c.x, y: c.y, w: c.w, h: c.h })) }; stage.setPointerCapture(e.pointerId); return; }
    if (e.target.id === 'rh' && rhFor && e.button === 0) { const c = byId(rhFor); if (c) { drag = { mode: 'resize', id: c.id, sx: w.x, sy: w.y, w0: c.w, h0: c.h }; stage.setPointerCapture(e.pointerId); return; } }
    if (cropping && e.target.closest('.crop-ui')) { e.preventDefault(); cropDown(e); return; }
    if (placing?.type === 'box' && e.button === 0) { e.preventDefault(); stopPlacing(); drag = { mode: 'drawbox', sx: w.x, sy: w.y }; stage.setPointerCapture(e.pointerId); return; }
    if (placing && e.button === 0) { e.preventDefault(); placeAt(w); return; }
    const wireEl = e.target.closest('[data-wire]');
    if (wireEl && !space) {
      const l = linkById(wireEl.dataset.wire); if (!l) return;
      if (wireEl.classList.contains('w-bend')) drag = { mode: 'bend', l };
      else if (wireEl.dataset.end) drag = { mode: 'rewire', l, end: wireEl.dataset.end };
      else { selectWire(l.id); return; }
      stage.setPointerCapture(e.pointerId); return;
    }
    if (selWire && !el) selectWire(null);
    if (space || e.button === 1) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }
    if (el) {
      const id = el.dataset.id, c = byId(id);
      if (editing === id && !e.target.closest('.handle, .knob')) return;      // clicking inside text you're editing
      if (e.target.closest('input[type=checkbox], .link-in input')) return;
      if (e.target.closest('[data-act]')) return;
      if (e.target.classList.contains('rot-h')) { drag = { mode: 'rotate', c, cx: c.x + c.w / 2, cy: c.y + c.h / 2 }; }
      else if (e.target.classList.contains('handle')) { drag = { mode: 'resize', id, sx: w.x, sy: w.y, w0: c.w, h0: c.h }; }
      else if (e.target.classList.contains('knob')) { drag = { mode: 'wire', id, a: { x: c.x + c.w, y: c.y + c.h / 2 } }; }
      else {
        endEdit();
        if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); selectOnly([...sel]); }
        else if (e.metaKey || e.ctrlKey) selectOnly([id]);   // ⌘-click reaches inside a group for just this piece
        else if (!sel.has(id)) selectOnly(groupOf(id));
        const ids = new Set(sel); [...sel].forEach(i => { const c = byId(i); if (c?.type === 'coll') (c.kids || []).forEach(k => ids.add(k)); if (c?.type === 'frame') onFrame(c).forEach(k => ids.add(k.id)); });
        drag = { mode: 'move', sx: w.x, sy: w.y, start: [...ids].map(i => byId(i)).filter(Boolean).map(c => ({ c, x: c.x, y: c.y })), moved: false };
      }
      stage.setPointerCapture(e.pointerId); return;
    }
    endEdit();
    if (!e.shiftKey) selectOnly([]);
    if (e.pointerType === 'touch') { if (!e.shiftKey) selectOnly([]); drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); stage.setPointerCapture(e.pointerId); return; }   // a finger on empty board moves the board
    drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base: new Set(sel) }; stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return; const w = toWorld(e.clientX, e.clientY);
    if (drag.mode === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); }
    if (drag.mode === 'move') {
      let dx = w.x - drag.sx, dy = w.y - drag.sy; if (Math.hypot(dx, dy) > 2) drag.moved = true;
      const sn = snapWF(drag.start, dx, dy); dx = sn.dx; dy = sn.dy;
      // move on the GPU: the card is lifted as an already-drawn picture and slid with a transform, so the wobbly-edge filter isn't redrawn every frame (Safari is slow at that)
      drag.start.forEach(s => { s.c.x = s.x + dx; s.c.y = s.y + dy; const el = s.el || (s.el = cardsEl.querySelector(`[data-id="${s.c.id}"]`)); if (!el) return;
        if (!s.lifted) { s.lifted = true; el.style.willChange = 'transform'; el.classList.add('dragging'); stage.classList.add('dragging-cards'); }
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; });
      renderWires();
      $('tray').classList.toggle('drop', overTray(e));
      const loose = drag.start.filter(s => s.c.type !== 'coll'), skip = new Set(drag.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      const dt = loose.length && !skip.size && docTarget(e, w, loose); $('docview').classList.toggle('drop', dt === 'page');
      if (dt && dt !== 'page') { cardsEl.querySelector(`[data-id="${dt.id}"]`)?.classList.add('drop-in'); }
      else if (loose.length && !skip.size) { const t = collAt(w, skip); if (t) cardsEl.querySelector(`[data-id="${t.s.id}"]`)?.classList.add(t.side ? 'drop-col' : 'drop-in'); }
    }
    if (drag.mode === 'resize' && byId(drag.id).type === 'coll') { const c = byId(drag.id); c.cols = Math.max(1, Math.round((drag.w0 + w.x - drag.sx - CPAD * 2 + CGAP) / (CW + CGAP))); layoutColl(c); renderWires(); return; }
    if (drag.mode === 'resize' && ['stamp', 'icon'].includes(byId(drag.id).type)) { const c = byId(drag.id); c.w = c.h = clamp(drag.w0 + Math.max(w.x - drag.sx, w.y - drag.sy), 24, 400); const el = cardsEl.querySelector(`[data-id="${c.id}"]`); Object.assign(el.style, { width: c.w + 'px', height: c.h + 'px' }); el.style.setProperty('--sz', c.w + 'px'); return; }
    if (drag.mode === 'resize') { const c = byId(drag.id); c.w = Math.max(80, drag.w0 + w.x - drag.sx); c.h = Math.max(50, drag.h0 + w.y - drag.sy); const el = cardsEl.querySelector(`[data-id="${c.id}"]`); el.style.width = c.w + 'px'; if (c.type !== 'title') el.style.height = c.h + 'px'; renderWires(); }
    if (drag.mode === 'gresize') { const d = drag, nw = Math.max(24, d.bw + w.x - d.sx), nh = Math.max(14, d.bh + w.y - d.sy), kx = nw / d.bw, ky = nh / d.bh;
      d.items.forEach(it => { const c = it.c, txt = c.type === 'text';   // text keeps its height and stays centered where it was, so a label sits in the middle of its button
        c.x = d.bx + (it.x - d.bx) * kx; c.w = Math.max(8, it.w * kx); c.h = txt ? it.h : Math.max(8, it.h * ky); c.y = txt ? d.by + (it.y + it.h / 2 - d.by) * ky - it.h / 2 : d.by + (it.y - d.by) * ky;
        const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.type === 'title' ? 'auto' : c.h + 'px' }); });
      renderWires(); }
    if (drag.mode === 'wire') { drag.b = w; renderWires({ a: drag.a, b: w }); }
    if (drag.mode === 'rotate') { let a = Math.atan2(w.y - drag.cy, w.x - drag.cx) * 180 / Math.PI + 90; a = ((a % 360) + 360) % 360; if (a > 180) a -= 360;
      const near = Math.round(a / 15) * 15; if (Math.abs(a - near) < 4) a = near;   // eases onto 15° steps
      drag.c.rot = Math.round(a); cardsEl.querySelector(`[data-id="${drag.c.id}"]`)?.style.setProperty('--rot', drag.c.rot + 'deg'); syncDesign(); }
    if (drag.mode === 'drawbox') { let r = drag.rect; if (!r) { r = drag.rect = document.createElement('div'); r.className = 'draw-rect'; world.appendChild(r); }
      const x = Math.min(drag.sx, w.x), y = Math.min(drag.sy, w.y); Object.assign(r.style, { left: x + 'px', top: y + 'px', width: Math.abs(w.x - drag.sx) + 'px', height: Math.abs(w.y - drag.sy) + 'px' }); }
    if (drag.mode === 'bend') { const a = byId(drag.l.a), b = byId(drag.l.b); if (a && b) { drag.l.bend = 0; const g = wireGeom(drag.l, a, b), bend = 2 * ((w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y);
      drag.l.bend = Math.abs(bend) < 12 ? 0 : Math.round(bend); renderWires(); } }   // pull it flat and it snaps straight
    if (drag.mode === 'rewire') { const keep = byId(drag.end === 'a' ? drag.l.b : drag.l.a); if (keep) renderWires({ a: center(keep), b: w }); }
    if (drag.mode === 'marquee') {
      const m = $('marquee'), r = stage.getBoundingClientRect(), x0 = Math.min(drag.sx, e.clientX), y0 = Math.min(drag.sy, e.clientY), x1 = Math.max(drag.sx, e.clientX), y1 = Math.max(drag.sy, e.clientY);
      Object.assign(m.style, { display: 'block', left: x0 - r.left + 'px', top: y0 - r.top + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
      const a = toWorld(x0, y0), b = toWorld(x1, y1), hit = board.cards.filter(c => !c.hidden && !c.locked && c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y).flatMap(c => groupOf(c.id));
      selectOnly([...new Set([...drag.base, ...hit])]);
    }
  });
  const overTray = e => { const r = $('tray').getBoundingClientRect(); return e.clientX > r.left && e.clientY > r.top && e.clientY < r.bottom && !$('tray').classList.contains('closed'); };
  stage.addEventListener('pointerup', e => {
    if (!drag) return; const d = drag; drag = null; stage.classList.remove('panning'); $('guides').innerHTML = ''; $('marquee').style.display = 'none'; $('tray').classList.remove('drop');
    if (d.mode === 'move') {
      stage.classList.remove('dragging-cards');
      // set it down: the transform becomes its real position again
      d.start.forEach(s => { const el = s.el || cardsEl.querySelector(`[data-id="${s.c.id}"]`); if (!el) return; el.style.left = s.c.x + 'px'; el.style.top = s.c.y + 'px'; el.style.transform = ''; el.style.willChange = ''; el.classList.remove('dragging'); });
      if (d.moved && overTray(e)) {                       // dropped on the tray: back to Unsorted
        d.start.forEach(s => { board.cards = board.cards.filter(c => c !== s.c); board.links = board.links.filter(l => l.a !== s.c.id && l.b !== s.c.id); board.tray.unshift(s.c); cardsEl.querySelector(`[data-id="${s.c.id}"]`)?.remove(); });
        sel.clear(); renderTray(); renderWires(); save(); return;
      }
      cardsEl.querySelectorAll('.drop-in, .drop-col').forEach(n => n.classList.remove('drop-in', 'drop-col'));
      if (d.moved) {
        if (settings.snap) { const lead = d.start[0].c, dx = snapTo(lead.x) - lead.x, dy = snapTo(lead.y) - lead.y; d.start.forEach(s2 => { s2.c.x += dx; s2.c.y += dy; renderCard(s2.c); }); }   // snap the group together, keeping its shape
        const w = toWorld(e.clientX, e.clientY), skip = new Set(d.start.filter(s => s.c.type === 'coll').map(s => s.c.id));
        const dt = !skip.size && docTarget(e, w, d.start); $('docview').classList.remove('drop');
        if (dt) { d.start.forEach(s2 => { s2.c.x = s2.x; s2.c.y = s2.y; renderCard(s2.c); }); dropIntoDoc(dt, d.start.map(s2 => s2.c), e); return; }   // the card slides home; its words go into the doc
        if (!skip.size) {
          const ids = d.start.map(s => s.c.id), t = collAt(w, skip);
          if (t) dropInto(t, ids, w);
          else ids.forEach(id => { const from = parentOf(id); if (from) { from.kids = from.kids.filter(k => k !== id); const el = cardsEl.querySelector(`[data-id="${id}"]`); el?.classList.remove('inside'); byId(id).r = tilt(); renderCard(byId(id)); } });
        }
        if (!skip.size) fileIntoFrame(d.start.map(s2 => s2.c).filter(c => c.type !== 'frame' && !parentOf(c.id)));
        save(); renderWires();
      }
      else if (d.start.length === 1 && d.start[0].c.type === 'swatch') openColor(d.start[0].c);
      else {   // our own double-click check (pointer events don't count clicks everywhere), on whatever is really under the pointer
        const now = Date.now(), id = d.start[0].c.id, under = document.elementFromPoint(e.clientX, e.clientY);
        if (under && under.matches('.card.todo li span') && !under.isContentEditable) { lastTap = {}; startEdit(id, under); return; }   // list items edit with one click
        const pid = under?.closest('.card')?.dataset.id || id;
        if (lastTap.id === pid && now - lastTap.t < 420) { lastTap = {};
          if (sel.size > 1 && byId(pid)?.group && sel.has(pid)) { selectOnly([pid]); if (['text', 'note', 'title', 'todo'].includes(byId(pid).type)) startEdit(pid, under); return; }   // into the group: just this piece
          startEdit(pid, under); } else lastTap = { id: pid, t: now };
      }
    }
    if (d.mode === 'resize') save();
    if (d.mode === 'gresize') { d.items.forEach(it => renderCard(it.c)); selectOnly(d.items.map(it => it.c.id)); save(); }
    if (d.mode === 'bend') save();
    if (d.mode === 'rotate') { save(); $('selbar').dataset.key = ''; }
    if (d.mode === 'drawbox') { d.rect?.remove(); const w = toWorld(e.clientX, e.clientY); let x = Math.min(d.sx, w.x), y = Math.min(d.sy, w.y), bw = Math.abs(w.x - d.sx), bh = Math.abs(w.y - d.sy);
      if (bw < 6 && bh < 6) { bw = 160; bh = 100; }   // a click makes a standard box
      const c = card('box', { x, y, w: Math.round(bw), h: Math.round(bh), r: 0, fill: '#e4e4e7', radius: 6 }); addCard(c); fileIntoFrame([c]); pickWF(null); selectOnly([c.id]); save(); }
    if (d.mode === 'rewire') {
      const w = toWorld(e.clientX, e.clientY), other = d.end === 'a' ? d.l.b : d.l.a, t = [...board.cards].reverse().find(c => c.id !== other && c.type !== 'coll' && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h);
      if (t) { d.l[d.end] = t.id; save(); } renderWires();
    }
    if (d.mode === 'wire') {
      const w = toWorld(e.clientX, e.clientY), t = [...board.cards].reverse().find(c => c.id !== d.id && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h);
      if (t && !board.links.some(l => (l.a === d.id && l.b === t.id) || (l.b === d.id && l.a === t.id))) { board.links.push({ id: uid(), a: d.id, b: t.id }); save(); }
      renderWires();
    }
  });
  stage.addEventListener('dblclick', e => {
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest('.card, .selbar')) return;
    if (e.target.closest('.card, .tools, .tray, .mochi, .top, .capture, .side, .keys, .cpop, .home, .linkbox, .selbar, .docview, .hub, .sheet')) return;
    const w = toWorld(e.clientX, e.clientY), c = card('note', { color: newNoteColor() }); c.x = snapTo(w.x - c.w / 2); c.y = snapTo(w.y - c.h / 2); addCard(c); selectOnly([c.id]); startEdit(c.id);
  });
  // card buttons: pull colours, checklist items
  cardsEl.addEventListener('click', e => {
    const el = e.target.closest('.card'); if (!el) return; const c = byId(el.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
    if (act && act.startsWith('vd-')) return videoAct(c, act, e);
    if (act && act.startsWith('au-')) return audioAct(c, act, e);
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
    if (e.target.closest('.tray, .m-bubble, .cpop, .home, .m-chat, .design, .side, .row-menu, .stamp-pick, .wheel-stamps, .docview, .settings, .shapepick, .tplpick')) return; e.preventDefault();
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

  // no Mac beep: keys pressed on the board (not while typing) are Mochiboard's own, so tell macOS they were handled.
  // Otherwise Delete, Escape, arrows and the letter shortcuts fall through to the window, and macOS beeps.
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === ' ' && e.target.closest?.('button, a, [role="button"]')) return;   // Space still presses a focused button
    if (/^(Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(e.key) || e.key.length === 1) e.preventDefault();
  });

  // ---------- quick capture (⌘K) ----------
  const capture = on => { $('capture').classList.toggle('on', on); if (on) { $('capInput').value = ''; $('capInput').focus(); } else $('capInput').blur(); };
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

  // ---------- your toolbar: pick which tools show at the bottom and in what order (shortcuts keep working for hidden ones) ----------
  const TB_DEFAULT = [...$('tools').querySelectorAll(':scope > [data-add]')].map(b => b.dataset.add);
  const tbName = b => (b.dataset.tip || b.getAttribute('aria-label') || '').split('·')[0].trim();
  function applyToolbar() {
    const box = $('tools'), cfg = settings.toolbar || {}, hidden = new Set(cfg.hidden || []);
    const order = (cfg.order || []).filter(k => TB_DEFAULT.includes(k)); TB_DEFAULT.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });   // tools added in a later version slot in where they belong
    const end = $('zoom'); order.forEach(k => { const b = box.querySelector(`:scope > [data-add="${k}"]`); if (b) { box.insertBefore(b, end); b.hidden = hidden.has(k); } });
    return order;
  }
  function toolbarEditor() {
    let p = $('tbEdit'); if (p && !p.hidden) { p.hidden = true; return; }
    if (placing) stopPlacing(); if (sel.size) selectOnly([]); if (drawOn) exitDraw();   // the tools have to be showing to edit them
    if (!p) { p = document.createElement('div'); p.id = 'tbEdit'; p.className = 'tb-edit'; document.body.appendChild(p);
      ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t => p.addEventListener(t, e => e.stopPropagation(), { passive: true })); }
    const draw = () => { const order = applyToolbar(), hidden = new Set((settings.toolbar || {}).hidden || []);
      p.innerHTML = `<div class="tbe-head"><b>Your toolbar</b><small>Switch tools on or off, drag to reorder</small></div><div class="tbe-list">${order.map(k => { const b = $('tools').querySelector(`:scope > [data-add="${k}"]`);
        return `<div class="tbe-row${hidden.has(k) ? ' off' : ''}" draggable="true" data-tb="${k}"><span class="tbe-grip">⋮⋮</span><span class="tbe-ic">${b.querySelector('svg')?.outerHTML || ''}</span><span class="tbe-name">${esc(tbName(b))}</span><input type="checkbox" class="tgl" ${hidden.has(k) ? '' : 'checked'} aria-label="Show ${esc(tbName(b))}"></div>`; }).join('')}</div>
        <div class="tbe-foot"><button class="set-btn" data-tbe="reset">Reset</button><button class="set-btn hot" data-tbe="done">Done</button></div>`; };
    const commit = (order, hidden) => { settings.toolbar = { order, hidden }; applySettings(); };
    const now = () => ({ order: [...p.querySelectorAll('.tbe-row')].map(r => r.dataset.tb), hidden: [...p.querySelectorAll('.tbe-row')].filter(r => !r.querySelector('input').checked).map(r => r.dataset.tb) });
    p.onchange = e => { if (e.target.matches('input')) { e.target.closest('.tbe-row').classList.toggle('off', !e.target.checked); const n = now(); commit(n.order, n.hidden); } };
    p.onclick = e => { const a = e.target.closest('[data-tbe]')?.dataset.tbe; if (a === 'done') p.hidden = true; if (a === 'reset') { delete settings.toolbar; applySettings(); draw(); } };
    let dragging = null;
    p.ondragstart = e => { dragging = e.target.closest('.tbe-row'); if (!dragging) return; dragging.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging.dataset.tb); };
    p.ondragover = e => { if (!dragging) return; e.preventDefault(); const L = p.querySelector('.tbe-list'), lr = L.getBoundingClientRect(); if (e.clientY < lr.top + 36) L.scrollTop -= 10; else if (e.clientY > lr.bottom - 36) L.scrollTop += 10;   // scroll the list when dragging near its edges
      const r = e.target.closest('.tbe-row'); if (!r || r === dragging) return; const box = r.getBoundingClientRect(); r.parentNode.insertBefore(dragging, e.clientY < box.top + box.height / 2 ? r : r.nextSibling); };
    p.ondragend = () => { if (!dragging) return; dragging.classList.remove('drag'); dragging = null; const n = now(); commit(n.order, n.hidden); };
    draw(); p.hidden = false;
    const place = () => { const t = $('tools').getBoundingClientRect(); if (!t.width) return; p.style.left = Math.max(12, Math.min(innerWidth - 312, t.left + t.width / 2 - 150)) + 'px'; p.style.bottom = (innerHeight - t.top + 12) + 'px'; };
    place(); requestAnimationFrame(place); setTimeout(place, 250);   // again once the tools have slid back in
  }
  $('tools').addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); boardMenu(e, [{ label: 'Customize toolbar…', run: toolbarEditor }]); });
  $('tbCustomize').onclick = () => { closeSettings(); setTimeout(toolbarEditor, 120); };
  document.addEventListener('pointerdown', e => { const p = $('tbEdit'); if (p && !p.hidden && !e.target.closest('#tbEdit, #rowMenu')) p.hidden = true; }, true);

  // ---------- just the board: every panel tucks away (⌘\, like Figma), and comes back with ⌘\ or Esc ----------
  const CLEAN_EL = ['side', 'tray', 'dock', 'keys', 'design'].map(id => $(id)).concat([document.querySelector('.top')]).filter(Boolean);
  function setClean(on) {
    if (on === document.body.classList.contains('clean') || (on && document.body.classList.contains('phone'))) return;
    const fade = (from, to) => CLEAN_EL.forEach(el => el.animate?.([{ opacity: from }, { opacity: to }], { duration: 220, easing: 'ease' }));
    if (on) { closeColor(); mochiOpen(false); fade(1, 0); setTimeout(() => document.body.classList.add('clean'), 200); }
    else { document.body.classList.remove('clean'); fade(0, 1); }
  }
  $('cleanBtn').onclick = () => setClean(true);
  $('cleanBack').onclick = () => setClean(false);
  ['pointerdown', 'mousedown', 'dblclick'].forEach(t => $('cleanBack').addEventListener(t, e => e.stopPropagation()));   // the board mustn't grab presses on the pill

  addEventListener('keydown', e => {
    const typing = e.target.closest('input, textarea, [contenteditable="true"]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); capture(true); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash') && !homeAt && !docCard) { e.preventDefault(); setClean(!document.body.classList.contains('clean')); return; }
    if (e.key === 'Escape' && document.body.classList.contains('clean') && !editing && !drawOn) { setClean(false); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input, textarea, [contenteditable="true"]') && !homeAt) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }   // inside text, ⌘Z undoes typing as usual
    if (e.key === 'Escape' && homeAt) { closeHome(); return; }
    if (e.key === 'Enter' && $('coach').classList.contains('on') && !editing && !document.activeElement?.closest?.('input, textarea, [contenteditable="true"]') && !$('capture').classList.contains('on')) { e.preventDefault(); $('coachNext').click(); return; }
    if (e.key === 'Escape' && $('coach').classList.contains('on') && !editing && !document.activeElement?.closest?.('input, textarea, [contenteditable="true"]') && !$('capture').classList.contains('on')) { endTour(); return; }
    if ($('onboard').classList.contains('on')) return obKeys(e);   // setup has its own keys
    if (e.key === 'Escape' && $('settings').classList.contains('on')) { closeSettings(); return; }
    if (e.key === 'Escape' && cropping) { endCrop('cancel'); return; }
    if (e.key === 'Enter' && cropping && !e.target.closest('input, textarea, [contenteditable="true"]')) { endCrop('done'); return; }
    if (e.key === 'Escape' && drawOn) { exitDraw(); return; }
    if (e.key === 'Escape' && docCard) { closeDoc(); return; }
    if (e.key === 'Escape' && (placing || $('shapePick').classList.contains('on') || $('tplPick').classList.contains('on') || $('stampWheel').classList.contains('on') || $('stampPick').classList.contains('on'))) { stopPlacing(); return; }
    if (e.key === 'Escape' && selWire) { selectWire(null); return; }
    if (e.key === 'Escape') { closeColor(); capture(false); endEdit(); setFocus(false); selectOnly([]); mochiOpen(false); document.activeElement.blur(); return; }
    if (typing || homeAt || $('capture').classList.contains('on')) return;   // never fire board shortcuts while quick capture is open
    if (e.key === ' ') { space = true; stage.classList.add('space'); e.preventDefault(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selWire) { board.links = board.links.filter(l => l.id !== selWire); selWire = null; renderWires(); save(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel.size) removeSelected();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && sel.size) { e.preventDefault(); groupSel(!e.shiftKey); return; }
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase()) && sel.size) { e.preventDefault(); $('selbar').querySelector(`[data-ts="${{ b: 'bold', i: 'italic', u: 'under' }[e.key.toLowerCase()]}"]`)?.click(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectOnly(board.cards.map(c => c.id)); }
    if ((e.metaKey || e.ctrlKey) && ['c', 'x'].includes(e.key.toLowerCase()) && sel.size && !homeAt) { const r = copyCards(); if (r) { navigator.clipboard?.writeText(r.text).catch(() => {}); if (e.key.toLowerCase() === 'x') { e.preventDefault(); removeSelected(); } } return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !homeAt) { pendingPaste = true; setTimeout(() => { if (pendingPaste && lastClip) pasteCards(); pendingPaste = false; }, 150); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && sel.size) { e.preventDefault(); const gm = {}, copies = [...sel].map(id => Object.assign(JSON.parse(JSON.stringify(byId(id))), { id: uid(), r: tilt() })); copies.forEach(c => { if (c.group) c.group = gm[c.group] || (gm[c.group] = uid()); }); copies.forEach(c => { c.x += 30; c.y += 30; addCard(c); }); selectOnly(copies.map(c => c.id)); }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') setFocus(!focusSet);
    if (k === 'n') startPlacing('note');
    if (k === 't') startPlacing('title');
    if (k === 'c') startPlacing('todo');
    if (k === 'g') startPlacing('coll');
    if (k === 'r') pickWF('box');
    if (k === 'x') pickWF('text');
    if (k === 'd') startPlacing('doc');
    if (k === 's') $('tools').querySelector('[data-add="shape"]').click();
    if (k === 'e') $('tools').querySelector('[data-add="stamp"]').click();
    if (k === 'l') startPlacing('link');
    if (k === 'p') drawOn ? exitDraw() : enterDraw();
    if (k === 'a') readyToRecord().then(ok => ok && startPlacing('audio'));
    if (k === 'v') startPlacing('video');
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
    if (t === 'draw') return drawOn ? exitDraw() : enterDraw();
    if (t === 'stamp') { const on = !$('stampWheel').classList.contains('on'); stopPlacing(); const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); ['stampWheel', 'stampPick'].forEach(id => $(id).style.left = (r.left + r.width / 2 - sr.left) + 'px'); renderWheel(); $('stampWheel').classList.toggle('on', on); b.classList.toggle('on', on); $('mBubble').classList.remove('on'); return; }
    if (t === 'shape') { const on = !$('shapePick').classList.contains('on'); stopPlacing(); const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); $('shapePick').style.left = (r.left + r.width / 2 - sr.left) + 'px'; $('shapePick').classList.toggle('on', on); b.classList.toggle('on', on); $('mBubble').classList.remove('on'); return; }
    if (t === 'tpl') { const on = !$('tplPick').classList.contains('on'); stopPlacing(); const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); $('tplPick').style.left = (r.left + r.width / 2 - sr.left) + 'px'; $('tplPick').classList.toggle('on', on); b.classList.toggle('on', on); $('mBubble').classList.remove('on'); return; }
    if (t === 'audio') return readyToRecord().then(ok => ok && startPlacing('audio'));
    startPlacing(t); };
  $('filePick').onchange = e => { const fs = [...e.target.files], tgt = $('filePick').dataset.into; delete $('filePick').dataset.into; e.target.value = '';
    const c = tgt && byId(tgt), v = fs.find(f => f.type.startsWith('video/'));
    if (c && v) return fillVideo(c, v); addImages(fs); };
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

  // ---------- copy, cut and paste cards: works across boards (the clip lives in Mochiboard, plus their words go to the Mac clipboard) ----------
  const CLIP = 'mochiboard:clip';
  let lastClip = null, pendingPaste = false, pasteN = 0;
  try { lastClip = JSON.parse(localStorage.getItem(CLIP) || 'null'); } catch (e) {}
  function copyCards() {
    const ids = new Set();
    const take = c => { if (!c || ids.has(c.id)) return; ids.add(c.id);
      if (c.type === 'coll') (c.kids || []).forEach(k => take(byId(k)));
      if (c.type === 'frame') onFrame(c).forEach(take);
      if (c.group) board.cards.filter(x => x.group === c.group).forEach(take); };
    selCards().forEach(take); if (!ids.size) return null;
    const cards = board.cards.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify(c)));
    const links = board.links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => ({ ...l }));
    const text = cards.map(c => c.text || c.title || c.name || c.label || '').filter(Boolean).join('\n') || `${cards.length} Mochiboard card${cards.length > 1 ? 's' : ''}`;
    lastClip = { cards, links, from: board.id, text }; pasteN = 0;
    try { localStorage.setItem(CLIP, JSON.stringify(lastClip)); } catch (e) {}   // big pictures may not fit; the copy still works while the app is open
    return lastClip;
  }
  function pasteCards() {
    const c0 = lastClip; if (!c0?.cards?.length || !board) return;
    remember();
    const map = {}, gmap = {}; c0.cards.forEach(c => map[c.id] = uid());
    const x0 = Math.min(...c0.cards.map(c => c.x)), y0 = Math.min(...c0.cards.map(c => c.y)), x1 = Math.max(...c0.cards.map(c => c.x + c.w)), y1 = Math.max(...c0.cards.map(c => c.y + c.h));
    let dx, dy;
    if (c0.from === board.id) { pasteN++; dx = dy = 30 * pasteN; }                    // same board: a little down and right of the original
    else { const ctr = centerWorld(); dx = ctr.x - (x0 + x1) / 2; dy = ctr.y - (y0 + y1) / 2; }   // another board: right in the middle of the view
    const fresh = c0.cards.map(c => { const n = JSON.parse(JSON.stringify(c)); n.id = map[c.id]; n.x += dx; n.y += dy;
      if (n.kids) n.kids = n.kids.map(k => map[k]).filter(Boolean);
      if (n.colOf) n.colOf = Object.fromEntries(Object.entries(n.colOf).filter(([k]) => map[k]).map(([k, v]) => [map[k], v]));
      if (n.onFrame) { if (map[n.onFrame]) n.onFrame = map[n.onFrame]; else delete n.onFrame; }
      if (n.group) n.group = gmap[n.group] || (gmap[n.group] = uid());
      return n; });
    board.cards.push(...fresh); fresh.forEach(c => renderCard(c, true));   // all in first, so collections find the cards that belong in them
    (c0.links || []).forEach(l => board.links.push({ ...l, id: uid(), a: map[l.a], b: map[l.b] }));
    layoutAll(); renderWires(); save();
    const inside = new Set(fresh.flatMap(c => c.kids || []));
    const freshIds = new Set(fresh.map(c => c.id));
    selectOnly(fresh.filter(c => !inside.has(c.id) && !(c.onFrame && freshIds.has(c.onFrame))).map(c => c.id));   // select the tops, not every card inside them
    if (c0.from !== board.id) chirp(`Pasted ${fresh.length} card${fresh.length > 1 ? 's' : ''} ✦`, 2200);
  }
  addEventListener('copy', e => { if (e.target.closest?.('input, textarea, [contenteditable="true"]') || !sel.size || homeAt) return;
    const r = copyCards(); if (!r) return; e.preventDefault(); e.clipboardData.setData('text/plain', r.text); e.clipboardData.setData('text/x-mochiboard', '1'); });
  addEventListener('cut', e => { if (e.target.closest?.('input, textarea, [contenteditable="true"]') || !sel.size || homeAt) return;
    const r = copyCards(); if (!r) return; e.preventDefault(); e.clipboardData.setData('text/plain', r.text); e.clipboardData.setData('text/x-mochiboard', '1'); removeSelected(); });

  // ---------- paste and drop ----------
  addEventListener('paste', e => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    pendingPaste = false;
    // cards copied in Mochiboard (on this board or another one) come back as cards
    const tx = e.clipboardData.getData('text/plain');
    if (lastClip && !e.clipboardData.files?.length && (e.clipboardData.getData('text/x-mochiboard') || tx === lastClip.text)) { e.preventDefault(); return pasteCards(); }
    const files = [...(e.clipboardData.files || [])]; const intoTray = $('capture').classList.contains('on');
    if (files.length) { e.preventDefault(); addImages(files, null, intoTray); capture(false); return; }
    const t = e.clipboardData.getData('text/plain').trim(); if (!t) return; e.preventDefault();
    if (/^https?:\/\/\S+$/.test(t)) linkCard(t, centerWorld()); else addAtCenter('note', { text: t, color: 'butter' });
  });
  stage.addEventListener('dragover', e => e.preventDefault());
  stage.addEventListener('drop', e => { e.preventDefault(); const files = [...e.dataTransfer.files], w = toWorld(e.clientX, e.clientY);
    const bid = e.dataTransfer.getData('mb/board'); if (bid && board) return nestBoard(bid, board.id, { x: w.x - 130, y: w.y - 90 }).then(ok => ok && refreshBoards());
    if (files.length) return addImages(files, w, overTray(e));
    const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (/^https?:/.test(u)) linkCard(u.trim(), w); });

  // ---------- Mochi on the board ----------
  // her hop: she jumps right up out of her pill, then squishes a little as she lands
  function hopMochi() { goo.hop(); favGoo?.hop(); const c = $('goo'); c.classList.remove('hopping'); void c.offsetWidth; c.classList.add('hopping'); }
  // in a browser, the tab's icon is a tiny Mochi who breathes, blinks and hops along with the real one
  const favGoo = MB.native ? null : (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const fg = Goo(c, { manual: true });
    let link = document.querySelector('link[rel="icon"]'); if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    setInterval(() => { fg.draw(); link.href = c.toDataURL('image/png'); }, 120); return fg; })();
  const goo = Goo($('goo')), goos = [goo, ...(favGoo ? [favGoo] : []), Goo($('brandGoo')), Goo($('aboutGoo')), Goo($('chatGoo')), Goo($('obGoo')), Goo($('obGoo2')), Goo($('coachGoo')), Goo($('setGoo'))];

  // ---------- settings: Mochi's color and greeting, her helpers, how the board looks ----------
  const MOCHI_COLORS = { blue: { B: '#33c7ff', S: '#ccf5ff', D: '#1480db' }, pink: { B: '#ff8fc2', S: '#ffe0ee', D: '#e0559a' }, mint: { B: '#5fdba0', S: '#d9fbe9', D: '#2fae73' },
    lilac: { B: '#b49bff', S: '#ece5ff', D: '#7e5ee6' }, butter: { B: '#ffd54f', S: '#fff4c4', D: '#e0a800' }, peach: { B: '#ffa978', S: '#ffe6d6', D: '#e57841' }, night: { B: '#4a4f7a', S: '#8d93c9', D: '#2b2e4f' } };
  const settings = Object.assign({ mochi: 'blue', greet: true, grid: true, tilt: true, motion: true, keys: true, theme: 'system', chat: 'normal', emoji: true, noteColor: 'random', snap: false, ai: true, mobbin: true, higgs: true, chatKeep: 'board', chatMax: '60', cursor: '#ff9ec4', fancyCursor: true, colors: { light: {}, dark: {} } }, (() => { try { return JSON.parse(localStorage.getItem('mochiboard:settings') || '{}'); } catch (e) { return {}; } })());
  try { if (localStorage.getItem('mochiboard:keys') === 'hide') settings.keys = false; } catch (e) {}
  function applySettings() {
    queueMicrotask(() => applyColors()); queueMicrotask(() => applyGridShape()); queueMicrotask(() => applyToolbar());
    goos.forEach(g => g.setColors(MOCHI_COLORS[settings.mochi] || MOCHI_COLORS.blue));
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', dark); document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', settings[g.dataset.seg] === b.dataset.v)));
    $('obNotes').innerHTML = $('noteColors').innerHTML = `<button data-nc="random" class="rand ${settings.noteColor === 'random' ? 'on' : ''}" title="A random pastel"></button>` + COLOR_NAMES.map(n => `<button data-nc="${n}" title="${n}" style="background:${COLORS[n]}" class="${settings.noteColor === n ? 'on' : ''}"></button>`).join('');
    document.body.classList.toggle('no-grid', !settings.grid); document.body.classList.toggle('neat', !settings.tilt); document.body.classList.toggle('calm', !settings.motion);
    $('keys').classList.toggle('hide', !settings.keys);
    $('obMochi').innerHTML = $('mochiColors').innerHTML = Object.entries(MOCHI_COLORS).map(([n, c]) => `<button data-mc="${n}" title="${n}" style="background:${c.B}" class="${settings.mochi === n ? 'on' : ''}"></button>`).join('');
    document.querySelectorAll('[data-set]').forEach(t => t.checked = !!settings[t.dataset.set]);
    try { localStorage.setItem('mochiboard:settings', JSON.stringify(settings)); localStorage.setItem('mochiboard:keys', settings.keys ? 'show' : 'hide'); } catch (e) {}
  }
  // ---------- your cursor: the same little pointer and name bubble as jessa.art, in your color ----------
  // It follows the mouse; over a card it turns into an open hand, and a fist while you drag. Text and inputs keep the Mac's own I-beam.
  const myCur = document.createElement('div'); myCur.className = 'mcur'; myCur.setAttribute('aria-hidden', 'true');
  myCur.innerHTML = `<svg class="tipv" viewBox="-1 -1 12.3 10.9"><path d="M3.4554 0.917919C4.24277 -0.305972 6.03201 -0.305974 6.81938 0.917917L9.94507 5.7765C11.0536 7.49959 9.16221 9.57694 7.34302 8.63439L6.05709 7.96814C5.48011 7.6692 4.79386 7.66921 4.21689 7.96817L2.93214 8.63388C1.11295 9.57651 -0.778528 7.49915 0.330012 5.77603L3.4554 0.917919Z"/></svg>`
    + `<svg class="grabhand open" viewBox="0 0 34 34"><g class="o"><rect x="8.5" y="15" width="19.5" height="16" rx="7"/><rect x="8" y="4.2" width="5" height="15.5" rx="2.5" transform="rotate(-8 10.5 19)"/><rect x="13.2" y="1.2" width="5" height="17.5" rx="2.5"/><rect x="18.4" y="2.2" width="5" height="16.5" rx="2.5"/><rect x="23.4" y="5.6" width="4.6" height="14" rx="2.3" transform="rotate(8 25.7 19)"/><rect x="7.6" y="15.5" width="3.8" height="9" rx="1.9" transform="rotate(-42 9.5 24)"/></g><g class="f"><rect x="8.5" y="15" width="19.5" height="16" rx="7"/><rect x="8" y="4.2" width="5" height="15.5" rx="2.5" transform="rotate(-8 10.5 19)"/><rect x="13.2" y="1.2" width="5" height="17.5" rx="2.5"/><rect x="18.4" y="2.2" width="5" height="16.5" rx="2.5"/><rect x="23.4" y="5.6" width="4.6" height="14" rx="2.3" transform="rotate(8 25.7 19)"/><rect x="7.6" y="15.5" width="3.8" height="9" rx="1.9" transform="rotate(-42 9.5 24)"/></g></svg>`
    + `<svg class="grabhand fist" viewBox="0 0 34 34"><g class="o"><rect x="7.5" y="13" width="21" height="17" rx="7.5"/><circle cx="11" cy="13.6" r="3"/><circle cx="16" cy="12.6" r="3"/><circle cx="21" cy="12.8" r="3"/><circle cx="25.4" cy="14.4" r="2.7"/><rect x="6" y="17" width="12" height="5" rx="2.5" transform="rotate(-12 12 19.5)"/></g><g class="f"><rect x="7.5" y="13" width="21" height="17" rx="7.5"/><circle cx="11" cy="13.6" r="3"/><circle cx="16" cy="12.6" r="3"/><circle cx="21" cy="12.8" r="3"/><circle cx="25.4" cy="14.4" r="2.7"/><rect x="6" y="17" width="12" height="5" rx="2.5" transform="rotate(-12 12 19.5)"/></g></svg>`
    + `<i class="ring"></i><div class="bub"></div>`;
  document.body.appendChild(myCur);
  const NATIVE = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=color]), textarea, select, [contenteditable="true"], .card.editing, .handle, #rh, .knob, .wires .w-end, .wires .w-bend, iframe, .wheel, .bright';
  function paintCursor() {
    const c = settings.cursor || '#ff9ec4', edge = mixHex(c, '#000000', lum(c) > .6 ? .28 : .38);
    myCur.style.setProperty('--c', c); myCur.style.setProperty('--cs', edge); myCur.style.setProperty('--ct', lum(c) > .4 ? '#3d3640' : '#ffffff');
    myCur.querySelector('.bub').textContent = (settings.name || 'You').slice(0, 24);
    document.body.classList.toggle('fancy-cursor', settings.fancyCursor !== false && matchMedia('(hover: hover) and (pointer: fine)').matches);
  }
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !document.body.classList.contains('fancy-cursor')) return;
    myCur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; myCur.classList.add('show');
    // at the window's edges, hand back the Mac's own cursor so its resize arrows show (and you can see where to grab)
    const edge = MB.native && (e.clientX < 8 || e.clientY < 8 || e.clientX > innerWidth - 8 || e.clientY > innerHeight - 8); document.body.classList.toggle('cur-edge', edge);
    const t = e.target, native = edge || !!(t.closest && t.closest(NATIVE));
    myCur.classList.toggle('hide', native); document.body.classList.toggle('cur-native', native);
    const onCard = !native && !placing && !drawOn && t.closest && t.closest('.card') && !t.closest('button, a, input');
    myCur.classList.toggle('grabby', !!onCard || stage.classList.contains('space') || stage.classList.contains('panning'));
  }, { passive: true, capture: true });
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; myCur.classList.add('down'); myCur.classList.remove('tap'); void myCur.offsetWidth; myCur.classList.add('tap'); }, true);
  addEventListener('pointerup', () => myCur.classList.remove('down'), true);
  document.addEventListener('pointerleave', () => myCur.classList.remove('show'));
  addEventListener('blur', () => myCur.classList.remove('show'));

  // ---------- your colors: the board, its dots, the panels and the accent, set per light/dark; one board can also have its own background ----------
  const COLOR_DEFAULTS = { light: { bg: '#fbf8fc', dot: '#e3dcee', panel: '#ffffff', accent: '#f27aa8' }, dark: { bg: '#1c1920', dot: '#35303c', panel: '#26222b', accent: '#f27aa8' } };
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const mixHex = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  const modeName = () => document.body.classList.contains('dark') ? 'dark' : 'light';
  const myColors = () => { settings.colors = settings.colors || { light: {}, dark: {} }; return settings.colors[modeName()] = settings.colors[modeName()] || {}; };
  const colorOf = k => (k === 'bg' && board && board.bg) || myColors()[k] || COLOR_DEFAULTS[modeName()][k];
  function applyColors() {
    const B = document.body.style, mine = myColors(), bg = colorOf('bg'), darkBg = lum(bg) < .2;
    B.setProperty('--board', bg);
    if (mine.dot) B.setProperty('--dot', mine.dot); else if (darkBg !== (modeName() === 'dark')) B.setProperty('--dot', mixHex(bg, darkBg ? '#ffffff' : '#000000', .13)); else B.removeProperty('--dot');
    document.body.classList.toggle('tint-panels', !!mine.panel); if (mine.panel) B.setProperty('--panel', mine.panel); else B.removeProperty('--panel');
    document.body.classList.toggle('panel-dark', !!mine.panel && lum(mine.panel) < .2);
    if (mine.accent) { B.setProperty('--pink-deep', mine.accent); B.setProperty('--pink', mixHex(mine.accent, '#ffffff', .3)); B.setProperty('--blush', mixHex(mine.accent, modeName() === 'dark' ? '#1c1920' : '#ffffff', .82)); }
    else ['--pink-deep', '--pink', '--blush'].forEach(v => B.removeProperty(v));
    document.body.classList.toggle('board-dark', darkBg); document.body.classList.toggle('board-light', !darkBg && modeName() === 'dark');
    document.querySelectorAll('[data-col]').forEach(b => b.style.setProperty('--chip', b.dataset.col === 'cursor' ? settings.cursor : colorOf(b.dataset.col)));
    $('colReset') && ($('colReset').hidden = !Object.keys(mine).length);
    paintCursor();
    // settings: name, cursor colors and the little preview
    if ($('setName') && document.activeElement !== $('setName')) $('setName').value = settings.name || '';
    if ($('curColors')) $('curColors').innerHTML = PRESETS.cursor.map(h => `<button data-cc="${h}" title="${h.toUpperCase()}" style="background:${h}" class="${settings.cursor === h ? 'on' : ''}"></button>`).join('')
      + `<button class="rand${PRESETS.cursor.includes(settings.cursor) ? '' : ' on'}" data-col="cursor" title="Any color"></button>`;
    const pv = document.querySelector('#curPrev .mcur'); if (pv) { pv.innerHTML = myCur.innerHTML; pv.setAttribute('style', myCur.getAttribute('style') || ''); pv.style.transform = ''; }
  }
  $('setName').oninput = e => { settings.name = e.target.value.trim().slice(0, 24); applySettings(); };
  $('setName').onkeydown = e => e.stopPropagation();
  $('curColors').onclick = e => { const b = e.target.closest('[data-cc]'); if (b) { settings.cursor = b.dataset.cc; applySettings(); } };
  $('colReset').onclick = () => { settings.colors[modeName()] = {}; applySettings(); };
  $('gearBtn').onclick = e => { e.stopPropagation(); if (placing) stopPlacing(); if (sel.size) selectOnly([]); checkUpdate(); showUsage(); $('boardCount').textContent = `${boardList.length} board${boardList.length === 1 ? '' : 's'}, kept on this Mac. They never leave your computer.`; showConnections(true); $('settings').classList.add('on'); };
  const closeSettings = () => $('settings').classList.remove('on');
  // settings tabs: one topic at a time, so it isn't one long scroll
  function setTab(t) { $('setTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('settings').querySelectorAll('.set-body section[data-tab]').forEach(sec => sec.classList.toggle('tab-off', sec.dataset.tab !== t)); $('settings').querySelector('.set-body').scrollTop = 0; if (t === 'helpers') showUsage(); }
  $('setTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); };
  setTab('general');
  // Claude usage (Mac app): Mochi's own tally, plus a door to the plan limits page
  const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n));
  const usLine = u => !u || !u.asks ? 'No asks yet' : `${u.asks} ask${u.asks === 1 ? '' : 's'} · ${kTok(u.tokensIn + u.tokensOut)} tokens`;
  async function showUsage() {
    if (!MB.native) return; let u = null; try { u = await MB.usage(); } catch (e) {}
    if (!u) return; $('usToday').textContent = usLine(u.today); $('usWeek').textContent = usLine(u.week); $('usAll').textContent = usLine(u.all);
    $('usNote').textContent = (u.week.cost >= .01 ? `About $${u.week.cost.toFixed(2)} this week if you paid per request (on a Pro or Max plan you don't). ` : '') + "Just Mochi's share, counted on this Mac. Your plan's limits cover everything you do with Claude.";
  }
  $('usLimits').onclick = () => MB.openURL('https://claude.ai/settings/usage');
  $('usReset').onclick = async () => { await MB.resetUsage(); showUsage(); };

  $('setClose').onclick = closeSettings;
  $('settings').onclick = e => { if (e.target === $('settings')) closeSettings(); };
  $('obMochi').onclick = $('mochiColors').onclick = e => { const b = e.target.closest('[data-mc]'); if (b) { settings.mochi = b.dataset.mc; applySettings(); hopMochi(); } };
  document.querySelectorAll('[data-set]').forEach(t => t.onchange = () => { settings[t.dataset.set] = t.checked; applySettings(); if (t.dataset.set === 'autoUpdate') { showUpdate.answered = true; if (t.checked && updInfo) showUpdate(); } });
  $('recheck').onclick = () => showConnections(true);
  // switching chats off (or to "until I quit") removes what's saved in the board files right away
  async function clearSavedChats() { const list = await MB.list(); for (const b of list) { const bb = b.id === board?.id ? board : await MB.load(b.id); if (bb?.chat?.length) { bb.chat = []; await MB.save(bb); } } }
  $('clearChats').onclick = async () => { await clearSavedChats(); Object.keys(sessionChats).forEach(k => delete sessionChats[k]); renderChat(); $('clearChats').textContent = 'Cleared ✓'; setTimeout(() => $('clearChats').textContent = 'Clear all chats', 1800); };
  document.querySelectorAll('[data-seg]').forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; settings[g.dataset.seg] = b.dataset.v; applySettings();
    if (g.dataset.seg === 'chatKeep' && b.dataset.v !== 'board') clearSavedChats(); if (g.dataset.seg === 'chatKeep') renderChat(); });
  $('obNotes').onclick = $('noteColors').onclick = e => { const b = e.target.closest('[data-nc]'); if (b) { settings.noteColor = b.dataset.nc; applySettings(); } };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'system' && applySettings());
  const newNoteColor = () => settings.noteColor === 'random' ? COLOR_NAMES[1 + Math.floor(Math.random() * 6)] : settings.noteColor;
  const snapTo = v => settings.snap ? Math.round(v / 26) * 26 : v;
  $('revealBoards').onclick = () => MB.reveal();
  let sayT = 0;
  // the little extras: skipped when she's set to Quiet
  function chirp(text, ms, acts) { if (settings.chat !== 'quiet') say(text, ms, acts); }
  function tip(text) { if (settings.chat === 'chatty') say(text, 6000); }
  function say(text, ms = 6000, acts = []) {
    if (chatOpen()) { if (text) addMsg('mochi', text, acts); return; }
    $('mSay').textContent = text; $('mActs').innerHTML = '';
    acts.forEach(a => { const b = document.createElement('button'); b.textContent = a.label; b.className = a.cls || (a.ghost ? 'ghost' : ''); b.onclick = () => { $('mBubble').classList.remove('on'); a.run(); }; $('mActs').appendChild(b); });
    $('mBubble').classList.add('on'); hopMochi(); clearTimeout(sayT); if (ms) sayT = setTimeout(() => $('mBubble').classList.remove('on'), ms);
  }
  // ---------- Mochi's chat window: click her to open it, click again (or Esc) to close ----------
  const chatOpen = () => $('mochi').classList.contains('chat');
  function mochiOpen(on) { $('mochi').classList.toggle('chat', on); if (on) { $('mBubble').classList.remove('on'); renderChat(); $('mcInput').focus(); } }
  $('mPill').onclick = () => mochiOpen(!chatOpen());
  $('mcClose').onclick = () => mochiOpen(false);
  $('mcNew').onclick = () => { chatLog().length = 0; if (settings.chatKeep === 'board') { board.chat = []; save(); } renderChat(); $('mcInput').focus(); };
  const IDEAS = ['Group these by theme', 'What am I missing?', 'Make a checklist from this', 'Find onboarding screens on Mobbin'];
  function msgEl(m) {
    const d = document.createElement('div'); d.className = 'mc-msg ' + m.who; d.textContent = m.text;
    if (m.acts?.length) { const box = document.createElement('div'); box.className = 'm-acts';
      m.acts.forEach(a => { const b = document.createElement('button'); b.textContent = a.label; b.className = a.cls || (a.ghost ? 'ghost' : ''); b.onclick = () => { box.remove(); a.run(); }; box.appendChild(b); }); d.appendChild(box); }
    return d;
  }
  function renderChat() {
    const list = $('mcList'); list.innerHTML = ''; const msgs = chatLog();
    if (!msgs.length) { list.innerHTML = `<div class="mc-empty"><b>Hi! I'm Mochi ✦</b>Ask me to sort, write, plan or find things for this board.<div class="mc-ideas">${IDEAS.filter(i => settings.mobbin || !/Mobbin/.test(i)).map(i => `<button>${i}</button>`).join('')}</div></div>`;
      list.querySelectorAll('.mc-ideas button').forEach(b => b.onclick = () => { ask(b.textContent); }); return; }
    msgs.forEach(m => list.appendChild(msgEl(m))); list.scrollTop = list.scrollHeight;
  }
  // where a chat lives depends on Settings: saved with the board, kept only until Mochiboard quits, or not kept at all
  const sessionChats = {};
  function chatLog() { if (!board) return []; if (settings.chatKeep === 'board') return (board.chat = board.chat || []); return (sessionChats[board.id] = sessionChats[board.id] || []); }
  function addMsg(who, text, acts = []) {
    if (!board) return; const log = chatLog(), m = { who, text, t: Date.now() }, max = +settings.chatMax || 60;
    log.push(m); if (log.length > max) log.splice(0, log.length - max); if (settings.chatKeep === 'board') save();
    const list = $('mcList'); list.querySelector('.mc-empty')?.remove(); list.appendChild(msgEl({ ...m, acts })); list.scrollTop = list.scrollHeight;
  }
  function typing(on) { $('mcList').querySelector('.typing')?.remove(); $('mcStatus').textContent = on ? 'thinking…' : '';
    if (on) { const d = document.createElement('div'); d.className = 'mc-msg mochi typing'; d.innerHTML = '<i></i><i></i><i></i>'; $('mcList').appendChild(d); $('mcList').scrollTop = 1e9; } }
  $('mcForm').onsubmit = e => { e.preventDefault(); const q = $('mcInput').value.trim(); if (!q) return; $('mcInput').value = ''; $('mcInput').style.height = ''; $('mcInput').placeholder = 'Ask Mochi… “group these by theme”'; ask(q); };
  $('mcInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('mcForm').requestSubmit(); } if (e.key === 'Escape') { mochiOpen(false); e.stopPropagation(); } };
  $('mcInput').oninput = () => { const t = $('mcInput'); t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; };
  $('mChat').addEventListener('pointerdown', e => e.stopPropagation());
  // what Mochi sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
  function snapshot() {
    const brief = c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h), color: c.color,
      text: (c.text || c.title || c.label || '').slice(0, 300), font: c.font, name: c.name, kids: c.kids, desc: c.desc, body: c.body ? c.body.slice(0, 600) : undefined, shape: c.shape, tag: c.tagText, items: c.items ? c.items.map(i => i.t) : undefined, hex: c.hex, url: c.url, selected: sel.has(c.id) || undefined });
    return { name: board.name, cards: board.cards.map(brief), links: board.links.map(l => [l.a, l.b]), unsorted: board.tray.map(brief), boardColors: board.palette,
      fontsOnThisMac: FONTS.filter(f => !/^(\.|Apple |System|STIX|Noto Sans [A-Z][a-z]+ [A-Z])/.test(f)).slice(0, 400),
      recentChat: (settings.chatKeep === 'off' ? chatLog().slice(-2) : chatLog().slice(-8)).map(m => `${m.who === 'me' ? 'Person' : 'Mochi'}: ${m.text}`),
      mochiStyle: (settings.name ? `The person's name is ${settings.name}; use it now and then, not in every reply. ` : '') + ({ quiet: 'Keep "say" to one short sentence.', normal: 'Keep "say" short and warm.', chatty: 'Be warm, playful and encouraging in "say" (2 to 3 sentences, a little cheer is welcome).' }[settings.chat] || '') + (settings.emoji ? ' A couple of fitting emojis in "say" are welcome.' : ' Never use emojis.'),
      library: { projects: projects.map(p => ({ name: p.name, folders: foldersIn(p.id).map(f => f.name) })), foldersNotInAProject: looseFolders().map(f => f.name), boards: boardList.map(b => ({ id: b.id, name: b.name, folder: (folders.find(f => f.id === b.folder) || {}).name || null, current: b.id === board.id || undefined })) } };
  }
  // without AI (switched off, or Claude Code not installed) Mochi still helps with the simple stuff, right here on the Mac
  function offlineMochi(q, why) {
    const notes = board.cards.filter(c => c.type === 'note' && !parentOf(c.id));
    if (/group|sort|organi[sz]e|tidy|line up/i.test(q) && notes.length) {
      const x0 = Math.min(...notes.map(c => c.x)), y0 = Math.min(...notes.map(c => c.y));
      notes.forEach((c, i) => { c.x = x0 + (i % 4) * 250; c.y = y0 + Math.floor(i / 4) * 180; c.r = tilt(); renderCard(c); }); renderWires(); save();
      return say(`I lined your ${notes.length} notes up in tidy rows ✦ ${why}`, 9000);
    }
    say(`${why} Everything else on the board works without me thinking ✦`, 0, (haveClaude === false || offlineMochi.signin) && settings.ai ? [{ label: 'Show me how to connect', run: () => MB.openURL(GUIDE) }] : []); offlineMochi.signin = false;
  }
  let haveClaude = null;
  const GUIDE = 'https://mochiboard.app/connect.html';   // the step-by-step page for connecting Claude Code
  const SIGNIN = /log ?in|api key|auth|credential|subscription|not (signed|logged)|oauth|unauthori[sz]ed|401|403/i;
  // the web demo: Mochi tidies for real, and for anything that needs AI she points you to the Mac app
  const getApp = () => MB.openURL(MB.getURL || 'https://github.com/jessawolfe-ux/mochiboard/releases/latest/download/Mochiboard.zip');
  const DL = [{ label: 'Download Mochiboard ✦', run: getApp }, { label: 'Keep playing', ghost: true, run: () => {} }];
  function webMochi(q) {
    const notes = board.cards.filter(c => c.type === 'note' && !parentOf(c.id));
    if (/group|sort|organi[sz]e|tidy|line up/i.test(q) && notes.length) return offlineMochi(q, 'In the Mac app I can sort them by theme too, with Claude.');
    const what = /mobbin/i.test(q) ? 'Mobbin lives in your Claude account, and I can only reach it from the Mac app.' : /higgsfield|photo|picture|image/i.test(q) ? 'Making pictures with Higgsfield happens in the Mac app, where I can check the price with you first.' : 'I think with Claude Code, and that lives in the Mac app.';
    say(`I'd love to help with that! ${what} Download me and I'll connect to your Claude, Mobbin and Higgsfield ✦`, 0, DL);
  }
  async function ask(q, confirmed = false) {
    if (MB.web) { if (!chatOpen()) mochiOpen(true); addMsg('me', q); return webMochi(q); }
    if (!settings.ai || haveClaude === false) { if (!chatOpen()) mochiOpen(true); addMsg('me', q); }
    if (!settings.ai) return offlineMochi(q, "My thinking is switched off in Settings, so I can only do simple tidying.");
    if (haveClaude === false) { await showConnections(true); if (haveClaude === false) return offlineMochi(q, "I need Claude Code on this Mac to think. It's a one-time setup with your Claude account."); }   // look again first: they may have just set it up
    if (!navigator.onLine) { if (!chatOpen()) mochiOpen(true); addMsg('me', q); return offlineMochi(q, "You're offline, so I can't think with Claude right now. I'll be back when the internet is."); }
    if (!chatOpen()) mochiOpen(true);
    if (!confirmed) addMsg('me', q); else addMsg('mochi', 'Making it… this can take a minute ✦');
    $('mochi').classList.add('thinking'); goo.think(true); favGoo?.think(true); typing(true);
    try { const raw = await MB.ask(q, snapshot(), confirmed, { mobbin: settings.mobbin, higgs: settings.higgs }); await applyMochi(parse(raw), q); }
    catch (err) { if (/Claude Code/.test(err.message)) { haveClaude = false; return offlineMochi(q, "I need Claude Code on this Mac to think. It's a one-time setup with your Claude account."); }
      if (SIGNIN.test(err.message)) { offlineMochi.signin = true; return offlineMochi(q, "Claude Code is here, but it isn't signed in yet. Open Terminal, type claude, and sign in with a Claude Pro or Max account."); }
      say("Hmm, I couldn't reach Claude: " + err.message); }
    finally { $('mochi').classList.remove('thinking'); goo.think(false); favGoo?.think(false); typing(false); }
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
    const place = o => { if (o.x == null || o.y == null) { const wide = o.type === 'font'; o.x = center.x - 300 + (i % 3) * (wide ? 330 : 250); o.y = center.y - 100 + Math.floor(i / 3) * (wide ? 240 : 170); i++; } };
    // collections Mochi makes, and cards she files into them (by collection id, or by the name of one she just made)
    const made = {};
    (r.collections || []).forEach(o => { place(o); const s2 = card('coll', { x: o.x, y: o.y, text: o.name || o.text || '', color: COLL[o.color] ? o.color : 'pink', kids: [], cols: o.cols || 1, r: 0 }); addCard(s2); made[(o.name || '').toLowerCase()] = s2; added.push(s2); });
    const collFor = k => k && (byId(k)?.type === 'coll' ? byId(k) : made[String(k).toLowerCase()] || colls().find(s2 => s2.text.toLowerCase() === String(k).toLowerCase()));
    const file = (c, k) => { const s2 = collFor(k); if (!s2 || c.id === s2.id) return; const from = parentOf(c.id); if (from) from.kids = from.kids.filter(x => x !== c.id); s2.kids.push(c.id); };
    (r.add || []).forEach(o => { place(o); const c = card(['todo', 'title', 'swatch', 'doc', 'font'].includes(o.type) ? o.type : 'note', { font: o.type === 'font' ? (o.font || o.text) : (o.font ? String(o.font) : undefined), body: o.type === 'doc' ? (o.body || '') : undefined,
      x: o.x, y: o.y, text: o.type === 'font' ? (o.sample || '') : o.text || '', color: COLOR_NAMES.includes(o.color) ? o.color : 'white', hex: o.hex, label: o.label,
      items: o.items ? o.items.map(t => ({ t: typeof t === 'string' ? t : t.t, done: false })) : undefined, tagText: o.tag, name: o.name }); addCard(c); added.push(c); if (o.in) file(c, o.in); });
    (r.titles || []).forEach(o => { place(o); added.push(addCard(card('title', { x: o.x, y: o.y, text: o.text }))); });
    (r.place || []).forEach(o => { const c = board.tray.find(x => x.id === o.id); if (!c) return; place(o); c.x = o.x; c.y = o.y; board.tray = board.tray.filter(x => x !== c); addCard(c); added.push(c); });
    (r.move || []).forEach(o => { const c = byId(o.id); if (!c || o.x == null) return; c.x = o.x; c.y = o.y; if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) { el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)'; renderCard(c); setTimeout(() => el.style.transition = '', 650); } added.push(c); });
    (r.edit || []).forEach(o => { const c = byId(o.id) || board.tray.find(x => x.id === o.id); if (!c) return;
      if (o.text != null) { if (c.type === 'link') c.title = o.text; else c.text = o.text; }
      if (o.desc != null) c.desc = o.desc;
      if (o.body != null && c.type === 'doc') { c.body = o.body; c.doc = null; if (docCard === c && ed) ed.commands.setContent(mdToHTML(c.body), false); }
      if (o.items) c.items = o.items.map((t, k) => ({ t: typeof t === 'string' ? t : t.t, done: (typeof t === 'object' && t.done) || (c.items?.[k]?.t === t && c.items[k].done) || false }));
      if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
      if (o.tag !== undefined) { if (o.tag) c.tagText = o.tag; else delete c.tagText; }
      if (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) c.hex = o.hex.toLowerCase();
      if (o.label != null) c.label = o.label;
      ['bold', 'italic', 'under', 'strike'].forEach(k => { if (typeof o[k] === 'boolean') c[k] = o[k]; });
      if (o.size && FS[o.size]) { if (o.size === 'm') delete c.fs; else c.fs = o.size; }
      if (o.name != null && c.type === 'note') c.name = o.name;
      if (o.in !== undefined) { if (o.in) file(c, o.in); else { const from = parentOf(c.id); if (from) from.kids = from.kids.filter(x => x !== c.id); } }
      if (board.cards.includes(c)) { renderCard(c, true); added.push(c); } else renderTray(); });
    if (r.remove && r.remove.length) { const gone = new Set(r.remove); board.cards = board.cards.filter(c => !gone.has(c.id)); board.tray = board.tray.filter(c => !gone.has(c.id)); board.links = board.links.filter(l => !gone.has(l.a) && !gone.has(l.b)); gone.forEach(id => cardsEl.querySelector(`[data-id="${id}"]`)?.remove()); }
    (r.connect || []).forEach(p => { const [a, b] = Array.isArray(p) ? p : [p.a, p.b]; if (byId(a) && byId(b)) board.links.push({ id: uid(), a, b }); });
    // wireframes: real screens built from the pieces, left to right, with arrows for the flow
    if (Array.isArray(r.screens) && r.screens.length) {
      let sx = board.cards.length ? Math.max(...board.cards.map(c => c.x + c.w)) + 160 : center.x - 200, sy = board.cards.length ? Math.min(...board.cards.map(c => c.y)) : center.y - 400, prev = null;
      const builtFrames = []; r.screens.forEach(sp => { const { f, made } = buildScreen(sp, sx, sy); builtFrames.push(f); made.forEach(c => added.push(c)); if (prev && sp.flow !== false) board.links.push({ id: uid(), a: prev.id, b: f.id, arrow: true }); prev = f; sx += f.w + 140; });
    }
    if (r.screens?.length) setTimeout(() => offerFill(spotsIn(board.cards.filter(c => c.type === 'frame').slice(-r.screens.length))), 1500);
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
    if (added.length) setTimeout(() => showWhatMochiMade(added), 250);
    const acts = r.confirm ? [{ label: (r.confirm || 'Yes, make it') + ' ✦', run: () => ask(q, true) }, { label: 'Not now', ghost: true, run: () => {} }] : [];
    // what next: Mochi's own ideas, or a sensible guess from what she just made
    const next = acts.length ? [] : (Array.isArray(r.next) && r.next.length ? r.next : guessNext(r, added)).filter(t => typeof t === 'string' && t.trim()).slice(0, 3);
    next.forEach(t => acts.push({ label: t.trim(), cls: 'next', run: () => ask(t.trim()) }));
    say(r.say || (added.length ? `Done! I touched ${added.length} cards.` : 'Done!'), r.confirm ? 0 : next.length ? 16000 : 9000, acts);
  }
  function guessNext(r, added) {
    const has = t => added.some(c => c.type === t);
    if (r.screens?.length) return added.some(c => c.img) ? ['Make the mobile version', 'Try a different color style', 'Write the real copy'] : ['Add the next screen', 'Make it a website too', 'Try a different style'];
    if (has('font')) return ['Pair these with colors', 'Show them on a landing page', 'Narrow it down to two'];
    if (has('swatch')) return ['Pick fonts that match', 'Build a page in these colors'];
    if (has('todo')) return ['Break it into smaller steps', 'Put dates on it'];
    if (added.length >= 3) return ['Group these by theme', 'What am I missing?', 'Turn this into a plan'];
    return [];
  }

  // ---------- Mochi's helpers: Claude Code, Mobbin, Higgsfield ----------
  let lastConn = 0;
  async function showConnections(force) {
    if (!force && Date.now() - lastConn < 5 * 60 * 1000) return; lastConn = Date.now();
    const els = [...document.querySelectorAll('.conns')];
    els.forEach(el => { if (!el.children.length) el.innerHTML = ['Claude Code', 'Mobbin', 'Higgsfield'].map(n => `<div class="conn"><span class="dot"></span>${n}<em style="color:var(--ink-faint)">checking…</em></div>`).join(''); });
    const c = await MB.connections().catch(() => ({})); if (!c.browser) haveClaude = !!c.claude;
    const rows = [['claude', 'Claude Code', GUIDE, 'Set up'], ['mobbin', 'Mobbin', 'https://claude.ai/settings/connectors', 'Connect'], ['higgsfield', 'Higgsfield', 'https://claude.ai/settings/connectors', 'Connect']];
    els.forEach(el => { el.innerHTML = '';
    rows.forEach(([k, name, url, verb]) => { const r = document.createElement('div'); r.className = 'conn' + (c[k] ? ' on' : ''); r.innerHTML = `<span class="dot"></span>${name}`;
      if (c[k]) r.insertAdjacentHTML('beforeend', '<em>ready</em>');
      else if (!c.browser) { const b = document.createElement('button'); b.textContent = verb; b.onclick = () => { MB.openURL(url); say(k === 'claude' ? 'Follow the steps on that page, then come back. I’ll notice as soon as Claude Code is ready!' : `Connect ${name} in your Claude settings (Connectors), then come back. I'll check again when you reopen me ✦`, 9000); }; r.appendChild(b); }
      el.appendChild(r); }); });
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
  const PLACE = { note: ['Note', [220, 120]], todo: ['Checklist', [240, 170]], title: ['Title', [300, 56]], coll: ['Collection', [288, 200]], swatch: ['Color', [120, 150]], doc: ['Doc', [240, 52]], canvas: ['Canvas', [260, 180]], link: ['Paste a link', [260, 52]], shape: ['', [160, 160]], stamp: ['', [56, 56]], audio: ['Voice memo', [290, 150]], piece: ['', [300, 60]], icon: ['', [28, 28]], frame: ['Screen', [393, 852]], text: ['Text', [220, 26]], box: ['Drag to draw a box', [160, 100]] , video: ['Video', [360, 246]] };
  function startPlacing(type, extra = {}) {
    if (placing?.type === type && placing.extra?.shape === extra.shape) return stopPlacing();
    stopPlacing(); placing = { type, extra }; selectOnly([]);
    const g = $('ghost'), [label, [w, h]] = PLACE[type]; g.className = 'ghost on ' + type; g.innerHTML = `<span>${label}</span>`;
    g.style.width = w + 'px'; g.style.height = (extra.shape === 'line' ? 24 : h) + 'px'; if (type === 'shape') g.innerHTML = shapeSVG({ shape: extra.shape });
    if (type === 'piece') { const P = PIECES[extra.piece], items = P.make(P.w || 360), W = Math.max(...items.map(i => i.x + i.w)), H = Math.max(...items.map(i => i.y + i.h)); g.style.width = W + 'px'; g.style.height = H + 'px'; g.querySelector('span').textContent = extra.piece; }
    if (type === 'icon') { g.innerHTML = `<span class="mi" style="font-size:28px;position:static;color:#27272a">${esc(extra.name)}</span>`; g.style.width = g.style.height = '28px'; }
    if (type === 'frame' && DEVICES[extra.device]) { g.style.width = DEVICES[extra.device][0] + 'px'; g.style.height = DEVICES[extra.device][1] + 'px'; g.querySelector('span').textContent = extra.device; }
    if (type === 'stamp') { const st = extra.stamp; g.innerHTML = stampHTML(st); g.style.width = g.style.height = '56px'; } moveGhost(); stage.classList.add('placing');
    $('tools').querySelector(`[data-add="${type}"]`)?.classList.add('on');
  }
  function stopPlacing() { if (placing?.type === 'audio') setTimeout(coolMic, 15000); $('shapePick').classList.remove('on'); $('tplPick').classList.remove('on'); $('stampWheel').classList.remove('on'); $('stampPick').classList.remove('on'); placing = null; $('ghost').className = 'ghost'; stage.classList.remove('placing'); $('tools').querySelectorAll('.on').forEach(b => b.classList.remove('on')); }
  function moveGhost() { if (!placing) return; const r = stage.getBoundingClientRect(), g = $('ghost'), o = placing.type === 'stamp' ? 28 * view.z : 14; g.style.left = mouse.x - r.left - o + 'px'; g.style.top = mouse.y - r.top - o + 'px'; g.style.transform = `scale(${view.z})`; }
  addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; moveGhost(); }, true);
  function placeAt(w) {
    if (placing.type === 'stamp') return stampAt(w, placing.extra.stamp);
    if (placing.type === 'piece') { const n = placing.extra.piece; stopPlacing(); $('dzPieces').querySelectorAll('.on').forEach(x => x.classList.remove('on')); return placePiece(n, w); }
    const type = placing.type, more = placing.extra || {}; stopPlacing();
    const dev = DEVICES[more.device], extra = type === 'icon' ? { name: more.name || 'star', color: '#27272a', w: 28, h: 28, r: 0 } : type === 'frame' ? { name: more.device === 'Desktop' ? 'Desktop' : 'Screen', device: more.device || 'Custom', w: dev ? dev[0] : 393, h: dev ? dev[1] : 852, radius: dev ? dev[2] : 0, fill: '#ffffff', r: 0 }
      : type === 'text' ? { text: '', size: 18, weight: 500, font: 'DM Sans', color: '#27272a', r: 0 } : type === 'audio' ? { r: 0 } : type === 'doc' ? { text: '', body: '' } : type === 'canvas' ? { text: '' } : type === 'link' ? { url: '' } : type === 'shape' ? { shape: more.shape, fill: 'gray', text: '', r: 0 } : type === 'note' ? { name: '', color: newNoteColor() } : type === 'todo' ? { text: '', items: [{ t: 'first thing', done: false }] } : type === 'title' ? { text: '' }
      : type === 'coll' ? { text: '', color: 'pink', kids: [], cols: 1 } : type === 'swatch' ? { hex: '#ff9ec4', label: 'Pink' } : {};
    const c = card(type, extra); c.x = snapTo(w.x - 14 / view.z); c.y = snapTo(w.y - 14 / view.z);
    if (type === 'coll') c.r = 0;
    if (type === 'link') c.h = 52;
    if (type === 'shape' && more.shape === 'line') { c.w = 200; c.h = 24; }
    if (window.__phone?.on) {   // a finger has no ghost to aim with: center it on the tap, and keep it on screen
      const r = stage.getBoundingClientRect(), z = view.z, mx = 12 / z, wl = (r.left + 12 - view.x) / z, wr = (r.right - 12 - view.x) / z, wt = (r.top + 70 - view.y) / z, wb = (r.bottom - 100 - view.y) / z;
      c.x = snapTo(clamp(w.x - c.w / 2, wl, Math.max(wl, wr - c.w))); c.y = snapTo(clamp(w.y - c.h / 2, wt, Math.max(wt, wb - c.h))); }
    if (type === 'swatch') { c.label = colorName(c.hex); c.autoName = true; }
    if (type === 'canvas') { const child = newBoard('Untitled canvas'); child.parent = board.id; child.folder = board.folder || null; c.board = child.id; MB.save(child).then(refreshBoards); }
    addCard(c); selectOnly([c.id]);
    if (type === 'note' && board.cards.filter(x => x.type === 'note' && !parentOf(x.id)).length === 6) tip('That\'s a lot of loose notes! Want me to sort them into collections? Just ask ✦');
    const t = type !== 'coll' && collAt(w, new Set([c.id])); if (t) { dropInto(t, [c.id], w); save(); }
    if (WF.includes(type)) { fileIntoFrame([c]); pickWF(null); }
    if (['note', 'todo', 'title', 'doc', 'canvas', 'text'].includes(type)) startEdit(c.id);   // ready to type right away, so the first letters never act as shortcuts
    if (type === 'coll') startEdit(c.id);
    if (type === 'swatch') setTimeout(() => openColor(c), 60);
    if (type === 'audio') { c.ready = true; renderCard(c); selectOnly([c.id]); save(); }
    if (type === 'video') { c.ready = true; renderCard(c); selectOnly([c.id]); save(); camOn(c); }   // it waits for Start recording, so nothing records by surprise
  }

  // ---------- design thinking templates: a ready-made layout with one or two examples, plus Mochi's how-to note (delete it anytime) ----------
  // items: title / note / coll (a collection with example notes) / how (Mochi's note). keys + links draw arrows between items.
  const FRAMEWORKS = {
    affinity: { emoji: '🧩', name: 'Affinity map', line: 'Cluster notes into themes', items: [
      { t: 'title', x: 0, y: 0, text: 'Affinity map' },
      { t: 'coll', x: 0, y: 90, name: 'Raw notes', color: 'white', notes: [{ text: '“I never know if my payment went through”' }, { text: '“I check my balance three times a day”' }, { text: 'Skipped the tutorial, then got lost' }, { text: '“The fees feel hidden”' }] },
      { t: 'coll', x: 330, y: 90, name: 'People don’t trust the numbers', color: 'pink', notes: [{ text: '“I never know if my payment went through”', color: 'pink' }, { text: '“The fees feel hidden”', color: 'pink' }] },
      { t: 'coll', x: 660, y: 90, name: 'Name a theme', color: 'mint', notes: [{ text: 'Drag notes that feel alike in here', color: 'mint' }] },
      { t: 'how', x: 990, y: 90, text: 'Write one observation per note, in Raw notes. Then drag notes that feel alike into the same group.\n\nName each group as an insight, like “People don’t trust the numbers”, not just “Trust”.\n\nStuck? Ask me to group them by theme.' },
    ] },
    opportunity: { emoji: '🌳', name: 'Opportunity map', line: 'Outcome → opportunities → solutions', items: [
      { t: 'title', x: 0, y: 0, text: 'Opportunity map' },
      { t: 'note', key: 'o', x: 330, y: 90, name: 'Outcome', text: 'More people finish signing up', color: 'sky' },
      { t: 'note', key: 'p1', x: 120, y: 300, name: 'Opportunity', text: '“I don’t know why it needs my ID”', color: 'butter' },
      { t: 'note', key: 'p2', x: 540, y: 300, name: 'Opportunity', text: '“Setting up takes too long”', color: 'butter' },
      { t: 'note', key: 's1', x: 0, y: 510, name: 'Solution', text: 'Explain why, right on that screen', color: 'mint' },
      { t: 'note', key: 's2', x: 240, y: 510, name: 'Solution', text: 'Let people add their ID later', color: 'mint' },
      { t: 'note', key: 's3', x: 540, y: 510, name: 'Solution', text: 'Save progress so they can come back', color: 'mint' },
      { t: 'note', key: 'e1', x: 0, y: 720, name: 'Test', text: 'Show the new copy to 5 people', color: 'lilac' },
      { t: 'how', x: 900, y: 90, text: 'Start at the top with the outcome you want.\n\nUnder it, add opportunities: needs and pains you heard from real people, in their words.\n\nUnder each one, a few solutions, then a small test to try first.\n\nDrag from a card’s edge to draw the lines, so you always know why you’re building something.' },
    ], links: [['o', 'p1'], ['o', 'p2'], ['p1', 's1'], ['p1', 's2'], ['p2', 's3'], ['s1', 'e1']] },
    matrix: { emoji: '⚖️', name: 'Impact / effort', line: 'Sort ideas into four boxes', items: [
      { t: 'title', x: 0, y: 0, text: 'Impact / effort' },
      { t: 'coll', x: 0, y: 90, name: '⚡ Quick wins', color: 'mint', notes: [{ text: 'Add a “save for later” button', color: 'mint' }] },
      { t: 'coll', x: 330, y: 90, name: '🚀 Big bets', color: 'sky', notes: [{ text: 'Rebuild search', color: 'sky' }] },
      { t: 'coll', x: 0, y: 360, name: '🧺 Fill-ins', color: 'butter', notes: [{ text: 'New empty-state art', color: 'butter' }] },
      { t: 'coll', x: 330, y: 360, name: '💤 Skip for now', color: 'pink', notes: [{ text: 'Custom themes', color: 'pink' }] },
      { t: 'how', x: 660, y: 90, text: 'Write every idea on its own note, then drop each one into a box.\n\nQuick wins: big impact, little effort. Big bets: big impact, lots of effort. Fill-ins: small and easy. Skip for now: small and hard.\n\nDo the quick wins first. Plan the big bets. Fill-ins are for slow days. Be honest about the last box.\n\nNot sure where one goes? Compare it to its neighbors, not to a perfect score.' },
    ] },
    empathy: { emoji: '💭', name: 'Empathy map', line: 'What they say, think, do and feel', items: [
      { t: 'title', x: 0, y: 0, text: 'Empathy map' },
      { t: 'note', x: 245, y: 90, name: 'Who', text: 'Maya, saving for her first apartment', color: 'lilac' },
      { t: 'coll', x: 0, y: 270, name: 'Says', color: 'sky', notes: [{ text: '“I just want to know I’m on track”', color: 'sky' }] },
      { t: 'coll', x: 330, y: 270, name: 'Thinks', color: 'lilac', notes: [{ text: 'Am I doing this wrong?', color: 'lilac' }] },
      { t: 'coll', x: 0, y: 520, name: 'Does', color: 'butter', notes: [{ text: 'Checks the app every morning', color: 'butter' }] },
      { t: 'coll', x: 330, y: 520, name: 'Feels', color: 'pink', notes: [{ text: 'Nervous before payday', color: 'pink' }] },
      { t: 'how', x: 660, y: 90, text: 'Pick one real person (or a clear type of person) and write who they are up top.\n\nFill each box from interviews and research, not guesses. Quotes go in Says.\n\nThe gold is where Says and Thinks don’t match. That gap is usually the real problem.' },
    ] },
    journey: { emoji: '🗺️', name: 'Journey map', line: 'Steps, feelings and pain points', items: [
      { t: 'title', x: 0, y: 0, text: 'Journey map' },
      { t: 'coll', x: 0, y: 90, name: '1 · Hears about it', color: 'sky', notes: [{ text: 'Sees a friend’s post', color: 'white' }, { text: '😊 Curious', color: 'mint' }] },
      { t: 'coll', x: 300, y: 90, name: '2 · Signs up', color: 'lilac', notes: [{ text: 'Fills out 4 screens', color: 'white' }, { text: '😩 “Why do you need my ID?”', color: 'pink' }] },
      { t: 'coll', x: 600, y: 90, name: '3 · First use', color: 'butter', notes: [{ text: 'Sets a savings goal', color: 'white' }] },
      { t: 'coll', x: 900, y: 90, name: '4 · Comes back', color: 'mint', notes: [{ text: 'What brings them back?', color: 'white' }] },
      { t: 'how', x: 1200, y: 90, text: 'One column per step, in order. In each, add what they do (white), how they feel (green = good, pink = rough) and what gets in the way.\n\nThe pink notes are your opportunities.\n\nRename the steps to fit your product.' },
    ] },
    hmw: { emoji: '💡', name: 'How might we', line: 'Turn problems into questions', items: [
      { t: 'title', x: 0, y: 0, text: 'How might we…' },
      { t: 'coll', x: 0, y: 90, name: 'Problems we heard', color: 'pink', notes: [{ text: 'People abandon sign up at the ID step', color: 'pink' }] },
      { t: 'coll', x: 330, y: 90, name: 'How might we…', color: 'butter', notes: [{ text: 'HMW make the ID step feel safe?', color: 'butter' }, { text: 'HMW let people start before the ID step?', color: 'butter' }] },
      { t: 'how', x: 660, y: 90, text: 'Write each problem on its own note. Then flip it into a question that starts with “How might we…”.\n\nGood ones are wide enough to have many answers, but narrow enough to start on today.\n\nWrite a few versions of each, then vote with stamps.' },
    ] },
    rtb: { emoji: '🌹', name: 'Rose, thorn, bud', line: 'A quick, kind retro', items: [
      { t: 'title', x: 0, y: 0, text: 'Rose, thorn, bud' },
      { t: 'coll', x: 0, y: 90, name: '🌹 Rose · what’s working', color: 'pink', notes: [{ text: 'Testing every Friday kept us honest', color: 'pink' }] },
      { t: 'coll', x: 330, y: 90, name: '🌵 Thorn · what hurt', color: 'peach', notes: [{ text: 'Handoff to engineering was rushed', color: 'peach' }] },
      { t: 'coll', x: 660, y: 90, name: '🌱 Bud · what could grow', color: 'mint', notes: [{ text: 'Share the research earlier', color: 'mint' }] },
      { t: 'how', x: 990, y: 90, text: 'Everyone writes quietly for 5 minutes: one note per thought.\n\nRoses are wins, thorns are pains, buds are ideas worth trying.\n\nThen read them out, group the alike ones, and pick one bud to try next.' },
    ] },
  };
  function placeFramework(key) {
    const F = FRAMEWORKS[key]; if (!F) return; remember(); stopPlacing();
    const c0 = centerWorld(), x0 = board.cards.length ? Math.max(...board.cards.map(c => c.x + c.w)) + 200 : c0.x - 500, y0 = board.cards.length ? Math.min(...board.cards.map(c => c.y)) : c0.y - 300;
    const made = [], keyed = {};
    F.items.forEach(it => {
      const at = { x: x0 + it.x, y: y0 + it.y };
      if (it.t === 'title') made.push(addCard(card('title', { ...at, text: it.text }), true));
      if (it.t === 'note') { const c = addCard(card('note', { ...at, text: it.text, name: it.name, color: it.color || 'white' }), true); made.push(c); if (it.key) keyed[it.key] = c; }
      if (it.t === 'how') made.push(addCard(card('note', { ...at, w: 280, h: 300, r: 1.5, name: 'Mochi’s how-to', text: it.text, color: 'white', mochi: true }), true));
      if (it.t === 'coll') {
        const kids = it.notes.map(n => card('note', { text: n.text, color: n.color || 'white', r: 0 }));
        const s2 = card('coll', { ...at, text: it.name, color: it.color, kids: kids.map(k => k.id), cols: 1, r: 0 });
        board.cards.push(s2); renderCard(s2, true); kids.forEach(k => { board.cards.push(k); renderCard(k, true); }); made.push(s2, ...kids);
      }
    });
    (F.links || []).forEach(([a, b]) => keyed[a] && keyed[b] && board.links.push({ id: uid(), a: keyed[a].id, b: keyed[b].id, arrow: true }));
    // notes grow to fit their words
    made.filter(c => c.type === 'note' && !parentOf(c.id)).forEach(c => { const el = cardsEl.querySelector(`[data-id="${c.id}"]`), b = el?.querySelector('.body'); if (!b) return; b.style.height = 'auto'; c.h = Math.max(c.h, b.offsetHeight + 8); b.style.height = ''; el.style.height = c.h + 'px'; });
    layoutAll(); renderWires(); save(); fit(made);
    say(`Here’s ${/^[aeiou]/i.test(F.name) ? 'an' : 'a'} ${F.name.toLowerCase()} ${F.emoji} My how-to note is on the right. Delete it whenever you’re ready ✦`, 7000);
  }
  // little line icons for the menu, drawn like the toolbar's
  const TPL_IC = {
    affinity: '<rect x="2.5" y="3" width="5" height="5" rx="1.2"/><rect x="4.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="12" y="3.5" width="5" height="5" rx="1.2"/><rect x="11.5" y="11" width="5" height="5" rx="1.2"/>',
    opportunity: '<rect x="7.5" y="2.5" width="5" height="3.5" rx="1"/><rect x="2.5" y="9" width="5" height="3.5" rx="1"/><rect x="12.5" y="9" width="5" height="3.5" rx="1"/><rect x="2.5" y="15" width="5" height="2.5" rx="1"/><path d="M10 6v1.5M5 9V7.5h10V9M5 12.5V15"/>',
    matrix: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M10 3v14M3 10h14"/><circle cx="13.5" cy="6.5" r="1" fill="currentColor"/>',
    empathy: '<path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z"/><path d="M10 11.5s-2.6-1.5-2.6-3.1a1.3 1.3 0 0 1 2.6-.4 1.3 1.3 0 0 1 2.6.4c0 1.6-2.6 3.1-2.6 3.1z"/>',
    journey: '<circle cx="4.5" cy="15" r="1.8"/><circle cx="15.5" cy="5" r="1.8"/><path d="M6.2 14.4c3-1 1.5-4.4 4.3-5.4 1.6-.6 2.7-1.4 3.4-2.6"/><path d="M15.5 9.5v.01M11 16h.01M14 13.5h.01" stroke-width="2.2"/>',
    hmw: '<path d="M7.5 14.5h5M8.3 17h3.4M10 2.8a5 5 0 0 0-3 9c.6.5 1 1.2 1 2v.7h4v-.7c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z"/>',
    rtb: '<circle cx="10" cy="7" r="3.6"/><path d="M10 5.3c-.9.4-1.2 1.4-.6 2.1M10 10.6V17.5M10 14c-2.3 0-3.8-1.2-4.2-3 2 0 3.6.9 4.2 3zM10 15.5c1.8 0 3.2-1 3.6-2.6-1.7 0-3.1.8-3.6 2.6z"/>',
  };
  // the old "Start from" boards live here now too, under the frameworks: each opens as its own new board
  const STARTERS = {
    'Moodboard': ['References, colors and type for a feeling', '<path d="M10 2.8a7.2 7.2 0 1 0 0 14.4c1.2 0 1.8-.9 1.4-1.9-.5-1.1.2-2.3 1.4-2.3h1.7a2.7 2.7 0 0 0 2.7-2.7c0-4.2-3.2-7.5-7.2-7.5z"/><circle cx="6.6" cy="9" r=".9" fill="currentColor"/><circle cx="9" cy="6.2" r=".9" fill="currentColor"/><circle cx="12.6" cy="6.8" r=".9" fill="currentColor"/>'],
    'App plan': ['Who it\'s for, the problem, the screens', '<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M8.5 6h3M8.5 9h3M8.5 12h2"/>'],
    'Brain dump': ['Empty your head, then let Mochi sort it', '<path d="M10 3.5c-3.6 0-6.5 2.4-6.5 5.5 0 1.9 1.1 3.5 2.8 4.5l-.6 3 3-1.8c.4.1.9.1 1.3.1 3.6 0 6.5-2.4 6.5-5.8S13.6 3.5 10 3.5z"/><path d="M7.5 8.5h5M7.5 11h3"/>'],
  };
  $('tplPick').innerHTML = '<div class="tp-h">Add to this board</div>' + Object.entries(FRAMEWORKS).map(([k, F]) => `<button data-tpl="${k}"><span class="tp-e"><svg viewBox="0 0 20 20">${TPL_IC[k]}</svg></span><span class="tp-t"><b>${esc(F.name)}</b><small>${esc(F.line)}</small></span></button>`).join('')
    + '<div class="tp-h">Start a new board</div>' + Object.entries(STARTERS).filter(([k]) => TEMPLATES[k]).map(([k, [line, ic]]) => `<button data-starter="${esc(k)}"><span class="tp-e"><svg viewBox="0 0 20 20">${ic}</svg></span><span class="tp-t"><b>${esc(k)}</b><small>${esc(line)}</small></span><span class="tp-new">New ↗</span></button>`).join('');
  $('tplPick').onclick = async e => { const st = e.target.closest('[data-starter]');
    if (st) { $('tplPick').classList.remove('on'); $('tools').querySelector('[data-add="tpl"]').classList.remove('on'); const name = st.dataset.starter, b = newBoard(name, name); await MB.save(b); await openBoard(b.id); fit(board.cards); refreshBoards(); return; }
    const b = e.target.closest('[data-tpl]'); if (!b) return; $('tplPick').classList.remove('on'); $('tools').querySelector('[data-add="tpl"]').classList.remove('on'); placeFramework(b.dataset.tpl); };

  // ---------- export: right-click a card (or the empty board) to save it as an image or PDF ----------
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function exportCards(cs, name, pdf) {
    if (!cs.length) return say('Nothing to export yet ✦', 2500);
    if (MB.web) return say('Saving images and PDFs works in the Mac app ✦', 0, DL);
    const all = new Set(cs); cs.forEach(c => { if (c.type === 'coll') (c.kids || []).forEach(k => byId(k) && all.add(byId(k))); if (c.type === 'frame') onFrame(c).forEach(k => all.add(k)); });
    const list = [...all], x0 = Math.min(...list.map(c => c.x)) - 24, y0 = Math.min(...list.map(c => c.y)) - 40, x1 = Math.max(...list.map(c => c.x + c.w)) + 24, y1 = Math.max(...list.map(c => c.y + c.h)) + 24;
    const keep = { ...view }, keepSel = [...sel], r = stage.getBoundingClientRect(), bw = x1 - x0, bh = y1 - y0;
    selectOnly([]); selWire = null; endEdit(); renderWires(); document.body.classList.add('exporting');
    const z = Math.min((r.width - 60) / bw, (r.height - 60) / bh, 2); view = { x: (r.width - bw * z) / 2 - x0 * z, y: (r.height - bh * z) / 2 - y0 * z, z }; applyView();
    await nextFrame(); await new Promise(res => setTimeout(res, 150));
    try {
      const saved = await MB.exportRect({ x: r.left + (r.width - bw * z) / 2, y: r.top + (r.height - bh * z) / 2, w: bw * z, h: bh * z, name, pdf, scale: Math.min(4, 2 / Math.min(z, 1)) });
      if (saved) chirp(`Saved “${saved}” ✦`, 3500);
    } catch (e) { say(e.message, 4000); }
    finally { document.body.classList.remove('exporting'); view = keep; applyView(); selectOnly(keepSel); }
  }
  function boardMenu(e, items) {
    $('rowMenu')?.remove(); const m = document.createElement('div'); m.id = 'rowMenu'; m.className = 'row-menu'; m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
    m.innerHTML = items.map((it, i) => it === '-' ? '<span class="rm-sep"></span>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.label}</button>`).join('');
    document.body.appendChild(m); const rr = m.getBoundingClientRect(); if (rr.bottom > innerHeight - 10) m.style.top = innerHeight - rr.height - 10 + 'px'; if (rr.right > innerWidth - 10) m.style.left = innerWidth - rr.width - 10 + 'px';
    m.onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; m.remove(); items[+b.dataset.i].run(); };
    setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true));
  }
  const cardName = cs => (cs.length === 1 ? (cs[0].name || cs[0].text || cs[0].title || cs[0].label || ({ image: 'Image', stamp: 'Stamp', shape: 'Shape' }[cs[0].type]) || 'Card') : `${board.name} – ${cs.length} cards`).toString().slice(0, 60).trim() || 'Card';
  stage.addEventListener('contextmenu', e => {
    // holding something (a sticker, a note to place, a shape) or a picker is open: a right-click just puts it down, like Esc
    if (placing || ['stampWheel', 'stampPick', 'shapePick', 'tplPick'].some(id => $(id).classList.contains('on'))) { e.preventDefault(); stopPlacing(); return; }
    if (e.target.closest('.dock, .side, .tray, .top, .home, .docview, .cpop, .settings')) return;
    e.preventDefault(); const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');   // the pointer may be captured, so look at what's really under it
    if (el) {
      if (!sel.has(el.dataset.id)) selectOnly([el.dataset.id]); const cs = selCards();
      boardMenu(e, [
        ...(cs.length > 1 && !cs.every(c => c.group && c.group === cs[0].group) ? [{ label: 'Group  ⌘G', run: () => { remember(); groupSel(true); } }] : []),
        ...(cs.some(c => c.group) ? [{ label: 'Ungroup  ⇧⌘G', run: () => { remember(); groupSel(false); } }] : []),
        { label: 'Export as image', run: () => exportCards(cs, cardName(cs), false) },
        { label: 'Export as PDF', run: () => exportCards(cs, cardName(cs), true) },
        ...(spotsIn(cs).length ? [{ label: `Fill ${spotsIn(cs).length} image spot${spotsIn(cs).length > 1 ? 's' : ''}…`, run: () => offerFill(spotsIn(cs)) }] : []), '-',
        { label: 'Duplicate', run: () => { const gm = {}, copies = cs.filter(c => c.type !== 'coll').map(c => Object.assign(JSON.parse(JSON.stringify(c)), { id: uid(), r: tilt(), x: c.x + 30, y: c.y + 30 })); copies.forEach(c => { if (c.group) c.group = gm[c.group] || (gm[c.group] = uid()); }); copies.forEach(c => addCard(c)); selectOnly(copies.map(c => c.id)); } },
        { label: 'Delete', danger: true, run: () => removeSelected() }]);
    } else boardMenu(e, [
      { label: 'Background color…', run: () => tintPicker('bg', { x: e.clientX + 12, y: e.clientY - 40 }, true) },
      ...(board.bg ? [{ label: 'Use the default background', run: () => { delete board.bg; save(); applyColors(); } }] : []),
      '-',
      { label: 'Export board as image', run: () => exportCards(board.cards, board.name, false) },
      { label: 'Export board as PDF', run: () => exportCards(board.cards, board.name, true) }]);
  });

  // ---------- voice memos: record straight onto the board, play them back, and Mochi writes them out ----------
  const PLAY = '<svg viewBox="0 0 12 12"><path d="M3 1.6v8.8L10.2 6z"/></svg>', PAUSE = '<svg viewBox="0 0 12 12"><rect x="2.2" y="1.8" width="2.6" height="8.4" rx=".8"/><rect x="7.2" y="1.8" width="2.6" height="8.4" rx=".8"/></svg>';
  const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const live = new Map();     // card id → { recorder, stream, timer, ... } while recording
  const players = new Map();  // card id → Audio
  const MIC = '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/></svg>';
  function fitAudio(c, el) { const b = el.querySelector('.body'); if (!b) return; b.style.height = 'auto'; const h = Math.max(150, b.offsetHeight); b.style.height = ''; if (Math.abs(h - c.h) > 2) { c.h = h; el.style.height = h + 'px'; renderWires(); } }
  // the first time someone picks the voice memo tool, ask for the mic (and speech) right then; macOS remembers the answer
  let micOK = false, warm = null, warmT = 0;
  // the mic switches on as soon as the tool is picked, so the first words aren't lost while it wakes up; it switches off again if nothing gets recorded
  function warmMic(st) { clearTimeout(warmT); if (warm && warm !== st) warm.getTracks().forEach(t => t.stop()); warm = st; warmT = setTimeout(coolMic, 60000); }
  function coolMic() { if (warm && !live.size) { warm.getTracks().forEach(t => t.stop()); warm = null; } }
  // ---------- video cards: record yourself with the camera, or drop in a video file ----------
  const SPK = '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8v4h3l4 3.5v-11l-4 3.5z"/><path class="w" d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.5 6.5 0 0 1 0 9"/></svg>';
  const vids = new Map(), cams = new Map(), VBAR = 44;   // one long-lived player / camera per card, moved back in after every redraw so playback never restarts
  const vEl = id => cardsEl.querySelector(`[data-id="${id}"]`);
  function setupVideo(c, el) {
    if (c.src) {
      let v = vids.get(c.id);
      if (!v) { v = document.createElement('video'); v.className = 'vd-v'; v.playsInline = true; v.preload = 'metadata'; if (c.poster) v.poster = c.poster; vids.set(c.id, v);
        MB.mediaURL(c.src).then(u => { if (u) v.src = u; });
        const paint = () => { const e2 = vEl(c.id); if (!e2) return; const f = (v.currentTime || 0) / (v.duration || c.dur || 1);
          const bar = e2.querySelector('.vd-prog i'); if (bar) bar.style.width = (f * 100).toFixed(2) + '%';
          const t = e2.querySelector('.vd-time'); if (t) t.textContent = v.paused && !v.currentTime ? fmtT(c.dur || v.duration || 0) : `${fmtT(v.currentTime)} / ${fmtT(c.dur || v.duration || 0)}`; };
        v.addEventListener('timeupdate', paint); v.addEventListener('seeked', paint);
        ['play', 'pause', 'ended'].forEach(t => v.addEventListener(t, () => { vEl(c.id)?.classList.toggle('playing', !v.paused); paint(); }));
        v.addEventListener('loadedmetadata', () => { if (!c.dur && isFinite(v.duration)) { c.dur = v.duration; save(); } paint(); }); }
      v.muted = !!c.muted; el.querySelector('.vd-v').replaceWith(v); el.classList.toggle('playing', !v.paused);
      return;
    }
    const cam = cams.get(c.id), slot = el.querySelector('.vd-live');
    if (slot && cam) { slot.replaceWith(cam.view); cam.view.play().catch(() => {}); }
  }
  async function camOn(c) {
    if (cams.has(c.id)) return cams.get(c.id);
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true }); }
    catch (e) { c.camErr = 'Mochiboard needs the camera. Turn it on in System Settings → Privacy & Security → Camera, then click Start recording again.'; c.camRest = false; renderCard(c); return null; }
    const view = document.createElement('video'); view.className = 'vd-live'; view.muted = true; view.playsInline = true; view.autoplay = true; view.srcObject = stream;
    const cam = { stream, view, idle: 0 }; cams.set(c.id, cam); c.camErr = ''; c.camRest = false;
    // the camera rests after a minute of waiting (no recording), and switches off if the card goes away
    cam.tick = setInterval(() => { if (!vEl(c.id) || (!c.rec && (cam.idle += 2) >= 60)) { camOff(c.id); if (byId(c.id) && !c.src) { c.camRest = true; renderCard(c); } } }, 2000);
    renderCard(c); return cam;
  }
  function camOff(id) { const cam = cams.get(id); if (!cam) return; clearInterval(cam.tick); cam.stream.getTracks().forEach(t => t.stop()); cams.delete(id); }
  async function videoRecord(c) {
    const cam = await camOn(c); if (!cam) return;
    const type = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    let stream = cam.stream, stopSlice = () => {};
    if (c.vert) { const st = cam.stream.getVideoTracks()[0]?.getSettings() || {}, W0 = cam.view.videoWidth || st.width || 1280, H0 = cam.view.videoHeight || st.height || 720;   // the real frame size, not what the camera says it sends
      const H = H0, W = Math.round(H * 9 / 16 / 2) * 2, cv = document.createElement('canvas'), g = cv.getContext('2d'); cv.width = W; cv.height = H; let on = true;
      (function slice() { if (!on) return; try { const fw = cam.view.videoWidth || W0, fh = cam.view.videoHeight || H0, sw = Math.round(fh * 9 / 16); g.drawImage(cam.view, (fw - sw) / 2, 0, sw, fh, 0, 0, W, H); } catch (e) {} requestAnimationFrame(slice); })();   // re-measured every frame, in case the camera changes size
      stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...cam.stream.getAudioTracks()]); stopSlice = () => { on = false; stream.getVideoTracks().forEach(t => t.stop()); }; }
    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: c.vert ? 3000000 : 2500000 } : undefined), chunks = [];
    cam.rec = rec; cam.idle = 0; c.rec = true; c.ready = false; selectOnly([c.id]);
    for (const n of [3, 2, 1]) { c.count = n; renderCard(c); await new Promise(r => setTimeout(r, 700)); if (!cams.has(c.id) || !c.rec) return; }
    c.count = 0; renderCard(c);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => { stopSlice(); const blob = new Blob(chunks, { type: (rec.mimeType || 'video/mp4').split(';')[0] }), secs = (Date.now() - cam.t0) / 1000; camOff(c.id);
      const when = new Date(); c.title = c.title || `Video · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      await fillVideo(c, blob, secs); };
    cam.t0 = Date.now(); rec.start(500);
    (function clock() { const e2 = vEl(c.id); if (!c.rec || !cams.has(c.id)) return; const t = e2?.querySelector('.vd-rtime'); if (t) t.textContent = fmtT((Date.now() - cam.t0) / 1000);
      if (Date.now() - cam.t0 > 15 * 60 * 1000) return videoAct(c, 'vd-stop');   // a 15 minute limit keeps files a sensible size
      setTimeout(clock, 250); })();
  }
  // a still from the video (for the poster and the board's thumbnails), plus its size and length
  function videoInfo(url) {
    return new Promise(res => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url; let done = false;
      const finish = poster => { if (done) return; done = true; res({ poster, vw: v.videoWidth, vh: v.videoHeight, dur: isFinite(v.duration) ? v.duration : 0 }); };
      v.onloadeddata = () => { try { v.currentTime = Math.min(.3, (v.duration || 1) / 10); } catch (e) { finish(''); } };
      v.onseeked = () => { try { const W = 480, cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(W * v.videoHeight / (v.videoWidth || 1)) || 270; cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); finish(cv.toDataURL('image/jpeg', .8)); } catch (e) { finish(''); } };
      v.onerror = () => finish(''); setTimeout(() => finish(''), 8000); });
  }
  async function fillVideo(c, blob, secs) {
    if (blob.size > 1024 * 1024 * 1024) return say('That video is over 1 GB, which is too big for a board. Try a shorter clip ✦', 7000);
    c.rec = false; c.ready = false; c.count = 0; c.saving = true; c.pct = 0; c.title = c.title || (blob.name ? blob.name.replace(/\.[^.]+$/, '') : 'Video'); renderCard(c);
    const local = URL.createObjectURL(blob), info = await videoInfo(local); URL.revokeObjectURL(local);
    let src; try { src = await MB.saveMedia(blob, f => { c.pct = f; const s2 = vEl(c.id)?.querySelector('.vd-msg span'); if (s2) s2.textContent = Math.round(f * 100) + '%'; }); }
    catch (e) { c.saving = false; c.ready = true; renderCard(c); return say("I couldn't save that video: " + e.message, 8000); }
    vids.get(c.id)?.pause(); vids.delete(c.id);
    Object.assign(c, { saving: false, pct: 0, src, poster: info.poster, dur: info.dur || secs || 0, vw: info.vw, vh: info.vh });
    if (info.vw && info.vh) c.h = Math.round(c.w * info.vh / info.vw) + VBAR;
    renderCard(c); selectOnly([c.id]); save();
  }
  function addVideo(file, at) {
    const p = at || centerWorld(), c = card('video', { title: file.name.replace(/\.[^.]+$/, '') }); c.x = p.x - c.w / 2; c.y = p.y - c.h / 2; addCard(c); fillVideo(c, file);
  }
  function videoAct(c, act, e) {
    const v = vids.get(c.id), el = vEl(c.id);
    if (act === 'vd-play' && v) { if (v.paused) { if (v.ended) v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); }
    if (act === 'vd-seek' && v && e) { const r = el.querySelector('.vd-prog').getBoundingClientRect(); v.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * (v.duration || c.dur || 0); }
    if (act === 'vd-mute') { c.muted = !c.muted; if (v) v.muted = c.muted; renderCard(c); save(); }
    if (act === 'vd-wake') camOn(c);
    if ((act === 'vd-wide' || act === 'vd-tall') && !c.rec) { const vert = act === 'vd-tall'; if (!!c.vert === vert) return;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2; c.vert = vert; c.w = vert ? 230 : 360; c.h = vert ? Math.round(230 * 16 / 9) + VBAR : 246; c.x = cx - c.w / 2; c.y = cy - c.h / 2; renderCard(c); selectOnly([c.id]); save(); }
    if (act === 'vd-start') videoRecord(c);
    if (act === 'vd-stop') { const cam = cams.get(c.id);
      if (cam?.rec && cam.rec.state !== 'inactive' && !c.count) cam.rec.stop();
      else { c.rec = false; c.count = 0; c.ready = true; renderCard(c); } }   // stopped during the countdown: back to ready (nothing was sliced yet)
    if (act === 'vd-file') { $('filePick').dataset.into = c.id; $('filePick').click(); }
  }

  async function readyToRecord() {
    if (micOK) { if (!warm) try { warmMic(await navigator.mediaDevices.getUserMedia({ audio: true })); } catch (e) {} return true; }
    try { warmMic(await navigator.mediaDevices.getUserMedia({ audio: true })); }
    catch (e) { say("Mochiboard needs the microphone for voice memos. Turn it on in System Settings → Privacy & Security → Microphone, then try again ✦", 10000); return false; }
    micOK = true;
    const sp = await MB.speechAuth().catch(() => 'off');
    if (sp === 'off') say("Recording works! To have me write memos out, turn on Speech Recognition for Mochiboard in System Settings → Privacy & Security.", 9000);
    return true;
  }
  async function record(c) {
    let stream = warm && warm.active ? warm : null; warm = null; clearTimeout(warmT);
    try { if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { say("I can't hear you yet. Let Mochiboard use the microphone (System Settings → Privacy & Security → Microphone), then try again.", 9000); if (!c.src) { sel = new Set([c.id]); removeSelected(); } return; }
    const chunks = [], recorder = new MediaRecorder(stream), ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an);
    const L = { recorder, stream, ac, start: Date.now(), paused: 0, pausedAt: 0 }; live.set(c.id, L);
    c.rec = true; c.ready = false; c.paused = false; c.starting = true; renderCard(c); selectOnly([c.id]);
    recorder.onstart = () => { c.starting = false; L.start = Date.now(); renderCard(c); };   // only say "Recording…" once it's really listening
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); ac.close(); live.delete(c.id);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' }), url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      let wave = [], dur = (Date.now() - L.start - L.paused) / 1000;
      try { const buf = await new AudioContext().decodeAudioData(await blob.arrayBuffer()), d = buf.getChannelData(0), n = 44, step = Math.floor(d.length / n); dur = buf.duration;
        for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(d[j])); wave.push(m); }
        const top = Math.max(...wave, .01); wave = wave.map(v => +(v / top).toFixed(2)); } catch (e) { wave = Array(44).fill(.3); }
      const when = new Date();
      Object.assign(c, { rec: false, paused: false, src: url, dur, wave, text: '', txNote: '', title: c.title || `Voice memo · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` });
      renderCard(c); save(); transcribe(c);
    };
    // count 3·2·1 right away while the mic wakes up in the background; recording starts on "go" once real sound is coming in
    (async () => {
      const buf = new Uint8Array(an.fftSize), awake = () => { an.getByteTimeDomainData(buf); return buf.some(v => Math.abs(v - 128) > 1); };
      for (const n of [3, 2, 1]) { c.count = n; renderCard(c); await new Promise(r => setTimeout(r, 650)); if (!live.has(c.id)) return; }
      const t0 = Date.now(); if (!awake()) { c.count = 'connecting'; renderCard(c); }
      while (!awake() && Date.now() - t0 < 8000) { await new Promise(r => setTimeout(r, 60)); if (!live.has(c.id)) return; }
      c.count = 0; recorder.start(250);
    })();
    const cv = () => cardsEl.querySelector(`[data-id="${c.id}"] .au-live`), data = new Uint8Array(an.frequencyBinCount);
    (function draw() {
      if (!live.has(c.id)) return; const el = cardsEl.querySelector(`[data-id="${c.id}"]`), canvas = cv();
      if (canvas) { const g = canvas.getContext('2d'); an.getByteTimeDomainData(data); g.clearRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#f27aa8';
        for (let i = 0; i < 44; i++) { const v = Math.abs(data[Math.floor(i * data.length / 44)] - 128) / 128, h = Math.max(4, v * canvas.height * 2.2); g.fillRect(i * 12, (canvas.height - h) / 2, 7, Math.min(h, canvas.height)); } }
      const t = el?.querySelector('.au-time'); if (t && !c.paused) t.textContent = fmtT((Date.now() - L.start - L.paused) / 1000);
      requestAnimationFrame(draw);
    })();
  }
  async function transcribe(c) {
    try { const text = await MB.transcribe(c.src); c.text = (text || '').trim(); c.txNote = c.text ? '' : "I couldn't make out any words in that one."; }
    catch (e) { c.txNote = e.message; }
    renderCard(c); save();
    if (c.text) say('I wrote out your voice memo ✦ Want me to turn it into notes?', 6000, [{ label: 'Turn into notes', run: () => audioAct(c, 'au-notes') }, { label: 'Not now', ghost: true, run: () => {} }]);
  }
  function audioAct(c, act, e) {
    const L = live.get(c.id), el = cardsEl.querySelector(`[data-id="${c.id}"]`);
    if (act === 'au-stop' && L) { if (L.recorder.state !== 'inactive') L.recorder.stop();
      else { L.stream.getTracks().forEach(t => t.stop()); L.ac.close(); live.delete(c.id); c.rec = false; c.count = 0; c.starting = false; if (!c.src) c.ready = true; renderCard(c); save(); } }   // stopped before it began
    if (act === 'au-pause' && L && L.recorder.state === 'inactive') return;
    if (act === 'au-pause' && L) { if (c.paused) { L.recorder.resume(); L.paused += Date.now() - L.pausedAt; } else { L.recorder.pause(); L.pausedAt = Date.now(); } c.paused = !c.paused; renderCard(c); }
    if (act === 'au-start') { readyToRecord().then(ok => { if (ok) record(c); }); return; }
    if (act === 'au-replace') { players.get(c.id)?.pause(); players.delete(c.id); record(c); }
    if (act === 'au-notes') ask(`This is a voice memo I recorded (card ${c.id}). Turn it into short notes on the board, placed just to the right of that card, grouped if there are a few ideas:\n"${c.text}"`);
    if (act === 'au-play' || act === 'au-seek') {
      let p = players.get(c.id); if (!p) { p = new Audio(c.src); players.set(c.id, p); }
      if (act === 'au-seek' && e) { const r = el.querySelector('.au-wave').getBoundingClientRect(); p.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * (c.dur || p.duration || 0); if (p.paused) p.play(); }
      else if (p.paused) p.play(); else p.pause();
      const tick = () => { const e2 = cardsEl.querySelector(`[data-id="${c.id}"]`); if (!e2) return; const f = (p.currentTime || 0) / (c.dur || p.duration || 1);
        e2.querySelectorAll('.au-wave i').forEach((b, i, all) => b.classList.toggle('past', i / all.length < f));
        e2.querySelector('.au-time').textContent = `${fmtT(p.currentTime || 0)} / ${fmtT(c.dur || 0)}`; const pb = e2.querySelector('.au-play'); pb.innerHTML = p.paused ? PLAY : PAUSE; pb.classList.toggle('on', !p.paused);
        if (!p.paused) requestAnimationFrame(tick); };
      p.onended = tick; requestAnimationFrame(tick);
    }
  }

  // ---------- wireframes: screens, boxes and text, a design panel, and snapping ----------
  const WF = ['frame', 'box', 'text', 'icon'];
  const DEVICES = { iPhone: [393, 852, 44], Android: [412, 915, 28], iPad: [834, 1194, 20], Desktop: [1440, 1024, 10], Watch: [205, 251, 40] };
  let FONTS = ['DM Sans', 'Inter', 'Helvetica Neue', 'Georgia']; MB.fonts().then(f => { if (f?.length) FONTS = f; }).catch(() => {});
  function styleWF(c, el) {
    el.classList.add('wf'); c.r = 0; el.style.setProperty('--rot', (c.rot || 0) + 'deg'); el.classList.toggle('grouped', !!c.group);
    if (!el.querySelector('.rot-h')) el.insertAdjacentHTML('beforeend', '<i class="rot-h" title="Drag to rotate"></i>');
    if (c.type === 'icon') { el.style.setProperty('--isz', Math.min(c.w, c.h) + 'px'); el.style.setProperty('--ic', c.color || '#27272a'); }
    if (c.type === 'frame') { el.style.setProperty('--fr-fill', c.fill || '#ffffff'); el.style.setProperty('--fr-r', (c.radius ?? 0) + 'px'); }
    if (c.type === 'box') Object.assign(el.querySelector('.bx').style, { background: c.src ? `center / cover no-repeat url("${c.src}")` : c.fill || '#e4e4e7', borderRadius: (c.radius || 0) + 'px', opacity: c.opacity ?? 1,
      boxShadow: c.stroke && c.sw ? `inset 0 0 0 ${c.sw}px ${c.stroke}` : 'none' });
    if (c.type === 'text') { el.style.height = 'auto'; Object.assign(el.querySelector('.tx').style, { fontFamily: `"${c.font || 'DM Sans'}", system-ui`, fontSize: (c.size || 18) + 'px', fontWeight: c.weight || 500,
      color: c.color || '#27272a', textAlign: c.align || 'left', lineHeight: c.lh || 1.3 }); requestAnimationFrame(() => { const h = el.offsetHeight; if (h && Math.abs(h - c.h) > 1) c.h = h; }); }
  }
  // what's on a screen: anything whose middle sits inside it
  const onFrame = f => board.cards.filter(c => c.id !== f.id && c.type !== 'frame' && c.onFrame === f.id);
  function fileIntoFrame(cs) {
    cs.forEach(c => { const mx = c.x + c.w / 2, my = c.y + c.h / 2, f = [...board.cards].reverse().find(f => f.type === 'frame' && f.id !== c.id && mx > f.x && mx < f.x + f.w && my > f.y && my < f.y + f.h);
      if (f) c.onFrame = f.id; else delete c.onFrame; });
  }
  // snapping: edges and middles line up with other wireframe things (and their screen), with pink guides
  function snapWF(start, dx, dy) {
    const moving = new Set(start.map(s => s.c.id)), mine = start.filter(s => WF.includes(s.c.type)); $('guides').innerHTML = '';
    if (!mine.length || space) return { dx, dy };
    const x0 = Math.min(...mine.map(s => s.x)) + dx, y0 = Math.min(...mine.map(s => s.y)) + dy, x1 = Math.max(...mine.map(s => s.x + s.c.w)) + dx, y1 = Math.max(...mine.map(s => s.y + s.c.h)) + dy;
    const others = board.cards.filter(c => WF.includes(c.type) && !moving.has(c.id)), T = 6 / view.z;
    let bx = null, by = null;
    const mx = [x0, (x0 + x1) / 2, x1], my = [y0, (y0 + y1) / 2, y1];
    others.forEach(o => { const ox = [o.x, o.x + o.w / 2, o.x + o.w], oy = [o.y, o.y + o.h / 2, o.y + o.h];
      mx.forEach(a => ox.forEach(b => { const d = b - a; if (Math.abs(d) < T && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: b, o }; }));
      my.forEach(a => oy.forEach(b => { const d = b - a; if (Math.abs(d) < T && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: b, o }; })); });
    let g = '';
    if (bx) { dx += bx.d; const top = Math.min(y0 + dy - y0 + y0, bx.o.y), bot = Math.max(y1, bx.o.y + bx.o.h); g += `<line x1="${bx.at + O}" y1="${Math.min(y0, bx.o.y) + O - 10}" x2="${bx.at + O}" y2="${Math.max(y1, bx.o.y + bx.o.h) + O + 10}"/>`; }
    if (by) { dy += by.d; g += `<line x1="${Math.min(x0, by.o.x) + O - 10}" y1="${by.at + O}" x2="${Math.max(x1, by.o.x + by.o.w) + O + 10}" y2="${by.at + O}"/>`; }
    $('guides').innerHTML = g; return { dx, dy };
  }
  // fonts: use what's on this Mac; anything else is fetched from Google Fonts so the real type shows
  const fontsLoaded = new Set();
  const onMac = f => FONTS.some(x => x.toLowerCase() === String(f || '').toLowerCase()) || ['DM Sans', 'Caveat'].includes(f);
  function useFont(f) {
    if (!f || onMac(f) || fontsLoaded.has(f)) return; fontsLoaded.add(f);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700&display=swap`; document.head.appendChild(l);
  }
  // groups: ready-made pieces arrive grouped; ⌘G groups a selection, ⇧⌘G ungroups
  const groupOf = id => { const g = byId(id)?.group; return g ? board.cards.filter(c => c.group === g).map(c => c.id) : [id]; };
  function groupSel(on) { const cs = selCards(); if (on && cs.length < 2) return; const g = on ? uid() : null; cs.forEach(c => { if (g) c.group = g; else delete c.group; renderCard(c); }); selectOnly(cs.map(c => c.id)); $('selbar').dataset.key = ''; save(); }
  // ready-made pieces, in clean gray; bars stretch to the screen they land on
  const T = (x, y, w, text, o = {}) => { const sz = o.size || 15, perLine = Math.max(4, Math.floor(w / (sz * .52))), lines = Math.max(1, ...String(text || '').split('\n').map(l => Math.ceil(Math.max(1, l.length) / perLine)));
    return { type: 'text', x, y, w, h: Math.round(sz * (o.lh || 1.3) * lines), text, size: 15, weight: 500, color: '#27272a', font: 'DM Sans', ...o }; };
  const B = (x, y, w, h, o = {}) => ({ type: 'box', x, y, w, h, fill: '#e4e4e7', radius: 0, ...o });
  const IC = (x, y, name, s = 24, o = {}) => ({ type: 'icon', x, y, w: s, h: s, name, color: '#3f3f46', ...o });
  // each piece can take its own words: (width, { title, text, sub, label, tabs, h, align, style… })
  const PIECES = {
    'Nav bar': { icon: 'web_asset', bar: 'top', make: (W, o = {}) => [B(0, 0, W, 56, { fill: '#fafafa', stroke: '#e4e4e7', sw: 1 }), ...(o.back === false ? [] : [IC(14, 16, 'arrow_back')]), T(56, 18, W - 112, o.title || o.text || 'Title', { size: 17, weight: 700, align: 'center' }), IC(W - 38, 16, o.icon || 'more_vert')] },
    'Tab bar': { icon: 'tab', bar: 'bottom', make: (W, o = {}) => { const items = (o.tabs || [['home', 'Home'], ['search', 'Search'], ['favorite_border', 'Saved'], ['person_outline', 'Profile']]).slice(0, 5).map(t => Array.isArray(t) ? t : [t.icon || 'circle', t.label || t.text || '']), cw = W / items.length;
      return [B(0, 0, W, 64, { fill: '#fafafa', stroke: '#e4e4e7', sw: 1 }), ...items.flatMap(([n, l], i) => [IC(i * cw + cw / 2 - 12, 10, n, 24, { color: i === (o.active ?? 0) ? '#18181b' : '#71717a' }), T(i * cw, 38, cw, l, { size: 11, align: 'center', color: i === (o.active ?? 0) ? '#18181b' : '#71717a' })])]; } },
    'Button': { icon: 'smart_button', w: 160, make: (W, o = {}) => { const sec = o.style === 'secondary' || o.style === 'outline';
      return [B(0, 0, W, 48, { fill: sec ? '#ffffff' : '#27272a', stroke: sec ? '#27272a' : undefined, sw: sec ? 1.5 : 0, radius: 12 }), T(0, 14, W, o.text || 'Button', { size: 15, weight: 600, color: sec ? '#27272a' : '#ffffff', align: 'center' })]; } },
    'Input': { icon: 'input', w: 300, make: (W, o = {}) => { const top = o.label ? 22 : 0; return [...(o.label ? [T(0, 0, W, o.label, { size: 13, weight: 600, color: '#3f3f46' })] : []), B(0, top, W, 48, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }), T(14, top + 14, W - 28, o.text || 'Placeholder', { color: '#a1a1aa' })]; } },
    'Search': { icon: 'search', w: 300, make: (W, o = {}) => [B(0, 0, W, 44, { fill: '#f4f4f5', radius: 22 }), IC(14, 10, 'search', 24, { color: '#71717a' }), T(46, 12, W - 60, o.text || 'Search', { color: '#a1a1aa' })] },
    'Card': { icon: 'crop_landscape', w: 300, make: (W, o = {}) => [B(0, 0, W, 236, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 14 }), B(10, 10, W - 20, 130, { radius: 10 }), IC(W / 2 - 12, 63, o.icon || 'image', 24, { color: '#a1a1aa' }), T(16, 154, W - 32, o.title || 'Card title', { size: 17, weight: 700 }), T(16, 182, W - 32, o.text || 'A short line about this card.', { size: 13, color: '#71717a' })] },
    'List row': { icon: 'view_list', bar: 'row', make: (W, o = {}) => [B(0, 0, W, 68, { fill: '#ffffff' }), o.icon ? IC(24, 22, o.icon, 24, { color: '#52525b' }) : B(16, 14, 40, 40, { radius: 20 }), T(68, 15, W - 120, o.title || o.text || 'Row title', { weight: 600 }), T(68, 36, W - 120, o.sub ?? 'Supporting text', { size: 13, color: '#71717a' }), IC(W - 36, 22, 'chevron_right', 24, { color: '#a1a1aa' }), B(68, 67, W - 68, 1, { fill: '#e4e4e7' })] },
    'Toggle': { icon: 'toggle_on', w: 52, make: (W, o = {}) => o.text ? [T(0, 6, W - 70, o.text), B(W - 52, 0, 52, 30, { fill: o.on === false ? '#d4d4d8' : '#27272a', radius: 15 }), B(o.on === false ? W - 49 : W - 27, 3, 24, 24, { fill: '#ffffff', radius: 12 })]
      : [B(0, 0, 52, 30, { fill: '#27272a', radius: 15 }), B(25, 3, 24, 24, { fill: '#ffffff', radius: 12 })] },
    'Checkbox': { icon: 'check_box', w: 240, make: (W, o = {}) => [B(0, 0, 22, 22, { fill: o.on === false ? '#ffffff' : '#27272a', stroke: '#27272a', sw: 1.5, radius: 6 }), ...(o.on === false ? [] : [IC(1, 1, 'check', 20, { color: '#ffffff' })]), T(32, 2, W - 32, o.text || 'Remember me')] },
    'Avatar': { icon: 'account_circle', w: 56, make: (W, o = {}) => { const s = o.size || 56; return [B(0, 0, s, s, { radius: s / 2 }), IC(s / 4, s / 4, 'person', s / 2, { color: '#a1a1aa' })]; } },
    'Image': { icon: 'image', w: 300, make: (W, o = {}) => { const h = o.h || 180; return o.img ? [PH(0, 0, W, h, o.img, { radius: 12 })] : [B(0, 0, W, h, { radius: 12 }), IC(W / 2 - 16, h / 2 - 16, o.icon || 'image', 32, { color: '#a1a1aa' })]; } },
    'Heading': { icon: 'title', w: 300, make: (W, o = {}) => [T(0, 0, W, o.text || o.title || 'Heading', { size: o.size || 28, weight: 800, align: o.align || 'left' }), ...(o.sub === '' ? [] : [T(0, (o.size || 28) * 1.3 + 6, W, o.sub || 'A little line underneath it.', { size: 15, color: '#71717a', align: o.align || 'left' })])] },
  };
  const PH = (x, y, w, h, label, o = {}) => ({ ...B(x, y, w, h, { radius: 16, ...o }), img: label || 'Image' });
  const WEB = {
    'Header': { icon: 'web', web: 1, make: (W, o = {}) => { const links = o.links || ['Product', 'Pricing', 'About', 'Blog'], M = 64;
      return [B(0, 0, W, 80, { fill: '#ffffff' }), T(M, 26, 260, o.logo || o.title || 'Brand', { size: 22, weight: 800 }), ...links.slice(0, 5).map((l, i) => T(W / 2 - links.length * 55 + i * 110, 30, 110, l, { size: 15, align: 'center', color: '#52525b' })),
        B(W - M - 150, 18, 150, 44, { fill: '#18181b', radius: 22 }), T(W - M - 150, 30, 150, o.cta || 'Get started', { size: 14, weight: 600, color: '#ffffff', align: 'center' }), B(0, 79, W, 1, { fill: '#e4e4e7' })]; } },
    'Hero': { icon: 'view_day', web: 1, make: (W, o = {}) => { const M = 64, cw = (W - M * 2) * .48, h = 600, t = T(M, 120, cw, o.title || 'A big, clear promise goes right here', { size: 56, weight: 800, lh: 1.1 }), sub = T(M, 120 + t.h + 24, cw, o.text || 'One or two sentences that say who it is for and why it helps.', { size: 20, color: '#71717a', lh: 1.45 }), by = sub.y + sub.h + 36;
      return [B(0, 0, W, h, { fill: '#ffffff' }), t, sub, B(M, by, 170, 52, { fill: '#18181b', radius: 26 }), T(M, by + 15, 170, o.cta || 'Get started', { size: 16, weight: 600, color: '#ffffff', align: 'center' }),
        B(M + 186, by, 160, 52, { fill: '#ffffff', stroke: '#18181b', sw: 1.5, radius: 26 }), T(M + 186, by + 15, 160, o.cta2 || 'Learn more', { size: 16, weight: 600, align: 'center' }), PH(W / 2 + 16, 72, W / 2 - M - 16, h - 144, o.img || 'Hero image', { radius: 28 })]; } },
    'Features': { icon: 'view_column', web: 1, make: (W, o = {}) => { const M = 64, items = (o.items || [{ icon: 'bolt', title: 'Fast', text: 'Say what makes it quick.' }, { icon: 'favorite_border', title: 'Friendly', text: 'Say why people enjoy it.' }, { icon: 'lock', title: 'Safe', text: 'Say why they can trust it.' }]).slice(0, 4), n = items.length, gap = 32, cw = (W - M * 2 - gap * (n - 1)) / n;
      const title = T(M, 96, W - M * 2, o.title || 'Why people love it', { size: 36, weight: 800, align: 'center' }), y0 = 96 + title.h + 56; let tall = 0;
      const cols = items.flatMap((it, i) => { const x = M + i * (cw + gap), tt = T(x, y0 + 72, cw, it.title || 'Feature', { size: 20, weight: 700 }), tx = T(x, y0 + 72 + tt.h + 8, cw, it.text || '', { size: 15, color: '#71717a', lh: 1.5 }); tall = Math.max(tall, 72 + tt.h + 8 + tx.h);
        return [B(x, y0, 52, 52, { fill: '#f4f4f5', radius: 14 }), IC(x + 14, y0 + 14, it.icon || 'star', 24), tt, tx]; });
      return [B(0, 0, W, y0 + tall + 96, { fill: '#ffffff' }), title, ...cols]; } },
    'Stats': { icon: 'insights', web: 1, make: (W, o = {}) => { const M = 64, items = (o.items || [{ value: '10k+', label: 'happy people' }, { value: '4.9', label: 'average rating' }, { value: '24/7', label: 'support' }]).slice(0, 4), cw = (W - M * 2) / items.length;
      return [B(0, 0, W, 220, { fill: '#f4f4f5' }), ...items.flatMap((it, i) => [T(M + i * cw, 60, cw, it.value || '100', { size: 48, weight: 800, align: 'center' }), T(M + i * cw, 128, cw, it.label || '', { size: 15, color: '#71717a', align: 'center' })])]; } },
    'Testimonials': { icon: 'format_quote', web: 1, make: (W, o = {}) => { const M = 64, items = (o.items || [{ quote: 'A short, warm quote from a happy customer.', name: 'Alex Kim' }, { quote: 'Another quote about what changed for them.', name: 'Sam Rivera' }, { quote: 'One more, short and specific.', name: 'Jo Patel' }]).slice(0, 3), gap = 24, cw = (W - M * 2 - gap * (items.length - 1)) / items.length;
      const title = T(M, 96, W - M * 2, o.title || 'What people say', { size: 36, weight: 800, align: 'center' }), y0 = 96 + title.h + 48;
      return [B(0, 0, W, y0 + 280 + 96, { fill: '#ffffff' }), title, ...items.flatMap((it, i) => { const x = M + i * (cw + gap); return [B(x, y0, cw, 280, { fill: '#f4f4f5', radius: 20 }), IC(x + 28, y0 + 28, 'format_quote', 32, { color: '#a1a1aa' }), T(x + 28, y0 + 72, cw - 56, '“' + (it.quote || '') + '”', { size: 17, lh: 1.5 }), PH(x + 28, y0 + 208, 44, 44, (it.name || 'Person') + ' portrait', { radius: 22 }), T(x + 84, y0 + 220, cw - 112, it.name || 'Name', { size: 15, weight: 700 })]; })]; } },
    'Pricing': { icon: 'sell', web: 1, make: (W, o = {}) => { const M = 64, plans = (o.plans || [{ name: 'Starter', price: 'Free', features: ['The basics', 'One project'] }, { name: 'Pro', price: '$12/mo', features: ['Everything in Starter', 'Unlimited projects', 'Priority help'] }, { name: 'Team', price: '$29/mo', features: ['Everything in Pro', 'Shared spaces'] }]).slice(0, 3), gap = 24, cw = Math.min(360, (W - M * 2 - gap * (plans.length - 1)) / plans.length), x0 = (W - (cw * plans.length + gap * (plans.length - 1))) / 2;
      const title = T(M, 96, W - M * 2, o.title || 'Simple pricing', { size: 36, weight: 800, align: 'center' }), y0 = 96 + title.h + 48, ch = 380;
      return [B(0, 0, W, y0 + ch + 96, { fill: '#ffffff' }), title, ...plans.flatMap((pl, i) => { const x = x0 + i * (cw + gap), hot = i === Math.min(1, plans.length - 1);
        return [B(x, y0, cw, ch, { fill: hot ? '#18181b' : '#ffffff', stroke: '#e4e4e7', sw: hot ? 0 : 1.5, radius: 22 }), T(x + 28, y0 + 28, cw - 56, pl.name || 'Plan', { size: 18, weight: 700, color: hot ? '#ffffff' : '#27272a' }), T(x + 28, y0 + 62, cw - 56, pl.price || '$0', { size: 40, weight: 800, color: hot ? '#ffffff' : '#18181b' }),
          ...(pl.features || []).slice(0, 5).map((f, k) => T(x + 28, y0 + 130 + k * 30, cw - 56, '✓  ' + f, { size: 15, color: hot ? '#e4e4e7' : '#52525b' })),
          B(x + 28, y0 + ch - 76, cw - 56, 48, { fill: hot ? '#ffffff' : '#18181b', radius: 24 }), T(x + 28, y0 + ch - 62, cw - 56, pl.cta || 'Choose ' + (pl.name || 'plan'), { size: 15, weight: 600, align: 'center', color: hot ? '#18181b' : '#ffffff' })]; })]; } },
    'Gallery': { icon: 'collections', web: 1, make: (W, o = {}) => { const M = 64, imgs = (o.imgs || ['Photo one', 'Photo two', 'Photo three', 'Photo four', 'Photo five', 'Photo six']).slice(0, 9), cols = 3, gap = 20, cw = (W - M * 2 - gap * (cols - 1)) / cols, rh = cw * .72;
      const title = T(M, 96, W - M * 2, o.title || 'A closer look', { size: 36, weight: 800, align: 'center' }), y0 = 96 + title.h + 48, rows = Math.ceil(imgs.length / cols);
      return [B(0, 0, W, y0 + rows * (rh + gap) + 76, { fill: '#ffffff' }), title, ...imgs.map((l, i) => PH(M + (i % cols) * (cw + gap), y0 + Math.floor(i / cols) * (rh + gap), cw, rh, l, { radius: 18 }))]; } },
    'Logos': { icon: 'workspaces', web: 1, make: (W, o = {}) => { const M = 64, n = 5, cw = (W - M * 2 - 32 * (n - 1)) / n;
      return [B(0, 0, W, 170, { fill: '#ffffff' }), T(M, 40, W - M * 2, o.title || 'Trusted by teams everywhere', { size: 14, weight: 600, color: '#a1a1aa', align: 'center' }), ...Array.from({ length: n }, (_, i) => B(M + i * (cw + 32), 84, cw, 44, { fill: '#f4f4f5', radius: 10 }))]; } },
    'CTA': { icon: 'campaign', web: 1, make: (W, o = {}) => { const M = 64, t = T(M + 64, 80, W - M * 2 - 128, o.title || 'Ready to start?', { size: 40, weight: 800, align: 'center', color: '#ffffff' }), sub = T(M + 64, 80 + t.h + 16, W - M * 2 - 128, o.text || 'One last nudge, in one line.', { size: 18, align: 'center', color: '#d4d4d8' }), by = sub.y + sub.h + 32;
      return [B(0, 0, W, by + 52 + 96, { fill: '#ffffff' }), B(M, 24, W - M * 2, by + 52 + 48, { fill: '#18181b', radius: 32 }), t, sub, B(W / 2 - 90, by, 180, 52, { fill: '#ffffff', radius: 26 }), T(W / 2 - 90, by + 15, 180, o.cta || 'Get started', { size: 16, weight: 600, align: 'center', color: '#18181b' })]; } },
    'Footer': { icon: 'call_to_action', web: 1, make: (W, o = {}) => { const M = 64, cols = o.cols || [['Product', ['Features', 'Pricing', 'Updates']], ['Company', ['About', 'Careers', 'Press']], ['Help', ['Support', 'Contact', 'Privacy']]];
      return [B(0, 0, W, 300, { fill: '#f4f4f5' }), T(M, 64, 300, o.logo || 'Brand', { size: 22, weight: 800 }), T(M, 100, 300, o.text || 'A one-line sign-off.', { size: 14, color: '#71717a' }),
        ...cols.slice(0, 4).flatMap(([h, ls], i) => [T(W - M - (cols.length - i) * 180, 64, 160, h, { size: 14, weight: 700 }), ...ls.slice(0, 4).map((l, k) => T(W - M - (cols.length - i) * 180, 98 + k * 28, 160, l, { size: 14, color: '#71717a' }))]),
        B(M, 240, W - M * 2, 1, { fill: '#e4e4e7' }), T(M, 258, 400, o.copy || '© 2026 ' + (o.logo || 'Brand'), { size: 12, color: '#a1a1aa' })]; } },
  };
  Object.assign(PIECES, WEB);
  // a screen's look: colors and fonts swapped onto the gray pieces
  const GRAY = { text: '#27272a', ink: '#18181b', muted: '#71717a', soft: '#52525b', surface: '#f4f4f5', bar: '#fafafa', line: '#e4e4e7' };
  function themeIt(list, th) {
    if (!th) return list; const t = { bg: '#ffffff', text: '#18181b', muted: '#71717a', primary: '#18181b', onPrimary: '#ffffff', surface: '#f4f4f5', font: 'DM Sans', headFont: '', ...th };
    useFont(t.font); if (t.headFont) useFont(t.headFont);
    return list.map(it => { const c = { ...it };
      if (c.type === 'text') { c.font = (c.weight >= 700 && t.headFont) ? t.headFont : t.font;
        if ([GRAY.text, GRAY.ink].includes(c.color)) c.color = t.text; else if ([GRAY.muted, GRAY.soft].includes(c.color)) c.color = t.muted; else if (c.color === '#ffffff' && th.onPrimary) c.color = t.onPrimary; }
      if (c.type === 'box' && !c.img) { if (c.fill === '#18181b' || c.fill === '#27272a') c.fill = t.primary; else if (c.fill === '#ffffff') c.fill = t.bg; else if ([GRAY.surface, GRAY.bar].includes(c.fill)) c.fill = t.surface; if (c.stroke === '#18181b' || c.stroke === '#27272a') c.stroke = t.primary; }
      if (c.type === 'icon' && [GRAY.text, '#3f3f46'].includes(c.color)) c.color = t.text;
      return c; });
  }
  // pieces only Mochi asks for by name (not in the panel)
  const EXTRA = {
    'Text': (W, o = {}) => [T(0, 0, W, o.text || '', { size: o.size || 15, weight: o.weight || 500, align: o.align || 'left', color: o.color || '#3f3f46' })],
    'Icon': (W, o = {}) => { const s = o.size || 32; return [IC(o.align === 'center' ? W / 2 - s / 2 : 0, 0, o.name || o.icon || 'star', s, { color: o.color || '#27272a' })]; },
    'Space': (W, o = {}) => [],
    'Divider': (W, o = {}) => [B(0, 0, W, 1, { fill: '#e4e4e7' })],
  };
  const pieceH = (items, o) => Math.max(o.h && !items.length ? o.h : 0, ...items.map(i => i.y + i.h));
  // a whole screen from a list of pieces, top to bottom: bars hug the edges, the rest stacks with even gaps
  const num = (v, d) => { const n = +v; return Number.isFinite(n) && v !== '' && v !== null ? n : d; };
  function buildScreen(spec, x, y) {
    spec = { ...spec, w: num(spec.w, undefined), h: num(spec.h, undefined), gap: num(spec.gap, undefined) };
    spec.items = (Array.isArray(spec.items) ? spec.items : []).filter(it => it && typeof it === 'object').map(it => ({ ...it, w: num(it.w, undefined), h: num(it.h, undefined), size: num(it.size, undefined), count: num(it.count, undefined) }));
    const dev = DEVICES[spec.device] || DEVICES.iPhone, W = spec.w || dev[0], phone = !spec.device || /iPhone|Android/.test(spec.device), webFirst = (spec.items || []).some(it => /^(header|hero|features|footer)$/i.test(it.piece || ''));
    const f = card('frame', { x, y, w: W, h: spec.h || (webFirst && spec.device === 'Desktop' ? 600 : dev[1]), r: 0, name: spec.name || 'Screen', device: DEVICES[spec.device] ? spec.device : 'iPhone', radius: webFirst ? 12 : dev[2], fill: '#ffffff' });
    board.cards.push(f); renderCard(f, true);
    const items = spec.items || [], M = spec.device === 'Desktop' ? 64 : 24, CW = W - M * 2, GAP = spec.gap || 16, made = [f];
    let top = y + (phone ? 44 : 0), bottom = y + f.h;
    const put = (list, ox, oy) => { const g = uid(); list.forEach(it => { const c = card(it.type, { ...it, x: ox + it.x, y: oy + it.y, r: 0, group: list.length > 1 ? g : undefined, onFrame: f.id }); if (!c.group) delete c.group; board.cards.push(c); renderCard(c, true); made.push(c); }); };
    const nav = items.find(it => /nav/i.test(it.piece || '')), tab = items.find(it => /tab/i.test(it.piece || ''));
    if (nav) { const l = themeIt(PIECES['Nav bar'].make(W, nav), spec.theme); put(l, x, top); top += 56; }
    if (tab) { const l = themeIt(PIECES['Tab bar'].make(W, tab), spec.theme); bottom -= 64 + (phone ? 20 : 0); put(l, x, bottom); }
    const isWeb = (spec.items || []).some(it => WEB[Object.keys(WEB).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase())]);
    if (spec.theme?.bg) { f.fill = spec.theme.bg; renderCard(f); }
    let cur = top + (spec.padTop ?? (isWeb ? 0 : 20));
    items.filter(it => it !== nav && it !== tab).forEach(it => {
      const name = Object.keys(PIECES).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase()) || Object.keys(EXTRA).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase()) || 'Text';
      const P = PIECES[name], full = name === 'List row' || (P && P.web), w = full ? W : ['Avatar', 'Toggle'].includes(name) && !it.text ? P.w : it.w || CW;
      const reps = Math.max(1, Math.min(8, +it.count || (Array.isArray(it.rows) ? it.rows.length : 1)));
      for (let k = 0; k < reps; k++) {
        const o = Array.isArray(it.rows) ? { ...it, ...it.rows[k] } : it, list = P ? P.make(w, o) : EXTRA[name](w, o), h = pieceH(list, o);
        const ox = full ? x : (it.align === 'center' && w < CW) ? x + (W - w) / 2 : x + M;
        put(themeIt(list, spec.theme), ox, cur); cur += h + (full ? 0 : GAP);
      }
    });
    if (webFirst && !tab) { f.h = Math.max(200, cur - y); renderCard(f); }
    else if (cur > bottom - 12) { const grow = cur - bottom + 24; f.h += grow; renderCard(f); made.filter(c => c.y >= bottom - 1 && c !== f).forEach(c => { c.y += grow; renderCard(c); }); }
    if (spec.note) { const n = card('note', { x, y: y + f.h + 28, w: W, h: 120, text: spec.note, name: spec.name || '', color: 'butter', r: 0 }); board.cards.push(n); renderCard(n, true); made.push(n); }
    return { f, made };
  }
  const pieceBtn = ([n, p]) => `<button data-piece="${n}" title="Add ${n.toLowerCase()}"><span class="mi">${p.icon}</span>${n}</button>`;
  $('dzPieces').innerHTML = Object.entries(PIECES).filter(([, p]) => !p.web).map(pieceBtn).join('') + '<div class="label dz-sub">Website</div>' + Object.entries(PIECES).filter(([, p]) => p.web).map(pieceBtn).join('');
  $('dzPieces').onclick = e => { const b = e.target.closest('[data-piece]'); if (!b) return; pickWF(null); $('dzPieces').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); startPlacing('piece', { piece: b.dataset.piece }); };
  function placePiece(name, w) {
    const P = PIECES[name], f = [...board.cards].reverse().find(f => f.type === 'frame' && w.x > f.x && w.x < f.x + f.w && w.y > f.y && w.y < f.y + f.h);
    const W = (P.bar || P.web) && f ? f.w : P.web ? 1200 : P.w || 360, items = P.make(W); let ox = w.x - 14 / view.z, oy = w.y - 14 / view.z;
    if ((P.bar || P.web) && f) { ox = f.x; if (P.bar === 'top') oy = Math.max(f.y, oy); if (P.bar === 'bottom') oy = Math.min(f.y + f.h - 64, Math.max(f.y, oy)); }
    const g = uid(), made = items.map(it => { const c = card(it.type, { ...it, x: ox + it.x, y: oy + it.y, r: 0, group: g }); board.cards.push(c); renderCard(c, true); return c; });
    fileIntoFrame(made); selectOnly(made.map(c => c.id)); renderWires(); save();
  }
  // icons: search all of Material Icons, then click to place (or swap the selected icon)
  let iconSwap = null;
  function renderIcons() {
    const q = $('iconSearch').value.trim().toLowerCase().replace(/\s+/g, '_'), all = window.MATERIAL_ICONS || [], hits = q ? all.filter(n => n.includes(q)) : all, shown = hits.slice(0, 180);
    $('iconGrid').innerHTML = shown.map(n => `<button data-icon="${n}" title="${n.replace(/_/g, ' ')}"><span class="mi">${n}</span></button>`).join('') + (hits.length > shown.length ? `<div class="more">${hits.length - shown.length} more… keep typing to narrow it down</div>` : hits.length ? '' : '<div class="more">No icons match that</div>');
  }
  $('iconSearch').oninput = renderIcons;
  $('iconSearch').onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { pickWF(null); stopPlacing(); } };
  $('iconGrid').onclick = e => { const b = e.target.closest('[data-icon]'); if (!b) return; $('iconGrid').querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on');
    if (iconSwap && byId(iconSwap)) { const c = byId(iconSwap); c.name = b.dataset.icon; renderCard(c); selectOnly([c.id]); save(); iconSwap = null; pickWF(null); return; }
    startPlacing('icon', { name: b.dataset.icon }); };

  // the design panel: tools when nothing's picked, the selection's settings when something is
  let wfTool = null;
  function pickWF(t) {
    document.querySelectorAll('[data-wf]').forEach(b => b.classList.toggle('on', b.dataset.wf === t));
    $('dzPresets').classList.toggle('on', t === 'frame');
    $('dzIcons').classList.toggle('on', t === 'icon'); if (t === 'icon') { renderIcons(); setTimeout(() => $('iconSearch').focus(), 20); return; }
    if (t !== 'icon') iconSwap = null; if (t) $('dzPieces').querySelectorAll('.on').forEach(x => x.classList.remove('on'));
    if (t === 'frame') { $('dzPresets').innerHTML = Object.keys(DEVICES).map(n => `<button data-dev="${n}">${n}</button>`).join(''); return; }
    if (t) startPlacing(t);
  }
  document.querySelectorAll('[data-wf]').forEach(b => b.onclick = () => { const t = b.dataset.wf; if (b.classList.contains('on')) { stopPlacing(); pickWF(null); return; } pickWF(t); });
  $('dzPresets').onclick = e => { const b = e.target.closest('[data-dev]'); if (!b) return; $('dzPresets').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); startPlacing('frame', { device: b.dataset.dev }); };
  $('dzMin').onclick = () => { const m = $('design').classList.toggle('min'); $('dzMin').textContent = m ? '+' : '–'; placeTray(); };
  $('design').addEventListener('pointerdown', e => e.stopPropagation());
  // Unsorted sits under the Wireframe panel and always fits on screen; its list scrolls when it's long
  function placeTray() { const d = $('design').getBoundingClientRect(), s = stage.getBoundingClientRect(), top = d.bottom - s.top + 12;
    $('tray').style.top = top + 'px'; $('tray').style.maxHeight = Math.max(150, s.height - top - 16) + 'px'; }
  addEventListener('resize', placeTray);
  new ResizeObserver(placeTray).observe($('design'));
  const AL = d => `<svg viewBox="0 0 20 20">${d}</svg>`;
  const ALIGN = { l: AL('<path d="M4 3v14M7 6h9M7 13h5"/>'), c: AL('<path d="M10 3v14M5 6h10M7 13h6"/>'), r: AL('<path d="M16 3v14M4 6h9M8 13h5"/>'),
    t: AL('<path d="M3 4h14M6 7v9M13 7v5"/>'), m: AL('<path d="M3 10h14M6 5v10M13 7v6"/>'), b: AL('<path d="M3 16h14M6 4v9M13 8v5"/>'),
    dh: AL('<path d="M3 4v12M17 4v12M8 7v6M12 7v6"/>'), dv: AL('<path d="M4 3h12M4 17h12M7 8h6M7 12h6"/>') };
  const field = (k, label, v, type = 'number', extra = '') => `<label class="dz-f ${extra}"><span>${label}</span><input data-k="${k}" type="${type}" value="${esc(v)}"${type === 'number' ? ' step="1"' : ''}></label>`;
  function renderDesign() {
    const fc = selCards().length === 1 && selCards()[0].type === 'font' ? selCards()[0] : null;
    if (fc) { $('dzProps').innerHTML = `<div class="dz-sec"><div class="label">Font</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${[...new Set([fc.font || 'DM Sans', ...FONTS])].map(f => `<option${fc.font === f ? ' selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></label><label class="dz-f wide"><span>Or any Google font</span><input data-k="gfont" placeholder="e.g. Playfair Display" spellcheck="false"></label></div><div class="dz-hint">Double-click the sample line on the card to try your own words.</div></div>`; return; }
    const cs = selCards().filter(c => WF.includes(c.type)), el = $('dzProps');
    if (!cs.length) { el.innerHTML = selCards().length ? '' : '<div class="dz-hint">Pick a tool or a piece. Drag to draw a box; things snap into line as you move them.</div>'; return; }
    const one = cs.length === 1 ? cs[0] : null; let h = '';
    if (one) h += `<div class="dz-sec"><div class="label">${{ frame: 'Screen', box: 'Box', text: 'Text', font: 'Font' }[one.type]}</div><div class="dz-grid">${field('x', 'X', Math.round(one.x))}${field('y', 'Y', Math.round(one.y))}${field('w', 'W', Math.round(one.w))}${one.type === 'text' ? '' : field('h', 'H', Math.round(one.h))}</div></div>`;
    if (one && one.type !== 'frame') h += `<div class="dz-sec"><div class="dz-grid">${field('rot', 'Rotate°', one.rot || 0, 'number', 'wide')}</div></div>`;
    if (one?.type === 'icon') h += `<div class="dz-sec"><div class="label">Icon</div><div class="dz-grid">${field('isz', 'Size', Math.round(one.w))}${field('color', 'Color', one.color || '#27272a', 'color')}</div><div class="dz-row"><button data-swap="1" style="font:600 11.5px/1 var(--font);gap:6px;display:flex;align-items:center;justify-content:center"><span class="mi" style="font-size:16px">${esc(one.name)}</span> Change icon</button></div></div>`;
    const groupedSel = cs.length > 1 && cs.every(c => c.group && c.group === cs[0].group);
    if (cs.length > 1) h += `<div class="dz-sec"><div class="dz-row"><button data-grp="${groupedSel ? 'off' : 'on'}" style="font:600 11.5px/1 var(--font)">${groupedSel ? 'Ungroup  ⇧⌘G' : 'Group  ⌘G'}</button></div></div>`;
    if (one?.type === 'frame') h += `<div class="dz-sec"><div class="dz-grid">${field('name', 'Name', one.name || 'Screen', 'text', 'wide')}<label class="dz-f wide"><span>Device</span><select data-k="device">${['Custom', ...Object.keys(DEVICES)].map(n => `<option${(one.device || 'Custom') === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>${field('fill', 'Fill', one.fill || '#ffffff', 'color')}${field('radius', 'Corners', one.radius ?? 0)}</div></div>`;
    if (one?.type === 'box') h += `<div class="dz-sec"><div class="label">Look</div><div class="dz-grid">${field('fill', 'Fill', one.fill || '#e4e4e7', 'color')}${field('radius', 'Corners', one.radius || 0)}${field('stroke', 'Border', one.stroke || '#a1a1aa', 'color')}${field('sw', 'Width', one.sw || 0)}${field('opacity', 'Opacity %', Math.round((one.opacity ?? 1) * 100), 'number', 'wide')}</div></div>`;
    if (one?.type === 'text') h += `<div class="dz-sec"><div class="label">Type</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${[...new Set([one.font || 'DM Sans', ...FONTS])].map(f => `<option${(one.font || 'DM Sans') === f ? ' selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></label>
      ${field('size', 'Size', one.size || 18)}<label class="dz-f"><span>Weight</span><select data-k="weight">${[[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi'], [700, 'Bold'], [800, 'Extra']].map(([v, n]) => `<option value="${v}"${(+one.weight || 500) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      ${field('color', 'Color', one.color || '#27272a', 'color')}${field('lh', 'Line', one.lh || 1.3)}</div><div class="dz-row">${['left', 'center', 'right'].map(a => `<button data-talign="${a}" class="${(one.align || 'left') === a ? 'on' : ''}" title="Align ${a}">${ALIGN[a[0]]}</button>`).join('')}</div></div>`;
    const inFrame = one && one.onFrame && byId(one.onFrame);
    if (cs.length > 1 || inFrame) h += `<div class="dz-sec"><div class="label">${cs.length > 1 ? 'Align' : 'Align on its screen'}</div><div class="dz-row">${['l', 'c', 'r', 't', 'm', 'b'].map(a => `<button data-align="${a}" title="Align">${ALIGN[a]}</button>`).join('')}</div>${cs.length > 2 ? `<div class="dz-row"><button data-dist="h" title="Even spacing across">${ALIGN.dh}</button><button data-dist="v" title="Even spacing down">${ALIGN.dv}</button></div>` : ''}</div>`;
    el.innerHTML = h;
  }
  $('dzProps').addEventListener('input', e => {
    const fc = selCards().length === 1 && selCards()[0].type === 'font' ? selCards()[0] : null;
    if (fc && (e.target.dataset.k === 'font' || e.target.dataset.k === 'gfont')) { const v = e.target.value.trim(); if (!v) return; if (e.target.dataset.k === 'gfont') { clearTimeout(fc._t); fc._t = setTimeout(() => { fc.font = v; renderCard(fc); selectOnly([fc.id]); save(); }, 500); return; } fc.font = v; renderCard(fc); selectOnly([fc.id]); save(); return; }
    const k = e.target.dataset.k, one = selCards().filter(c => WF.includes(c.type))[0]; if (!k || !one) return; let v = e.target.value;
    if (['x', 'y', 'w', 'h', 'radius', 'sw', 'size', 'rot', 'isz'].includes(k)) v = +v || 0; if (k === 'opacity') v = Math.max(0, Math.min(100, +v)) / 100; if (k === 'lh') v = +v || 1.3; if (k === 'weight') v = +v;
    if (k === 'rot') { one.rot = v; } else if (k === 'isz') { one.w = one.h = Math.max(8, v); }
    else if (k === 'device') { if (DEVICES[v]) { one.w = DEVICES[v][0]; one.h = DEVICES[v][1]; one.radius = DEVICES[v][2]; } one.device = v; }
    else one[k] = v;
    if (k === 'w' || k === 'h') one.device = 'Custom';
    renderCard(one); selectOnly([one.id]); renderWires(); save();
    if (k === 'device') $('selbar').dataset.key = '', renderDesign();
  });
  $('dzProps').addEventListener('click', e => {
    if (e.target.closest('[data-swap]')) { iconSwap = selCards()[0]?.id; pickWF('icon'); return; }
    const gp = e.target.closest('[data-grp]'); if (gp) return groupSel(gp.dataset.grp === 'on');
    const cs = selCards().filter(c => WF.includes(c.type)), ta = e.target.closest('[data-talign]'), al = e.target.closest('[data-align]'), di = e.target.closest('[data-dist]');
    if (ta) { cs.forEach(c => c.align = ta.dataset.talign); }
    if (al) { // line them up with each other, or a single thing with its screen
      const ref = cs.length === 1 ? byId(cs[0].onFrame) : null, x0 = ref ? ref.x : Math.min(...cs.map(c => c.x)), y0 = ref ? ref.y : Math.min(...cs.map(c => c.y)), x1 = ref ? ref.x + ref.w : Math.max(...cs.map(c => c.x + c.w)), y1 = ref ? ref.y + ref.h : Math.max(...cs.map(c => c.y + c.h));
      cs.forEach(c => { const a = al.dataset.align; if (a === 'l') c.x = x0; if (a === 'c') c.x = (x0 + x1) / 2 - c.w / 2; if (a === 'r') c.x = x1 - c.w; if (a === 't') c.y = y0; if (a === 'm') c.y = (y0 + y1) / 2 - c.h / 2; if (a === 'b') c.y = y1 - c.h; });
    }
    if (di) { const hz = di.dataset.dist === 'h', s = [...cs].sort((a, b) => hz ? a.x - b.x : a.y - b.y), first = s[0], last = s[s.length - 1];
      const span = hz ? last.x + last.w - first.x : last.y + last.h - first.y, used = s.reduce((t, c) => t + (hz ? c.w : c.h), 0), gap = (span - used) / (s.length - 1); let at = hz ? first.x : first.y;
      s.forEach(c => { if (hz) c.x = at; else c.y = at; at += (hz ? c.w : c.h) + gap; }); }
    if (ta || al || di) { cs.forEach(c => renderCard(c)); selectOnly(cs.map(c => c.id)); renderWires(); save(); renderDesign(); }
  });
  // keep X / Y / W / H current while you drag (unless you're typing in them)
  function syncDesign() { const one = selCards().length === 1 && WF.includes(selCards()[0].type) ? selCards()[0] : null; if (!one || $('dzProps').contains(document.activeElement)) return;
    ['x', 'y', 'w', 'h'].forEach(k => { const i = $('dzProps').querySelector(`[data-k="${k}"]`); if (i && +i.value !== Math.round(one[k])) i.value = Math.round(one[k]); }); }

  // ---------- filling image spots: Higgsfield photos (price check, then your yes) or free drawn illustrations ----------
  const spotsIn = cs => { const ids = new Set(); cs.forEach(c => { if (c.type === 'frame') onFrame(c).forEach(k => ids.add(k.id)); else ids.add(c.id); }); return board.cards.filter(c => ids.has(c.id) && c.type === 'box' && c.img && !c.src); };
  const aspect = c => { const r = c.w / c.h, opts = [['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['3:2', 1.5], ['2:3', 2 / 3], ['21:9', 21 / 9]]; return opts.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0]; };
  const styleHint = spots => { const f = byId(spots[0]?.onFrame); return [board.name, f?.name].filter(Boolean).join(', '); };
  function offerFill(spots, where = 'chat') {
    if (!spots.length) return;
    if (MB.web) return say(`There ${spots.length === 1 ? 'is 1 image spot' : `are ${spots.length} image spots`} waiting for pictures. In the Mac app I can fill them with Higgsfield or draw them for you ✦`, 0, DL);
    const n = spots.length, acts = [];
    if (settings.ai && settings.higgs) acts.push({ label: `Fill ${n} with Higgsfield ✦`, run: () => quoteFill(spots) });
    if (settings.ai) acts.push({ label: 'Draw simple illustrations (free)', ghost: !!(settings.ai && settings.higgs), run: () => drawFill(spots) });
    if (!acts.length) return;
    say(`There ${n === 1 ? 'is 1 image spot' : `are ${n} image spots`} waiting for pictures. ${settings.higgs ? 'Higgsfield makes real photos (that uses credits, and I check the price with you first), or I can draw simple illustrations for free.' : 'I can draw simple illustrations for them, free.'}`, 0, [...acts, { label: 'Leave them empty', ghost: true, run: () => {} }]);
  }
  async function quoteFill(spots) {
    if (!chatOpen()) mochiOpen(true); addMsg('mochi', 'Checking your Higgsfield balance and the price per image…'); typing(true);
    try {
      const q = parse(await MB.higgsQuote({ model: 'nano_banana_2' })); typing(false);
      const per = +q.perImage, bal = +q.balance, total = Number.isFinite(per) ? Math.ceil(per * spots.length) : null;
      const line = total != null ? `That's ${spots.length} image${spots.length > 1 ? 's' : ''} × about ${per} credits ≈ ${total} credits.` : `I couldn't find the exact price, so check Higgsfield before saying yes.`;
      const balLine = Number.isFinite(bal) ? ` You have ${bal} credits.` : '', short = Number.isFinite(bal) && total != null && total > bal;
      say(line + balLine + (short ? ' That\'s more than you have right now, so I\'d fill fewer spots or top up first.' : ' Want me to make them?'), 0,
        short ? [{ label: 'Draw illustrations instead (free)', run: () => drawFill(spots) }, { label: 'Not now', ghost: true, run: () => {} }]
              : [{ label: `Yes, make ${spots.length} ✦`, run: () => makeFill(spots) }, { label: 'Not now', ghost: true, run: () => {} }]);
    } catch (e) { typing(false); say("I couldn't reach Higgsfield: " + e.message); }
  }
  async function placeImages(spots, list, key) {
    let n = 0;
    for (const it of list || []) { const c = spots.find(s => s.id === it.id); if (!c) continue;
      try { c.src = key === 'svg' ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(it.svg) : await MB.fetchImage(it.url); renderCard(c); n++; } catch (e) {} }
    save(); return n;
  }
  async function makeFill(spots) {
    addMsg('mochi', `Making ${spots.length} image${spots.length > 1 ? 's' : ''} with Higgsfield… this can take a minute or two ✦`); typing(true); $('mochi').classList.add('thinking'); goo.think(true); favGoo?.think(true);
    try { const r = parse(await MB.higgsMake({ model: 'nano_banana_2', style: styleHint(spots), images: spots.map(c => ({ id: c.id, label: c.img, aspect: aspect(c) })) }));
      const n = await placeImages(spots, r.images, 'url'); typing(false); say(n ? `Done! ${n} image${n > 1 ? 's are' : ' is'} in place ✦` : "Hmm, the images didn't come back. Nothing was placed."); if (n) showWhatMochiMade(spots.filter(c => c.src)); }
    catch (e) { typing(false); say("Something went wrong making those: " + e.message); }
    finally { $('mochi').classList.remove('thinking'); goo.think(false); favGoo?.think(false); }
  }
  async function drawFill(spots) {
    if (!chatOpen()) mochiOpen(true); addMsg('mochi', `Drawing ${spots.length} little illustration${spots.length > 1 ? 's' : ''}…`); typing(true); $('mochi').classList.add('thinking'); goo.think(true); favGoo?.think(true);
    try { const r = parse(await MB.drawFill({ style: 'soft pastel, rounded, friendly, minimal', images: spots.map(c => ({ id: c.id, label: c.img, w: Math.round(c.w), h: Math.round(c.h) })) }));
      const n = await placeImages(spots, r.images, 'svg'); typing(false); say(n ? `Drew ${n} ✦ (want real photos later? that's Higgsfield)` : "I couldn't draw those this time."); if (n) showWhatMochiMade(spots.filter(c => c.src)); }
    catch (e) { typing(false); say("I couldn't draw those: " + e.message); }
    finally { $('mochi').classList.remove('thinking'); goo.think(false); favGoo?.think(false); }
  }

  // ---------- crop an image: see the whole picture, drag the box or its corners, then Done ----------
  let cropping = null, cropDrag = null;
  function startCrop(c) {
    const img = cardsEl.querySelector(`[data-id="${c.id}"] img`), nw = img?.naturalWidth || c.w, nh = img?.naturalHeight || c.h;
    cropping = { c, nw, nh, prevH: c.h, prevCrop: c.crop, box: Object.assign({ x: 0, y: 0, w: 1, h: 1 }, c.crop) };
    c.cropEdit = true; c.h = Math.round((c.w - 16) * nh / nw + 16); renderCard(c); selectOnly([c.id]); $('selbar').dataset.key = ''; renderWires();
  }
  function endCrop(how) {
    if (!cropping) return; const { c, nw, nh, prevH, prevCrop, box } = cropping;
    if (how === 'reset') { cropping.box = { x: 0, y: 0, w: 1, h: 1 }; renderCard(c); selectOnly([c.id]); return; }
    if (how === 'done') { const full = box.w > .995 && box.h > .995; if (full) delete c.crop; else c.crop = { ...box }; c.h = Math.round((c.w - 16) * (nh * box.h) / (nw * box.w) + 16); }
    else { c.h = prevH; if (prevCrop) c.crop = prevCrop; else delete c.crop; }
    delete c.cropEdit; cropping = null; renderCard(c); selectOnly([c.id]); $('selbar').dataset.key = ''; renderWires(); if (how === 'done') save();
  }
  function cropDown(e) {
    const img = cardsEl.querySelector(`[data-id="${cropping.c.id}"] img`); if (!img) return;
    cropDrag = { h: e.target.closest('[data-h]')?.dataset.h || 'move', r: img.getBoundingClientRect(), sx: e.clientX, sy: e.clientY, b0: { ...cropping.box } }; stage.setPointerCapture(e.pointerId);
  }
  addEventListener('pointermove', e => {
    if (!cropDrag || !cropping) return;
    const { h, r, b0 } = cropDrag, dx = (e.clientX - cropDrag.sx) / r.width, dy = (e.clientY - cropDrag.sy) / r.height, MIN = .08, b = { ...b0 };
    if (h === 'move') { b.x = clamp(b0.x + dx, 0, 1 - b0.w); b.y = clamp(b0.y + dy, 0, 1 - b0.h); }
    if (h.includes('w')) { b.x = clamp(b0.x + dx, 0, b0.x + b0.w - MIN); b.w = b0.x + b0.w - b.x; }
    if (h.includes('e')) b.w = clamp(b0.w + dx, MIN, 1 - b0.x);
    if (h.includes('n')) { b.y = clamp(b0.y + dy, 0, b0.y + b0.h - MIN); b.h = b0.y + b0.h - b.y; }
    if (h.includes('s')) b.h = clamp(b0.h + dy, MIN, 1 - b0.y);
    cropping.box = b; const box = cardsEl.querySelector(`[data-id="${cropping.c.id}"] .crop-box`);
    if (box) Object.assign(box.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
  });
  addEventListener('pointerup', () => { cropDrag = null; });

  // ---------- drawing: the same soft ink as jessa.art (it swells when you slow down and tapers at the ends), plus a marker, a highlighter and an easy eraser ----------
  const INKS = { ink: '#494848', pink: '#f27aa8', coral: '#ff7f6b', butter: '#f3c84a', mint: '#3fbf86', sky: '#4aa3f0', lilac: '#9b7bff', white: '#ffffff' };
  const PEN_SIZE = { pen: { s: 5, m: 9, l: 16 }, marker: { s: 4, m: 8, l: 14 }, hi: { s: 14, m: 24, l: 38 } };
  const pen = { tool: 'pen', size: 'm', color: 'ink' };
  let drawOn = false, stroke = null, erasing = false, liveSvg = null;
  try { Object.assign(pen, JSON.parse(localStorage.getItem('mochiboard:pen') || '{}')); } catch (e) {}
  // any thickness, not just three: each tool keeps its own (old drawings saved as s / m / l still read from PEN_SIZE)
  const PEN_RANGE = { pen: [2, 48], marker: [2, 40], hi: [8, 72], eraser: [10, 90] };
  pen.sizes = Object.assign({ pen: PEN_SIZE.pen[pen.size] || 9, marker: PEN_SIZE.marker[pen.size] || 8, hi: PEN_SIZE.hi[pen.size] || 24, eraser: 28 }, pen.sizes || {});
  const penW = (tool, size) => typeof size === 'number' ? size : ((PEN_SIZE[tool] || PEN_SIZE.pen)[size] || 9);
  const curSize = () => pen.sizes[pen.tool] || 9;
  const sizeToT = v => { const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen; return Math.pow((v - a) / (b - a), 1 / 1.7); };   // a gentle curve: fine control at the thin end
  const tToSize = t => { const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen; return Math.round(a + (b - a) * Math.pow(Math.min(1, Math.max(0, t)), 1.7)); };
  function setSize(v) { const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen; pen.sizes[pen.tool] = Math.min(b, Math.max(a, Math.round(v))); paintSize(); try { localStorage.setItem('mochiboard:pen', JSON.stringify(pen)); } catch (e) {} }
  function paintSize() {
    const v = curSize(), t = sizeToT(v), er = pen.tool === 'eraser', col = er ? 'transparent' : pen.color === 'ink' ? 'var(--pen-ink)' : INKS[pen.color] || pen.color;
    $('dbsFill').style.width = `calc(${t * 100}% + ${9 - t * 18}px)`; $('dbsKnob').style.left = `calc(${t * 100}% + ${9 - t * 18}px)`; $('dbsVal').textContent = v;
    const dot = $('dbsDot'), d = Math.min(22, Math.max(3, v * (er ? .35 : .6))); Object.assign(dot.style, { width: d + 'px', height: d + 'px', background: col, opacity: pen.tool === 'hi' ? .45 : 1 }); dot.classList.toggle('er', er);
    // the bubble over the knob shows the true size on the board right now (at this zoom)
    const bub = $('dbsBub').firstElementChild, bd = Math.min(110, Math.max(2, er ? v : v * view.z)); Object.assign(bub.style, { width: bd + 'px', height: bd + 'px', background: col, opacity: pen.tool === 'hi' ? .45 : 1 }); bub.classList.toggle('er', er);
    const ring = $('eraseRing'); if (ring) Object.assign(ring.style, { width: v + 'px', height: v + 'px', margin: `${-v / 2}px 0 0 ${-v / 2}px` });
  }
  { const tr = $('dbsTrack'); let on = false;
    const at = e => { const r = tr.getBoundingClientRect(); setSize(tToSize((e.clientX - r.left - 9) / (r.width - 18))); };
    tr.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); on = true; tr.setPointerCapture(e.pointerId); $('dbSize').classList.add('sizing'); at(e); });
    tr.addEventListener('pointermove', e => on && at(e));
    const up = () => { on = false; $('dbSize').classList.remove('sizing'); }; tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up);
    tr.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation(); setSize(curSize() + d * Math.max(1, Math.round(curSize() * .08))); });
    tr.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); setSize(curSize() + (e.deltaY < 0 || e.deltaX > 0 ? 1 : -1) * Math.max(1, Math.round(curSize() * .06))); }, { passive: false });
  }
  // [ and ] while drawing: smaller / bigger, with the bubble flashing up so you can see it
  addEventListener('keydown', e => { if (!drawOn || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea, [contenteditable="true"]')) return; const d = e.key === ']' ? 1 : e.key === '[' ? -1 : 0; if (!d) return;
    e.preventDefault(); setSize(curSize() + d * Math.max(1, Math.round(curSize() * .12))); $('dbSize').classList.add('sizing'); clearTimeout(setSize.t); setSize.t = setTimeout(() => $('dbSize').classList.remove('sizing'), 700); });
  // a filled ribbon around the line: wider where you slowed down, thin at the start and end, with a little breathing wobble
  function butter(raw, finished, BASE) {
    const pts = []; let acc = 0;
    for (let i = 0; i < raw.length; i++) {
      if (i === 0) { pts.push({ x: raw[0][0], y: raw[0][1] }); continue; }
      const a = raw[i - 1], b = raw[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), dt = Math.max(1, b[2] - a[2]);
      let d = acc; while (d < seg) { const k = d / seg; pts.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, v: seg / dt }); d += 3; }
      acc = d - seg;
    }
    if (pts.length < 2) return '';
    if (finished && pts.length > 6) { const a = pts[0], z = pts[pts.length - 1]; if (Math.hypot(a.x - z.x, a.y - z.y) < 14) pts.splice(-2, 2); }
    let s = pts[1]?.v || .3; const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens[lens.length - 1], MIN = Math.max(1, BASE / 9), ramp = Math.min(54, BASE * 6);
    const width = i => { s += ((pts[i].v == null ? s : pts[i].v) - s) * .08; const slow = Math.max(0, Math.min(1, 1 - s / 1.8));
      let w = MIN + (BASE - MIN) * (.22 + .78 * slow * slow); const inR = Math.min(1, lens[i] / ramp), outR = finished ? Math.min(1, (total - lens[i]) / ramp) : 1;
      return w * Math.pow(inR, .8) * Math.pow(outR, .8) * (1 + .12 * Math.sin(lens[i] / 11)) + .4; };
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)]; let nx = -(p1.y - p0.y), ny = p1.x - p0.x; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const w = width(i) / 2; L.push([pts[i].x + nx * w, pts[i].y + ny * w]); R.push([pts[i].x - nx * w, pts[i].y - ny * w]); }
    const seq = L.concat(R.reverse()); let d = `M${seq[0][0].toFixed(1)} ${seq[0][1].toFixed(1)}`;
    for (let i = 1; i < seq.length; i++) { const m = seq[i - 1], c = seq[i]; d += ` Q${m[0].toFixed(1)} ${m[1].toFixed(1)} ${((m[0] + c[0]) / 2).toFixed(1)} ${((m[1] + c[1]) / 2).toFixed(1)}`; }
    return d + ' Z';
  }
  function centerline(p) {
    if (p.length < 3) return `M${p[0][0]} ${p[0][1]} L${p[p.length - 1][0] + .1} ${p[p.length - 1][1]}`;
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${((p[i][0] + p[i + 1][0]) / 2).toFixed(1)} ${((p[i][1] + p[i + 1][1]) / 2).toFixed(1)}`;
    return d + ` L${p[p.length - 1][0].toFixed(1)} ${p[p.length - 1][1].toFixed(1)}`;
  }
  function inkPath(pts, tool, size, color, finished) {
    const col = color === 'ink' || !color ? 'var(--pen-ink)' : INKS[color] || color, w = penW(tool, size);
    if (tool === 'pen') { if (pts.length < 2) { const [x, y] = pts[0]; return `<path style="fill:${col}" d="M${x - w / 3} ${y} a${w / 3} ${w / 3} 0 1 0 ${w / 1.5} 0 a${w / 3} ${w / 3} 0 1 0 ${-w / 1.5} 0"/>`; } return `<path style="fill:${col}" d="${butter(pts, finished, w)}"/>`; }
    return `<path fill="none" style="stroke:${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${tool === 'hi' ? ' opacity=".38" style="mix-blend-mode:multiply"' : ''} d="${centerline(pts)}"/>`;
  }
  function renderDrawbar() {
    $('dbColors').innerHTML = Object.entries(INKS).map(([n, c]) => `<button data-ink="${n}" title="${n}" style="background:${n === 'ink' ? 'var(--pen-ink)' : c}" class="${pen.color === n ? 'on' : ''}"></button>`).join('');
    $('drawbar').querySelectorAll('[data-pen]').forEach(b => b.classList.toggle('on', b.dataset.pen === pen.tool));
    paintSize();
    stage.classList.toggle('erasing', drawOn && pen.tool === 'eraser'); stage.classList.toggle('drawing', drawOn && pen.tool !== 'eraser');
    try { localStorage.setItem('mochiboard:pen', JSON.stringify(pen)); } catch (e) {}
  }
  function enterDraw() { if (pen.tool === 'eraser') pen.tool = 'pen'; stopPlacing(); selectOnly([]); selWire = null; drawOn = true; $('dock').classList.add('drawing'); renderDrawbar();
    if (!liveSvg) { liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); liveSvg.classList.add('live-ink'); world.appendChild(liveSvg); const ring = document.createElement('div'); ring.className = 'erase-ring'; ring.id = 'eraseRing'; stage.appendChild(ring); } }
  function exitDraw() { drawOn = false; stroke = null; erasing = false; $('dock').classList.remove('drawing'); stage.classList.remove('drawing', 'erasing'); if (liveSvg) liveSvg.innerHTML = ''; }
  $('drawbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('drawbar').onclick = e => {
    const t = e.target.closest('[data-pen]'), k = e.target.closest('[data-ink]');
    if (e.target.closest('[data-db="done"]')) return exitDraw();
    if (t) pen.tool = t.dataset.pen; if (k) { pen.color = k.dataset.ink; if (pen.tool === 'eraser') pen.tool = 'pen'; }
    renderDrawbar();
  };
  const O = 5000;
  function drawDown(e) {
    const w = toWorld(e.clientX, e.clientY); stage.setPointerCapture(e.pointerId);
    if (pen.tool === 'eraser') { erasing = true; eraseAt(e); return; }
    stroke = { pts: [[w.x, w.y, performance.now()]], tool: pen.tool, size: curSize(), color: pen.color };
    liveSvg.innerHTML = '';
  }
  function eraseAt(e) {
    const w = toWorld(e.clientX, e.clientY), r = (pen.sizes.eraser || 28) / 2 / view.z; let hit = false;   // the eraser is a size on screen, like the ring you see
    board.cards.filter(c => c.type === 'ink').forEach(c => {
      const sx = c.w / c.ow, sy = c.h / c.oh, half = penW(c.pen, c.size) / 2;
      if (w.x < c.x - r - half || w.x > c.x + c.w + r + half || w.y < c.y - r - half || w.y > c.y + c.h + r + half) return;
      if (c.pts.some(p => Math.hypot(c.x + p[0] * sx - w.x, c.y + p[1] * sy - w.y) < r + half)) {
        hit = true; board.cards = board.cards.filter(x => x !== c); const el = cardsEl.querySelector(`[data-id="${c.id}"]`); if (el) { el.classList.add('fading'); setTimeout(() => el.remove(), 260); }
      }
    });
    if (hit) save();
  }
  addEventListener('pointermove', e => {
    if (!drawOn) return;
    const ring = $('eraseRing'); if (ring) { const r = stage.getBoundingClientRect(); ring.style.left = e.clientX - r.left + 'px'; ring.style.top = e.clientY - r.top + 'px'; }
    if (erasing) return eraseAt(e);
    if (!stroke) return;
    const w = toWorld(e.clientX, e.clientY), last = stroke.pts[stroke.pts.length - 1]; if (Math.hypot(w.x - last[0], w.y - last[1]) < 1.5 / view.z) return;
    stroke.pts.push([w.x, w.y, performance.now()]);
    liveSvg.innerHTML = inkPath(stroke.pts.map(p => [p[0] + O, p[1] + O, p[2]]), stroke.tool, stroke.size, stroke.color, false);
  });
  addEventListener('pointerup', () => {
    if (!drawOn) return; erasing = false; if (!stroke) return;
    const s2 = stroke; stroke = null; liveSvg.innerHTML = '';
    const pad = penW(s2.tool, s2.size) + 4, xs = s2.pts.map(p => p[0]), ys = s2.pts.map(p => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    const pts = s2.pts.map(p => [+(p[0] - x0).toFixed(1), +(p[1] - y0).toFixed(1), Math.round(p[2])]);
    const c = card('ink', { x: x0, y: y0, w, h, ow: w, oh: h, r: 0, pts, pen: s2.tool, size: s2.size, ink: s2.color });
    board.cards.push(c); renderCard(c); save();
  });

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
  // every emoji stamp is drawn as Mochi-style pixel art (stamps/px); boards made before keep working, they just get the new look
  const PX = { '❤️': 'heart', '👍': 'thumbsup', '👎': 'thumbsdown', '⭐': 'star', '✨': 'sparkles', '🌈': 'rainbow', '🔥': 'fire', '🎉': 'party', '💯': 'hundred', '✅': 'check', '❌': 'cross', '❓': 'question', '❗': 'exclaim', '💡': 'bulb', '👀': 'eyes', '🙌': 'raised', '👏': 'clap', '🤔': 'thinking', '😍': 'hearteyes', '😂': 'joy', '🥹': 'holdingtears', '😭': 'sob', '😅': 'sweat', '🫶': 'hearthands', '💖': 'sparkleheart', '🩷': 'pinkheart', '💜': 'purpleheart', '💙': 'blueheart', '🌸': 'blossom', '🌷': 'tulip', '🍓': 'strawberry', '🍑': 'peach', '🧁': 'cupcake', '☕': 'coffee', '🚀': 'rocket', '📌': 'pushpin', '📍': 'roundpin', '🎯': 'target', '🏆': 'trophy', '🧠': 'brain', '💬': 'speech', '🗓️': 'calendar', '⏰': 'alarm', '🔗': 'link', '🎨': 'palette', '🖍️': 'crayon', '📸': 'camera', '🎧': 'headphones' };
  const pxSrc = e => PX[e] ? `stamps/px/${PX[e]}.png` : null;
  const stampHTML = st => st.src ? `<img src="${esc(st.src)}" alt="">` : pxSrc(st.emoji) ? `<img src="${pxSrc(st.emoji)}" alt="${esc(st.emoji)}">` : esc(st.emoji);
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

  // ---------- docs: a real document editor (styles, fonts, sizes, colors, lists, tables, images, Mochi on any words), beside the board ----------
  // A doc keeps its rich content in c.doc (the editor's own structured format) and a plain-text copy in c.body (for the card, search and Mochi).
  let docCard = null, ed = null, dvT = 0; const bubbleEl = $('dvBubble');   // the editor's popup moves the floating bar out of the page, so keep hold of it
  const DOC_FONT = 'DM Sans', SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
  const BLOCKS = [['title', 'Title', 36], ['heading', 'Heading', 26], ['sub', 'Subheading', 20], ['body', 'Body', 16], ['lead', 'Lead', 19], ['caption', 'Caption', 13], ['quote', 'Quote', 18], ['code', 'Code', 14]];
  const TEXT_COLORS = ['#2b2630', '#6b6370', '#a39aa8', '#e2649a', '#e8590c', '#c99a00', '#1f9d63', '#1f7ae0', '#6b4fe0', '#c0392b'];
  const HIGHLIGHTS = ['#fff1a8', '#ffd3e5', '#cdf2df', '#d4e8ff', '#e5dbff', '#ffe0c9', '#e9e4ec'];
  const SUGGESTED_FONTS = ['DM Sans', 'Inter', 'Helvetica Neue', 'Avenir Next', 'Futura', 'Gill Sans', 'Georgia', 'Baskerville', 'Palatino', 'Times New Roman', 'Didot', 'Playfair Display', 'Lora', 'Fraunces', 'Merriweather', 'Space Grotesk', 'IBM Plex Mono', 'Menlo', 'Caveat'];
  const DI = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const DICON = {
    left: DI('<path d="M3.5 5h13M3.5 8.5h9M3.5 12h13M3.5 15.5h9"/>'), center: DI('<path d="M3.5 5h13M5.5 8.5h9M3.5 12h13M5.5 15.5h9"/>'),
    right: DI('<path d="M3.5 5h13M7.5 8.5h9M3.5 12h13M7.5 15.5h9"/>'), justify: DI('<path d="M3.5 5h13M3.5 8.5h13M3.5 12h13M3.5 15.5h13"/>'),
    bullet: DI('<circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="10" r="1" fill="currentColor"/><circle cx="4.5" cy="14" r="1" fill="currentColor"/><path d="M8 6h8.5M8 10h8.5M8 14h8.5"/>'),
    ordered: DI('<path d="M3.5 4.5h1.2v3.2M3.4 7.7h2.2M3.4 12.2c.2-.7 2.2-.8 2.2.3 0 .8-2.2 1.4-2.2 2.2h2.3M8.5 6h8M8.5 13.5h8"/>'),
    task: DI('<rect x="3" y="4" width="5" height="5" rx="1.3"/><path d="M4.3 6.5l1 1 1.6-2"/><rect x="3" y="11.5" width="5" height="5" rx="1.3"/><path d="M10.5 6.5h6M10.5 14h6"/>'),
    link: CIC.link, image: DI('<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="M3.5 14.5l4-3.5 3 2.5 2.5-2 3.5 3"/>'),
    more: DI('<circle cx="5" cy="10" r="1.1" fill="currentColor"/><circle cx="10" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/>'),
    hl: DI('<path d="M11.5 3.5l5 5-6 6H6v-4.5z"/><path d="M4 18h12" stroke-width="3" class="bar"/>'), undo: DI('<path d="M7.5 7.5H13a3.5 3.5 0 0 1 0 7H8"/><path d="M10 4.5l-3 3 3 3"/>'), redo: DI('<path d="M12.5 7.5H7a3.5 3.5 0 0 0 0 7h5"/><path d="M10 4.5l3 3-3 3"/>'),
    mochi: DI('<path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"/><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
    table: DI('<rect x="3" y="4" width="14" height="12" rx="1.6"/><path d="M3 8h14M3 12h14M8 4v12M12.5 4v12"/>'), hr: DI('<path d="M3 10h14"/><path d="M6 6h8M6 14h8" opacity=".4"/>'),
    clear: DI('<path d="M5 4.5h10M10 4.5L7.5 16"/><path d="M12.5 12l4 4M16.5 12l-4 4"/>'),
  };
  const fontName = f => String(f || '').replace(/["']/g, '').split(',')[0].trim();
  const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // plain text or Mochi's light markdown → editor HTML (headings, lists, checklists, quotes, dividers, **bold**, *italic*, `code`)
  function mdToHTML(src) {
    const inl = s => escH(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/`(.+?)`/g, '<code>$1</code>');
    const lines = String(src || '').replace(/\r/g, '').split('\n'); let out = '', list = null;
    const close = () => { if (list) { out += `</${list === 'task' ? 'ul' : list}>`; list = null; } };
    const open = k => { if (list !== k) { close(); out += k === 'task' ? '<ul data-type="taskList">' : `<${k}>`; list = k; } };
    for (const raw of lines) {
      const l = raw.trimEnd(); let m;
      if (!l.trim()) { close(); continue; }
      if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = l.match(/^\s*(?:(?:[-*]\s+)?\[( |x|X)\]|([☐☑]))\s*(.*)/))) { open('task'); const on = (m[1] || '').toLowerCase() === 'x' || m[2] === '☑'; out += `<li data-type="taskItem" data-checked="${on}"><p>${inl(m[3])}</p></li>`; }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { open('ul'); out += `<li><p>${inl(m[1])}</p></li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { open('ol'); out += `<li><p>${inl(m[1])}</p></li>`; }
      else if ((m = l.match(/^>\s?(.*)/))) { close(); out += `<blockquote><p>${inl(m[1])}</p></blockquote>`; }
      else if (/^(-{3,}|\*{3,})$/.test(l.trim())) { close(); out += '<hr>'; }
      else { close(); out += `<p>${inl(l)}</p>`; }
    }
    close(); return out || '<p></p>';
  }
  const docHTML = c => c.doc && window.MBEditor ? MBEditor.generateHTML(c.doc, MBEditor.extensions()) : mdToHTML(c.body);
  // load any web fonts a doc uses, so it looks right on this Mac
  function fontsIn(json) { const out = new Set(); (function walk(n) { (n?.marks || []).forEach(m => m.type === 'textStyle' && m.attrs?.fontFamily && out.add(fontName(m.attrs.fontFamily))); (n?.content || []).forEach(walk); })(json); return [...out]; }

  function ensureEditor() {
    if (ed) return ed; if (!window.MBEditor) return null;
    ed = new MBEditor.Editor({
      element: $('dvBody'),
      extensions: [...MBEditor.extensions('Start writing, or drag cards here from the board…'),
        MBEditor.BubbleMenu.configure({ element: bubbleEl, tippyOptions: { duration: [140, 90], placement: 'top', offset: [0, 10], maxWidth: 'none', zIndex: 60, appendTo: () => document.body, popperOptions: { strategy: 'fixed' } },
          shouldShow: ({ editor, state }) => !state.selection.empty && editor.isEditable && !editor.isActive('image') && !document.querySelector('#dvPop:not([hidden])') })],
      editorProps: {
        attributes: { class: 'dv-prose', spellcheck: 'true' },
        handleKeyDown: (v, e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); showPop('link', $('dvTools').querySelector('[data-pop="link"]')); return true; } return false; },
        // images dropped or pasted in become part of the doc (kept inside the doc, so they never go missing)
        handleDrop: (v, e) => { const fs = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/')); if (!fs.length) return false; e.preventDefault(); const pos = v.posAtCoords({ left: e.clientX, top: e.clientY })?.pos; fs.forEach(f => addDocImage(f, pos)); return true; },
        handlePaste: (v, e) => { const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (!fs.length) return false; fs.forEach(f => addDocImage(f)); return true; },
      },
      onUpdate: () => { if (!docCard) return; clearTimeout(dvT); $('dvSaved').textContent = 'saving…'; dvT = setTimeout(syncDoc, 350); paintCount(); },
      onSelectionUpdate: () => paintTools(), onTransaction: () => requestAnimationFrame(paintTools),
    });
    buildTools(); return ed;
  }
  function syncDoc() {
    clearTimeout(dvT); if (!docCard || !ed) return;
    docCard.doc = ed.getJSON(); docCard.body = ed.getText({ blockSeparator: '\n' }).replace(/\n{3,}/g, '\n\n').trim();
    renderCard(docCard); save(); $('dvSaved').textContent = 'saved';
  }
  const paintCount = () => { if (!ed) return; const w = ed.storage.characterCount.words(); $('dvCount').textContent = `${w.toLocaleString()} word${w === 1 ? '' : 's'}`; };
  function addDocImage(file, pos) {
    const r = new FileReader(); r.onload = () => { const ch = ed.chain().focus(); (pos != null ? ch.insertContentAt(pos, { type: 'image', attrs: { src: r.result } }) : ch.setImage({ src: r.result })).run(); };
    r.readAsDataURL(file);
  }
  const imgPick = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true }); document.body.appendChild(imgPick);
  imgPick.onchange = () => { [...imgPick.files].forEach(f => addDocImage(f)); imgPick.value = ''; };

  function openDoc(c) {
    if (docCard && docCard !== c) syncDoc();
    docCard = c; $('dvTitle').value = c.text || '';
    $('dvWhere').textContent = `${board.name} › ${c.text || 'Untitled'}`;
    $('docview').classList.add('on'); stage.classList.add('doc-open'); selectOnly([]);
    const e = ensureEditor();
    if (e) { e.commands.setContent(docHTML(c), false); if (c.doc) fontsIn(c.doc).forEach(useFont); e.commands.setTextSelection(0); paintTools(); paintCount(); $('dvSaved').textContent = ''; }
    $('dvPage').scrollTop = 0;
    setTimeout(() => c.text ? e?.commands.focus('end') : $('dvTitle').focus(), 250);
  }
  function closeDoc() { if (!docCard) return; syncDoc(); hidePop(); const c = docCard; docCard = null; $('docview').classList.remove('on', 'wide'); stage.classList.remove('doc-open'); document.activeElement.blur(); renderCard(c); selectOnly([c.id]); save(); }
  $('dvTitle').oninput = () => { if (!docCard) return; docCard.text = $('dvTitle').value; $('dvWhere').textContent = `${board.name} › ${docCard.text || 'Untitled'}`; renderCard(docCard); save(); };
  $('dvTitle').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ed?.commands.focus('start'); } };
  $('dvBack').onclick = closeDoc; $('dvClose').onclick = closeDoc;
  $('dvExport').onclick = e => { ensureEditor(); showPop('export', e.currentTarget); };
  // writing on a dark page: only the view changes, never what gets saved or downloaded
  const pagePref = () => { try { return localStorage.getItem('mochiboard:docPage') || 'auto'; } catch (e) { return 'auto'; } };
  function applyDocPage() { const p = pagePref(), dark = p === 'dark' || (p === 'auto' && document.body.classList.contains('dark')); $('docview').classList.toggle('page-dark', dark); }
  $('dvPageMode').onclick = e => { ensureEditor(); showPop('page', e.currentTarget); };
  new MutationObserver(applyDocPage).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  applyDocPage();

  // ---------- a doc as a PDF: the same styles you see, laid out on real pages ----------
  // the editor's own text styles, read from the app's stylesheet, so the PDF always matches the screen
  function proseCSS() {
    let out = '';
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of rules) if (r.selectorText && /\.dv-prose/.test(r.selectorText) && !/page-dark|ProseMirror-selectednode|selectedCell|column-resize|resize-cursor|is-empty|::selection|is-editor-empty/.test(r.selectorText)) out += r.cssText + '\n'; }
    return out;
  }
  function docPrintHTML(paper) {
    // glue each heading to the block after it, so a heading never sits alone at the bottom of a page (WebKit's print ignores break-after)
    const glue = html => { const d = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html'), r = d.getElementById('r');
      [...r.querySelectorAll(':scope > h1, :scope > h2, :scope > h3')].forEach(h => { const w = d.createElement('div'); w.className = 'keep'; h.before(w); w.append(h); const n = w.nextElementSibling; if (n && !/^H[1-3]$/.test(n.tagName)) w.append(n); });
      return r.innerHTML; };
    const body = glue(ed ? ed.getHTML() : docHTML(docCard)), first = (ed ? ed.state.doc.firstChild?.textContent : '') || '';
    const title = (docCard?.text || '').trim() && first.trim().toLowerCase() !== (docCard.text || '').trim().toLowerCase() ? docCard.text.trim() : '';   // no double title when the doc already starts with it
    const web = [...new Set(fontsIn(ed ? ed.getJSON() : docCard.doc || {}))].filter(f => !onMac(f));
    const size = paper === 'a4' ? '210mm 297mm' : '8.5in 11in';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escH(title || 'Document')}</title>
<link rel="stylesheet" href="__WEB__/fonts.css">${web.map(f => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400&display=swap">`).join('')}
<style>
@page { size: ${size}; margin: 0.8in 0.85in 0.85in; }   /* browsers use these; the Mac app sets the same margins on its printer */
html, body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { padding: 0; }
:root { --paper: #ffffff; --paper-ink: #2b2630; --paper-soft: #6b6370; }   /* downloads are always light pages */
.doc-title { margin: 0 0 18px; font: 800 36px/1.1 "DM Sans", system-ui, sans-serif; letter-spacing: -.035em; color: #2b2630; }
${proseCSS()}
.dv-prose { min-height: 0; }
.dv-prose h1, .dv-prose h2, .dv-prose h3 { break-after: avoid; page-break-after: avoid; }
.dv-prose img, .dv-prose tr, .dv-prose blockquote, .dv-prose pre, .dv-prose li { break-inside: avoid; page-break-inside: avoid; }
.dv-prose p { orphans: 3; widows: 3; }
.dv-prose .keep { break-inside: avoid; page-break-inside: avoid; }
.dv-prose .keep > :first-child { margin-top: 0; } .dv-prose > .keep { margin-top: 1.5em; } .dv-prose > .keep:first-child { margin-top: 0; }
.dv-prose a { color: #c4417f; }
.dv-prose ul[data-type="taskList"] input[type="checkbox"] { pointer-events: none; }
</style></head><body>${title ? `<h1 class="doc-title">${escH(title)}</h1>` : ''}<div class="dv-prose">${body}</div></body></html>`;
  }
  // ---------- a doc as a Word file: real headings, lists, tables and pictures, with DM Sans built in ----------
  let docxLoading = null;
  const loadDocx = () => docxLoading || (docxLoading = new Promise((res, rej) => { if (window.MBDocx) return res(); const sc = document.createElement('script'); sc.src = 'vendor/docx.js'; sc.onload = res; sc.onerror = () => { docxLoading = null; rej(new Error("the Word maker didn't load")); }; document.head.appendChild(sc); }));
  async function downloadWord() {
    if (!docCard) return; syncDoc();
    const paper = (() => { try { return localStorage.getItem('mochiboard:paper') || 'letter'; } catch (e) { return 'letter'; } })();
    $('dvSaved').textContent = 'making your Word file…';
    try {
      await loadDocx();
      const bytes = await MBDocx.toDocx(ed ? ed.getJSON() : docCard.doc || MBEditor.generateJSON(docHTML(docCard), MBEditor.extensions()), { title: (docCard.text || '').trim(), paper });
      let b64 = ''; for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); b64 = btoa(b64);
      const name = await MB.saveFile(b64, (docCard.text || 'Document').trim() || 'Document', 'docx');
      if (name) say(`Saved “${name}” ✦`, 5000);
    } catch (err) { say("I couldn't make the Word file: " + err.message, 8000); }
    finally { $('dvSaved').textContent = ''; }
  }
  async function downloadPDF() {
    if (!docCard) return; syncDoc();
    const paper = (() => { try { return localStorage.getItem('mochiboard:paper') || 'letter'; } catch (e) { return 'letter'; } })();
    $('dvSaved').textContent = 'making your PDF…';
    try {
      const name = await MB.docPDF(docPrintHTML(paper), (docCard.text || 'Document').trim() || 'Document', paper);
      if (name) say(`Saved “${name}” ✦`, 5000);
    } catch (err) { say("I couldn't make the PDF: " + err.message, 8000); }
    finally { $('dvSaved').textContent = ''; }
  }
  $('dvWide').onclick = () => { const w = $('docview').classList.toggle('wide'); requestAnimationFrame(fitTools); $('dvWide').textContent = w ? '⤡' : '⤢'; $('dvWide').title = w ? 'Half page' : 'Full page'; };

  // ---------- the toolbar ----------
  function buildTools() {
    const tb = (c, label, tip, cls = '') => `<button type="button" class="dt-b ${cls}" data-c="${c}" title="${tip}" aria-label="${tip}">${label}</button>`;
    const pop = (p, label, tip, cls = '') => `<button type="button" class="dt-b dt-drop ${cls}" data-pop="${p}" title="${tip}" aria-label="${tip}" aria-haspopup="true">${label}</button>`;
    $('dvTools').innerHTML = [
      tb('undo', DICON.undo, 'Undo · ⌘Z', 'dt-fold f7'), tb('redo', DICON.redo, 'Redo · ⇧⌘Z', 'dt-fold f8'), '<span class="dt-sep"></span>',
      pop('style', '<span class="dt-lbl" id="dtStyle">Body</span><i class="dt-car"></i>', 'Text style', 'dt-style'),
      pop('font', '<span class="dt-lbl" id="dtFont">DM Sans</span><i class="dt-car"></i>', 'Font', 'dt-font'),
      `<span class="dt-size" title="Text size"><button type="button" class="dt-b" data-c="smaller" aria-label="Smaller">−</button><input id="dtSize" inputmode="numeric" aria-label="Text size" value="16"><button type="button" class="dt-b" data-c="bigger" aria-label="Bigger">+</button></span>`,
      '<span class="dt-sep"></span>',
      tb('bold', '<b>B</b>', 'Bold · ⌘B', 'dt-t'), tb('italic', '<i>I</i>', 'Italic · ⌘I', 'dt-t'), tb('underline', '<u>U</u>', 'Underline · ⌘U', 'dt-t'), tb('strike', '<s>S</s>', 'Strikethrough · ⇧⌘S', 'dt-t'),
      pop('color', '<span class="dt-a">A<i id="dtColorBar"></i></span>', 'Text color'), pop('hl', DICON.hl, 'Highlight', 'dt-hl'),
      '<span class="dt-sep"></span>',
      pop('align', `<span id="dtAlign">${DICON.left}</span>`, 'Alignment', 'dt-fold f6'),
      tb('bullet', DICON.bullet, 'Bulleted list', 'dt-fold f5'), tb('ordered', DICON.ordered, 'Numbered list', 'dt-fold f4'), tb('task', DICON.task, 'Checklist', 'dt-fold f3'),
      '<span class="dt-sep"></span>',
      pop('link', DICON.link, 'Link · ⌘K', 'dt-fold f2'), tb('image', DICON.image, 'Add a picture', 'dt-fold f1'), pop('more', DICON.more, 'More: line spacing, tables, dividers…'),
      `<button type="button" class="dt-mochi dt-round" data-pop="mochi" data-tip="Mochi" aria-label="Ask Mochi about your selection">${DICON.mochi}</button>`,
    ].join('');
    bubbleEl.innerHTML = [tb('bold', '<b>B</b>', 'Bold', 'dt-t'), tb('italic', '<i>I</i>', 'Italic', 'dt-t'), tb('underline', '<u>U</u>', 'Underline', 'dt-t'), tb('strike', '<s>S</s>', 'Strikethrough', 'dt-t'),
      pop('color', '<span class="dt-a">A<i class="dtBar"></i></span>', 'Text color'), pop('hl', DICON.hl, 'Highlight', 'dt-hl'), pop('link', DICON.link, 'Link'),
      `<button type="button" class="dt-mochi" data-pop="mochi" title="Ask Mochi to rewrite this">${DICON.mochi}<span>Mochi</span></button>`].join('');
    [$('dvTools'), bubbleEl].forEach(bar => {
      bar.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });   // keep the text selected while using the bar
      bar.addEventListener('click', e => { const b = e.target.closest('[data-c], [data-pop]'); if (!b) return; if (b.dataset.pop) return showPop(b.dataset.pop, b); run(b.dataset.c); });
    });
    const sz = $('dtSize');
    sz.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = clamp(parseInt(sz.value, 10) || 16, 6, 200); ed.chain().focus().setFontSize(v + 'px').run(); } if (e.key === 'Escape') { sz.blur(); ed.commands.focus(); } });
    sz.addEventListener('focus', () => sz.select());
    new ResizeObserver(() => requestAnimationFrame(fitTools)).observe($('docview'));
  }
  // keep the toolbar to one row: when space is tight, picture, link, lists and alignment fold into More (like Word and Google Docs)
  function fitTools() {
    const bar = $('dvTools'); if (!bar.offsetParent) return;
    const folds = [...bar.querySelectorAll('.dt-fold')].sort((a, b) => +a.className.match(/f(\d)/)[1] - +b.className.match(/f(\d)/)[1]);
    folds.forEach(b => b.hidden = false); bar.querySelectorAll('.dt-sep').forEach(x => x.hidden = false);
    const first = bar.firstElementChild, oneRow = () => bar.lastElementChild.offsetTop - first.offsetTop < 6;
    for (const b of folds) { if (oneRow()) break; b.hidden = true; tidySeps(bar); }
    tidySeps(bar);
  }
  function tidySeps(bar) {   // no separator at the edges or two in a row once buttons fold away
    let prev = null; [...bar.children].forEach(el => { if (el.hidden && !el.classList.contains('dt-sep')) return;
      if (el.classList.contains('dt-sep')) { el.hidden = !prev || prev.classList.contains('dt-sep'); if (!el.hidden) prev = el; } else prev = el; });
    const vis = [...bar.children].filter(el => !el.hidden); const last = vis[vis.length - 2]; if (last?.classList.contains('dt-sep')) last.hidden = true;
  }
  const docSize = () => { const s = parseFloat(ed.getAttributes('textStyle').fontSize); if (s) return s; return (BLOCKS.find(b => b[0] === blockOf()) || BLOCKS[3])[2]; };
  function blockOf() {
    if (!ed) return 'body'; if (ed.isActive('heading', { level: 1 })) return 'title'; if (ed.isActive('heading', { level: 2 })) return 'heading'; if (ed.isActive('heading', { level: 3 })) return 'sub';
    if (ed.isActive('codeBlock')) return 'code'; if (ed.isActive('blockquote')) return 'quote'; const k = ed.getAttributes('paragraph').kind; return k === 'lead' || k === 'caption' ? k : 'body';
  }
  function setBlock(k) {
    const c = ed.chain().focus();
    if (ed.isActive('blockquote') && k !== 'quote') c.lift('blockquote'); if (ed.isActive('codeBlock') && k !== 'code') c.setParagraph();
    ({ title: () => c.setHeading({ level: 1 }), heading: () => c.setHeading({ level: 2 }), sub: () => c.setHeading({ level: 3 }), body: () => c.setParagraph().updateAttributes('paragraph', { kind: null }),
      lead: () => c.setParagraph().updateAttributes('paragraph', { kind: 'lead' }), caption: () => c.setParagraph().updateAttributes('paragraph', { kind: 'caption' }),
      quote: () => ed.isActive('blockquote') ? c : c.setParagraph().setBlockquote(), code: () => c.setCodeBlock() })[k]();
    c.run();
  }
  function run(cmd) {
    if (!ed) return; const c = ed.chain().focus();
    const step = d => { const s = docSize(), i = SIZES.findIndex(x => x >= s); const n = d > 0 ? (SIZES.find(x => x > s) || s + 8) : ([...SIZES].reverse().find(x => x < s) || Math.max(6, s - 2)); return n + 'px'; };
    ({ undo: () => c.undo(), redo: () => c.redo(), bold: () => c.toggleBold(), italic: () => c.toggleItalic(), underline: () => c.toggleUnderline(), strike: () => c.toggleStrike(),
      bullet: () => c.toggleBulletList(), ordered: () => c.toggleOrderedList(), task: () => c.toggleTaskList(),
      smaller: () => c.setFontSize(step(-1)), bigger: () => c.setFontSize(step(1)), image: () => (imgPick.click(), c),
    })[cmd]?.().run();
  }
  // show what's true where the cursor is: style, font, size, bold…, alignment, colors
  function paintTools() {
    if (!ed || !docCard) return;
    const k = blockOf(), st = ed.getAttributes('textStyle');
    $('dtStyle').textContent = (BLOCKS.find(b => b[0] === k) || BLOCKS[3])[1];
    const f = fontName(st.fontFamily) || DOC_FONT; $('dtFont').textContent = f; $('dtFont').style.fontFamily = `"${f}", ${DOC_FONT}, system-ui`;
    if (document.activeElement !== $('dtSize')) $('dtSize').value = Math.round(docSize());
    const on = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' };
    [$('dvTools'), bubbleEl].forEach(bar => bar.querySelectorAll('[data-c]').forEach(b => { const n = on[b.dataset.c]; if (n) b.classList.toggle('on', ed.isActive(n)); }));
    const al = ['center', 'right', 'justify'].find(a => ed.isActive({ textAlign: a })) || 'left'; $('dtAlign').innerHTML = DICON[al];
    const col = st.color || ''; [$('dtColorBar'), ...bubbleEl.querySelectorAll('.dtBar')].forEach(b => b.style.background = col || 'var(--ink)');
    const hl = ed.getAttributes('highlight').color || ''; [...$('dvTools').querySelectorAll('.dt-hl .bar'), ...bubbleEl.querySelectorAll('.dt-hl .bar')].forEach(b => b.style.stroke = hl || '#f4dc6c');
    $('dvTools').querySelector('[data-c="undo"]').disabled = !ed.can().undo(); $('dvTools').querySelector('[data-c="redo"]').disabled = !ed.can().redo();
  }

  // ---------- the drop-down menus ----------
  let popKind = null;
  function hidePop() { $('dvPop').hidden = true; popKind = null; document.querySelectorAll('.dt-b.open, .dt-mochi.open').forEach(b => b.classList.remove('open')); }
  function showPop(kind, btn) {
    if (popKind === kind && !$('dvPop').hidden) return hidePop();
    hidePop(); popKind = kind; btn.classList.add('open'); const p = $('dvPop'); p.className = 'dv-pop pop-' + kind;
    const swatches = (list, cur, attr) => list.map(h => `<button type="button" class="dp-sw ${cur && cur.toLowerCase() === h.toLowerCase() ? 'on' : ''}" ${attr}="${h}" style="--sw:${h}" title="${h.toUpperCase()}" aria-label="${h.toUpperCase()}"></button>`).join('');
    const boardCols = [...new Set((board.palette || []).map(x => x.hex).concat(board.cards.filter(c => c.type === 'swatch').map(c => c.hex)))].slice(0, 14);
    if (kind === 'style') {
      const k = blockOf(); p.innerHTML = BLOCKS.map(([id, name]) => `<button type="button" class="dp-row dp-st st-${id} ${id === k ? 'on' : ''}" data-block="${id}">${name}</button>`).join('');
    } else if (kind === 'font') {
      const cur = fontName(ed.getAttributes('textStyle').fontFamily) || DOC_FONT;
      const onBoard = boardFonts();
      const row = f => `<button type="button" class="dp-row dp-font ${f === cur ? 'on' : ''}" data-font="${escH(f)}" style="font-family:'${escH(f)}', ${DOC_FONT}, system-ui">${escH(f)}${onMac(f) ? '' : '<small>Google Fonts</small>'}</button>`;
      p.innerHTML = `<input class="dp-search" id="dpFontQ" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
        <div class="dp-scroll" id="dpFontList">${onBoard.length ? `<div class="dp-h">Used on this board</div>${onBoard.map(row).join('')}` : ''}<div class="dp-h">Suggested</div>${SUGGESTED_FONTS.filter(f => !onBoard.includes(f)).map(row).join('')}
        <div class="dp-h">On your Mac</div>${FONTS.filter(f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f)).slice(0, 400).map(row).join('')}</div>`;
      SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
      const q = $('dpFontQ'); q.addEventListener('keydown', e => e.stopPropagation());
      q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); p.querySelectorAll('.dp-font').forEach(b => b.hidden = !!v && !b.dataset.font.toLowerCase().includes(v)); p.querySelectorAll('.dp-h').forEach(h => h.hidden = !!v); });
      setTimeout(() => q.focus(), 30);
    } else if (kind === 'color' || kind === 'hl') {
      const isHl = kind === 'hl', cur = isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color;
      p.innerHTML = `<button type="button" class="dp-row dp-none" data-${isHl ? 'hl' : 'tc'}="">${isHl ? 'No highlight' : 'Default color'}</button>
        ${boardCols.length ? `<div class="dp-h">Board colors</div><div class="dp-grid">${swatches(boardCols, cur, isHl ? 'data-hl' : 'data-tc')}</div>` : ''}
        <div class="dp-h">${isHl ? 'Highlighters' : 'Colors'}</div><div class="dp-grid">${swatches(isHl ? HIGHLIGHTS : TEXT_COLORS, cur, isHl ? 'data-hl' : 'data-tc')}</div>
        <button type="button" class="dp-row dp-any" data-any="${kind}">Any color…</button>`;
    } else if (kind === 'align') {
      p.innerHTML = `<div class="dp-icons">${['left', 'center', 'right', 'justify'].map(a => `<button type="button" class="dp-ic ${ed.isActive({ textAlign: a }) || (a === 'left' && !['center', 'right', 'justify'].some(x => ed.isActive({ textAlign: x }))) ? 'on' : ''}" data-align="${a}" title="${a[0].toUpperCase() + a.slice(1)}">${DICON[a]}</button>`).join('')}</div>`;
    } else if (kind === 'link') {
      const href = ed.getAttributes('link').href || '';
      p.innerHTML = `<form class="dp-link" id="dpLink"><input id="dpLinkIn" placeholder="Paste a link…" value="${escH(href)}" autocomplete="off" spellcheck="false"><button class="dp-go" type="submit">${href ? 'Update' : 'Add link'}</button></form>
        ${href ? `<div class="dp-linkacts"><button type="button" class="dp-row" data-link="open">Open ↗</button><button type="button" class="dp-row" data-link="remove">Remove link</button></div>` : ''}`;
      const inp = $('dpLinkIn'); inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { hidePop(); ed.commands.focus(); } });
      $('dpLink').onsubmit = e => { e.preventDefault(); let v = inp.value.trim(); if (!v) { ed.chain().focus().extendMarkRange('link').unsetLink().run(); return hidePop(); }
        if (!/^(https?:|mailto:|tel:)/i.test(v)) v = 'https://' + v;
        if (ed.state.selection.empty && !ed.isActive('link')) ed.chain().focus().insertContent(`<a href="${escH(v)}">${escH(v.replace(/^https?:\/\//, ''))}</a> `).run();
        else ed.chain().focus().extendMarkRange('link').setLink({ href: v }).run(); hidePop(); };
      setTimeout(() => inp.focus(), 30);
    } else if (kind === 'more') {
      const lh = ed.getAttributes('paragraph').lineHeight || ed.getAttributes('heading').lineHeight || '';
      const inTable = ed.isActive('table');
      const folded = [...$('dvTools').querySelectorAll('.dt-fold[hidden]')].map(b => b.dataset.c || b.dataset.pop);
      const foldIcons = folded.flatMap(k => k === 'align' ? ['left', 'center', 'right', 'justify'].map(a => `<button type="button" class="dp-ic ${ed.isActive({ textAlign: a }) ? 'on' : ''}" data-align="${a}" title="Align ${a}">${DICON[a]}</button>`)
        : k === 'link' ? [`<button type="button" class="dp-ic ${ed.isActive('link') ? 'on' : ''}" data-flink="1" title="Link">${DICON.link}</button>`]
        : [`<button type="button" class="dp-ic ${({ bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' })[k] && ed.isActive(({ bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' })[k]) ? 'on' : ''}" data-c2="${k}" title="${({ bullet: 'Bulleted list', ordered: 'Numbered list', task: 'Checklist', image: 'Add a picture', undo: 'Undo', redo: 'Redo' })[k]}">${DICON[k]}</button>`]).join('');
      p.innerHTML = (foldIcons ? `<div class="dp-h">Tools</div><div class="dp-icons dp-fold">${foldIcons}</div>` : '') + `<div class="dp-h">Line spacing</div><div class="dp-seg">${[['1', 'Single'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double']].map(([v, l]) => `<button type="button" class="${String(lh) === v ? 'on' : ''}" data-lh="${v}">${l}</button>`).join('')}</div>
        <div class="dp-h">Insert</div>
        <button type="button" class="dp-row dp-irow" data-ins="table">${DICON.table}Table</button>
        <button type="button" class="dp-row dp-irow" data-ins="hr">${DICON.hr}Divider</button>
        <button type="button" class="dp-row dp-irow" data-ins="sup"><b class="dp-glyph">x²</b>Superscript</button>
        <button type="button" class="dp-row dp-irow" data-ins="sub"><b class="dp-glyph">x₂</b>Subscript</button>
        ${inTable ? `<div class="dp-h">Table</div><div class="dp-grid2">${[['rowAfter', '+ Row'], ['colAfter', '+ Column'], ['delRow', '− Row'], ['delCol', '− Column'], ['header', 'Header row'], ['delTable', 'Delete table']].map(([a, l]) => `<button type="button" data-tbl="${a}">${l}</button>`).join('')}</div>` : ''}
        <div class="dp-h"></div><button type="button" class="dp-row dp-irow" data-ins="clear">${DICON.clear}Clear formatting</button>`;
    } else if (kind === 'page') {
      const cur = pagePref();
      p.innerHTML = `<div class="dp-h">Page color</div>${[['auto', 'Match Mochiboard', 'Light or dark, with the app'], ['light', 'Light paper', 'Always white'], ['dark', 'Dark', 'Easy on the eyes at night']].map(([v, l, sub]) => `<button type="button" class="dp-row dp-page ${cur === v ? 'on' : ''}" data-page="${v}"><i class="pg-sw pg-${v}"></i><span>${l}<small>${sub}</small></span></button>`).join('')}
        <p class="dp-tip">Only how it looks while you write. Downloads are always regular light pages.</p>`;
    } else if (kind === 'export') {
      const paper = (() => { try { return localStorage.getItem('mochiboard:paper') || 'letter'; } catch (e) { return 'letter'; } })();
      p.innerHTML = `<div class="dp-h">Paper</div><div class="dp-seg">${[['letter', 'Letter'], ['a4', 'A4']].map(([v, l]) => `<button type="button" class="${paper === v ? 'on' : ''}" data-paper="${v}">${l}</button>`).join('')}</div>
        <button type="button" class="dp-row dp-pdf" data-pdf="1"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2.5h6l3.5 3.5v10.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/><path d="M11.5 2.5V6H15"/></svg><span>Download PDF<small>Real pages, ready to send or print</small></span></button>
        <button type="button" class="dp-row dp-pdf dp-word" data-word="1"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2.5h6l3.5 3.5v10.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/><path d="M11.5 2.5V6H15M7 9.5l1.2 5 1.8-3.6 1.8 3.6 1.2-5"/></svg><span>Download Word<small>A .docx you can keep editing in Word or Pages</small></span></button>`;
    } else if (kind === 'mochi') {
      const has = !ed.state.selection.empty;
      p.innerHTML = has ? `<div class="dp-h">Mochi, make this…</div>${[['Shorter', 'Make it shorter and tighter'], ['Clearer', 'Make it clearer and easier to read'], ['Friendlier', 'Make it warmer and friendlier'], ['More confident', 'Make it more confident and direct'], ['More professional', 'Make it more polished and professional'], ['Fix spelling & grammar', 'Fix spelling, grammar and punctuation only. Change nothing else'], ['Into bullet points', 'Turn it into a short bulleted list']].map(([l, how]) => `<button type="button" class="dp-row" data-how="${escH(how)}">${l}</button>`).join('')}
        <form class="dp-link" id="dpAsk"><input id="dpAskIn" placeholder="Or tell Mochi what to do…" autocomplete="off"><button class="dp-go" type="submit">✦</button></form>`
        : `<p class="dp-tip">Select some words, then ask Mochi to rewrite them: shorter, friendlier, fixed up, or anything you like ✦</p>`;
      const ask = $('dpAskIn'); if (ask) { ask.addEventListener('keydown', e => e.stopPropagation()); $('dpAsk').onsubmit = e => { e.preventDefault(); const v = ask.value.trim(); if (v) rewrite(v); }; }
    }
    // place it under its button, inside the doc panel
    p.hidden = false; const dv = $('docview').getBoundingClientRect(), r = btn.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight; let x = r.left - dv.left, y = r.bottom - dv.top + 8;
    if (y + h > dv.height - 10) y = Math.max(10, r.top - dv.top - h - 8);
    p.style.left = clamp(x, 10, dv.width - w - 10) + 'px'; p.style.top = y + 'px';
  }
  const p_seg = b => b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('dvPop').addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
  $('dvPop').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.type === 'submit') return; const d = b.dataset, c = ed.chain().focus();
    if (d.block) { setBlock(d.block); return hidePop(); }
    if (d.font != null) { useFont(d.font); (d.font === DOC_FONT ? c.unsetFontFamily() : c.setFontFamily(`"${d.font}"`)).run(); return hidePop(); }
    if (d.tc != null) { (d.tc ? c.setColor(d.tc) : c.unsetColor()).run(); return hidePop(); }
    if (d.hl != null) { (d.hl ? c.setHighlight({ color: d.hl }) : c.unsetHighlight()).run(); return hidePop(); }
    if (d.any) { const isHl = d.any === 'hl', r = b.getBoundingClientRect(), sel = { from: ed.state.selection.from, to: ed.state.selection.to }; hidePop();
      openColor({ tint: true, title: isHl ? 'Highlight' : 'Text color', hex: (isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color) || (isHl ? '#fff1a8' : '#e2649a'), presets: isHl ? HIGHLIGHTS : TEXT_COLORS, at: { x: r.left, y: r.bottom + 8 },
        apply: hex => { const k = ed.chain().setTextSelection(sel); (isHl ? k.setHighlight({ color: hex }) : k.setColor(hex)).run(); }, reset: () => { const k = ed.chain().setTextSelection(sel); (isHl ? k.unsetHighlight() : k.unsetColor()).run(); } }); return; }
    if (d.align) { c.setTextAlign(d.align).run(); return hidePop(); }
    if (d.c2) { hidePop(); return run(d.c2); }
    if (d.flink) { const more = $('dvTools').querySelector('[data-pop="more"]'); hidePop(); return showPop('link', more); }
    if (d.link === 'open') { MB.openURL(ed.getAttributes('link').href); return hidePop(); }
    if (d.link === 'remove') { c.extendMarkRange('link').unsetLink().run(); return hidePop(); }
    if (d.lh) { (ed.getAttributes('paragraph').lineHeight === d.lh || ed.getAttributes('heading').lineHeight === d.lh ? c.unsetLineHeight() : c.setLineHeight(d.lh)).run(); return hidePop(); }
    if (d.ins) { ({ table: () => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }), hr: () => c.setHorizontalRule(), sup: () => c.toggleSuperscript(), sub: () => c.toggleSubscript(), clear: () => c.unsetAllMarks().clearNodes() })[d.ins]().run(); return hidePop(); }
    if (d.tbl) { ({ rowAfter: () => c.addRowAfter(), colAfter: () => c.addColumnAfter(), delRow: () => c.deleteRow(), delCol: () => c.deleteColumn(), header: () => c.toggleHeaderRow(), delTable: () => c.deleteTable() })[d.tbl]().run(); return hidePop(); }
    if (d.page) { try { localStorage.setItem('mochiboard:docPage', d.page); } catch (er) {} applyDocPage(); return hidePop(); }
    if (d.paper) { try { localStorage.setItem('mochiboard:paper', d.paper); } catch (er) {} p_seg(b); return; }
    if (d.pdf) { hidePop(); return downloadPDF(); }
    if (d.word) { hidePop(); return downloadWord(); }
    if (d.how) rewrite(d.how);
  });
  addEventListener('pointerdown', e => { if (!$('dvPop').hidden && !e.target.closest('#dvPop, .dt-drop, .dt-mochi, #cpop')) hidePop(); }, true);
  $('docview').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dvPop').hidden) { e.stopPropagation(); hidePop(); ed?.commands.focus(); } }, true);

  // ---------- Mochi rewrites the words you selected ----------
  async function rewrite(how) {
    hidePop(); if (!ed) return; const { from, to } = ed.state.selection; if (from === to) return;
    const text = ed.state.doc.textBetween(from, to, '\n'), size = ed.state.doc.content.size;
    const around = ed.state.doc.textBetween(Math.max(0, from - 700), Math.min(size, to + 700), '\n');
    $('docview').classList.add('mochi-busy'); goo.think(true); $('dvSaved').textContent = 'Mochi is rewriting…';
    try {
      const out = (await MB.rewrite(text, how, docCard?.text || '', around) || '').trim(); if (!out) throw new Error('Mochi came back empty-handed');
      const multi = /\n/.test(out);
      ed.chain().focus().insertContentAt({ from, to }, multi ? mdToHTML(out) : escH(out)).run();
      const end = ed.state.selection.from; ed.commands.setTextSelection({ from, to: end });
      say('Rewritten ✦ Undo brings back your words.', 6000, [{ label: 'Undo', run: () => ed.chain().focus().undo().run() }]);
    } catch (err) {
      const m = err.message || '';
      if (/Claude Code/.test(m)) say("I need Claude Code to rewrite things. It's a one-time setup with your Claude account.", 0, [{ label: 'Show me how to connect', run: () => MB.openURL(GUIDE) }]);
      else if (SIGNIN.test(m)) say("Claude Code is here, but it isn't signed in yet. Open Terminal, type claude, and sign in.", 0, [{ label: 'Show me how', run: () => MB.openURL(GUIDE) }]);
      else say(MB.native ? "Hmm, I couldn't rewrite that: " + m : 'Mochi rewrites text with Claude in the Mac app ✦', 8000);
    } finally { $('docview').classList.remove('mochi-busy'); goo.think(false); $('dvSaved').textContent = ''; }
  }

  // ---------- dropping cards into a doc: they arrive as real content (a checklist stays a checklist) ----------
  const WORDY = ['note', 'todo', 'title', 'link', 'swatch', 'doc', 'shape', 'audio'];
  function cardWords(c) {
    if (c.type === 'note') return [c.name, c.text].filter(x => (x || '').trim()).join('\n');
    if (c.type === 'todo') return [(c.text || '').trim(), ...(c.items || []).map(i => (i.done ? '☑ ' : '☐ ') + i.t)].filter(Boolean).join('\n');
    if (c.type === 'link') return [c.title, c.url].filter(Boolean).join('\n');
    if (c.type === 'swatch') return `${c.label || ''} ${c.hex.toUpperCase()}`.trim();
    if (c.type === 'audio') return [c.title, c.text].filter(Boolean).join('\n');
    if (c.type === 'doc') return [c.text, c.body].filter(x => (x || '').trim()).join('\n');
    return c.text || '';
  }
  function cardHTML(c) {
    if (c.type === 'note') return (c.name ? `<p><strong>${escH(c.name)}</strong></p>` : '') + mdToHTML(c.text);
    if (c.type === 'todo') return (c.text ? `<p><strong>${escH(c.text)}</strong></p>` : '') + `<ul data-type="taskList">${(c.items || []).map(i => `<li data-type="taskItem" data-checked="${!!i.done}"><p>${escH(i.t)}</p></li>`).join('')}</ul>`;
    if (c.type === 'link') return `<p><a href="${escH(c.url)}">${escH(c.title || c.url)}</a></p>`;
    if (c.type === 'swatch') return `<p><span style="color: ${c.hex}">■</span> ${escH(c.label || '')} <code>${c.hex.toUpperCase()}</code></p>`;
    if (c.type === 'title') return `<h2>${escH(c.text)}</h2>`;
    if (c.type === 'doc') return (c.text ? `<h2>${escH(c.text)}</h2>` : '') + docHTML(c);
    return mdToHTML(cardWords(c));
  }
  // the open doc page, or a doc card on the board, under the pointer (only for cards that have words)
  function docTarget(e, w, moving) {
    const cs = moving.map(m => m.c || m); if (!cs.length || !cs.every(c => WORDY.includes(c.type))) return null;
    if (docCard && !cs.includes(docCard)) { const r = $('docview').getBoundingClientRect(); if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return 'page'; }
    return [...board.cards].reverse().find(c => c.type === 'doc' && !cs.includes(c) && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h) || null;
  }
  function dropIntoDoc(t, cs, e) {
    const doc = t === 'page' ? docCard : t, html = cs.map(cardHTML).join(''), before = { body: doc.body, doc: doc.doc };
    if (t === 'page' && ed) {
      // right where you let go on the page
      const at = ed.view.posAtCoords({ left: e.clientX, top: e.clientY }); const $p = at && ed.state.doc.resolve(at.pos);
      const pos = $p ? ($p.depth ? $p.after(1) : at.pos) : ed.state.doc.content.size;
      ed.chain().focus().insertContentAt(pos, html).run(); syncDoc();
    } else { doc.doc = MBEditor.generateJSON(docHTML(doc) + html, MBEditor.extensions()); doc.body = [doc.body, ...cs.map(cardWords)].filter(x => (x || '').trim()).join('\n\n'); }
    selectOnly(cs.map(c => c.id)); renderCard(doc); renderWires(); save();
    say(`Copied ${cs.length === 1 ? 'that' : cs.length + ' cards'} into “${doc.text || 'Untitled'}” ✦`, 6000, [{ label: 'Undo', run: () => {
      if (t === 'page' && ed && docCard === doc) { ed.commands.undo(); syncDoc(); } else { doc.body = before.body; doc.doc = before.doc; if (docCard === doc && ed) ed.commands.setContent(docHTML(doc), false); }
      renderCard(doc); save(); } }]);
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
  const FS = { s: .8, m: 1, l: 1.4, xl: 2 }, SIZED = ['note', 'todo', 'title', 'shape', 'coll'];
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
    crop: I('<path d="M5.5 2.5v11a1 1 0 0 0 1 1h11M2.5 5.5h11a1 1 0 0 1 1 1v11"/>'),
    open: I('<path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/>'),
    link: I('<path d="M8.5 11.5a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-.9.9"/><path d="M11.5 8.5a3.2 3.2 0 0 0-4.5 0l-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/>'),
  };
  // fonts for board text: the same list as docs (fonts on this board first, then suggestions, then everything on this Mac)
  // every font this board uses: picked for notes and titles, wireframe text, font cards, and fonts set inside docs (most used first)
  function boardFonts() {
    const n = new Map(), add = f => { f = String(f || '').replace(/^["']|["']$/g, '').trim(); if (f && !/^(system-ui|sans-serif|serif|monospace|inherit|-apple-system)$/i.test(f)) n.set(f, (n.get(f) || 0) + 1); };
    board.cards.forEach(c => { if (c.font) add(c.font); if (c.type === 'doc' && c.doc) for (const m of JSON.stringify(c.doc).matchAll(/"fontFamily":"([^"]+)"/g)) add(m[1].split(',')[0]); });
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  }
  function boardFontPop(btn, list) {
    let p = $('fontPop'); if (p && !p.hidden && p.dataset.for === list.map(c => c.id).join()) { p.hidden = true; return; }
    if (!p) { p = document.createElement('div'); p.id = 'fontPop'; p.className = 'dv-pop pop-font board-font'; document.body.appendChild(p);
      ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t => p.addEventListener(t, e => e.stopPropagation(), { passive: true })); }
    p.dataset.for = list.map(c => c.id).join();
    const cur = list.every(c => (c.font || '') === (list[0].font || '')) ? (list[0].font || '') : null;
    const onBoard = boardFonts();
    const row = f => `<button type="button" class="dp-row dp-font ${f === cur ? 'on' : ''}" data-bfont="${escH(f)}" style="font-family:'${escH(f)}', ${DOC_FONT}, system-ui">${escH(f)}${onMac(f) ? '' : '<small>Google Fonts</small>'}</button>`;
    p.innerHTML = `<input class="dp-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${cur === '' ? 'on' : ''}" data-bfont="">Default font<small>Mochiboard’s own</small></button>
      ${onBoard.length ? `<div class="dp-h">Used on this board</div>${onBoard.map(row).join('')}` : ''}<div class="dp-h">Suggested</div>${SUGGESTED_FONTS.filter(f => !onBoard.includes(f)).map(row).join('')}
      <div class="dp-h">On your Mac</div>${FONTS.filter(f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f)).slice(0, 400).map(row).join('')}</div>`;
    SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
    const r = btn.getBoundingClientRect(); p.hidden = false; p.style.position = 'fixed'; p.style.width = '260px';
    p.style.left = Math.max(10, Math.min(innerWidth - 270, r.left + r.width / 2 - 130)) + 'px';
    const above = r.top > innerHeight / 2; p.style.top = ''; p.style.bottom = '';
    if (above) p.style.bottom = (innerHeight - r.top + 8) + 'px'; else p.style.top = (r.bottom + 8) + 'px';
    const els = list.map(c => cardsEl.querySelector(`[data-id="${c.id}"]`)).filter(Boolean);
    const preview = f => els.forEach((el, i) => { const c = list[i]; const v = f === undefined ? c.font : f;
      el.classList.toggle('has-font', !!v); if (v) { useFont(v); el.style.setProperty('--cf', `"${v.replace(/"/g, '')}"`); } else el.style.removeProperty('--cf'); });
    const q = p.querySelector('.dp-search'); q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { preview(); p.hidden = true; } if (e.key === 'Enter') p.querySelector('.dp-font:not([hidden])')?.click(); });
    q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); p.querySelectorAll('.dp-font').forEach(b => b.hidden = !!v && !b.dataset.bfont.toLowerCase().includes(v)); p.querySelectorAll('.dp-h').forEach(h => h.hidden = !!v); });
    p.onmouseover = e => { const b = e.target.closest('[data-bfont]'); if (b) preview(b.dataset.bfont); };
    p.onmouseleave = () => preview();
    p.onclick = e => { const b = e.target.closest('[data-bfont]'); if (!b) return; const f = b.dataset.bfont;
      remember(); list.forEach(c => { if (f) c.font = f; else delete c.font; renderCard(c); }); p.hidden = true; $('selbar').dataset.key = ''; selectOnly(list.map(c => c.id)); save(); };
    setTimeout(() => q.focus(), 30);
  }
  document.addEventListener('pointerdown', e => { const p = $('fontPop'); if (p && !p.hidden && !e.target.closest('#fontPop, [data-sbfont]')) p.hidden = true; }, true);
  function placeSelbar() {
    const bar = $('selbar'), dock = $('dock'), cs = selCards(), lw = selWire && linkById(selWire);
    if (lw && !homeAt) { dock.classList.add('ctx'); bar.classList.add('on'); const key = 'w' + lw.id + lw.bend + lw.dash + lw.arrow; if (bar.dataset.key === key) return; bar.dataset.key = key;
      const tb = (a, label, on, tip) => `<button class="sb-txt ${on ? 'on' : ''}" data-wb="${a}" title="${tip}">${label}</button>`;
      bar.innerHTML = `<span class="sb-label">Connector</span>` + tb('curve', 'Curved', lw.bend !== 0, 'Curved line (drag the middle dot to bend it)') + tb('straight', 'Straight', lw.bend === 0, 'Straight line')
        + `<span class="sb-sep"></span>` + tb('dash', 'Dashed', !!lw.dash, 'Dashed line') + tb('arrow', 'Arrow', !!lw.arrow, 'Arrow at the end') + tb('flip', 'Flip', false, 'Swap which end has the arrow') + `<span class="sb-sep"></span><button class="sb-ic" data-wb="del" title="Delete">${ICON.del}</button>`;
      return; }
    const show = cs.length && !homeAt && !stage.querySelector('.card.dragging') && !$('cpop').classList.contains('on');
    dock.classList.toggle('ctx', !!show); bar.classList.toggle('on', !!show); if (!show) { if (bar.dataset.key !== '') { bar.dataset.key = ''; renderDesign(); } return; }
    const key = cs.map(c => c.id + c.color + c.head + c.tagText + c.hideName + c.hideHex + c.fill + c.url + c.fs + c.font + c.bold + c.italic + c.under + c.strike + !!c.cropEdit + !!c.src + c.group).join();
    if (bar.dataset.key === key) { syncDesign(); return; } bar.dataset.key = key; renderDesign();
    const one = cs.length === 1 ? cs[0] : null, btn = (a, icon, tip, on) => `<button class="sb-ic ${on ? 'on' : ''}" data-sb="${a}" title="${tip}">${ICON[icon]}</button>`;
    let h = `<span class="sb-label">${one ? ({ note: 'Note', todo: 'Checklist', title: 'Title', image: 'Image', link: 'Link', swatch: 'Color', coll: 'Collection', doc: 'Doc', canvas: 'Canvas', shape: 'Shape', stamp: 'Stamp', audio: 'Voice memo', video: 'Video', ink: 'Drawing', frame: 'Screen', box: 'Box', text: 'Text', font: 'Font' }[one.type] || 'Card') : cs.length + ' selected'}</span>`;
    const fill = cs.filter(c => FILLABLE.includes(c.type));
    if (one?.type === 'coll') h += `<div class="sb-dots">${Object.keys(COLL).map(n => `<button data-cc="${n}" title="${n}" style="background:${COLL[n][0]}" class="${one.color === n ? 'on' : ''}"></button>`).join('')}</div><span class="sb-sep"></span>` + btn('head', 'head', one.head === false ? 'Show the header' : 'Hide the header', one.head !== false);
    else if (fill.length) h += `<div class="sb-dots">${COLOR_NAMES.map(n => `<button data-c="${n}" title="${n}" style="background:${COLORS[n]}" class="${fill.every(c => c.color === n) ? 'on' : ''}"></button>`).join('')}</div><span class="sb-sep"></span>`;
    if (one?.type === 'swatch') h += btn('pick', 'color', 'Change the color') + btn('hidename', 'name', one.hideName ? 'Show the name' : 'Hide the name', !one.hideName) + btn('hidehex', 'hex', one.hideHex ? 'Show the hex' : 'Hide the hex', !one.hideHex);
    if (one?.type === 'image' && cropping?.c === one) { bar.innerHTML = `<span class="sb-label">Crop</span><button class="sb-txt" data-crop="cancel">Cancel</button><button class="sb-txt" data-crop="reset">Reset</button><button class="sb-txt on" data-crop="done">Done</button>`; return; }
    if (one?.type === 'box' && one.img && !one.src) h += `<button class="sb-txt" data-fill="1" title="Fill this image spot">Fill image ✦</button>`;
    if (one?.type === 'image') h += btn('crop', 'crop', 'Crop') + btn('tag', 'caption', one.tagText ? 'Remove the caption' : 'Add a caption', !!one.tagText);
    else if (one && !['coll', 'swatch', 'stamp', 'ink'].includes(one.type)) h += btn('tag', 'tag', one.tagText ? 'Remove the label (double-click it to edit)' : 'Add a little label (like “step 1”)', !!one.tagText);
    if (one?.type === 'doc') h += btn('open', 'open', 'Open the doc');
    if (one?.type === 'canvas') h += btn('open', 'open', 'Open this canvas');
    if (one?.type === 'link' && one.url) h += btn('visit', 'open', 'Open the link') + btn('relink', 'link', 'Change the link');
    if (one?.type === 'shape') h += `<div class="sb-dots">${Object.keys(SHAPE_FILL).map(n => `<button data-sf="${n}" title="${n}" style="background:var(--sh-${n})" class="${(one.fill || 'gray') === n ? 'on' : ''}"></button>`).join('')}<label class="sf-any ${SHAPE_FILL[one.fill || 'gray'] ? '' : 'on'}" title="Any color"${SHAPE_FILL[one.fill || 'gray'] ? '' : ` style="--any:${one.fill}"`}><input type="color" data-sfany value="${SHAPE_FILL[one.fill || 'gray'] ? '#ff9ec4' : one.fill}"></label></div><span class="sb-sep"></span>`;
    const sized = cs.filter(c => SIZED.includes(c.type));
    if (sized.length) { const cur = sized.every(c => (c.fs || 'm') === (sized[0].fs || 'm')) ? (sized[0].fs || 'm') : '';
      // bold is on by default for titles and collection names, off for everything else
      const isOn = (c, k) => c[k] ?? (k === 'bold' && ['title', 'coll'].includes(c.type));
      const ST = [['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['under', '<u>U</u>', 'Underline'], ['strike', '<s>S</s>', 'Strikethrough']];
      h += `<span class="sb-sep"></span><div class="sb-sizes sb-style">${ST.map(([k, l, t]) => `<button data-ts="${k}" title="${t}" class="${sized.every(c => isOn(c, k)) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const fnt = sized.every(c => (c.font || '') === (sized[0].font || '')) ? (sized[0].font || '') : null;
      h += `<span class="sb-sep"></span><button class="sb-txt sb-font" data-sbfont="1" title="Font"><span style="${fnt ? `font-family:'${esc(fnt)}', var(--font)` : ''}">${fnt === null ? 'Mixed fonts' : esc(fnt || 'Default font')}</span><svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
      h += `<span class="sb-sep"></span><div class="sb-sizes" title="Text size">${['s', 'm', 'l', 'xl'].map(z => `<button data-fs="${z}" class="${cur === z ? 'on' : ''}">${z.toUpperCase()}</button>`).join('')}</div>`; }
    const oneGroup = cs.length > 1 && cs.every(c => c.group && c.group === cs[0].group);
    if (cs.length > 1) h += `<span class="sb-sep"></span><button class="sb-txt" data-sb="${oneGroup ? 'ungroup' : 'group'}" title="${oneGroup ? 'Ungroup · ⇧⌘G' : 'Group, so they move together · ⌘G'}">${oneGroup ? 'Ungroup' : 'Group'}</button>`;
    h += `<span class="sb-sep"></span>` + btn('mochi', 'mochi', 'Ask Mochi to change ' + (one ? 'this' : 'these')) + btn('del', 'del', 'Delete');
    bar.innerHTML = h;
  }
  let coverT = 0;
  let coverKey = '';
  function checkTitleCover() {
    const t = document.querySelector('.top'); if (!t || !board) return; const key = view.x + ',' + view.y + ',' + view.z + ',' + board.cards.length + ',' + (drag ? 1 : 0);
    if (key === coverKey && !drag) return; coverKey = key;
    const r = t.getBoundingClientRect(), a = toWorld(r.left - 6, r.top - 6), b = toWorld(r.right + 6, r.bottom + 6);
    t.classList.toggle('covered', board.cards.some(c => c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y));
  }

  let gbKey = '';
  function drawGroupBoxes() {
    if (!board) return; const gs = [...new Set(selCards().map(c => c.group).filter(Boolean))];
    const boxes = gs.map(g => { const cs = board.cards.filter(c => c.group === g && !c.onFrame); if (cs.length < 2) return null;
      const x0 = Math.min(...cs.map(c => c.x)), y0 = Math.min(...cs.map(c => c.y)), x1 = Math.max(...cs.map(c => c.x + c.w)), y1 = Math.max(...cs.map(c => c.y + c.h)); return [x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28]; }).filter(Boolean);
    const key = JSON.stringify(boxes); if (key === gbKey) return; gbKey = key;
    $('groupBoxes').innerHTML = boxes.map(([x, y, w, h]) => `<div class="group-box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><span>Group</span></div>`).join('');
  }
  (function tick() { placeSelbar(); drawGroupBoxes(); if (++coverT % 8 === 0) checkTitleCover(); requestAnimationFrame(tick); })();
  $('selbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('selbar').addEventListener('input', e => { if (!e.target.matches('[data-sfany]')) return; const one = selCards()[0]; if (!one) return; one.fill = e.target.value; renderCard(one); selectOnly([one.id]); e.target.closest('.sf-any').style.setProperty('--any', one.fill); save(); });
  $('selbar').addEventListener('click', e => {
    const a = e.target.closest('[data-wb]')?.dataset.wb, l = selWire && linkById(selWire); if (!a || !l) return; e.stopImmediatePropagation();
    if (a === 'curve') l.bend = l.bend === 0 ? undefined : l.bend; if (a === 'curve' && l.bend === undefined) delete l.bend;
    if (a === 'straight') l.bend = 0;
    if (a === 'dash') l.dash = !l.dash;
    if (a === 'arrow') l.arrow = !l.arrow;
    if (a === 'flip') { [l.a, l.b] = [l.b, l.a]; if (l.bend) l.bend = -l.bend; }
    if (a === 'del') { board.links = board.links.filter(x => x !== l); selWire = null; }
    $('selbar').dataset.key = ''; renderWires(); save();
  }, true);
  $('selbar').onclick = e => {
    const cs = selCards(), one = cs[0], dot = e.target.closest('[data-c]'), cdot = e.target.closest('[data-cc]'), a = e.target.closest('[data-sb]')?.dataset.sb;
    if (a === 'group' || a === 'ungroup') { remember(); return groupSel(a === 'group'); }
    const redraw = () => { cs.forEach(c => renderCard(c)); selectOnly(cs.map(c => c.id)); $('selbar').dataset.key = ''; save(); };
    if (dot) { cs.filter(c => FILLABLE.includes(c.type)).forEach(c => c.color = dot.dataset.c); redraw(); }
    if (cdot) { one.color = cdot.dataset.cc; redraw(); }
    const sf = e.target.closest('[data-sf]'); if (sf) { one.fill = sf.dataset.sf; redraw(); }
    const ts = e.target.closest('[data-ts]'); if (ts) { const k = ts.dataset.ts, list = cs.filter(c => SIZED.includes(c.type)), isOn = c => c[k] ?? (k === 'bold' && ['title', 'coll'].includes(c.type)), to = !list.every(isOn);
      list.forEach(c => c[k] = to); redraw(); }
    if (e.target.closest('[data-sbfont]')) return boardFontPop(e.target.closest('[data-sbfont]'), cs.filter(c => SIZED.includes(c.type)));
    const fz = e.target.closest('[data-fs]'); if (fz) { cs.filter(c => SIZED.includes(c.type)).forEach(c => { if (fz.dataset.fs === 'm') delete c.fs; else c.fs = fz.dataset.fs;
      if (c.type === 'note' && !parentOf(c.id)) { renderCard(c); const el = cardsEl.querySelector(`[data-id="${c.id}"]`), b2 = el.querySelector('.body'); b2.style.height = 'auto'; c.h = Math.max(80, b2.offsetHeight); b2.style.height = ''; } }); redraw(); }
    if (a === 'crop') return startCrop(one);
    const cr = e.target.closest('[data-crop]')?.dataset.crop; if (cr) return endCrop(cr);
    if (e.target.closest('[data-fill]')) return offerFill(spotsIn(cs));
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
    if (a === 'mochi') { mochiOpen(true); $('mcInput').placeholder = cs.length === 1 ? 'Change this… “make it say…”, “turn it mint”' : `Change these ${cs.length}… “rename to step 1, 2, 3”`; }
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
    $('cpop').classList.toggle('tint', !!c.tint);
    if (c.tint) document.body.appendChild($('cpop')); else if ($('cpop').parentNode !== stage) stage.appendChild($('cpop'));   // UI colors sit above Settings; card colors stay on the board
    if (c.tint) {   // a UI color, not a color card: no name or palette, a few starting points, and a way back to the default
      colorCard = c; hsv = hex2hsv(c.hex); drawIfV(); $('cpHex').value = c.hex.toUpperCase(); $('cpDot').style.background = c.hex; $('cpTitle').textContent = c.title;
      $('cpQuick').innerHTML = c.presets.map(h => `<button style="background:${h}" data-hex="${h}" title="${h.toUpperCase()}"></button>`).join('');
      const pop = $('cpop'); pop.classList.add('on'); const w = 252, h = pop.offsetHeight || 470;
      pop.style.left = clamp(c.at.x, 12, innerWidth - w - 12) + 'px'; pop.style.top = clamp(c.at.y, 12, innerHeight - h - 12) + 'px'; return;
    }
    colorCard = c; hsv = hex2hsv(c.hex); drawIfV();
    $('cpHex').value = c.hex.toUpperCase(); $('cpName').value = c.label || ''; $('cpDot').style.background = c.hex;
    $('cpQuick').innerHTML = board.palette.map(p => `<button style="background:${p.hex}" data-hex="${p.hex}" title="${esc(p.name)}"></button>`).join('');
    $('cpSave').textContent = board.palette.some(p => p.hex === c.hex) ? 'Update board color' : 'Save to board colors'; $('cpSave').classList.remove('saved-ok');
    placeColorPop(c); $('cpop').classList.add('on');
  }
  function closeColor() { $('cpop').classList.remove('on'); colorCard = null; }
  function setColor(hex, from) {
    if (colorCard && colorCard.tint && hex) { colorCard.hex = hex; $('cpDot').style.background = hex; if (from !== 'hex') $('cpHex').value = hex.toUpperCase(); if (from !== 'wheel') { hsv = hex2hsv(hex); drawIfV(); } colorCard.apply(hex); return; }
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
    $('cpSave').textContent = 'Saved ✓'; $('cpSave').classList.add('saved-ok'); chirp(`Saved “${name}” to this board's colors ✦`, 3500);
  };
  $('cpDone').onclick = closeColor;
  addEventListener('pointerdown', e => { if ($('cpop').classList.contains('on') && !e.target.closest('.cpop, .card.swatch, [data-col]')) closeColor(); }, true);
  $('cpReset').onclick = () => { if (colorCard && colorCard.tint) { colorCard.reset(); closeColor(); } };
  const PRESETS = { bg: ['#fbf8fc', '#ffffff', '#fff6f9', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#1c1920', '#232733', '#2b2433'], dot: ['#e3dcee', '#f2c9da', '#cfe8d9', '#cfe0f5', '#e6dcff', '#d8d2dd', '#35303c', '#4a4452'],
    panel: ['#ffffff', '#fff6f9', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#26222b', '#2f2a36'], accent: ['#f27aa8', '#ff8a5c', '#f3c84a', '#3fbf86', '#4aa3f0', '#9b7bff', '#494848'],
    cursor: ['#ff9ec4', '#ffc8a6', '#f8e08a', '#a8e6c3', '#aed3ff', '#cdb8ff', '#ffffff', '#494848'] };
  const COLOR_TITLES = { bg: 'Board background', dot: 'Dots', panel: 'Panels', accent: 'Accent', cursor: 'Your cursor' };
  // open the wheel for a UI color; `forBoard` means just this board's background (from a right-click)
  function tintPicker(key, at, forBoard) {
    const set = hex => { if (key === 'cursor') settings.cursor = hex; else if (forBoard) { board.bg = hex; save(); } else myColors()[key] = hex; applySettings(); };
    openColor({ tint: true, title: forBoard ? 'This board’s background' : COLOR_TITLES[key], hex: key === 'cursor' ? settings.cursor : forBoard ? (board.bg || colorOf('bg')) : colorOf(key), presets: PRESETS[key], at,
      apply: set, reset: () => { if (key === 'cursor') settings.cursor = '#ff9ec4'; else if (forBoard) { delete board.bg; save(); } else delete myColors()[key]; applySettings(); } });
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (!b) return; const r = b.getBoundingClientRect(); tintPicker(b.dataset.col, { x: r.left - 270, y: r.top - 120 }); });
  function renderPalette() {
    const el = $('palette'); el.innerHTML = '';
    if (!board.palette.length) { el.innerHTML = '<div class="palette-empty">Click a color card to name it and save it here. Each board keeps its own palette.</div>'; return; }
    board.palette.forEach((p, i) => {
      const r = document.createElement('div'); r.className = 'pal'; r.title = 'Click to add to the board';
      r.innerHTML = `<i style="background:${p.hex}"></i><span></span><small>${p.hex.slice(1)}</small>`;
      r.title = 'Click to add it to the board. Right-click to rename, change or remove it';
      const name = r.querySelector('span'); name.textContent = p.name;
      const rename = () => { name.contentEditable = 'true'; name.focus(); getSelection().selectAllChildren(name);
        const done = () => { name.contentEditable = 'false'; const v = name.textContent.trim(); if (v) { p.name = v; board.cards.filter(c => c.type === 'swatch' && c.hex === p.hex).forEach(c => { c.label = v; renderCard(c); }); } renderPalette(); save(); };
        name.onblur = done; name.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); name.blur(); } if (ev.key === 'Escape') { name.textContent = p.name; name.blur(); } ev.stopPropagation(); }; };
      // change the color itself: color cards on the board that use it follow along
      const recolor = e => { const was = p.hex, rr = r.getBoundingClientRect();
        openColor({ tint: true, title: `Change “${p.name}”`, hex: p.hex, presets: [p.hex, ...board.palette.filter(x => x !== p).map(x => x.hex)].slice(0, 10), at: { x: rr.right + 12, y: rr.top - 60 },
          apply: hex => { const from = p.hex; p.hex = hex; board.cards.filter(c => c.type === 'swatch' && c.hex === from).forEach(c => { c.hex = hex; renderCard(c); }); r.querySelector('i').style.background = hex; r.querySelector('small').textContent = hex.slice(1); save(); },
          reset: () => { const from = p.hex; p.hex = was; board.cards.filter(c => c.type === 'swatch' && c.hex === from).forEach(c => { c.hex = was; renderCard(c); }); renderPalette(); save(); } }); };
      r.onclick = () => { if (name.isContentEditable) return; addAtCenter('swatch', { hex: p.hex, label: p.name }); };
      r.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); boardMenu(e, [
        { label: 'Add to the board', run: () => addAtCenter('swatch', { hex: p.hex, label: p.name }) },
        { label: 'Rename', run: rename },
        { label: 'Change color…', run: recolor },
        '-',
        { label: 'Remove from board colors', danger: true, run: () => { board.palette.splice(i, 1); renderPalette(); save(); chirp(`Removed “${p.name}” from this board's colors`, 2500); } }]); };
      el.appendChild(r);
    });
  }

  // ---------- the floating boxes: minimize to their title, remembered between launches ----------
  const boxState = (() => { try { return JSON.parse(localStorage.getItem('mochiboard:boxes') || '{}'); } catch (e) { return {}; } })();
  document.querySelectorAll('.box').forEach(b => {
    const k = b.dataset.box, btn = b.querySelector('.mini:not(.home-btn):not(.gear)');
    const set = min => { b.classList.toggle('min', min); btn.textContent = min ? '+' : '–'; btn.title = min ? 'Open' : 'Minimize'; boxState[k] = min; try { localStorage.setItem('mochiboard:boxes', JSON.stringify(boxState)); } catch (e) {} };
    set(!!boxState[k]); btn.onclick = () => set(!b.classList.contains('min'));
  });
  $('keysX').onclick = () => { settings.keys = false; applySettings(); };

  // the board area never scrolls (it pans instead); if focusing something nudges it, snap it straight back
  [stage, document.scrollingElement].forEach(el => el && el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } }));
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); });

  world.appendChild($('guides')); setTimeout(placeTray, 0); renderDesign();
  // ---------- updates: check GitHub for a newer Mochiboard (about once a day), show what's new, update with one tap ----------
  let updInfo = null;
  if (!MB.native) $('setUpdate').style.display = 'none';   // updating is a Mac app thing: the web version changes when the site does
  async function checkUpdate(force) {
    if (!MB.native) return;
    let last = 0; try { last = +localStorage.getItem('mochiboard:updChecked') || 0; } catch (e) {}
    if (!force && Date.now() - last < 20 * 3600 * 1000 && updInfo) return showUpdate();
    $('suSub').textContent = 'Checking for a new version…';
    try { updInfo = await MB.updateCheck(); localStorage.setItem('mochiboard:updChecked', Date.now()); } catch (e) { updInfo = { error: true }; }
    showUpdate(true);
  }
  function showUpdate(fresh) {
    const u = { ...(updInfo || {}) }, n = u.behind || 0;
    if (u.since && !u.release) { const d = new Date(u.since + 'T12:00'); if (!isNaN(d)) u.since = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    $('gearBtn').classList.toggle('has-update', n > 0);
    $('setUpdate').classList.toggle('ready', n > 0);
    $('suGo').hidden = !(n > 0);
    $('suTitle').textContent = n > 0 ? `A new Mochiboard is ready ✦` : 'Updates';
    $('suSub').textContent = !u.repo && !u.release ? 'To get updates, update once from Terminal with ./install.sh --update. After that it works from here.'
      : u.offline ? 'I couldn’t reach GitHub just now. I’ll try again later.'
      : u.release ? (n > 0 ? `Version ${String(u.latest || '').replace(/^v/, '')} is ready (you have ${u.since}). Your boards and settings stay just as they are.` : `You’re up to date (version ${u.since}).`)
      : n > 0 ? `${n} update${n > 1 ? 's' : ''} since your version${u.since ? ' from ' + u.since : ''}. Your boards and settings stay just as they are.`
      : `You’re up to date${u.since ? ' (version from ' + u.since + ')' : ''}.`;
    const notes = (u.notes || []).slice(0, 8);
    $('suNotes').hidden = !(n > 0 && notes.length);
    $('suNotes').innerHTML = notes.map(t => `<li>${esc(t)}</li>`).join('');
    // a quiet bar on the board instead of a pop-up: shown once there's a new version, hidden with × until the next one
    const ver = String(u.latest || u.since || '').replace(/^v/, '').replace(/\.0$/, ''), key = (u.latest || '') + ':' + (u.since || '') + ':' + n; let hid = ''; try { hid = localStorage.getItem('mochiboard:upbarHidden') || ''; } catch (e) {}
    $('ubText').textContent = u.latest ? `Mochiboard ${ver} is ready` : 'A new Mochiboard is ready';
    $('ubGo').disabled = false; $('ubGo').textContent = 'Update now'; $('upBar').classList.remove('busy');
    // the first time there's an update, the bar asks once if Mochi may keep things up to date; the answer becomes a switch in Settings
    const asking = n > 0 && (settings.autoUpdate === undefined || (u.preview && !showUpdate.answered));   // the preview always asks, so it can be shown again
    $('upBar').classList.toggle('ask', asking); requestAnimationFrame(fitUpBar); $('ubYes').hidden = $('ubNo').hidden = !asking; $('ubNotes').hidden = $('ubGo').hidden = asking;
    if (asking) $('ubText').textContent = `Mochiboard ${ver} is ready. Keep it up to date for you?`;
    else if (n > 0 && settings.autoUpdate) $('ubText').textContent = `Mochiboard ${ver} is ready. I’ll put it in when you quit, or`;
    if (n > 0 && settings.autoUpdate && !asking) prepareUpdate();
    $('upBar').hidden = !(n > 0) || (!asking && hid === key && !u.preview); $('upBar').dataset.key = key;
    fitUpBar();
  }
  $('suCheck').onclick = () => checkUpdate(true);
  ['pointerdown', 'mousedown', 'dblclick'].forEach(t => $('upBar').addEventListener(t, e => e.stopPropagation()));
  // the bar sits at the top centre; if it would touch the board's name, it slides down just below it
  function fitUpBar() { const b = $('upBar'); if (b.hidden) return; b.classList.remove('low'); b.style.left = '';
    // centre it in the open space between the board's name and the panels on the right; only if that's too tight does it step down
    const st = stage.getBoundingClientRect(), t = document.querySelector('.top')?.getBoundingClientRect(), w = b.getBoundingClientRect().width;
    const right = [$('design'), $('tray')].map(el => el?.getBoundingClientRect()).filter(r => r && r.width && r.top < 140).reduce((m, r) => Math.min(m, r.left), st.right);
    const from = (t ? t.right : st.left) + 20, to = right - 20;
    if (to - from >= w) b.style.left = (from + to) / 2 - st.left + 'px';
    else if (t) { const r = b.getBoundingClientRect(); if (r.left < t.right + 16 && r.right > t.left - 16) b.classList.add('low'); } }
  addEventListener('resize', () => fitUpBar());   // the board mustn't grab presses on the bar
  // automatic updates: get the new version ready quietly; it goes in when Mochiboard quits
  let preparing = null;
  function prepareUpdate() { if (preparing || !MB.updatePrepare) return; preparing = MB.updatePrepare().catch(() => { preparing = null; }); }
  $('ubYes').onclick = () => { showUpdate.answered = true; settings.autoUpdate = true; applySettings(); showUpdate(); prepareUpdate(); $('ubText').textContent = 'Lovely ✦ I’ll update when you quit Mochiboard, or'; fitUpBar(); };
  $('ubNo').onclick = () => { showUpdate.answered = true; settings.autoUpdate = false; applySettings(); showUpdate(); };
  $('ubX').onclick = () => { try { localStorage.setItem('mochiboard:upbarHidden', $('upBar').dataset.key || ''); } catch (e) {} $('upBar').hidden = true; };
  $('ubNotes').onclick = () => { $('gearBtn').click(); setTab('general'); setTimeout(() => $('setUpdate').scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); };
  $('ubGo').onclick = async () => {
    $('ubGo').disabled = true; $('ubGo').textContent = 'Updating…'; $('upBar').classList.add('busy'); $('ubText').textContent = 'Getting the new version. Mochiboard will reopen in a moment';
    try { await MB.updateNow(); } catch (e) { $('ubText').textContent = e.message; $('ubGo').textContent = 'Update now'; $('ubGo').disabled = false; $('upBar').classList.remove('busy'); }
  };
  $('suGo').onclick = async () => {
    $('suGo').disabled = true; $('suGo').textContent = 'Updating…'; $('suSub').textContent = 'Getting the new version and rebuilding. Mochiboard will close and reopen in about 30 seconds.';
    try { await MB.updateNow(); } catch (e) { $('suGo').disabled = false; $('suGo').textContent = 'Update now'; $('suSub').textContent = e.message; }
  };
  document.querySelectorAll('[data-url]').forEach(b => b.onclick = () => MB.openURL(b.dataset.url));

  // ---------- first run: set up with Mochi, then an optional hands-on tour ----------
  const OB_N = 6; let obAt = 0;
  function obGo(i) {
    obAt = clamp(i, 0, OB_N - 1);
    document.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('on', +s.dataset.step === obAt));
    $('obDots').innerHTML = Array.from({ length: OB_N }, (_, k) => `<i class="${k === obAt ? 'on' : k < obAt ? 'done' : ''}"></i>`).join('');
    $('obBack').style.visibility = obAt ? 'visible' : 'hidden'; $('obNext').textContent = obAt === 0 ? "Let's go" : 'Next';
    $('onboard').classList.toggle('last', obAt === OB_N - 1); $('obSkip').style.display = obAt === OB_N - 1 ? 'none' : '';
    if (obAt === 2) showConnections(true);
    if (obAt === OB_N - 1) $('obDoneTitle').textContent = `You're all set${settings.name ? ', ' + settings.name : ''}!`;
    if (obAt === 0) setTimeout(() => $('obName').focus(), 50);
    goos[4].hop(); goos[5].hop();
  }
  function openSetup() { closeSettings(); $('obName').value = settings.name || ''; applySettings(); $('onboard').classList.add('on'); obGo(0); }
  function finishSetup(tour) {
    settings.name = $('obName').value.trim().slice(0, 40); applySettings();
    try { localStorage.setItem('mochiboard:onboarded', '1'); } catch (e) {}
    $('onboard').classList.remove('on');
    if (tour) setTimeout(startTour, 350); else say(`Have fun${settings.name ? ', ' + settings.name : ''}! Click me anytime to chat ✦`, 6000);
  }
  $('obNext').onclick = () => { if (obAt === 0) { settings.name = $('obName').value.trim().slice(0, 40); applySettings(); } obGo(obAt + 1); };
  $('obBack').onclick = () => obGo(obAt - 1);
  $('obSkip').onclick = () => finishSetup(false);
  $('obTour').onclick = () => finishSetup(true);
  $('obExplore').onclick = () => finishSetup(false);
  $('obRecheck').onclick = () => showConnections(true);
  $('obName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('obNext').click(); } e.stopPropagation(); };
  function obKeys(e) {
    if (e.target.closest?.('input')) return;
    if (e.key === 'ArrowRight') obGo(obAt + 1); if (e.key === 'ArrowLeft') obGo(obAt - 1);
    if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); obAt < OB_N - 1 ? $('obNext').click() : $('obTour').click(); }
  }
  $('redoSetup').onclick = openSetup;
  $('redoTour').onclick = () => { closeSettings(); setTimeout(startTour, 250); };

  // the tour: Mochi points at each part; some steps you try for real and she notices
  const TOUR = [
    { el: '#tools', side: 'top', text: 'These are your tools: notes, docs, checklists, titles, collections, links, images, voice memos, colors, shapes, stamps and drawing. Pick one, then click the board to place it.', try: 'Try it: add a note (or double-click the board).', done: t => board.cards.length > t.cards },
    { el: null, text: 'Got an idea mid-thought? Press ⌘K, type it, hit Enter. It goes to Unsorted so you never lose your place.', try: 'Try it: press ⌘K and jot something down.', done: t => board.tray.length > t.tray },
    { el: '#tray', side: 'left', text: 'Unsorted holds your quick ideas. Drag one onto the board when it finds a home, or ask me to sort them all.' },
    { el: '#side .box', side: 'right', text: 'Your boards live here. Group them into projects and folders. Right-click anything to rename, move, duplicate or delete it.' },
    { el: '#design', side: 'left', text: 'Wireframes: screens, boxes, text, icons, and ready-made pieces, from nav bars to whole website sections. Things snap into line as you move them.' },
    { el: '#mPill', side: 'top', text: "And that's me! Click me to chat. Ask me to sort your notes, plan a project, explore fonts, or build screens and whole landing pages. I'll take you right to whatever I make." },
    { el: '#gearBtn', side: 'right', text: 'Everything from setup lives in Settings, and you can replay this tour there anytime. Have fun! ✦' },
  ];
  let tourAt = -1, tourPoll = 0;
  function startTour() { if (homeAt) closeHome(); if (chatOpen()) mochiOpen(false); $('mBubble').classList.remove('on'); $('coach').classList.add('on'); tourGo(0); }
  function endTour() { clearInterval(tourPoll); tourAt = -1; $('coach').classList.remove('on'); }
  function tourGo(i) {
    clearInterval(tourPoll);
    if (i >= TOUR.length) { endTour(); say(`You're ready${settings.name ? ', ' + settings.name : ''}! Click me whenever you want help ✦`, 0,
      [{ label: 'Brainstorm with me', cls: 'next', run: () => ask('Help me brainstorm a new project. Ask me one question to start.') },
       { label: 'Build me a landing page', cls: 'next', run: () => { mochiOpen(true); $('mcInput').value = 'Build me a landing page for '; $('mcInput').focus(); } }]); return; }
    tourAt = i; const st = TOUR[i], start = { cards: board.cards.length, tray: board.tray.length };
    $('coachStep').textContent = `${i + 1} of ${TOUR.length}`; $('coachText').textContent = st.text;
    $('coachTry').textContent = st.try || ''; $('coachTry').classList.remove('yay'); $('coachTry').style.display = st.try ? '' : 'none';
    $('coachNext').textContent = i === TOUR.length - 1 ? 'Done ✦' : 'Continue';
    placeCoach(); goos[6].hop();
    if (st.done) tourPoll = setInterval(() => { if (tourAt !== i || !st.done(start)) return; clearInterval(tourPoll);
      $('coachTry').textContent = 'Nice! ✦'; $('coachTry').classList.add('yay'); hopMochi(); setTimeout(() => tourAt === i && tourGo(i + 1), 1200); }, 250);
  }
  function placeCoach() {
    if (tourAt < 0) return; const st = TOUR[tourAt], t = st.el && document.querySelector(st.el), card = $('coachCard'), ring = $('coachRing');
    const r = t && t.getBoundingClientRect(), ok = r && r.width > 0 && r.height > 0, cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight;
    ring.style.display = ok ? '' : 'none'; $('coach').classList.toggle('dim', !ok);
    let x = (W - cw) / 2, y = (H - ch) / 2;
    if (ok) { Object.assign(ring.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px' });
      if (st.side === 'top') { x = r.left + r.width / 2 - cw / 2; y = r.top - ch - 26; }
      else if (st.side === 'left') { x = r.left - cw - 26; y = r.top + Math.min(r.height, 300) / 2 - ch / 2; }
      else if (st.side === 'right') { x = r.right + 26; y = r.top + Math.min(r.height, 300) / 2 - ch / 2; } }
    card.style.left = clamp(x, 16, W - cw - 16) + 'px'; card.style.top = clamp(y, 16, H - ch - 16) + 'px';
  }
  addEventListener('resize', placeCoach);
  $('coachNext').onclick = () => tourGo(tourAt + 1);
  $('coachSkip').onclick = endTour;
  $('coachCard').addEventListener('pointerdown', e => e.stopPropagation());

  if (MB.web) document.body.classList.add('web');
  document.querySelectorAll('.get-app').forEach(b => b.onclick = e => { e.stopPropagation(); getApp(); });
  // ---------- what's new: a little card, once, the first time a new version opens ----------
  const NEWS = { '1.1.0': [
    ['<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><path d="M14 11.5v5M11.5 14h5"/>', 'Design thinking templates', 'Affinity maps, journey maps, impact / effort and more, from the new button in the toolbar. Each one comes with an example and a how-to note from me.'],
    ['<path d="M6 15.5h8.2a3.3 3.3 0 0 0 .6-6.5 4.6 4.6 0 0 0-8.9-.9A3.7 3.7 0 0 0 6 15.5z"/><path d="M3.5 3.5l13 13"/>', 'Works without internet', 'Your boards keep working offline. I’ll tell you when I can’t think with Claude and pick back up when you’re online.'],
    ['<circle cx="5" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="5" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="5" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/>', 'Canvases go anywhere', 'Drag a canvas onto another board, into a folder, or right-click to make it its own board.'],
    ['<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>', 'Tidier Settings', 'Settings has tabs now, and Helpers shows how much Claude I’ve used, with a link to your plan’s limits.'],
  ], '1.2.0': [
    ['<path d="M4.5 3.5l11 5.2-4.6 1.4-1.6 4.6z"/><path d="M11 10.2l4 4.3"/>', 'Your own cursor', 'Your name and color follow your mouse around the board. Pick them in Settings → General.'],
    ['<path d="M10 2.8a7.2 7.2 0 1 0 0 14.4c1.2 0 1.8-.9 1.4-1.9-.5-1.1.2-2.3 1.4-2.3h1.7a2.7 2.7 0 0 0 2.7-2.7c0-4.2-3.2-7.5-7.2-7.5z"/><circle cx="6.6" cy="9" r=".9" fill="currentColor"/><circle cx="9" cy="6.2" r=".9" fill="currentColor"/><circle cx="12.6" cy="6.8" r=".9" fill="currentColor"/>', 'Your colors', 'Change the board, dots, panels and accent. Right-click any board for its own background.'],
    ['<path d="M10 3l7 3.8-7 3.8-7-3.8z"/><path d="M3 10.2l7 3.8 7-3.8"/><path d="M3 13.6l7 3.8 7-3.8"/>', 'Layers', 'Everything on the board in one list. Pick, rename, hide, lock and restack, like Figma.'],
    ['<rect x="3.5" y="3.5" width="13" height="13" rx="2"/><path d="M11 16.5h5.5V11M16.5 16.5l-5-5"/>', 'Reshape wireframes', 'Drag any piece’s corner to resize it. Double-click to reach inside a button or input.'],
    ['<path d="M13.5 3.5l3 3L8 15l-4 1 1-4z"/><path d="M3 18.5h14" stroke-width="1.2"/>', 'Any pen size', 'A slider for every thickness, and [ and ] while you draw. Stamps are all pixel art now too.'],
    ['<path d="M11 2.5L4.5 11h5l-1 6.5L15.5 9h-5z"/>', 'Smoother', 'Dragging and zooming glide on big boards, and the dots stay the same size as you zoom.'],
  ], '1.3.0': [
    ['<path d="M5.5 2.5h6l4 4v11h-10z"/><path d="M11.5 2.5v4h4"/><path d="M8 10h5M8 13h5"/>', 'Real docs', 'Styles, any font on your Mac, colors and highlights, lists, tables and pictures. Open any doc to try it.'],
    ['<path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"/><path d="M15.5 13.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>', 'Mochi edits with you', 'Select words in a doc and ask me to make them shorter, clearer, friendlier, or anything you type.'],
    ['<path d="M10 3v9.5M6 8.5l4 4 4-4"/><path d="M4 16.5h12"/>', 'PDF and Word', 'Download any doc as a PDF or a Word file, on Letter or A4 pages. Headings, lists and tables come along.'],
    ['<path d="M7.5 4.5h5a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z"/><path d="M8 10.5l1.5 1.5L12.5 9"/>', 'Easier to set up', 'I find Claude Code wherever it lives, and a step-by-step guide shows up if I can\u2019t think yet.'],
 ], '1.4.0': [
    ['<rect x="2.5" y="5.5" width="10.5" height="9" rx="2.2"/><path d="M13 9l4.5-2.6v7.2L13 11"/>', 'Video cards', 'Press V to record yourself, wide or phone-shaped, or drop in a video. It plays right on the board.'],
    ['<path d="M3.5 15.5L8 4.5l4.5 11M5.2 11.5h5.6"/><path d="M13.5 10.5h4M15.5 8.5v6"/>', 'Your fonts', 'Any font on your Mac for notes, titles and checklists, with a live preview as you hover.'],
    ['<path d="M5 6.2c-.1 0-.2 0-.3-.1C4 5.5 3 4.8 3 3.9c0-.6.4-1 1-1 .4 0 .8.2 1 .5.2-.3.6-.5 1-.5.6 0 1 .4 1 1 0 .9-1 1.6-1.7 2.2-.1.1-.2.1-.3.1z" fill="currentColor" stroke="none"/><circle cx="10" cy="4.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="4.5" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M15 12.6c-.1 0-.2 0-.3-.1-.7-.6-1.7-1.3-1.7-2.2 0-.6.4-1 1-1 .4 0 .8.2 1 .5.2-.3.6-.5 1-.5.6 0 1 .4 1 1 0 .9-1 1.6-1.7 2.2-.1.1-.2.1-.3.1z" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="15.5" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="15.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="15.5" r="1" fill="currentColor" stroke="none"/>', 'Grid shapes', 'Dots, crosses, hearts, sparkles and more behind your cards. Settings → Board.'],
    ['<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/><circle cx="7" cy="6" r="1.6" fill="currentColor"/><circle cx="13" cy="10" r="1.6" fill="currentColor"/><circle cx="9" cy="14" r="1.6" fill="currentColor"/>', 'Your toolbar', 'Right-click the toolbar to hide tools you don\u2019t use and drag the rest into your own order.'],
    ['<rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>', 'Memos wait for you', 'Drop a voice memo and press Start recording when you\u2019re ready. Nothing records by surprise.'],
  ] };
  // the button on each version's card: try the headline thing
  const NEWS_TRY = { '1.1.0': ['Try a template', () => $('tools').querySelector('[data-add="tpl"]').click()], '1.2.0': ['Make it yours', () => { $('gearBtn').click(); setTab('board'); setTimeout(() => $('settings').querySelector('.col-grid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); }], '1.3.0': ['Write a doc', () => openDoc(addAtCenter('doc', { text: 'My first real doc' }))], '1.4.0': ['Record a video', () => startPlacing('video')] };
  const newsKey = 'mochiboard:newsSeen';
  async function maybeNews() {
    let v = null; try { v = await MB.version(); } catch (e) {} if (!v) v = Object.keys(NEWS).pop();
    let seen = null; try { seen = localStorage.getItem(newsKey); } catch (e) {}
    try { localStorage.setItem(newsKey, v); } catch (e) {}
    // everything new since the version you last saw (a small fix release has no card of its own)
    const num = x => String(x || '0').replace(/^v/, '').split('.').map(n => +n || 0), after = (x, y) => { const a = num(x), b = num(y); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return false; };
    const items = Object.keys(NEWS).filter(k => (!seen || after(k, seen)) && !after(k, v)).flatMap(k => NEWS[k]);
    if (seen === v || !items.length) return;
    $('newsV').textContent = `Mochiboard ${v}`;
    $('newsList').innerHTML = items.map(([e, t, d]) => `<li><span class="nw-e"><svg viewBox="0 0 20 20">${e}</svg></span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('');
    const tryK = Object.keys(NEWS_TRY).filter(k => !after(k, v)).pop(), tr = NEWS_TRY[tryK]; $('newsTry').textContent = tr[0]; $('newsTry').onclick = () => { closeNews(); tr[1](); };
    $('news').classList.add('on');
  }
  const closeNews = () => $('news').classList.remove('on');
  $('newsOk').onclick = closeNews;
  $('news').onclick = e => { if (e.target === $('news')) closeNews(); };

  // ---------- phone: the board gets the whole screen. Panels slide up as bottom sheets, and the bottom bar becomes a hub ----------
  // The sheets hold the app's real panels (moved in while on a phone, put back on a bigger screen), so everything works the same.
  const phone = (() => {
    const mq = matchMedia('(max-width: 700px)'), home = new Map();
    const PI = d => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const hub = document.createElement('div'); hub.className = 'hub'; hub.id = 'hub';
    hub.innerHTML = `<button data-sheet="boards">${PI('<rect x="3" y="3" width="6" height="6" rx="1.6"/><rect x="11" y="3" width="6" height="6" rx="1.6"/><rect x="3" y="11" width="6" height="6" rx="1.6"/><rect x="11" y="11" width="6" height="6" rx="1.6"/>')}<span>Boards</span></button>`
      + `<button data-sheet="layers">${PI('<path d="M10 3l7 3.8-7 3.8-7-3.8z"/><path d="M3 10.2l7 3.8 7-3.8"/><path d="M3 13.6l7 3.8 7-3.8"/>')}<span>Layers</span></button>`
      + `<button class="hub-add" data-sheet="add" aria-label="Add something">${PI('<path d="M10 4v12M4 10h12" stroke-width="2.4"/>')}</button>`
      + `<button data-sheet="tray">${PI('<path d="M3 11.5l2.2-6.3A1.5 1.5 0 0 1 6.6 4h6.8a1.5 1.5 0 0 1 1.4 1.2l2.2 6.3V15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15z"/><path d="M3 11.5h4l1 2h4l1-2h4"/>')}<span>Unsorted</span><b class="hub-n" id="hubN"></b></button>`
      + `<button data-hub="mochi"><canvas id="hubGoo" width="64" height="56"></canvas><span>Mochi</span></button>`;
    const sh = document.createElement('div'); sh.className = 'sheet'; sh.id = 'sheet';
    sh.innerHTML = '<div class="sh-veil"></div><div class="sh-panel" role="dialog"><div class="sh-grab"><i></i></div><div class="sh-head"><b id="shTitle"></b><div class="sh-tabs" id="shTabs"></div><button class="sh-x" aria-label="Close">×</button></div><div class="sh-body" id="shBody"></div></div>';
    document.body.appendChild(sh);
    const hubGoo = Goo(hub.querySelector('#hubGoo')); goos.push(hubGoo);
    const box = k => document.querySelector(`.box[data-box="${k}"]`);
    const SHEETS = {
      boards: { title: 'Boards', tabs: [['Boards', () => box('boards')]] },
      layers: { title: 'Layers', tabs: [['Layers', () => box('layers')]] },
      add: { title: 'Add', tabs: [['Basics', () => $('tools')], ['Wireframe', () => $('design')], ['Colors', () => box('colors')]] },
      tray: { title: 'Unsorted', tabs: [['Ideas', () => $('tray')]] },
    };
    let open = null, tab = 0;
    // move a real panel into the sheet (remembering where it lived) or put it back
    const adopt = el => { if (!home.has(el)) home.set(el, [el.parentNode, el.nextSibling]); };
    const restoreAll = () => home.forEach(([p, n], el) => { p.insertBefore(el, n && n.parentNode === p ? n : null); el.classList.remove('in-sheet'); });
    function show(name, t = 0) {
      const S = SHEETS[name]; if (!S) return; open = name; tab = t;
      $('shTitle').textContent = S.title;
      $('shTabs').innerHTML = S.tabs.length > 1 ? S.tabs.map(([l], i) => `<button data-t="${i}" class="${i === t ? 'on' : ''}">${l}</button>`).join('') : '';
      const body = $('shBody'); [...body.children].forEach(c => c.classList.remove('shown'));
      S.tabs.forEach(([, get], i) => { const el = get(); if (!el) return; adopt(el); if (el.parentNode !== body) body.appendChild(el); el.classList.add('in-sheet'); el.classList.toggle('shown', i === t); });
      if (name === 'tray') $('tray').classList.remove('closed');
      sh.classList.add('on'); hub.querySelectorAll('[data-sheet]').forEach(b => b.classList.toggle('on', b.dataset.sheet === name));
      if (name === 'layers') renderLayers();
    }
    function hide() { open = null; sh.classList.remove('on'); sh.querySelector('.sh-panel').style.transform = ''; hub.querySelectorAll('[data-sheet]').forEach(b => b.classList.remove('on')); }
    hub.addEventListener('click', e => {
      const b = e.target.closest('[data-sheet], [data-hub]'); if (!b) return;
      if (b.dataset.hub === 'mochi') { hide(); hubGoo.hop(); return mochiOpen(!$('mochi').classList.contains('chat')); }
      if (open === b.dataset.sheet) return hide();
      mochiOpen(false); show(b.dataset.sheet);
    });
    $('shTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) show(open, +b.dataset.t); };
    sh.querySelector('.sh-veil').onclick = hide; sh.querySelector('.sh-x').onclick = hide;
    // drag the sheet down by its handle to close it
    { const grab = sh.querySelector('.sh-grab'), panel = sh.querySelector('.sh-panel'); let y0 = null, dy = 0;
      grab.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); panel.style.transition = 'none'; });
      grab.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
      grab.addEventListener('pointerup', () => { if (y0 === null) return; y0 = null; panel.style.transition = ''; if (dy > 90) hide(); else panel.style.transform = ''; }); }
    // picking something to place closes the sheet, so the next tap lands on the board
    const ready = () => placing || drawOn || ['shapePick', 'tplPick', 'stampWheel', 'linkbox'].some(id => $(id).classList.contains('on'));
    $('shBody').addEventListener('click', () => { setTimeout(() => ready() && hide(), 0); setTimeout(() => open && ready() && hide(), 700); });   // the second look catches tools that get ready a moment later (a voice memo asks for the mic first)
    // layers and boards: once you pick one, get out of the way so you can see it
    box('layers').addEventListener('click', e => { if (phone.on && e.target.closest('.ly') && !e.target.closest('.ly-tw, .ly-b')) setTimeout(hide, 60); });
    box('boards').addEventListener('click', e => { if (phone.on && e.target.closest('.board-row')) setTimeout(hide, 60); });
    // Unsorted on a phone: tap an idea to drop it in the middle of the board (Mochi points it out)
    $('trayList').addEventListener('pointerdown', e => {
      if (!phone.on) return; const it = e.target.closest('.tray-item'); if (!it) return; e.stopImmediatePropagation(); e.preventDefault();
      const c = board.tray.find(x => x.id === it.dataset.id); if (!c) return;
      const r = stage.getBoundingClientRect(), w = toWorld(r.left + r.width / 2, r.top + r.height * .42);
      c.x = w.x - c.w / 2; c.y = w.y - c.h / 2; board.tray = board.tray.filter(x => x !== c); addCard(c); renderTray(); hide(); selectOnly([c.id]); lyFlash([c.id]);
    }, true);
    function set(on) {
      phone.on = on; document.body.classList.toggle('phone', on);
      if (on) { $('dock').prepend(hub);
        $('tools').querySelectorAll('[data-tip]').forEach(b => b.dataset.name = b.dataset.tip.split(' · ')[0]);   // no keyboard on a phone, so just the names
        if (board?.cards.length && view.z < .6) { fit(board.cards, 40, 1); applyView(); } }   // start where the cards are, at a size you can read
      else { hide(); restoreAll(); hub.remove(); }
      hub.querySelector('#hubN').textContent = board?.tray?.length || '';
    }
    mq.addEventListener('change', e => set(e.matches));
    $('selbar').addEventListener('scroll', e => e.target.classList.toggle('end', e.target.scrollLeft + e.target.clientWidth >= e.target.scrollWidth - 4), { passive: true });
    return { on: false, set, hide, count: () => { hub.querySelector('#hubN').textContent = board?.tray?.length || ''; }, init: () => set(mq.matches) };
  })();
  window.__phone = phone;

  // ---------- touch: one finger pans an empty board, two fingers pinch to zoom, press and hold for the menu ----------
  { const pts = new Map(); let pinch = null, hold = null;
    stage.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      clearTimeout(hold); const x0 = e.clientX, y0 = e.clientY, tgt = e.target;
      if (pts.size === 1 && !e.target.closest('.dock, .hub, .sheet, .top, .m-chat')) hold = setTimeout(() => {   // press and hold: the same menu as a right-click
        if (pts.size !== 1) return; const p = [...pts.values()][0]; if (Math.hypot(p.x - x0, p.y - y0) > 8) return;
        drag = null; stage.classList.remove('panning'); $('marquee').style.display = 'none'; navigator.vibrate?.(10);
        tgt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x0, clientY: y0, button: 2 }));
      }, 520);
      if (pts.size === 2) {   // a second finger: whatever the first was doing becomes a pinch
        clearTimeout(hold); drag = null; stage.classList.remove('panning'); $('marquee').style.display = 'none';
        const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: view.z, wx: (mx - view.x) / view.z, wy: (my - view.y) / view.z };
      }
    }, true);
    addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        view.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .2, 3); view.x = mx - pinch.wx * view.z; view.y = my - pinch.wy * view.z; applyView(); }
    }, true);
    const end = e => { if (!pts.delete(e.pointerId)) return; clearTimeout(hold); if (pts.size < 2 && pinch) { pinch = null; save(); } };
    addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
  }

  // ---------- start ----------
  (async () => {
    let list = await MB.list();
    if (!list.length) { const b = newBoard('Brain dump', 'Brain dump'); b.name = 'My first board'; await MB.save(b); list = await MB.list(); }
    let last = null; try { last = localStorage.getItem('mochiboard:last'); } catch (e) {}
    await openBoard(list.some(b => b.id === last) ? last : list[0].id);
    applySettings(); phone.init();
    let onboarded = true; try { onboarded = !!localStorage.getItem('mochiboard:onboarded'); } catch (e) {}
    if (!onboarded) { try { localStorage.setItem(newsKey, (await MB.version().catch(() => null)) || Object.keys(NEWS).pop()); } catch (e) {} setTimeout(() => { fit(board.cards); openSetup(); }, 400); showConnections(true); return; }   // brand new: the tour covers it, no what's new
    setTimeout(() => { fit(board.cards); if (settings.greet && settings.chat !== 'quiet') say(`Hi${settings.name ? ' ' + settings.name : ''}, it's Mochi! Dump ideas with ⌘K, then ask me to sort them ✦`, 7000); }, 400);
    showConnections(true);
    setTimeout(maybeNews, 700);
    setTimeout(() => checkUpdate(), 4000);
  })();
  window.__mb = { openSetup, startTour, get board() { return board; }, applyMochi, fit, lib: () => snapshot().library, openHome, get editing() { return editing; }, get sel() { return [...sel]; }, placeSelbar };   // handy for testing
})();
