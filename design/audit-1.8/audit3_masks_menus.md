# Audit 3 · masks, combine shapes, right-click menus, selection and keys

Oct 27 2026, pre-release pass on `main` (after the link-screenshot commits). Playwright WebKit against `http://localhost:4130/index.html?web`, 1500×950 (and 414×800 for the phone check). Every check used real pointer and key events on real elements, with computed visibility asserted; data was read from `__mb.board`. No page errors in any run. Nothing was changed in the repo except this file.

## Blockers

None found.

## Should fix

**1. ⌘G with a masked member leaves the mask alone in an empty mask group.**
Repro: picture + circle, Mask ▸ *Use the circle on top as the mask*. Add a note. Double-click the picture to pick it inside the group, Shift-click the note, ⌘G.
Observed: the picture and the note form a new group (Layers calls it "a note"); the circle keeps `maskLayer: true` in the old group by itself. Layers shows a "Circle mask" group containing only "Circle · mask"; the picture is no longer clipped. The lonely mask never dissolves (dissolveLonely only runs on unmask, Layers drops and deletes), so the board keeps a mask with nothing in it until something else happens to it.
Expected: either ⌘G treats the mask group as one unit (groups all of it, like ⌘D already does via `withMaskGroups`), or the orphaned mask turns back into a plain shape.

**2. ⇧⌘G on a member picked inside the mask group leaves the same orphan.**
Repro: same mask group; double-click the picture (picks only `p`), ⇧⌘G.
Observed: `p.group` cleared, clip gone, circle still `maskLayer: true` alone in its group.
(Ungroup on the *whole* group, by key or by the menu, is clean: both lose the group, the circle becomes a plain shape, Layers shows "Image" and "Circle".)

**3. A combined (bool) shape can't be a mask.**
Repro: rect + circle → Combine shapes ▸ Union. Select the result and a picture, right-click → Mask ▸.
Observed: the flyout offers only "Use the picture as the mask" plus the ready-made shapes; the bool is never offered (`vectorish` excludes `shape === 'bool'`, and `maskSource` builds on it). The 1.8 notes say Combine results can be used as masks.
Expected: "Use the shape on top as the mask" for a bool, drawing its parts as the clip (or the nested-mask SVG as a mask image).

## Minor

4. The single-picture menu on a masked picture has "Mask" and "Take it out of the mask" but not "Select the circle (the mask)". The general card menu (notes, shapes, boxes) has it, and the whole-group menu has "Select the mask". A member that is a picture has no one-click way to the mask except the Layers panel or double-clicking off its edge.
5. Phone width (414): the Mask flyout opens on top of its own menu (left 10–186 over a menu at 130–292). It stays fully on screen and is usable; it's the earlier "small decision" item, unchanged.
6. Dragging a mask layer's row in Layers onto a row inside another group makes it a plain member of that group (fine) and leaves its old group as an ordinary, unnamed group ("a note") instead of dissolving it. The members are unmasked correctly.
7. A shape card with an unknown `shape` kind (only reachable from data, not the UI) is still offered as a mask source and then clips nothing.

## Verified OK

Masks
- Shape over picture, both selected → Mask ▸ "Use the circle on top as the mask": group formed, circle is the mask layer, picture clipped live (SVG clipPath in `userSpaceOnUse`), Layers shows "Circle mask" / "Image" / "Circle · mask".
- Lone shape (circle, star, triangle, rect, diamond, heart) selected alone over a note or a picture: "Use the shape as the mask for the note/picture underneath" → masked and clipped.
- One shape over three selected notes: "Use the circle as the mask for the 2 things" masks only the two it overlaps; the third is untouched.
- Ready-made Heart on a picture, Blob on a note, Star on a plain box, Circle on a cut-out (nobg picture): mask group made, member clipped.
- Pen: three clicks + right-click (and + Enter) make a 3-point path, clicks over a picture still add points; a 3-point pen shape placed over a picture is offered as "Use the drawn shape on top as the mask" and clips. A 2-point line is not offered as a mask.
- A cut-out picture masks a picture through the CSS alpha mask (`--imask` on the frame and body).
- Re-masking with a second shape replaces the first mask (the old circle becomes a plain shape); undo restores the circle mask, redo brings the star back.
- Tilting the mask (rot 25) and the member (r 10) keeps the clip.
- A real click on a masked picture selects the whole group (`s`, `p`); dragging it moves the mask with the picture. Double-click picks the member alone; dragging it then moves only the member (Figma-like). The group box is drawn at the mask's box and labelled "Mask".
- Whole-group menu: Ungroup, Create section, Mask, Select the mask, Turn the mask back into a shape, Arrange, Export…, Save each…, Duplicate, Delete. Member menu: Mask, Take it out of the mask. Mask menu: Turn the mask back into a shape.
- "Take it out of the mask" on the member unmasks it and the lonely mask becomes a plain shape.
- ⌘D on a masked picture copies the whole mask group (5 cards, 2 masks, 2 groups); undo removes the copy.
- Backspace on the mask layer: the picture is freed (no group, no clip); undo brings the mask back clipped. Delete via the menu behaves the same. Deleting the only member turns the lonely mask back into a shape.
- Save → reload keeps the mask group and the clip. A legacy card with `mask: 'heart'` still renders clipped.
- `exportPlan` for a selected masked picture returns the whole "Image group" (mask + member), so the export takes the group.
- Layers: drag a note row onto the picture row inside the mask group → it joins and is clipped; drag a star in → it becomes a member, not a second mask (one mask per group); drag the picture row out onto a row outside → unmasked and the lonely mask dissolves; drag a member from one mask group onto a row in another → re-masked by the new group's mask; undo restores.

Combine shapes
- Union / Subtract / Intersect / Exclude on rect + circle each give one `bool` card with two parts (Exclude builds three SVG masks); the sources are removed; undo restores both.
- Union: rect + pen shape; Subtract: plain box + star. Not offered with a picture or a note in the selection.
- The bool's menu has "Separate the shapes" and no Combine; Separate gives the rect and the circle back at their original places and sizes; undo restores the bool. Resizing the bool scales its drawing with the card. Bool paths carry no stroke.

Menus
- Arrange ▸ with the four stacking rows (Bring to front, Bring forward, Send backward, Send to back) in the note, picture, shape, group and multi-selection menus. The empty-board menu is Background color…, Export board as image, Export board as PDF.
- Line menu (Label, Arrow at the end, Arrow at the start, Color, Make it an elbow, Delete) on a straight line, on a curved labelled line, by a plain right-click and by a real right press-and-release (the pointer-capture path through `elementFromPoint`).
- Esc closes the menu and its open flyout together; afterwards the board still has the keys (arrow nudges the selection). The menu and flyout stay inside the window at the bottom-right corner (flyout flips to the left). A locked card still gets its menu.

Keys
- Arrow nudges 1 px, Shift+arrow 10 px. Five quick presses undo in one step; two bursts with a 1.5 s pause undo as two steps. Backspace deletes and ⌘Z brings it back.
- No nudge while typing in the board-name input, while Settings or the Library is open, while framing a picture (Adjust the crop) — the guard also names `#ftModal.on` and `#wfModal.on`.
- Esc leaves pen mode, ends point editing (double-click a rect → vec-mode → Esc), and ends framing.

## Not verified here

- Resizing a mask group or a member through resize handles: `.card .handle` is hidden by a global rule (`display: none !important`, style.css line 1207), so the handle path couldn't be exercised; moving, tilting and re-rendering keep the clip, which is the same code path.
- The actual Export as image of a mask group (native only in the Mac app; the plan was checked), and the Windows build.
- The right-click on a line's label pill itself (element not located by class; the line menu opens from the line in every other way).
