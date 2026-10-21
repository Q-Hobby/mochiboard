<p align="center"><img src="assets/icon.png" width="160" alt="Mochiboard"></p>

<h1 align="center">Mochiboard</h1>
<p align="center"><b>An infinite canvas for planning creative work, with Mochi as your AI helper.</b></p>

---

Mochiboard is a free Mac app for the messy part before you open your design tools. Drop notes, images, links, checklists and colors on an endless board, arrange them however makes sense to *you*, and ask Mochi (a tiny pixel goo powered by Claude Code) to sort, plan and fill in the gaps.

## What's inside

- 🗺️ **Infinite canvas.** Pan with two fingers, pinch to zoom, cards tilt a little like real paper.
- 🗒️ **Cards for everything.** Notes, big titles, checklists, images (drop or paste), links with previews, color swatches.
- 🎨 **Made for designers.** Pull a color palette out of any image in one click. Draw connections between ideas.
- 🧠 **ADHD-friendly.** An **Unsorted** tray so nothing gets lost, **⌘K** to dump an idea instantly, and **Focus mode** (press F) to hide everything but what you're working on.
- 🫧 **Mochi.** Ask her things like *"sort my unsorted ideas by theme"*, *"make a moodboard plan for a coffee brand"* or *"what am I forgetting?"* and she adds and arranges cards right on your board.
- 💾 **Your files, your Mac.** Boards are saved as files in `~/Library/Application Support/Mochiboard`. No account, no cloud.

## Install

You need a Mac (macOS 13+). For Mochi's brain, install [Claude Code](https://claude.com/claude-code).

```bash
git clone https://github.com/jessawolfe-ux/mochiboard.git
cd mochiboard
./install.sh
```

Update any time with `./install.sh --update`.

## Shortcuts

| | |
|---|---|
| **⌘K** | Quick capture into Unsorted |
| **double-click** | New note |
| **N / C / T / L / I** | Note, checklist, title, link, image |
| **F** | Focus on the selection (Esc to leave) |
| **M** | Ask Mochi |
| **space + drag** | Pan |
| **⌘D** | Duplicate |
| **0** | Fit the whole board |

## How it's built

A small Swift app (`Sources/Mochiboard.swift`) wraps the canvas (`web/`, plain HTML, CSS and JavaScript). Swift saves boards, fetches link previews and runs `claude -p` so Mochi can think. To work on the canvas in a browser, run `python3 -m http.server` inside `web/` (Mochi is pretend there).

---

<p align="center">Made with 🫧 by <a href="https://jessa.art">Jessa Wolfe</a>. MIT licensed.</p>
