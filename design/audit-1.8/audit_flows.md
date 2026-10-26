# 1.8 audit · flows, Mochi, misc (web app, WebKit, Oct 26 2026)

Tested as a user in the browser build at localhost:4130 (`?web` = offline Mochi; the pretend path without `?web` for doing-labels), real mouse and keyboard wherever possible. Screenshots in `scratchpad/audit/`.

## 1 · BUGS

### B1 · should fix · Right-click flyouts run off the left edge at phone width
- Repro: 430 px wide window, select a picture + a circle, right-click, hover **Mask ▸** (same for **Arrange ▸**, **Combine shapes ▸**).
- Happened: the second column opens at x = −69 px; the first word of every row is cut off ("the circle on top as the mask", "ded", "ngle"…).
- Expected: when there is no room on either side, the flyout should clamp to the window (10 px in) or open below the row.
- Where: `openSub()` in the kits block flips left when the right side has no room, but never clamps.
- Shot: `audit/phone_mask_menu.png`

### B2 · should fix · Offline Mochi drops asks that have no verb, and answers "what is a flowchart" with a recipe
- "forgot password" → "I'd love to help with that! I think with Claude Code, and that lives in the Mac app…" (the Forgot password flow exists; the regex needs make/build/draw… to fire).
- "swimlanes for support escalation" → same download line (flowTplAsk needs a verb too).
- "what is a flowchart" → "Write a few notes first, one per idea, then ask me again and I'll build the flowchart from them ✦" (the recipe hook catches the word *flowchart* before the dictionary does; "what is onboarding" correctly answers from the dictionary).
- "can you help me with a flow?" → the same "write a few notes" line.
- Expected: a flow or template name on its own should place it (or offer it with a button, the way "organize this" offers five choices); question words should go to Learn first; the "download me" line should never appear for something the offline library can do.

### B3 · minor · Library "Ask Mochi more" opens the chat but sends nothing
- Repro: Learn → Dictionary → pick a term → **Ask Mochi more**.
- Happened: chat opens, input empty, no message. Expected: the question ("tell me more about Lean UX") is sent, or at least prefilled.

### B4 · minor · Bug triage template: one arrow label touches a shape
- The "No" label on the "Fixed for you?" loop back to "Fix it" sits over the Engineering lane's shapes at default zoom. Cosmetic; every other template's labels are clear.
- Shot: `audit/tpl_label_triage.png`

### B5 · minor · "Dream it" is not in the Templates menu
- Templates lists the seven frameworks + Moodboard, App plan, Brain dump. The poster only exists as the first board. If people delete or edit their first board there is no way to get it back. (Might be intended; flagging it because the brief said Templates → Dream it.)

### Checked and NOT bugs (my first reads were wrong, re-verified)
- Connector dots setting: off hides dots on plain cards and keeps them on flowchart pieces. ✓
- Onboarding's last step: "Next" is hidden there; "I'll explore on my own" closes it; it does not come back on reload. ✓
- Shortcuts ⌘K, ⌘G, ⇧⌘G, ⌘D, M, ⌘Z, ⇧⌘Z all work (my harness had left the onboarding's `on` class, which swallows board keys — real users won't hit that).
- Ideate panel: the Flows / Templates lists are below the fold but the panel scrolls with the wheel. ✓ (see UX 3)

## 2 · UX RECOMMENDATIONS (priority order)

1. **Clamp the flyouts** (B1). One line in `openSub`: `x = Math.max(10, x)`, and if it still doesn't fit, open it below the row. Phone width is the web demo on an iPhone, which is where new people meet it.
2. **Make Mochi's offline intent more forgiving** (B2). Accept bare names ("forgot password", "checkout flowchart", "swimlanes for X"), route "what is / explain" to the dictionary before recipes, and when an ask is ambiguous reply with buttons (Wireframes / Flowchart / Explain) like the recipe chooser already does. The web-only fallback should say what Mochi *can* do here, not send people to the download.
3. **Library discoverability.** The Flows list (12) and Templates list (14) sit under the shapes in a ~470 px-tall panel, so the first flow is at the bottom of the panel and the last needs ~1,150 px of scrolling. Options: a "Library" sub-tab per pane, collapsible category headers (Sign up ▸, Login ▸…), or a taller default for the Ideate panel when a library pane is open. Also show a count ("Flows · 12").
4. **Auto line-up scope.** The new line-up also applies to Sitemap pages and Mind-map branches (verified: a branch dropped 30 px off a sibling snaps into line). For sitemaps that's right; for mind maps branches are meant to fan out, so consider flow + site only. A 150 ms slide to the lined-up spot would also make the move feel intentional rather than a jump.
5. **Arrow keys don't nudge.** There is no arrow-key nudging of selected cards at all (only the onboarding uses arrows). 1 px, Shift = 10 px is expected by anyone coming from Figma; it was in the test brief and I think she assumes it exists.
6. **Flow placement on a busy board.** Every placed flow/template goes to the right of everything (`besideAll`), so after three flows the board is 8,000 px wide and the fit zoom drops to 24 %. Prefer the first empty spot near the current view, or below the last placed thing.
7. **Stamps tab balance.** Doubles, Wings and Devils (static PNG) live in the Mochi tab (now 26 entries); Flyers (animated GIF) live in Moving Mochi. People looking for "the winged one" won't guess that only the flyers move. Either animate wings/doubles too (files are PNG) or group all the new Mochis together with a tiny "moves" badge on the animated ones.
8. **Toast text.** "Connected and lined up ✦" is good; consider "Lined up with Review ✦" (the neighbour's text) so people know what it snapped to.
9. **Recipes keep originals** by default and offer "Remove the original notes": good. Same pattern would help flows: "Remove the why note" for people who know the pattern.
10. **"Why it works" notes** are 300 px wide with three paragraphs; at fit zoom they read as a wall. A two-line summary with "more…" or a smaller type size would keep the flow as the hero.

## 3 · WHAT WORKED

- **Flow library (12):** every flow places beside existing content (never over it), screens + why note + arrows, fit zoom, chirp. Undo after placing removes the whole flow in one step. Mochi offline: "make a login flow", "sign up flow for web", "make an onboarding quiz" place the right variant with "Try the web/quiz one instead" + Undo buttons; "what is onboarding" answers from the dictionary and places nothing.
- **Flowchart library (14):** all place with title + why; no overlapping shapes in any of them; swimlane templates keep every node inside its lane; labels on the Yes/No arrows; "make a flowchart for checkout", "draw the bug triage process" place; "what is a flowchart" and "make a login flow" don't place a flowchart (the latter gives wireframes).
- **Editing a placed template:** dragging a node moves just that node, lines follow; Undo puts it back; clicking a line selects it, a second click opens the label editor; the bar has Label.
- **Auto-connect line-up (by real placement):** right 20 px high → linked and lined up; below 25 px left → linked and lined up; diagonal 150 px up → linked, left alone; gap 200 → no link; toast Undo removes the arrow and restores the position; Auto-connect off → nothing happens; works inside swimlanes.
- **Connector dots:** on/off behaves, flowchart pieces keep theirs.
- **Pen:** three clicks + right-click finishes the line (no context menu), Line ends dropdown gives arrow/dot ends, clicking the first point closes the shape, a closed pen shape over a note offers "Use the drawn shape as the mask".
- **Stamps:** 17 new static Mochis in the picker + 7 flyers under Moving Mochi; all load (light and dark), place at 56 px, resize via the corner (56 → 116), tilt handle present.
- **Mochi doing-labels (pretend path):** "squishing through fonts…", "sketching little screens…" show while she thinks and clear on reply. Check-ins couldn't be provoked (pretend replies in < 2 s). The greeting bubble doesn't show in web mode so the sparkle-orphan case wasn't reproducible here; `say()` wraps text in `noOrphan()` per code.
- **Settings:** Ideate tabs list toggles don't overlap text; Toolbar tab renders; Board → Pictures group has all four rows and Widgets no longer has them; ports/pullColors/autoLink persist across reload.
- **First board:** fresh profile gets the poster (section "Your first board", 4 stamps, note, titles, pen heart), the note is editable, onboarding runs 6 steps and ends on "I'll explore on my own".
- **Learn:** Dictionary (80 terms, 9 groups, search works), Principles; Add as a note / Add as a checklist add the right card types. Recipes: "organize this" offers 5 choices; sitemap / checklist / flowchart recipes build from 5 notes and keep the originals with a remove button.
- **General:** 160 cards → Layers rebuild in 3 ms; zoom 8 % (far mode) and 400 % fine; board JSON round trip is byte-identical for 150 cards / 16 links; dark-mode menus and flyouts readable; no page errors anywhere in ~40 runs.
