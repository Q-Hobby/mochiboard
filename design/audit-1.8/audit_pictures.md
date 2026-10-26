# 1.8 picture features · audit (Oct 26 2026)

Tested in the web build (`localhost:4130/index.html?web`) with Playwright WebKit, real mouse/keyboard where it mattered, judged by what is on screen. Screenshots in `audit_shots/`. Nothing was changed.

## 1 · Bugs

### Should fix before release

**B1 · Mask ▸ on an already-masked picture leaves the old mask shape visible inside the group.**
Repro: picture → right-click → Mask ▸ Heart. Right-click the picture again → Mask ▸ Circle.
What happens: the circle becomes the mask, the heart loses its mask flag and stays in the group as an ordinary pink heart drawn over the picture (and is itself clipped by the circle). Remove mask / undo then has to deal with two shapes. `audit_shots/G_remask.png`.
Expected: the new shape replaces the old mask (old mask layer removed), or the picker is disabled with a "change the mask by editing the shape" hint.

**B2 · "Remove mask" is missing from a masked picture's right-click menu.**
Repro: mask a picture any way, right-click the picture alone.
What happens: the menu has Mask ▸ but no Remove mask (the entry is gated on the old `c.mask` field, not on being a mask-group member). The only way out is to select the whole group and use the board menu, or Layers.
Expected: Remove mask in the picture menu whenever the picture is masked.

**B3 · Dark mode: the Drop shadow sheet is unreadable.**
Repro: turn on dark mode, select a picture, open Shadow.
What happens: number boxes, the hex field, the "Start from" presets and the Clear button are light text (236,232,240) on light boxes (244,240,245). `audit_shots/C_dark_shadow.png`. Light mode is fine.

**B4 · Dark mode: the picture mat ignores the Stroke colour.**
Repro: dark mode, picture with Stroke width 24, colour white (the default dot shows white).
What happens: the mat draws dark grey (50,45,56) because the dark theme overrides the frame background. `audit_shots/F_dark_mat.png`. Pick pink in the dropdown and it still shows grey. Either honour the colour or show the real one in the dropdown.

### Minor

**B5 · Stroke width has no ceiling when typed.** Type 999 in the Stroke number box → sw 999, the card grows to 2242px wide. Range is 0–24; clamp the typed value the same way. (-5 clamps to 0 correctly.)

**B6 · Shadow "Add" with a mixed selection does nothing for the picture without one.** Select a picture with a shadow and one without → Shadow → the sheet shows the first one's values and Add is gone; the second never gets a shadow. Expected: Add shows when any selected card lacks a shadow, and applies to those.

**B7 · Chips outgrow tiny pictures.** On a 60×48 picture the "pull colors ✦" chip and the Crop chip overlap each other and spill outside the card (`audit_shots/B_tiny_chips.png`). Hide the chips under ~140px wide, or show one small "⋯" chip.

**B8 · Dropping a library placeholder onto a photo turns it into a plain grey picture, not a placeholder.** The picture's src becomes the scene PNG: no label pill, "pull colors" chip appears on a placeholder, and the scene can't be swapped by label later. Expected: it becomes a placeholder spot (or keep the photo and just say it only works on spots).

**B9 · Label → scene misses a few obvious words.** "Album cover" → landscape instead of music. Worth a pass over the synonym list (album, cover, song, podcast → music; logo, icon → product/any; screenshot → photo).

**B10 · Hover tip only shows on wireframe spots.** Hover a picture card: no "Right-click to crop or swap the picture"; hover a spot: shows. Either show it on both or on neither (the setting is called "Image hints").

**B11 · Duplicate on a masked picture yields an unmasked copy with a fresh one-member group.** Harmless visually, but the copy shows as a group of one. Duplicating the whole mask group works and stays masked. Suggest: Duplicate from a masked picture duplicates its mask group.

**B12 · Far zoom keeps cut-out filters.** At zoom .3 (`stage.far`) picture shadows switch off as designed, but cut-out outlines/shadows (filter drop-shadow ×8) stay on. Only a performance thing with many cut-outs.

**B13 · Esc during crop silently throws the crop away.** The bar offers Reset and Done; Esc reverts to the previous crop with no word about it. Fine as "cancel", but the bar should say "Esc to cancel", or Esc should keep (= Done).

### Watch (seen once, could not pin down)

- **Remove the background on a spot in the web build** takes 20–40 s on a fresh load (40 MB model, single-threaded WASM). It completed in later runs; in one run the spot's right-click menu showed the board menu right after. Worth one manual try on the Mac (Vision path) and in the browser demo. The busy shimmer does show.

## 2 · UX recommendations (in priority order)

1. **Make the picture menu complete for masks.** Add "Remove mask", and when a picture is masked show the shape name ("Masked with a heart"), so people know why Corners/Stroke vanished from the bar. (B1, B2)
2. **Dark mode pass on every new sheet.** Shadow sheet, Stroke pop, Corners pop, the picture menu + flyout, chips. The menu and flyout look good in dark; the sheet doesn't. (B3, B4)
3. **Small-picture chips.** Below ~140px, hide the two chips and rely on the right-click menu; the tip already says right-click. (B7)
4. **Say what Stroke means on a picture.** In the Stroke pop for pictures, a one-line caption ("the picture's border; 0 is none") avoids the "where's my border?" moment, since the row is shared with shapes.
5. **One hint rule.** Show the hover tip on pictures too, or drop it from spots; today it depends on which kind you hovered. (B10)
6. **Crop bar wording.** "Drag to reposition · scroll to zoom · Esc cancels". (B13)
7. **Placeholder drop on a photo.** Either convert the photo into a spot (keeps the label pill and the "fill the spot" behaviour) or refuse with a chirp. (B8)
8. **Clamp typed numbers** in Stroke (0–24) and Shadow (x/y ±200, blur 0–200, spread 0–60, opacity 0–100) so a typo can't blow a card up. (B5)
9. **Mixed selections.** Shadow Add when any lacks one; Corners already shows "–" for mixed, which is good; Stroke shows the first card's width with no "mixed" hint. (B6)
10. **Scene synonyms.** A few more words per scene; it is cheap and the labels are what people type. (B9)

## 3 · What held up

- Placeholders: click adds a 300×225 spot with the right scene; the art fills the spot at any size (300×225, 140×420), label pill stays; Hero/Avatar/Chart/Team/Map/Product map correctly; unknown labels get the plain scene.
- Drops: file on empty board → new picture; file on a picture → replaced, size kept; file on empty or filled spot → fills/replaces, box kept; placeholder onto spots → scene swapped; undo after each.
- Right-click menus on pictures, filled spots, empty spots and cut-outs show the right items; Mask ▸ and Arrange ▸ flyouts open on hover and click; multi-select shows the board menu with Group/Create section/Save each/Save N pictures; web exports say "works in the Mac app" without errors; Upload opens the file chooser and the chosen file replaces the picture; Ask Mochi on a spot takes the typed brief; Duplicate/Delete/undo work.
- Crop chip on hover and on select for pictures and spots (also inside a screen, a section and a group); chips scale with the card (53px → 156px wide); framing: wheel zooms, drag repositions, the card box never changes, Reset/Done work, right-click while framing still gives the menu, Backspace while framing does not delete the card, crop survives save + reload.
- Bar: Stroke/Corners/Shadow pops open and close on click; Shadow Add → Medium, sliders by mouse, typed numbers, hex (bad hex ignored), presets, Clear; Enter/Backspace inside the sheet's fields never leak to the board; Stroke width changes keep the picture in place (card grows/shrinks around it), 0 and None remove the mat; cut-out gets an 8-stroke outline; Corners hidden for cut-outs; mixed Corners show "–" and set both.
- Settings → Board → Pictures: all four toggles work, persist across reload, affect new pictures only; hints toggle hides the tip.
- Mask groups: masking a picture inside a group masks the whole group (consistent with "one mask per group"); undo restores; duplicating a whole mask group gives a masked copy.
- 60 shadowed pictures: select-all 0.3 s, nudge-all + save 0.1 s. Zoom 3× keeps the bar on screen. Remove background on a picture card in the web: 12 s first run, works.
