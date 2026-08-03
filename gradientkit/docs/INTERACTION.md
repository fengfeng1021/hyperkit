# GradientKit - INTERACTION

Written before any styling. Nothing in `style.css` may be authored until every state machine below
has a defined visual. If an interaction is not in this file, it does not ship.

Terminology used throughout:
- **Stage** = the WebGL2 canvas showing the current gradient or mesh.
- **Track** = the ruler strip under the Stage holding the color stops.
- **Rail** = a vertical column of panels (left rail = composition, right rail = measurement/output).
- **Notice** = the achromatic inline message bar. There are no toasts and no modals in this product.

---

## 1. Core loop

### 1.1 What is on screen at t=0

No marketing hero. No "get started". The first viewport is the instrument, already running, with a
real gradient loaded (`Deep Field`, the default specimen). Reading order, top to bottom:

1. **Bar** (48px): wordmark `GradientKit`, then a single sentence in `--fg-muted`:
   *"Perceptually even gradients, measured."* Then, right-aligned: mode toggle (Gradient / Mesh),
   `Load reference set`, `Copy link`, `Reset`.
2. **Stage** fills the remaining height minus the Track and the Bar. It is showing the default
   gradient rendered in OKLCH, with grain off and dither on.
3. **Track** (56px) directly under the Stage: 3 stop handles sitting on a ruler with ticks at every
   10% and numerals at 0 / 25 / 50 / 75 / 100.
4. **Left rail** (280px): gradient type, angle dial, interpolation space, stop list with numeric
   position and color per row.
5. **Right rail** (320px): tabbed. `CSS` is the open tab, showing live output that already includes
   the `@supports` block.

The user can therefore read the entire product proposition without clicking: a gradient, a space
selector, and the CSS it produces.

### 1.2 First action

The designed first action is **pressing Space**, or clicking the `sRGB / OKLCH` compare control in
the left rail. Both run the signature sweep (Section 6). Discovery path for that action, in priority
order:

- The interpolation-space control is the only element in the left rail with a 1px white bounding
  hairline at full opacity; everything else is at 0.14 alpha. It is the brightest interactive
  affordance on the page.
- Under it, one line of body copy: *"Two colors. Four ways to get from one to the other."*
- On first visit only (no `localStorage` key `gk.seen`), 900ms after fonts settle, the control's
  hairline runs one 700ms luminance pulse from 0.14 → 1.0 → 0.42 alpha. One pulse. Never repeats,
  never loops, suppressed under `prefers-reduced-motion`.

### 1.3 What they get

The sweep. A 1px white line crosses the Stage over 2.4s; behind it the gradient is OKLCH, ahead of
it the gradient is sRGB, and the boundary is a hard visible seam. It stops at the computed worst
point, brackets it, prints the real chroma deficit, and then releases. See Section 6 for the frame
by frame spec.

After it completes, the CSS panel's changed lines wipe-highlight left to right, so the user
understands that the thing they just watched is the thing in their clipboard.

### 1.4 Why they come back or share

**Share:** the Copy link action puts a hash URL on the clipboard. That link is not a screenshot, it
is the editable document. A designer sends it to an engineer; the engineer opens it and the exact
gradient is there, editable, with the CSS already generated. This is the loop that makes the tool
spread inside a company.

**Return:** because the CSS output pastes into production without editing. That is a weekly need for
anyone building marketing pages. The saved library (localStorage) turns the second visit into a
30-second visit.

---

## 2. Information architecture

### 2.1 First viewport (100dvh, no scroll needed to use the tool)

```
+--------------------------------------------------------------------------+
| BAR  GradientKit   Perceptually even gradients, measured.  [G|M] [set] [link] [reset] |
+------------------+-----------------------------------+-------------------+
| LEFT RAIL 280px  |  STAGE (WebGL2)                   | RIGHT RAIL 320px  |
|                  |                                   |                   |
| Type   L R C     |                                   | CSS SVG TW PNG    |
| Angle  [dial]    |                                   | ----------------- |
|                  |                                   | code output       |
| Space            |                                   |                   |
|  sRGB  HSL       |                                   | ----------------- |
|  OKLab OKLCH     |                                   | Contrast probe    |
|                  |                                   | ----------------- |
| Stops            |                                   | Vision            |
|  #0B1026  0.00   +-----------------------------------+ ----------------- |
|  #1B2A6B  42.00  | TRACK   |----|----|----|----|----|| Grain and dither  |
|  #6E8BFF 100.00  |    0   25   50   75  100         || ----------------- |
+------------------+-----------------------------------+-------------------+
```

Rails are separated from the Stage by a single 1px hairline. No cards, no panel backgrounds, no
radius above 2px, no shadows on any static surface.

### 2.2 Below the fold, in order

| Section | Layout family | Job |
|---|---|---|
| **B. Four spaces, same two colors** | Four stacked full-width bands, each 88px tall, labelled at the left edge, with a computed chroma-deficit number at the right edge | The teaching artifact. Screenshot-ready with no caption. |
| **C. Reference set** | Horizontal scroll-snap shelf, 168x112 tiles | 12 gradient specimens + 3 mesh fields, each a one-click load |
| **D. Output reference** | Two-column prose plus a support table | What each export target produces, which browsers need the fallback, licence and credits, link back to the hub |

Four distinct layout families across four sections. No zigzag, no repeated family, no card grids.

### 2.3 Breakpoints

- **>= 1280px:** as drawn above. Stage minimum 620x420.
- **768px - 1279px:** left rail stays at 280px, right rail collapses to a bottom drawer with the
  same tab set, pinned to the viewport bottom at 220px tall, resizable by dragging its top hairline
  (min 140, max 60dvh). Stage takes the remainder.
- **< 768px:** single column. Bar (44px) → Stage (52dvh) → Track (48px) → one segmented control with
  four tabs `Stops / Space / Output / Measure`, the active panel filling the rest. Left and right
  rails no longer exist as columns; their panels are redistributed into those four tabs. All
  sections B, C, D stack to full width. The shelf in C stays horizontally scrollable.
- The Stage never drops below 240px tall at any width.

---

## 3. State machines

Every interactive object. Format: state → what it looks like → what enters it → what leaves it.

Shared conventions:
- **Focus ring**, global and identical everywhere: `2px solid #FFFFFF` outline, `2px` offset, plus a
  `1px` black inner ring so it survives on top of any user gradient. Never a color. Never a glow.
- **Disabled** everywhere: foreground drops to `--fg-disabled`, hairline drops to 0.08 alpha,
  `cursor: not-allowed`, `aria-disabled="true"`. Disabled controls stay focusable so a keyboard user
  can read the reason, which is always exposed via `aria-describedby` pointing at a live sentence.
- **Nothing anywhere uses hue to signal state.** State is luminance, hairline weight, fill inversion.

### 3.1 Stop handle (Track)

12px wide x 22px tall, 2px radius, filled with the stop's own color, 1px white ring at 0.42 alpha.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | ring 0.42 alpha, no lift | default | pointer enters, focus |
| hover | ring → 1.0 alpha, handle scales to 1.08 on Y only (grows upward, 160ms `--ease-out`), position readout appears above it in Fragment Mono 11px | `pointerenter` | `pointerleave` |
| focus | focus ring as above, plus the readout is permanently visible | `focus` via Tab or arrow navigation | `blur` |
| active (dragging) | scale 1.14, `--shadow-lift` applied (this is the only element that ever gets a shadow), the Track's ruler numerals fade to 0.3 so the dragged value dominates, a 1px vertical white line drops from the handle across the full Stage height | `pointerdown` + `setPointerCapture` | `pointerup` / `pointercancel` |
| success | after drop, the handle plays one 220ms settle: scaleY 1.14 → 0.96 → 1.0, `back.out(2)` | `pointerup` | auto after 220ms |
| error | not applicable. Position is clamped to [0,100] and to not cross neighbours; there is no invalid drop. | | |
| disabled | only when exactly 2 stops remain, and only for the delete affordance, not the handle itself | stop count == 2 | stop count > 2 |
| empty | not applicable. Minimum 2 stops always. | | |
| loading | not applicable. | | |

Drag mechanics: GSAP `Draggable` with `type: "x"`, `bounds` = the Track, `liveSnap: false`,
`inertia: false` (a precision instrument does not throw). Holding **Shift** during drag snaps to 1%
increments; holding **Alt** while pressing on an existing handle duplicates that stop at the pointer.
**Esc** during a drag aborts and returns the stop to its pre-drag position.

### 3.2 Track background (empty area between stops)

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | ruler ticks at `--fg-tick`, numerals at `--fg-muted` | default | pointer enters |
| hover | a ghost handle at 0.3 alpha follows the pointer x, and the position it would take appears in Fragment Mono | `pointermove` over track, not over a handle | `pointerleave` |
| active | click inserts a stop at that position, colored by sampling the current gradient at that exact t, so the visual does not change at the moment of insertion; the new handle plays the 220ms settle and takes focus | `click` | immediate |

That "insert does not change the picture" behaviour is deliberate: adding a control point must never
destroy work.

### 3.3 Color popover

Opened by clicking a stop handle's swatch in the left rail list, by pressing Enter on a focused
handle, or by double-clicking a handle.

Anchored to the trigger, 260px wide, 1px hairline border, `--surface-1` background, `--shadow-lift`.
Not a modal: the page behind stays interactive, no scrim, no focus trap that cannot be escaped.
Focus is *moved into* it and **Esc** returns focus to the trigger.

Contents, in order: hex field, three numeric fields `L` `C` `H` in Fragment Mono with 1px slider
rails beneath each, a gamut line, and (feature-detected only) an eyedropper button.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | as above | open | Esc, outside click, trigger re-click |
| hover (on a slider rail) | rail thickens 1px → 2px | pointerenter | pointerleave |
| focus (a numeric field) | focus ring on the field, its rail thickens, and the field's text selects entirely | Tab / click | blur |
| active (scrubbing a rail) | thumb scales 1.2, value updates every frame, Stage re-renders every frame | pointerdown | pointerup |
| loading | not applicable | | |
| success | on a valid commit, the field's underline runs one 180ms left-to-right wipe at full white then settles to 0.42 | `change` with valid value | auto |
| error | field text stays exactly as typed, underline becomes `2px dashed #FFFFFF`, and a sentence appears below: *"Not a color. Try `#3A5BFF` or `oklch(62% 0.21 264)`."* The Stage does not update. | invalid parse on `input` debounce 300ms or on `blur` | valid input, or Esc which reverts to the last committed value |
| out-of-gamut (an information state, not an error) | a 1px white bracket draws to the right of the L/C/H triple and a line reads *"Chroma reduced to 0.187 for sRGB. Delta E 0.019."* with real computed numbers | the requested OKLCH is outside sRGB | in-gamut value |
| disabled | never | | |

**Eyedropper:** the button only renders if `'EyeDropper' in window`. There is no broken button on
Safari or Firefox. If the API exists but the user cancels the pick, nothing happens and no message
is shown (cancelling is not an error).

### 3.4 Interpolation space control (the primary control)

Four options: `sRGB` `HSL` `OKLab` `OKLCH`. Rendered as a 2x2 grid of 1px-outlined cells, not a
segmented pill, so all four are visible simultaneously and none is hidden behind a dropdown.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle (unselected) | 1px hairline 0.14, label `--fg-secondary` | default | hover/focus |
| hover | hairline → 0.42, label → `--fg-primary`, and the Stage shows a 12% opacity preview overlay of what that space would produce | pointerenter | pointerleave, and the overlay fades out over 160ms |
| focus | focus ring | Tab / arrows within the group | blur |
| selected | filled `#FFFFFF`, label inverted to `--surface-0`. This is the only filled-white surface in the chrome. | click / Enter / Space | another option selected |
| active | scale 0.98 for 90ms | pointerdown | pointerup |
| transitioning | while the sweep runs, the whole group is `aria-busy="true"`, the outgoing and incoming cells both show a half-fill that tracks the sweep progress | sweep starts | sweep completes |
| disabled | `HSL` and `sRGB` are never disabled. In Mesh mode, `HSL` is disabled with the reason *"Mesh fields blend in a rectangular space. HSL has no rectangular form."* | mode == mesh | mode == gradient |

The group is a real radiogroup: `role="radiogroup"`, arrow keys move selection, Tab enters and
leaves as one stop.

### 3.5 Numeric field (used for position, angle, L, C, H, grain, size, export dimensions)

Fragment Mono, right-aligned, fixed decimal places per field so digits do not jitter.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | value in `--fg-primary`, 1px bottom hairline 0.14 | default | |
| hover | hairline 0.42, and the *label* becomes a horizontal scrub target (`cursor: ew-resize`) | pointerenter | pointerleave |
| focus | focus ring, full text selected, hairline 1.0 | click / Tab | blur |
| active (scrubbing the label) | body gets `cursor: ew-resize`, pointer is captured, 1px moves the value by one step, Shift multiplies step by 10, Alt divides by 10 | pointerdown on label | pointerup |
| success | commit runs the 180ms underline wipe | Enter or blur with a valid value | |
| error | value stays as typed, dashed underline, message below naming the accepted range, e.g. *"Position is 0 to 100."* | out of range or unparseable | valid value, or Esc to revert |
| disabled | angle field is disabled when type is `radial`, with reason *"Radial gradients use a center and a radius, not an angle."* | type == radial | type != radial |

Keys inside a focused field: `↑ / ↓` step, `Shift+↑ / ↓` step x10, `Home / End` min / max,
`Enter` commit and keep focus, `Esc` revert and keep focus, `Tab` commit and move on.

### 3.6 Stage (canvas)

One tab stop. Inside it, `[` and `]` cycle the active mesh point (mesh mode) or the active stop
(gradient mode).

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | the gradient, full bleed, no overlay | default | |
| hover | a 1px crosshair follows the pointer and a Fragment Mono readout in the top-right corner shows the sampled color under the cursor as `#RRGGBB` and `oklch(L C H)` | pointermove | pointerleave, readout fades 160ms |
| focus | 2px white inset ring drawn *inside* the canvas bounds so it is never clipped | Tab | blur |
| active (dragging a mesh point) | the dragged point's ring goes to 1.0 alpha, its influence radius draws as a 1px dashed circle, and the other points drop to 0.3 | pointerdown on a point | pointerup |
| loading | shader compile only. Under 120ms: nothing. Over 120ms: a 1px white hairline grows from left edge to right over the Stage's top edge, `ease: "none"` because it is a real progress measure. | shader compile start | compile end |
| error | shader compile failure or context loss: the Stage renders the Canvas2D fallback immediately, and a Notice appears above the Track. Never a black rectangle. | `webglcontextlost`, or `getProgramParameter` false | fallback renders |
| empty | not applicable. The Stage always has a gradient. | | |
| disabled | never | | |

### 3.7 Output tabs and code block

Tabs: `CSS` `SVG` `Tailwind` `PNG`. Real `role="tablist"`, arrow keys switch, `Home`/`End` jump.

Code block: Fragment Mono 12.5px / 1.55, line numbers in `--fg-tick`, `tabindex="0"` so it is
keyboard-scrollable and readable by screen readers as a `<pre>`.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | code, and a `Copy` button at the top right of the block | default | |
| hover (block) | the block's left gutter hairline goes 0.14 → 0.42 | pointerenter | pointerleave |
| focus (Copy) | focus ring | Tab | blur |
| active (Copy) | scale 0.98 for 90ms | pointerdown | pointerup |
| success | button label swaps to `Copied` with the check icon, for 1600ms, then swaps back. The swap is a 120ms crossfade, not a layout shift: both labels occupy the same fixed 84px width. | successful `navigator.clipboard.writeText` | 1600ms timer |
| error | button label swaps to `Select and copy`, the code block's text is programmatically selected, and a Notice reads *"The browser blocked clipboard access. The code is selected, press Ctrl+C."* | clipboard promise rejects, or `navigator.clipboard` missing (insecure context) | user dismisses |
| loading | only on the `PNG` tab. `Export 4096px` becomes `Rendering 4096px`, disabled, with a 1px determinate progress hairline under it driven by the actual tile count. | export starts | export ends |
| changed | when the underlying gradient changes, the changed lines run one 420ms left-to-right wipe highlight. The highlight fill is **the gradient's own mid color at 22% alpha**, never green. | any state change | auto |
| empty | not applicable | | |

### 3.8 Contrast probe

A text input, a size stepper, a weight toggle, and a live readout.

| State | Visual | Enter | Leave |
|---|---|---|---|
| empty | The probe overlay on the Stage shows a 1px baseline rule and one line of instruction under the input: *"Type sample text to measure it against the gradient."* The readout area shows `--.--` in Fragment Mono at `--fg-disabled`. This is a composed empty state, not a blank. | no text entered | first character typed |
| idle | text is drawn on the Stage at the chosen size/weight, readout shows `4.72:1` plus `PASS AA` or `FAIL AA` in words, plus the position of the worst point as `worst at 61.4%` | text present | |
| hover (readout) | the worst point's marker on the Stage grows from 6px to 10px | pointerenter | pointerleave |
| focus (input) | focus ring; the sample text on the Stage gets a 1px white boundary box so the user can see its extent | focus | blur |
| active (dragging the sample text on the Stage) | the text follows the pointer, the readout recomputes every frame | pointerdown on the sample text | pointerup |
| success | when a change moves the ratio from failing to passing, the readout's number runs a single 260ms counter tween to the new value and the word `PASS AA` wipes in left to right | ratio crosses 4.5 (or 3.0 for large) | |
| error | not applicable. A failing ratio is information, not an error, and is shown in the same neutral treatment as a passing one, distinguished by the word and by weight, never by color. | | |
| disabled | never | | |

### 3.9 Vision simulation

Four thumbnails: `Normal` `Protanopia` `Deuteranopia` `Tritanopia`, each 68x44.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | four live thumbnails, each rendering the current gradient through its matrix | default | |
| hover | that thumbnail's 1px frame goes to 1.0 and its name appears below | pointerenter | pointerleave |
| focus | focus ring | Tab, arrows within the group | blur |
| selected | the Stage itself renders through that matrix, the thumbnail is framed at 2px white, and a persistent Notice sits above the Track: *"Stage is simulating deuteranopia. Exports are unaffected."* | click | selecting `Normal` |
| disabled | never | | |

The wording "Exports are unaffected" is load-bearing. Without it a user will believe they are about
to export a simulated image.

### 3.10 Grain and dither

Amplitude slider (0-100), grain size stepper (1-8 device pixels), dither toggle, and an 8x loupe
showing actual pixels from the Stage so the user can see the dither pattern at 1:1.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | controls, loupe live | default | |
| hover (loupe) | loupe follows the pointer position over the Stage instead of its default sample point | pointerenter on Stage while the grain panel is open | pointerleave |
| active (slider) | Stage regrains every frame; the loupe updates every frame | pointerdown | pointerup |
| off (amplitude 0) | the loupe shows the ungrained gradient and one line reads *"Grain off. 8-bit banding is visible in the loupe at this amplitude."* only when the current gradient actually bands (computed: any adjacent 1px column pair differing by exactly 1 in any channel over a run longer than 24px) | amplitude == 0 and banding detected | amplitude > 0 |
| disabled | never | | |

### 3.11 Saved library

`localStorage` key `gk.saved.v1`, an array of hash strings plus name and timestamp.

| State | Visual | Enter | Leave |
|---|---|---|---|
| empty | A composed panel, not a blank: a 1px-drawn spectral scale (the same ruler language as the Track) sits above the sentence *"Nothing saved on this device yet."*, then the primary action `Save current gradient`, then the secondary `Load reference set`. | no entries | first save |
| idle | rows of 40x24 thumbnails, name, and relative time in Fragment Mono | entries exist | |
| hover (row) | row's hairline 0.14 → 0.42, and a `Delete` affordance fades in at the right, occupying reserved space so nothing shifts | pointerenter | pointerleave |
| focus (row) | focus ring on the whole row | Tab | blur |
| active | click loads that gradient into the workbench; the Stage cross-dissolves over 320ms | click / Enter | |
| success | after a save, the new row inserts at the top with a 260ms height-and-alpha entrance, and a Notice reads *"Saved to this browser only."* | save completes | 3200ms |
| error | quota exceeded: Notice reads *"This browser's storage is full. Delete a saved gradient to make room."* and the oldest row is marked with a 2px left hairline. `Save` becomes disabled until a delete happens. | `QuotaExceededError` | successful delete |
| disabled | `Save` is disabled when the current gradient is byte-identical to an already-saved one, with reason *"Already saved."* | duplicate hash | state changes |

### 3.12 Extract from image

The Stage is a drop target for image files.

| State | Visual | Enter | Leave |
|---|---|---|---|
| idle | no visible drop affordance (the Stage is not a dropzone-looking box; a 1px dashed border would be noise 99% of the time) | default | dragenter |
| dragover | a 2px white inset frame draws inside the Stage and a centered line reads *"Drop an image to pull four stops from it."* | `dragenter` with `types` containing `Files` | `dragleave` / `drop` |
| loading | the frame stays, the line becomes *"Reading image."*, and a 1px determinate hairline tracks decode + quantize progress | `drop` | done |
| success | the Stage cross-dissolves to the new 4-stop gradient over 420ms, the Track's new handles each settle in with a 40ms stagger, and a Notice reads *"Four stops pulled from `filename.jpg`. Undo with Ctrl+Z."* | quantize completes | 4000ms or dismiss |
| error (wrong type) | Notice: *"That file is not an image. PNG, JPEG, WebP, GIF, or AVIF."* | `file.type` does not start with `image/` | dismiss |
| error (too large) | Notice: *"That image is over 25 MB. Export a smaller version and drop it again."* Refused before decode, so we never blow up memory. | `file.size > 26214400` | dismiss |
| error (decode failed) | Notice: *"The browser could not decode that image. Try re-saving it as PNG."* | `createImageBitmap` rejects | dismiss |
| disabled | never | | |

Quantization: downscale to 128px on the long edge, convert to OKLab, median-cut to 4 buckets, take
each bucket's OKLab mean, sort by `L`, place at 0 / 33.3 / 66.6 / 100. Real computation, no library.

### 3.13 Notice (the only messaging surface)

1px hairline bar directly above the Track, full width of the Stage column, 36px tall. Icon (16px,
from the authored icon set), one sentence, optional one action, and a close affordance.

| State | Visual | Enter | Leave |
|---|---|---|---|
| entering | slides down from -36px and fades 0 → 1 over 260ms `--ease-out`; the Stage shrinks by 36px in the same tween so nothing is covered | any of the triggers above | |
| idle | as above | | |
| hover | hairline 0.14 → 0.42 | pointerenter | pointerleave |
| focus | the close affordance takes a focus ring | Tab | blur |
| leaving | fades and collapses over 200ms | dismiss click, Esc while focused, or its auto-timer | |
| stacked | maximum one Notice at a time. A new Notice replaces the current one with a 120ms crossfade, no stacking, no queue. | new trigger while one is showing | |

Every Notice is announced through a single `aria-live="polite"` region. Failure-class Notices use
`aria-live="assertive"` and `role="alert"`.

### 3.14 Buttons (Load reference set, Copy link, Reset, Save, Export)

| State | Visual |
|---|---|
| idle | 1px hairline 0.42, label `--fg-primary`, height 32px, radius 2px, padding 0 14px |
| hover | hairline 1.0, background `rgba(255,255,255,0.06)` |
| focus | focus ring |
| active | `scale(0.98)` for 90ms, background `rgba(255,255,255,0.12)` |
| loading | label swaps to the present-participle form (`Rendering 4096px`), `aria-busy="true"`, disabled, 1px determinate hairline along the bottom edge |
| success | label swaps to the completed form (`Copied`, `Saved`, `Downloaded`) for 1600ms with the check icon; fixed-width label box so nothing reflows |
| error | label reverts to idle, a Notice carries the message. Buttons never turn red. |
| disabled | `--fg-disabled`, hairline 0.08, reason exposed via `aria-describedby` |

`Reset` is the only destructive action. It requires a second press within 3 seconds: first press
changes the label to `Press again to reset` and starts a 3s countdown drawn as a 1px hairline
draining right to left along the button's bottom edge. Esc or blur cancels. No confirmation modal.

---

## 4. Keyboard

### 4.1 Tab order

1. Skip link (`Skip to gradient controls`), visible only on focus, top-left.
2. Wordmark (link to `../index.html`, the hub).
3. Mode toggle (Gradient / Mesh) as a radiogroup, one stop.
4. `Load reference set` → `Copy link` → `Reset`.
5. Left rail: type radiogroup → angle field → space radiogroup → stop list (each row is one stop
   containing swatch button, position field, delete button).
6. Stage (one stop).
7. Track (one stop, roving tabindex across handles).
8. Right rail: tablist (one stop) → active tab panel contents in DOM order.
9. Section B controls, then Section C shelf (roving tabindex across tiles), then Section D links.
10. Back-to-hub link in the footer.

Rails are `<aside>` with accessible names; the Stage region is `<main>`. Landmarks are correct so a
screen-reader user can jump directly.

### 4.2 Global shortcuts

Suppressed whenever the active element is a text input or `contenteditable`.

| Key | Action |
|---|---|
| `Space` | Run the sweep: toggle between the current space and OKLCH, animated. This is the signature action. |
| `1` `2` `3` | Linear / Radial / Conic |
| `Q` `W` `E` `R` | sRGB / HSL / OKLab / OKLCH (instant, no sweep) |
| `M` | Toggle Gradient / Mesh mode |
| `G` | Toggle grain on/off (remembers the last non-zero amplitude) |
| `D` | Toggle dither |
| `C` | Cycle vision simulation: off → protanopia → deuteranopia → tritanopia → off |
| `T` | Focus the contrast probe input |
| `+` / `=` | Insert a stop at the midpoint of the widest gap |
| `-` | Delete the focused stop (no-op at 2 stops) |
| `Ctrl/Cmd + C` | Copy the active output tab's text (when focus is anywhere in the right rail) |
| `Ctrl/Cmd + S` | Save to the local library. `preventDefault` so the browser save dialog does not open. |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Undo / redo, 50-step history |
| `?` | Open the shortcut sheet |
| `Esc` | See below |

### 4.3 Esc behaviour, in priority order

1. If a drag is in progress → abort it, restore the pre-drag value.
2. Else if the shortcut sheet is open → close it, return focus to its opener.
3. Else if a color popover is open → close it, return focus to its trigger.
4. Else if a Notice is focused → dismiss it.
5. Else if a text field is focused and dirty → revert to the last committed value, keep focus.
6. Else if `Reset` is armed → disarm it.
7. Else → nothing. Esc never navigates away and never clears the user's work.

### 4.4 Shortcut sheet

Not a modal. A 320px panel that slides in from the right edge over 260ms, pushing nothing, with its
own close button and a heading. Page behind stays scrollable and interactive. Focus moves to the
panel heading on open; Tab cycles within it while it is open but Shift+Tab from the heading returns
to the page (a soft trap, not a hard one). Esc closes and restores focus.

### 4.5 Screen reader specifics

- The Stage has `role="img"` with an `aria-label` regenerated on every commit:
  *"Linear gradient at 135 degrees, interpolated in OKLCH, three stops: deep navy at 0 percent,
  indigo at 42 percent, periwinkle at 100 percent."* Color names come from a small authored
  name-lookup over the OKLCH hue wheel, not from raw hex.
- Stop handles are `role="slider"` with `aria-valuemin/max/now/text`, where `aria-valuetext` is
  *"42.0 percent, indigo"*.
- The contrast readout is inside `aria-live="polite"` and rate-limited to one announcement per
  800ms so scrubbing does not flood the buffer.
- Every icon-only button has a `<span class="sr-only">` label. No `title`-attribute-only labelling.

---

## 5. First visit, zero data

There is no blank state for the tool itself, and that is a deliberate product decision: an empty
gradient editor is useless and unphotographable. Three things are true on a first, cold visit with
no hash and no localStorage:

1. **The workbench is loaded with `Deep Field`**, a real authored specimen, rendered in OKLCH with
   dither on. The user sees a finished-looking artifact immediately.
2. **`Load reference set` is present in the Bar** as a persistent, always-available action. One
   click populates every panel at once: 12 gradient specimens and 3 mesh fields into the shelf, the
   workbench set to `Deep Field`, grain at amplitude 14 / size 2, dither on, the contrast probe
   filled with the sentence *"Shipping this on Friday"* at 32px/600, and Section C scrolled into
   view. This is the "load sample data" affordance required by the build standard, and it exists
   because a visitor with no file of their own must be able to reach a complete, populated result in
   one click.
3. **The genuinely empty surfaces are composed, not blank**, and each names its own filling action:
   - Saved library → spectral rule + *"Nothing saved on this device yet."* + `Save current gradient`
   - Contrast probe → baseline rule + *"Type sample text to measure it against the gradient."*
   - Undo history at depth 0 → the Undo button is disabled with the reason *"Nothing to undo yet."*

The `gk.seen` flag is set after the first sweep completes. Its only effect is suppressing the
one-time hairline pulse on the space control.

---

## 6. Signature moment: the sweep

One authored moment. Everything else in the product uses short functional transitions of 90-260ms.
This is the only thing over one second, and it exists because it is the product's entire argument.

### 6.1 Trigger

`Space`, or clicking a space option that is not the current one, or clicking the dedicated
`Compare` affordance. Re-triggering while it runs restarts it from 0 (`tl.restart()`), never queues.

### 6.2 Preparation, before any frame renders

Computed synchronously on trigger, all real numbers, none decorative:

1. Sample both interpolations at 256 evenly spaced `t` values.
2. For each `t`, convert both results to OKLCH and take chroma `C`.
3. `deficit(t) = 1 - (C_from / C_oklch)`, clamped to `[0, 1]`.
4. `tDead = argmax(deficit)`. `deficitPct = round(deficit(tDead) * 100)`.
5. If `max(deficit) < 0.06`, there is no meaningful dead zone (for example two near-neutral colors).
   The sweep then runs straight through with no pause and no bracket, and the label reads
   *"No chroma loss between these two. sRGB is fine here."* Honesty over theatre.

### 6.3 Uniforms

The shader holds `u_sweep` (0..1, the line's x position), `u_spaceA`, `u_spaceB` (integer space ids),
and `u_shake` (px offset applied to the seam only). GSAP tweens a **plain JS object**, and `onUpdate`
writes the uniforms. No DOM element is animated for the sweep itself. This is what keeps it at 60fps.

```js
const s = { x: 0, shake: 0 };
const tl = gsap.timeline({ onUpdate: () => renderer.setSweep(s.x, s.shake) });
```

### 6.4 Timeline

Total 2.4s of sweep travel plus about 0.6s of resolution, driven by a single GSAP timeline with
labels so the whole thing is seekable and reversible.

| Label | t (s) | What happens |
|---|---|---|
| `arm` | 0.00 | Space control enters `transitioning`. Stage's hover crosshair and readout hide. A 1px white line appears at x=0 at 0 alpha and fades in over 120ms. The seam label mounts above the Stage centre: `sRGB  <  |  >  OKLCH`, in Fragment Mono 11px, `--fg-muted`, at 0 alpha. |
| `travel-a` | 0.12 | `s.x: 0 → tDead`, `ease: "none"`. Linear is correct here and only here: this is a measuring instrument crossing a measured field, and any ease would imply the scan is not uniform. Duration is `2.4 * tDead` so the overall pace stays constant regardless of where the dead zone falls. Seam label fades to 1 over the first 240ms. |
| `bracket` | `0.12 + 2.4*tDead` | Travel stops. A 1px white dashed rectangle draws around the dead zone (its width is the span where `deficit > deficit(tDead) * 0.6`), drawn by animating `stroke-dashoffset` on an SVG rect over 180ms. Simultaneously `s.shake` runs `0 → 1.5 → -1.5 → 0.8 → 0` over 150ms, so the seam physically stutters. Under the bracket, a Fragment Mono line types in: `chroma -34% here` using the real computed `deficitPct`. |
| `hold` | +0.15 | Nothing moves. This pause is the entire point: it is where the user's eye lands on the difference. |
| `release` | +0.15 | The bracket's dashes rotate outward and its stroke fades to 0 over 200ms while the rect scales to 1.06. The label under it fades. |
| `travel-b` | `release` | `s.x: tDead → 1`, `ease: "none"`, duration `2.4 * (1 - tDead)`. |
| `land` | +0 | Seam line fades out over 180ms. Seam label fades out over 180ms. |
| `breathe` | `land` | The whole Stage scales `1 → 1.015 → 1`, 520ms, `ease: "power2.inOut"`. Transform only, on the canvas element, GPU-composited. This is the exhale that tells the user the operation is complete. |
| `code` | `land + 0.06` | In the right rail, the changed CSS lines run a left-to-right wipe highlight over 420ms via `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)` on an overlay div. **The wipe fill is the gradient's own mid color at 22% alpha, not green.** |
| `settle` | end | Space control leaves `transitioning`, `aria-busy` removed, and the live region announces *"Now interpolating in OKLCH. Chroma recovered 34 percent at 61 percent position."* |

### 6.5 Deviations from the portfolio brief, and why

The portfolio spec asks for a red dashed dead-zone box and a green code highlight. Both are refused,
because the pinned visual world forbids any hue in the chrome and that constraint is the product's
credibility.

- **Red box → white 1px dashed bracket** plus the seam stutter. The stutter carries the "something is
  wrong here" signal that red was carrying. Motion replaces hue.
- **Green highlight → the user's own gradient mid color at 22% alpha.** This is strictly better: the
  confirmation is literally made of the thing the user just made, and it stays inside the world.

Everything else in the brief's description is implemented as written.

### 6.6 Reduced motion

Under `prefers-reduced-motion: reduce`, inside `gsap.matchMedia()`, the sweep does not animate. The
seam lands instantly at 50%, the seam label and the bracket render immediately in their final state
with the real `deficitPct`, and **the seam becomes a draggable divider** the user can move with the
pointer or with arrow keys when focused. The full teaching value is preserved and the user controls
the pace. The live-region announcement is identical.

### 6.7 Performance budget

- Sweep must hold 60fps on a 1440x900 Stage on integrated graphics.
- The fragment shader evaluates both interpolations per pixel only within a 24px band around the
  seam; outside the band it takes a single branch. Verified by shrinking the band to 0 and
  confirming frame time drops.
- No `requestAnimationFrame` loop outside GSAP's ticker. One ticker for the whole app.
- The grain pass runs at most once per frame and is skipped entirely while `u_sweep` is animating if
  frame time exceeds 14ms for three consecutive frames (graceful degradation, restored on `settle`).

---

## 7. Failure paths, complete

| Failure | Detection | What the user sees | Recovery |
|---|---|---|---|
| WebGL2 unavailable | `canvas.getContext('webgl2')` returns null | Canvas2D path renders at once. Notice: *"Software renderer. The mesh preview is lower resolution. Exports are full resolution."* | None needed. Exports still use the CPU path at full size. |
| Shader compile fails | `getProgramParameter(p, LINK_STATUS)` false | Same Canvas2D fallback, same Notice wording | Same |
| WebGL context lost | `webglcontextlost` event | `preventDefault()`, Canvas2D takes over within one frame, Notice: *"The graphics context restarted. Your gradient is unchanged."* | Auto re-init on `webglcontextrestored`. After two losses in one session, stay on Canvas2D permanently and stop announcing. |
| Malformed URL hash | schema parse throws or version prefix unknown | Default gradient loads. Notice: *"That link could not be read, so the default gradient is loaded."* with action `Copy a working link`. | User keeps working. Never a blank canvas. |
| Hash from a newer version | version prefix > known | Parses every field it recognises, ignores the rest. Notice: *"Part of that link came from a newer version and was skipped."* | Everything recognised still loads. |
| Invalid color typed | parse fails after 300ms debounce | Field keeps typed text, dashed underline, inline sentence with two valid examples | Esc reverts, or type a valid value |
| Position out of range | value outside 0-100 | Inline sentence *"Position is 0 to 100."* | Clamp on commit, or Esc |
| Out-of-gamut OKLCH | `inGamut()` false after conversion | Not treated as an error. Bracket plus *"Chroma reduced to 0.187 for sRGB. Delta E 0.019."* | Informational. User may accept or lower C. |
| Clipboard blocked | promise rejects or API absent | Code auto-selected, Notice: *"The browser blocked clipboard access. The code is selected, press Ctrl+C."* | Manual copy works |
| localStorage full | `QuotaExceededError` | Notice: *"This browser's storage is full. Delete a saved gradient to make room."*, oldest row marked, `Save` disabled | Delete any row |
| localStorage unavailable (private mode / blocked) | write probe throws `SecurityError` | Library panel replaced by one sentence: *"This browser is blocking local storage, so saving is off. Share links still work."* Save controls hidden, not broken. | Share links are the alternative and are named as such |
| 4K PNG export fails | `toBlob` returns null, or allocation throws | Automatic retry at 2048px. Notice: *"The 4096px export was too large for this device, so a 2048px file was saved instead."* | File still downloads |
| Download blocked by popup rules | `a.click()` on a blob has no effect and `document.hasFocus()` is false | Notice with a real `<a download>` link the user can click directly | One extra click |
| Image drop, wrong type | `!file.type.startsWith('image/')` | *"That file is not an image. PNG, JPEG, WebP, GIF, or AVIF."* | Drop another |
| Image drop, over 25 MB | `file.size > 26214400` | *"That image is over 25 MB. Export a smaller version and drop it again."* Refused before decode. | Drop another |
| Image decode fails | `createImageBitmap` rejects | *"The browser could not decode that image. Try re-saving it as PNG."* | Drop another |
| Fonts fail to load | `document.fonts.ready` rejects or times out at 3s | Metric-matched fallback stack renders. Layout does not shift because the fallbacks are declared with `size-adjust`. No message: this is not the user's problem. | None |
| Offline (returning visitor) | `navigator.onLine === false` and GSAP script fails | The page still works: content is visible by default and every animation is progressive enhancement. The sweep degrades to the reduced-motion instant-split behaviour. Notice: *"Offline. Animations are off, everything else works."* | Reload when online |
| Two stops at the identical position | user drags one onto another | Allowed. It produces a hard stop, which is a legitimate gradient technique. The Track draws them as a single 2px-wide double handle and the readout says `hard stop at 42.0%`. | Not an error |
| Mesh with fewer than 3 points | user tries to delete the third | Delete disabled with reason *"A mesh field needs at least three points."* | Add a point first |

---

## 8. Motion inventory

Every animation in the product, with its one-sentence justification. Anything not on this list does
not get animated.

| Element | Motion | Justification |
|---|---|---|
| The sweep | Section 6 | Storytelling. It is the product's argument, rendered. |
| Stop handle hover / drag / settle | scaleY, shadow, 160-220ms | Feedback. Confirms grab and release on a direct-manipulation control. |
| Copy button label swap | 120ms crossfade, fixed width | Feedback. A silent copy is indistinguishable from a failure. |
| Code line wipe highlight | 420ms clip-path | State transition. Connects the visual change to the text output. |
| Notice enter / leave | 260 / 200ms slide plus Stage resize | State transition. Nothing gets covered, so the Stage must move. |
| Stage cross-dissolve on preset load | 320ms | State transition. Prevents a jarring cut between two unrelated images. |
| New stop settle after insert | 220ms `back.out(2)` | Feedback. Tells the user where the new object landed. |
| Contrast readout counter | 260ms tween on the number | Hierarchy. Draws the eye to the value that changed. |
| First-visit hairline pulse on the space control | one 700ms pulse, once ever | Hierarchy. Points at the first action. Never loops. |
| Shortcut sheet slide-in | 260ms | State transition. |
| Reset arm countdown | 3s draining hairline, `ease: "none"` | Feedback. It is a literal timer, so linear is correct. |

Not animated, deliberately: panel mounts, section entrances on scroll, rail reveals, tab switches,
thumbnail hovers, number field commits beyond the 180ms underline wipe. There is no scroll-reveal
choreography anywhere in this build. The instrument does not perform.

`ScrollTrigger` is used for exactly one thing: pausing the Stage's render loop when the Stage
scrolls out of view, and resuming it when it returns. That is a performance measure, not an effect.

---

## 9. Undo model

50-step ring buffer of serialized state objects (the same shape the hash encodes). Pushed on commit,
never during a drag. A drag pushes one entry on `pointerup` covering the whole gesture. Coalescing:
consecutive numeric-field commits on the same field within 600ms collapse into one entry.

Undo restores state without animation except for the Stage cross-dissolve, because an undo should
feel instant. The live region announces what was undone: *"Undid stop position change."*
