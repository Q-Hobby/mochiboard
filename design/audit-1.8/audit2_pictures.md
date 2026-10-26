# 1.8 audit · second pass · pictures, placeholders, Mochi offline, placement, line-up, stamps, first-mask hint

WebKit (Playwright), web build at :4130 `?web`, three scripted runs + screenshots in `audit2/`. No page errors in any run. Nothing changed.

## 1 · BUGS

### B1 · should fix · A flowchart template's bare name, or a verb + name without the word "flowchart", gets the "download me" line
- Repro (chat or `__ftpl.ask`): "bug triage" · "hiring pipeline" · "draw the hiring pipeline" · "incident response".
- Happened: *"I'd love to help with that! I think with Claude Code, and that lives in the Mac app. Download me…"*
- Expected: the template places (the wireframe side already does this: "forgot password" and "checkout" place without a verb). `flowTplAsk` still requires one of *flowchart / diagram / process / workflow / swimlane* in the sentence; "swimlanes for support escalation" and "make a flowchart for checkout" work, "bug triage" doesn't. The web fallback line is the worst reply for something the offline library can do.
- Fix idea: in `flowTplAsk`, when the ask is short (≤ 5 words) and matches an FT_ASKS entry that has no wireframe twin (triage, approval, support, publish, hiring, incident, feature, cancel, search), place it without needing the flowchart word; for names that exist on both sides (login, signup, forgot, onboarding, checkout) keep the current rule (wireframes win).

### B2 · minor · "explain checkout" (and any unknown term) gets the download line
- "what is a flowchart" / "what is onboarding" correctly answer from the dictionary. "explain checkout" has no dictionary entry, so it falls through to *"Download me and I'll connect to your Claude…"*.
- Expected: a kinder miss: "I don't have that one in my dictionary yet. Want the Checkout flow or flowchart instead?" with buttons. (Pre-existing fallback, just more visible now that questions are routed.)

### B3 · minor · Ready-made masks (Circle, Heart… from Mask ▸) never show the first-mask hint, or any toast
- `maskCards()` has no chirp; only "Use the shape as the mask" does. Someone whose first mask is a preset never learns the mask lives in Layers. The hint flag also isn't set by that path, so their later shape-mask shows the long hint (fine, just inconsistent).

### B4 · minor · "Moving Mochi" tab now shows a MOVES badge on all 16 entries
- The badge is added wherever an entry is animated, so the Moving tab is wall-to-wall badges (noise). Expected: badge only in the New ✦ tab (where static and animated mix), or hide it when every entry in the tab moves. `audit2/stamps_new.png` for the New tab (reads well there).

### Not verifiable from the harness (needs one manual check)
- **Chips reappearing live during a resize drag.** The Playwright mouse can't drive the corner handle in this app (the card never resizes), so I could only verify the end state after a programmatic resize (works: `tiny` toggles at 140×90). The live branch is on the same line as the width update, so it should be fine, but please drag a 100px picture bigger once and watch the chips come back mid-drag.

## 2 · UX NOTES

1. **Placement**: works as designed. When the spot under the view is taken (even by one note), the flow goes below everything rather than beside the note, so with a single card near the top-left you still get a long vertical board. A "to the right of the blocking card if there is room on screen" candidate before "below everything" would keep things in view more often. (`audit2/placement_4.png`: four placements, no overlaps.)
2. **Why notes**: the three small notes read well at 64% (`audit2/checkout_fit.png`); at 20% for the swimlane templates (`audit2/triage_fit.png`) they're dots, same as any note at that zoom. Fine.
3. **Bug triage "No" label**: now clear of the shapes at default zoom (`audit2/triage_fit.png`).
4. **Line-up toast**: "Lined up with A very long neighbour ✦" (22-char cut, no ellipsis). An ellipsis would read better than a mid-word stop.
5. **Dark mode**: Shadow sheet, Stroke, Corners, picture menu + flyouts all readable now (`audit2/dark_shadow.png`, `dark_stroke.png`, `dark_corners.png`, `dark_menu.png`). Mats honour white / pink / 0-width.
6. **Converted spot keeps the photo's shadow** (`shadow: soft` survived the placeholder drop). Probably fine, noting it.

## 3 · WHAT WORKED

- Shadow sheet on mixed selections: "Add to all" shows when any lacks one and only touches those; both "Add to all" and "Clear" with a 2-of-3 mix; Clear removes all and "Add" returns. (`audit2/shadow_mixed.png`)
- Typed Stroke width: 999 → 24, -5 → 0, 12.5 kept; slider follows the number. Caption shows on pictures only.
- Tiny pictures (120 wide, or 80 tall) hide both chips; 300×240 shows them.
- Hover tip: on pictures and spots, not on notes or empty board, never stuck after the pointer leaves, hidden while framing, off with "Image hints on board". Crop bar reads "Drag the picture to reposition it · scroll to zoom in or out · Esc cancels"; Esc leaves framing.
- Real `mb/ph` drag of a library placeholder onto a photo: becomes a spot (label pill, scene art, no src, no chips), its menu is the spot menu, and a dropped picture file fills it (chips return). `audit2/ph_on_photo.png`
- Scene words: Album cover → music, Podcast art → music, App screenshot → photo, Company logo → product, Hero image → landscape, Team photo → team, Map of the store → map, Product shot → product.
- Far zoom (<.55) drops outline/shadow filters on picture cut-outs and spot cut-outs, and restores them when zooming back in.
- Mochi offline: "forgot password", "checkout", "swimlanes for support escalation", "make a login flow", a long sentence containing "forgot password flow" all place with the right reply + Undo; "what is a flowchart" / "what is onboarding" answer from the dictionary and place nothing; nonsense gets the fallback.
- Placement: four flows/templates in a row with the view moved around: each lands near the view or below everything, never overlapping, each with a title and three small "why" notes (`fs: 's'`).
- Auto line-up: flow shapes line up (center-aligned, so a 90-tall Process sits at y 295 next to an 80-tall box at 300, which is right), sitemap pages line up under their parent, mind-map branches connect but keep their offset; toast Undo restores the position and removes the arrow; Auto-connect off does nothing; the 160ms slide is set and cleared; real placement from the kit grid next to "Review" lines up with the toast "Lined up with Review ✦".
- Stamps: New ✦ tab has 24 entries (3 doubles, 7 wings, 7 devils, 7 flyers), MOVES badge on exactly the 7 flyers, other tabs unchanged (Mochi 26, Moving 16, Emoji 48); placing from the New tab adds a stamp; dark mode fine (`audit2/stamps_new_dark.png`).
- First-mask hint: long toast with "find it in Layers" the first time, short "Masked with the circle ✦" after, `mbMaskHint` stored; clearing localStorage brings the long one back.
