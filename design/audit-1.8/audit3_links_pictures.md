# 1.8 audit, third pass · links and pictures

Oct 27 2026, web build at http://localhost:4130/index.html?web in Playwright WebKit (1500×950), real clicks, drags, pastes and keys; visibility asserted from computed style and `elementFromPoint`. No page errors in any run.

## Blockers

None.

## Should fix

1. **Crop chip on a masked picture can't be clicked.** Drop a picture, draw a circle over it, Mask ▸ use the circle. Hover the picture: both chips show (pull colors on the left, ⤢ Crop on the right). Click ⤢ Crop: nothing happens. `elementFromPoint` at the chip's centre returns the `.mkw` mask wrapper, which sits over the chip (the pull-colors chip *is* reachable, so the two chips stack differently). The menu route works: double-click into the group, right-click → Adjust the crop opens framing, and dragging there reframes without moving the card. Fix: let the chips sit above `.mkw` (z-index on `.card .chip, .card .bx-fr`) or give the wrapper `pointer-events: none` with the frame/body opting back in.

2. **Bare-address detection is a little too eager.** Pasting `file.psd` or `hello.world` (and quick-capturing them) makes a link card to `https://file.psd` / `https://hello.world`, with a screenshot request fired at a dead host. `v1.2.3` is correctly a note. The regex accepts any `word.word` where the last part is two or more letters. Suggest: skip common file extensions (psd, png, jpg, gif, pdf, fig, sketch, zip, mov, mp4, txt, md…) or require a known TLD list for the short cases. Low risk, two-line change in `asLink`.

3. **"Save 2 pictures as PNG…" gives both files the same name.** Two dropped pictures, both selected, right-click → Save 2 pictures as PNG… produced two downloads both called `Picture.png` (the browser then relies on its own "(1)" renaming; in the Mac app two Save panels both propose "Picture"). Number them (`Picture 1.png`, `Picture 2.png`) or use the picture's tag/title when it has one.

## Minor

- **Layers names an ellipse mask "shape mask" / "shape · mask".** A circle mask reads "Circle mask"; an ellipse falls through `shapeWord` to "shape". Add ellipse (and any other shapes missing from the word list).
- **Web screenshot thumb is blank for a while.** The service (`s.wordpress.com/mshots`) returns a placeholder until it has rendered the page; the card re-looks at 7, 16 and 32 s with a fresh cache-buster. In an 8.5 s observation the thumb was still white. Expected for the web/Windows path, but worth a one-line note in What's new ("…fills in after a moment"). The Mac app renders its own and was verified separately (crisp JPEGs in ~2 s).
- **Dragging a placeholder from the pane onto a photo** could not be verified with a synthetic drag (`DataTransfer.getData('mb/ph')` is empty on a synthetic drop in WebKit). The underlying function (`placeholderOnto`) works: the photo becomes "a portrait" spot and undo restores the photo. Try the real drag once on the Mac.
- **Remove the background** entry points are present (picture menu `Remove the background`, selection bar, and on a cut-out `Put the background back`) but were not clicked in the web build, since that fetches the 40 MB model. Mac-only check.

## Verified OK

Links
- Paste: full URL, `jessa.art` → `https://jessa.art`, `mochiboard.app/updates`, `www.apple.com`, upper-case `HTTP://EXAMPLE.COM` all make link cards; sentences make notes; `v1.2.3` is a note.
- ⌘K quick capture: `jessa.art` and a full URL land in Unsorted as link cards with a screenshot thumb (h 210); a sentence becomes a note; tray rows visible.
- Link tool (toolbar `L`): click the board → a link card with its own input, focused; `jessa.art/snoot.html` + Enter → `https://…`, shot, h 210, title; Escape on an empty one removes the card. (The old `#linkbox` prompt is dead code, never shown.)
- Link card: `compact` off once the shot is in, thumb ~190 px tall at h 210, `shot` class set, MSHOTS URL carries a cache-buster.
- Change the link (selection bar): clears url/image/shot, h back to 52, input visible; the new address gets its own shot, the old one never sticks; a second quick change doesn't get a stale re-look (checked after 8.5 s).
- Open the link calls `MB.openURL` with the url.
- Spotify links still make Spotify cards (title and art filled).
- Undo removes a pasted link; redo brings it back.
- `MB.linkShot` missing or throwing: no errors, the service fallback still applies a shot.
- A link can be masked by a shape (`__maskWithShape`): grouped with the mask, thumb still visible, Layers shows "shape mask / jessa.art / shape · mask"; export plan builds for a link card and for the mask group; a link sits above a section it's in.
- Unmask keeps the pair as a plain group with the shape no longer a mask layer ("Turn the mask back into a shape"), same for pictures. Matches Figma; noting it in case she expects the group to dissolve.
- Dark mode: title `rgb(236,232,240)`, description soft grey, card background transparent over the dark card chrome.

Pictures
- Drop: 600×400 PNG → 260×189 with the frame, corner 20 (`.body` border-radius 20px). Paste from the clipboard adds a picture.
- Chips: pull colors and ⤢ Crop visible on hover; chip font 12 px at 260 wide → 28.5 px at 620 wide; with the real resize handle, at 129 px wide mid-drag both chips are hidden and `tiny` is on; growing back past 140 mid-drag brings them back.
- Crop chip opens framing (bar with Reset / Done); drag inside moves `fx` without moving the card; scroll zooms (`fz` 1.06); Reset clears; Done closes; Esc closes.
- Corners 0 → `.body` 0px. On a cut-out the Corners control is hidden and the stroke caption says "outline".
- Stroke 8 from the bar: `--skw: 8px`, the body gets an 8 px mat (padding) in the card colour; on a cut-out it becomes a drop-shadow outline stack on the image.
- Shadow sheet: opens from the bar, Add / None / Soft / Medium / Strong / Hard, 5 sliders; Add sets `medium` and the frame draws the shadow (`data-sh` on the card); Strong preset applies; the first slider at max updates x/blur in the data; Clear removes it. Picture + shape selection shows Shadow and Add sets both; picture + note shows no Shadow (notes aren't shadowable: by design).
- Settings → Board: Picture borders, Pull colors button, Rounded corners on new pictures, Image hints on board are all under the Pictures heading; pull colors off → `body.no-pull`, chip hidden; rounded off → new picture `radius 0`, `.body` 0px.
- Picture menu (right-click): Upload, Ask Mochi, Adjust the crop, Save as PNG/JPEG, Remove the background, Mask ▸, Arrange ▸ (Bring to front / forward / backward / Send to back), Duplicate, Delete. Save as PNG downloads `Picture.png`; Duplicate adds one; Delete removes; undo after Delete restores; Upload opens the file chooser.
- Multi-select menu: Group, Create section, Mask, Arrange, Export as image/PDF, Save each as its own image, Save 2 pictures as PNG…/JPEG…, Duplicate, Delete; Save 2 pictures gives two downloads.
- Placeholders: nine buttons visible in Wireframing; clicking Landscape adds "a landscape" spot (300×225) with its scene drawn; `placeholderOnto` turns a photo into a spot and undo restores the photo.
- Pictures in a mask group: masked by a circle (group + mask layer + `.mkw`), Adjust the crop works from the menu, export plan builds, pull-colors chip still reachable.

Scripts: scratchpad `audit3_links.py`, `audit3_pics.py`, `audit3_pics2.py`, `audit3_pics3.py`, `audit3_pics4.py`.
