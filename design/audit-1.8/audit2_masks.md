# Audit 2 · masks, menus, lines, Templates window, arrow nudging

WebKit (Playwright), web build at :4130 (`?web`), real mouse/keyboard for menus, flyouts, Layers drags, ⌘Z/⇧⌘Z/⌘D/⌘C/⌘V/Backspace and arrows; API only to set boards up. ~75 checks in two runs. Screenshots in `scratchpad/audit2/`. Nothing was changed.

## 1 · BUGS

### B1 · should fix · Backspace on the mask can't be undone back to a mask group
- Repro: mask a picture with a circle. Select just the circle (Select the mask, or the Layers row). Press Backspace. Press ⌘Z.
- Happened: both cards come back, but ungrouped and unmasked (`groups: 0, masked: false, ciMask: false`). The undo lands on the state from *before* the mask was made, so the delete itself never pushed an undo step.
- Expected: ⌘Z brings the mask group back (which is exactly what happens when the same delete is done from the right-click menu → Delete: `groups: 1, masked: true`).
- Where to look: the keyboard delete path for cards vs the menu's `removeSelected`; the `removeSelected`/`removeCards` wrappers that dissolve lonely groups run after the base function, so the base's `remember()` should have fired. Check whether the Backspace handler reaches a `remember()` for this case or hits the "same state as last snapshot" dedupe.

### B2 · should fix · ⌘D on a masked picture copies only the picture
- Repro: mask a picture; click the picture alone (inside the group); ⌘D.
- Happened: one new image card in a brand-new one-member group (`[{n:2, masks:['ci']}, {n:1, masks:[]}]`): a masked copy without a mask, and a lonely "Group" row in Layers.
- Expected: same as the right-click menu's Duplicate, which copies the whole mask group (`2:1, 2:1`). ⌘D on the *whole* group is fine. The keyboard duplicate path wasn't given the `withMaskGroups` treatment.

### B3 · should fix · Swimlane previews in the Templates window are unreadable
- Repro: Flowchart → Templates → Team processes → Bug triage (or Approval, Support, Incident).
- Happened: the preview scales to fit the box width, so a 2,580-unit-wide swimlane drawing lands at 0.17×: node labels are 2.8–3.6 px tall on screen (`audit2/tpl_triage.png`, `tpl_incident.png`). The non-lane templates are fine (login ≈ 7 px, `tpl_login.png`).
- Expected: the preview should still tell you what the flow is. Options: let the lane previews use the full right column height (a taller `.ft-prevbox` for `lanes`), hide node text below ~0.3× and let shapes + lane names carry it, or a hover/click to enlarge.

### B4 · should fix · After "Select the mask", right-clicking the mask gives the picture's menu and re-selects the picture
- Repro: mask a picture, right-click → Select the mask (the circle ghost shows at 35 %). Right-click the ghost.
- Happened: the picture-menu intercept takes the topmost card under the pointer (the picture), calls `selectOnly([picture])` and shows the picture menu (`Upload a picture…`). The mask selection is lost. The only way to act on the mask by right-click is the Layers row.
- Expected: if the mask is the current selection and the pointer is over its ghost, the right-click should act on the mask (menu with Turn the mask back into a shape / Arrange / Delete), or at least not steal the selection.
- Related wording: the picture menu's own row still says **Remove mask** while the board menu says **Take it out of the mask** / **Turn the mask back into a shape**. Make them match.

### B5 · minor · At 430 px the flyout sits on top of its menu
- The Mask ▸ flyout is now clamped inside the window (x 10–250 of 430), but at that width it lands over the menu it came from (`audit2/phone_flyout.png`). Readable, nothing cut off; just a little odd. Opening it *below* the row when neither side fits would be cleaner.

### Seen once, not reproduced
- One page error `null is not an object (evaluating 'b.hidden')` during run 1 (around the ⌘ shortcut presses); run 2 with stack capture had no errors. Possibly the onboarding's own key handler when its element is hidden; a real user with onboarding dismissed shouldn't hit it.

## 2 · UX NOTES (priority order)
1. Fix B4 together with B2/B1: the three are all "the mask is a second-class object" moments; after the first session with masks, people will hit at least one.
2. Swimlane previews (B3): the cheapest fix is a taller preview box for lane templates plus hiding text under 0.3×; the lanes' names and the shapes read fine even tiny.
3. The Templates window takes no keyboard focus on open (`activeElement = BODY`). Esc still works (document-level), so fine, but Tab doesn't reach the list. A focus on the first list item would make it keyboard-friendly.
4. Picture-menu wording: "Remove mask" → "Take it out of the mask" (member) to match the board menu.
5. Dark mode is good everywhere checked (picture menu, Templates window, flyouts). The preview's node labels stay dark ink on pastel nodes in dark mode, which reads well.

## 3 · WHAT WORKED
- Re-mask chains: preset→preset (old preset gone), preset→drawn (preset gone, drawn is the mask), drawn→preset (drawn steps out as a plain shape with its frame hidden), and ⌘Z / ⇧⌘Z through all three.
- Picture menu title "Picture · masked with the circle"; Esc closes it. Whole-group menu: Select the mask + Turn the mask back into a shape; Select the mask picks only the circle and shows the 35 % ghost; mask-alone menu via Layers says Turn the mask back into a shape.
- Unmask variants: on the mask → plain visible shape, group kept, picture unmasked; on the only member → no lonely group; delete via menu → picture ungrouped, no "Group" row, ⌘Z restores.
- Masking a shape, sticker, icon and a closed pen shape: frames hidden, bodies clipped (`audit2/masked_kinds.png`).
- Menu Duplicate, ⌘C/⌘V of a member, ⌘C/⌘V of the whole group, ⌘D of the whole group: all give two intact mask groups; undo of the paste goes back to one.
- Layers: dragging a free note into a mask group masks it; dragging a mask into another mask group leaves one mask there and dissolves the emptied group; dragging the mask out turns it into a plain visible shape and unmasks the members (the 3-member group stays).
- JSON round trip keeps the group; dark-mode picture menu contrast is fine.
- Board menu: Arrange ▸ with four rows on hover, no bare stacking rows; Esc closes menu + flyout; bottom-right corner keeps menu and flyout on screen; 430 px clamps the flyout inside the window.
- Line menu on one line: Label, Arrow at the end/start (Dot sets the tail), Color, Make it an elbow ↔ Make it a curve, Delete; on two Shift-selected lines: no Label, "Delete 2 lines", colour applies to both; ⌘Z restores.
- Layers right-click on the picture row with the group selected → only the picture; on the group row → group menu.
- Templates window: button sits beside Starter flow and the old list is gone; empty state; all 14 previews have no text outside the drawing, no overlapping nodes, 3 why bullets and an Add button; Add to the board closes the window, lands clear of a note placed in the way, with title + 3 small why notes (fs `s`) + shapes (`audit2/placed_near_view.png`); Esc, ×, click-outside close it; opening twice is fine; dark mode fine (`audit2/tpl_dark.png`).
- Arrow keys: →→↓⇧←⇧↑ lands on (292, 291), one ⌘Z undoes the burst; a mask group nudges together with its clip unchanged; nudging the member alone re-clips it; a selected line, typing in a note, Settings open and the Templates window open all leave the cards alone.
