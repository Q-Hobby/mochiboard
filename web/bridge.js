// The bridge between the canvas and wherever it's running.
// Inside the Mac app, calls go to Swift (saving board files, link previews, asking Mochi through Claude Code).
// In a plain browser (for building and demos) it falls back to localStorage and a pretend Mochi.
(() => {
  const native = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mb);
  const waiting = new Map(); let seq = 0;
  // Swift answers with window.__mbReply(id, ok, value)
  window.__mbReply = (id, ok, value) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); ok ? w.res(value) : w.rej(new Error(value)); };
  const call = (op, args = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); window.webkit.messageHandlers.mb.postMessage({ id, op, args }); });

  const LS = 'mochiboard:';
  const browser = {
    async list() { return JSON.parse(localStorage.getItem(LS + 'index') || '[]'); },
    async load(id) { const s = localStorage.getItem(LS + 'board:' + id); return s ? JSON.parse(s) : null; },
    async save(board) {
      localStorage.setItem(LS + 'board:' + board.id, JSON.stringify(board));
      const idx = JSON.parse(localStorage.getItem(LS + 'index') || '[]').filter(b => b.id !== board.id);
      idx.unshift({ id: board.id, name: board.name, color: board.color, folder: board.folder || null, parent: board.parent || null, updated: Date.now() });
      localStorage.setItem(LS + 'index', JSON.stringify(idx)); return true;
    },
    async folders() { return JSON.parse(localStorage.getItem(LS + 'folders') || '[]'); },
    async saveFolders(folders) { localStorage.setItem(LS + 'folders', JSON.stringify(folders)); return true; },
    async remove(id) { localStorage.removeItem(LS + 'board:' + id); localStorage.setItem(LS + 'index', JSON.stringify(JSON.parse(localStorage.getItem(LS + 'index') || '[]').filter(b => b.id !== id))); return true; },
    async connections() { return { claude: false, mobbin: false, higgsfield: false, browser: true }; },
    async fetchImage(url) { return url; },
    async openURL(url) { window.open(url, '_blank'); },
    async speechAuth() { return 'ok'; },
    async exportRect() { throw new Error('Exporting works in the Mac app'); },
    async transcribe() { throw new Error('Mochi writes out voice memos in the Mac app'); },
    async reveal() { alert('Your boards live in this browser while you try Mochiboard here. In the Mac app this opens their folder.'); },
    async linkPreview(url) { let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {} return { title: host, desc: url, image: '' }; },
    // a pretend Mochi for the browser: she still tidies things up so the canvas can be tried without the app
    async ask(prompt, board) {
      await new Promise(r => setTimeout(r, 900));
      const notes = board.cards.filter(c => c.type === 'note');
      if (/group|sort|organi[sz]e|tidy/i.test(prompt) && notes.length) {
        const cx = Math.min(...board.cards.map(c => c.x)), cy = Math.min(...board.cards.map(c => c.y));
        return JSON.stringify({ say: `I lined up your ${notes.length} notes into one tidy column. (In the Mac app I'd really sort them by theme with Claude.)`,
          titles: [{ text: 'Sorted', x: cx, y: cy - 90 }], move: notes.map((n, i) => ({ id: n.id, x: cx + (i % 3) * 250, y: cy + Math.floor(i / 3) * 170 })) });
      }
      return JSON.stringify({ say: "Here's a little starter set! (This is pretend Mochi in the browser. In the Mac app I think with Claude Code.)",
        add: [{ type: 'note', text: 'What is this for?', color: 'butter' }, { type: 'note', text: 'Who will see it?', color: 'mint' }, { type: 'note', text: 'What does done look like?', color: 'lilac' }] });
    },
  };
  window.MB = native ? {
    native: true,
    list: () => call('list'), load: id => call('load', { id }), save: board => call('save', { board }), remove: id => call('remove', { id }),
    folders: () => call('folders'), saveFolders: folders => call('saveFolders', { folders }),
    linkPreview: url => call('linkPreview', { url }), ask: (prompt, board, confirmed = false, opts = {}) => call('ask', { prompt, board, confirmed, ...opts }),
    connections: () => call('connections'), fetchImage: url => call('fetchImage', { url }), openURL: url => call('openURL', { url }), reveal: () => call('reveal'), transcribe: audio => call('transcribe', { audio }), speechAuth: () => call('speechAuth'), exportRect: o => call('export', o),
  } : Object.assign({ native: false }, browser);
})();
