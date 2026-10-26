# 1.8 audit · masks, combine, menus (web app, WebKit, real mouse/keyboard where possible)

Scripts: `audit_A.py`, `audit_A6.py`, `audit_B.py`, `audit_C.py`, `audit_D.py`, `audit_D6.py` (helpers in `mlib.py`). Screenshots in this folder.

## 1 · BUGS

### B1 · Masking a shape, sticker or icon paints a white card behind it — **should fix before release**
- Repro: put a circle over a star (or a stamp, or an icon), select both or just the circle, right-click → Mask ▸ Use the circle as the mask. Same with a picture as the mask over a star.
- Happened: the star is cut to the circle, but a white rounded card fills the circle behind it (white disc with a star on it). Same for stamp and icon. Screenshot: `shape_masked_by_shape.png`, `a2_pic_as_mask.png`, `picmask_probe.png`.
- Expected: only the star, cut to the circle, on the board background.
- Why: shapes/stamps/icons/paths normally hide their white `.frame` (computed `display: none` when unmasked). Masking wraps `.frame` + `.body` in `.mkw`, which breaks whatever direct-child rule hides the frame, so it becomes `display: block`, white, and gets clipped to the mask. Fix: keep the frame hidden for those card types when masked (`.card.masked.shape .frame, .card.masked.stamp .frame, .card.masked.icon .frame, .card.masked.path .frame { display: none }`), or check the original selector that hides it. Notes/pictures are fine (their frame is meant to show).

### B2 · Dragging a mask into a group that already has a mask gives that group two masks — **should fix before release**
- Repro: two mask groups in Layers (Circle mask · picture, Rectangle mask · picture). Expand both. Drag "Rectangle · mask" row into the circle group (drop above its mask row).
- Happened: the circle group now has two cards flagged as masks (`['ci', 'sq']`); which one clips is whichever is found first; the rectangle's old group is left with one lonely member.
- Expected: one mask per group. The dragged mask should become a plain member of the new group (lose `maskLayer`), or replace the existing mask. The Layers drop code only sets `group`; it never clears `maskLayer` when dropping into a group.

### B3 · A group keeps living with one member after the mask leaves — minor
- Repro: Circle mask group (circle + picture). In Layers drag the mask row out to the top level (works: circle becomes a plain shape, picture unmasked). Or delete the mask layer.
- Happened: the picture stays in a one-member group: Layers shows a "Group" row wrapping just the picture; click selects "the group". `A5c`, `D2`.
- Expected: when a group drops to one member (or to no mask + one member), dissolve it (delete `group`). Same after Remove mask on one member when only one member remains.

### B4 · The mask looks half-visible after a reload/undo while its group is selected — minor
- Repro: whole mask group selected, then the board re-renders without `selectOnly` running (reload of the board JSON with the selection still set; some undo paths).
- Happened: the mask shows at 35% (the "selected alone" look) while the whole group is selected (`D3 reload`: ci opacity .35). The `gsel` class is only set inside `selectOnly`, not on `renderAll`.
- Expected: hidden (0) when the whole group is selected. Fix: reapply the `gsel` toggle at the end of `renderAll`/`refreshMaskGroups`.

### B5 · Right-click on a Layers row that is part of a bigger selection acts on the whole selection — minor / UX trap
- Repro: click a masked picture on the board (selects the whole group). In Layers, right-click the "Circle · mask" row → Delete.
- Happened: the menu is the group's menu (Ungroup, Remove mask…) and Delete removes the picture too (`A6`). With nothing selected first, the same right-click correctly selects only the mask and deletes only it (`D2`).
- Expected: right-click on a row selects exactly that row unless the row *is* the selection. (Pre-existing Layers behaviour, but the mask row makes it bite.)

No page errors in any run. No blockers found.

## 2 · UX RECOMMENDATIONS (priority order)

1. **Fix B1 before shipping.** It's the first thing anyone will try after "mask a picture": mask a shape or a sticker. The white disc looks like a rendering bug.
2. **One mask per group, always** (B2) and **dissolve one-member groups** (B3). Both are small code changes and they stop Layers from showing nonsense states.
3. **Esc should close the right-click menu and its flyout.** Today only clicking elsewhere closes them (`C1`). Every other overlay in the app closes on Esc.
4. **Picking the mask on the board is nearly impossible.** The mask sits under its member, so double-clicking into the group always lands on the member; the mask can only be reached through Layers (`A1`: dblclick on the mask selected the picture). Options: when the whole group is selected, let a click on the faint mask ghost pick it; or add "Select the mask" to the group's right-click menu; or show the mask's handles while the group is selected so it can be resized without picking it.
5. **Tell people the mask moved to Layers.** After masking, the chirp says "drag things in or out of it in Layers". Good, but the group box only says "Mask"; a one-time hint on the first mask ("The circle is the group's mask now, find it in Layers") would cover the people who don't read chirps.
6. **"Remove mask" on the whole group leaves a plain group behind** (by design, Figma does the same). Consider wording it "Turn the mask back into a shape" so nobody expects an ungroup.
7. **Right-clicking a connector line gives the board menu** (Background color…, Export board) instead of the line's menu (`D5`). Pre-existing, but with Arrange ▸ everywhere now it stands out. A small line menu (Label, Ends, Color, Delete) would match.
8. **Save N pictures / Save each in the browser**: couldn't confirm a visible "works in the Mac app" message from the harness (`D5`). Worth a manual check in the web demo so it doesn't silently do nothing.
9. **Combined shapes have no stroke** (known). The Stroke pop is correctly hidden; add a line in the release notes so people don't look for it.
10. Shortcuts ⌘G / ⌘D / ⇧⌘G didn't fire in the WebKit harness while ⌘Z/⇧⌘Z did (`D1`, `A6`). Most likely a harness focus quirk, but worth one manual check in the Mac app that ⌘G, ⌘D and ⇧⌘G work with a mask group selected.

## 3 · WHAT WORKED

- Mask ▸ flyout: lone shape over a picture ("…for the picture underneath"), pair both ways (on top / underneath), shape over several selected things masks only what it overlaps (far note left alone), open 5-point pen line as a mask (closed up), 2-point line correctly not offered, ready-made Heart on two notes makes two separate groups, picture/cut-out as a mask (alpha), Mask ▸ preset on an already-masked group replaces the mask (one mask, no mask-of-a-mask).
- Mask group model: mask is the bottom layer, hidden (0) unselected, faint (.35) when picked alone, members clipped live; group box labelled "Mask" hugs the mask; corners and stroke pops hidden for masked pictures (shadow stays); moving the whole group with the mouse keeps the clip; mask group inside a section moves with the section; tilted mask (25°) clips correctly (counter-rotated); far zoom keeps the clip and hides the mask; dark mode looks right (`d6d_dark.png`).
- Layers: group named "Circle mask", mask row "Circle · mask"; drag a loose layer into a group → masked; drag a member out → unmasked; drag between two groups; drag the mask out → plain visible shape, members unmasked; group rows reorder.
- Remove mask on one member (leaves the group), on the group (mask becomes a plain shape, group stays), Ungroup via menu (all unmasked, mask visible), Delete the mask from its Layers row (with nothing else selected), undo/redo through mask / move / ungroup / delete; Duplicate (menu) of a mask group makes an independent masked copy; reload round trip keeps masks and combined shapes.
- Legacy boards: old folded masks (pen `from`, preset heart, picture mask) migrate to proper groups on open (`d4_migrated.png`).
- Combine: Union/Subtract/Intersect/Exclude via the flyout, bottom shape first, result keeps the bottom fill, wobble and shadow work on it, 3 shapes, plain box + pen shape, pictures/spots never get Combine, a combined shape is not offered as a mask source but can be masked by a cut-out, Separate restores both shapes, undo both ways, Duplicate (menu) copies it cleanly, dark mode fine. The fill picker is the usual "color" pop.
- Menus: Arrange ▸ opens on hover and on click in the board, picture, section and Layers-row menus; hovering another row closes it; clicking a row runs it and closes everything; click-away closes both; near the bottom-right corner the menu and flyout stay on screen (`c1_corner_menu.png`); Layers-row flyout opens to the right of the menu.
- Shape text: centered by default for rect, diamond, pill, io, doc, db; long text stays inside the diagram shapes (`b3_shapes_text.png`); editing text inside a masked note works and it stays masked.
