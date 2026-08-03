# GradientKit

A gradient editor that interpolates in OKLCH instead of sRGB, shows you the exact point where the
grey band disappears, and hands you production CSS with a real fallback.

Live: `https://fengfeng1021.github.io/hyperkit/gradientkit/`

---

## What it is

Every other gradient generator interpolates in sRGB, which physically cannot avoid the desaturated
grey band between two saturated colors. GradientKit interpolates in OKLCH, measures how much chroma
the sRGB route gives up, and prints the number.

That is the whole product. Mesh fields, grain, dither, exports, the contrast probe and the colorblind
simulation exist to make that one sentence usable at work.

The interface carries no hue of its own. Pure black, white hairlines, one grey step. A color tool
with a brand accent is a broken instrument, so success is not green, error is not red, and focus is
not blue. Every hue you see on screen is yours.

## How to use it

Open it. There is no sign-up, no empty state and no onboarding: the instrument is already running
with a specimen mounted.

1. **Press Space.** A seam appears across the stage. Left of it the gradient is interpolated in
   OKLCH, right of it in the space you were in. The bracket marks the worst point and prints the real
   chroma difference. Drag the seam to compare anywhere along the ramp.
2. **Edit.** Drag a stop on the rule under the stage, click the rule to insert one, double-click a
   handle to open its color popover with hex plus L, C and H. Numbers can be typed or scrubbed by
   dragging the field's label.
3. **Copy.** The right rail already holds the CSS, with an `@supports` block and an sRGB fallback
   resampled from the OKLCH curve at nine stops. SVG, Tailwind v4 and PNG are one tab away.
4. **Share.** `Copy link` puts the whole gradient in the URL. The person who opens it gets an
   editable document, not a screenshot.

**No file of your own?** `Load reference set` in the bar loads twelve gradient specimens and three
mesh fields, sets the workbench to `Deep Field`, turns grain on and fills the contrast probe. One
click to a complete, populated result. The same data is in `assets/reference-set.json` if you would
rather read it or feed it to your own tooling.

### Keyboard

| Key | Action |
|---|---|
| `Space` | Compare the current space against OKLCH |
| `1` `2` `3` | Linear, radial, conic |
| `Q` `W` `E` `R` | sRGB, HSL, OKLab, OKLCH without the comparison |
| `M` | Switch between gradient and mesh |
| `G` / `D` | Grain on or off, dither on or off |
| `C` | Cycle the vision simulation |
| `T` | Jump to the contrast probe |
| `+` / `-` | Add a stop at the widest gap, delete the focused stop |
| `[` `]` | Move between stops or mesh points |
| `Ctrl/Cmd + C` `S` `Z` | Copy the open tab, save locally, undo (add Shift to redo) |
| `?` | Shortcut panel |
| `Esc` | Cancel a drag, close a popover, revert a field |

Every value is reachable from the keyboard, including stop positions, stop colors and mesh points.
Stop handles are real sliders with `aria-valuetext`, and the stage regenerates its own description on
every commit.

## Technical notes

Static page. No build step, no bundler, no framework, no runtime dependency. Native HTML, CSS custom
properties and ES modules. Open `index.html` from a web server and it works.

### The color math is hand-written

`js/color.js` implements the whole chain and imports nothing:

- sRGB to linear-sRGB with the exact piecewise transfer function, sign-preserving so out-of-gamut
  intermediates survive the round trip. The `pow(c, 2.2)` shortcut is not used anywhere, including in
  the shader, which is where most WebGL gradient tools quietly lose accuracy in the darks.
- linear-sRGB to OKLab and back with Bjorn Ottosson's matrices at full precision, using `cbrt`
  rather than `pow(x, 1/3)` because `l`, `m` and `s` do go negative during gamut mapping.
- OKLab to OKLCH, where hue is `NaN` and never `0` for achromatic colors. Carrying a fake hue of zero
  is exactly the bug that swings a black-to-orange ramp through red.
- Gamut mapping per CSS Color 4 section 13.2: binary search on chroma with a delta-E-OK acceptance
  test, not a naive per-channel clip. The clipped chroma and the delta E are surfaced in the color
  popover as real numbers.
- Hue interpolation along the shortest arc, with powerless-hue carry.
- WCAG 2.1 relative luminance and contrast ratio. APCA is deliberately not implemented: its
  specification is still revising, and shipping a number that later changes would break the one thing
  this tool sells.

`tools/check-color.mjs` asserts the `hex -> OKLCH -> hex` round trip on 4096 evenly spaced colors
plus 2000 random ones, checks the Bayer recursion against its closed form, checks powerless-hue
carry, and checks that white on black is exactly 21:1. Run `node tools/check-color.mjs` after
touching the math.

### Rendering

`js/render.js` is a WebGL2 fragment shader that is the GPU twin of `js/gradient.js`. It does the same
conversions, the same shortest-arc hue interpolation and a fixed 12-iteration form of the same gamut
search, because unbounded loops are hostile to GLSL compilers.

- Device pixel ratio is capped at 2 to bound fragment cost.
- Ordered dither is an 8x8 Bayer matrix generated by the standard recursion, applied at exactly
  `1/255` immediately before the 8-bit write, in gamma-encoded space. That is what removes the
  banding you can see in the loupe with dither off.
- Grain is hash noise applied in linear light, so it behaves like film in the shadows rather than
  like additive whitening. Grain size changes the particle size, not just the density.
- Color vision matrices are applied in linear light and never to an export.
- If WebGL2 is missing, the shader fails to link, or the context is lost, the stage falls through to
  a Canvas2D path that runs the same math at one sixth the linear resolution, and says so. Exports
  stay full resolution either way, rendered in 256px tiles with a yield between tiles.

### Mesh

`N` control points, each with an OKLab color and a radius, blended by inverse distance weighting in
OKLab. OKLab, not sRGB, is what stops the grey seams where lobes meet, which is the same argument as
the gradient case.

### Output

- **CSS**: an sRGB block whose stops are resampled from the OKLCH curve at nine positions, plus an
  `@supports` block with real `oklch()` values. Both are round-tripped through `CSS.supports()` in
  your browser before they are offered for copy. The fallback is never a two-stop guess.
- **SVG**: real `linearGradient` and `radialGradient` in `objectBoundingBox` units with the angle in
  `gradientTransform`, resampled to seventeen sRGB stops. Conic has no SVG primitive, so that tab
  embeds a 512px raster of exactly what the stage shows and says so.
- **Tailwind**: v4 `@theme`, not a v3 config object.
- **PNG**: rendered by the same shader at the target size, so dither and grain land at full
  resolution. Falls back to 2048px if the device cannot allocate 4096px, and tells you.

### State

The URL hash carries everything: `#gk1&k=g&t=l&a=200&i=oklch&s=071033@0,4FE3C1@78,EAFFF7@100&d=1`.
Parsing is total. Every field is validated on its own, an invalid field falls back to its default
instead of aborting the parse, and there is no code path where reading a hash throws. Writes use
`history.replaceState`, so editing a gradient does not fill the back button with hundreds of entries.

Undo is a 50-step ring. A whole drag gesture is one entry; consecutive edits to the same field within
600ms coalesce.

## Privacy

Everything runs in your tab.

- No account, no server, no upload, no analytics, no cookies.
- Gradients you save go to this browser's `localStorage` under `gk.saved.v1` and nowhere else. If the
  browser blocks storage, the panel says so and points at share links instead of breaking.
- Dropped images are decoded in memory to read four colors out of them, and are never uploaded or
  retained.
- A share link carries the gradient inside the URL, so sharing does not create a record anywhere.
- The only network requests the page makes are for the two Google Fonts and the GSAP script on the
  CDN. Block them and the tool still works.

## Files

```
gradientkit/
  index.html              direction contract, full structure
  css/tokens.css          the only place a literal color may appear
  css/style.css           layout, components, states, breakpoints
  js/color.js             color science, pure functions, zero imports
  js/gradient.js          sampling, ramps, deficits, CPU raster
  js/render.js            WebGL2 shader plus Canvas2D fallback
  js/state.js             store, hash schema, undo ring
  js/presets.js           the reference set (sample data)
  js/output.js            CSS, SVG, Tailwind, PNG generation
  js/outputs.js           the output tabs and code block
  js/track.js             the rule, stop handles, color popover
  js/sweep.js             the comparison seam and its numbers
  js/panels.js            vision, loupe, contrast probe, library
  js/sections.js          comparison bands and the reference shelf
  js/controls.js          numeric field, slider, toggle, radio group
  js/extract.js           four stops from a dropped image
  js/library.js           localStorage with quota and private-mode handling
  js/notice.js            the single messaging surface
  js/icons.js             Lucide path data, inlined
  js/main.js              assembly, frame schedule, keyboard
  assets/reference-set.json  the reference set as portable data
  tools/check-color.mjs   run by hand, not part of a build
```

## Motion hooks

The animation layer is `js/motion.js`, loaded after `main.js` and able to be deleted without
changing anything the page says or does. It tweens plain numbers and writes them through the API
below; no DOM element is animated for the sweep itself, which is what keeps it at 60fps.

Three things animate, and no more. The sweep is the authored moment: 2.4s of constant-speed travel,
a stop on the measured worst point to bracket it and type the real percentage, the rest of the
crossing, one 1.5% breathe, the code wipe, and the divider parking on the finding. The other two are
the one-time first-visit ring on the interpolation-space control and the grain phase advancing while
a grain control is being adjusted. Nothing animates on scroll, so ScrollTrigger is not loaded.

`window.GradientKit` exposes `store`, `renderer`, `sweep`, `track`, `announce`, `notice`,
`scheduleFast` and `renderNow`.

| Hook | Where | What the motion layer does with it |
|---|---|---|
| `renderer.setSweep(x, shake, fromSpace)` | `js/render.js` | Tween `x` from 0 to 1 to drive the seam. `shake` is a pixel offset applied to the seam only. |
| `sweep.choreograph(fn)` | `js/sweep.js` | Register the landing sequence. Return `true` and the sweep leaves the seam alone; register nothing and it lands on the measurement at once, which is the reduced-motion behaviour. |
| `renderer.setGrainPhase(v)` | `js/render.js` | Preview-only grain phase, added to the seed. Never reaches an export. |
| `.gk-sweep`, `.gk-sweep-rail`, `.gk-sweep-line`, `.gk-sweep-grip` | stage overlay | The seam. `--seam` (a percentage) and `--shake` are custom properties on `.gk-sweep`; the rail carries the transform, so the seam needs no measurement and survives a resize. |
| `.gk-sweep-label` | stage overlay | `sRGB < | > OKLCH`, fades in over the first 240ms of travel. |
| `.gk-sweep-bracket` | stage overlay | Dead-zone rectangle. Drawn left to right with `clip-path`, released by scaling to 1.06 and fading. |
| `.gk-sweep-deficit` | stage overlay | The measured percentage. Types in under the bracket. |
| `.gk-stage-canvas` | stage | The 1.5% breathe after the seam lands. Transform only. |
| `.gk-code-wipe` | output panel | Changed-line highlight. Tween `clip-path`; the fill is `--user-mid-wash`, the gradient's own mid color, never green. |
| `.gk-stop` | track | Hover, drag and the 220ms settle after a drop. Stays in CSS; the motion layer does not touch it. |
| `.gk-spaces::after` | left rail | The one-time first-visit ring, driven by the `--pulse` custom property. Reads `document.documentElement.dataset.firstVisit`. |
| `.gk-stage.is-scanning` | stage | Added for the duration of the sweep. Hides the hover crosshair and readout so two instruments do not fight over the same pixels. |
| `.gk-notice`, `.gk-sheet`, `.gk-btn--arm::after` | various | Stay in CSS. Short functional transitions do not need a timeline. |
| `.gk-tile`, `.gk-band` | sections B and C | Deliberately not animated. There is no scroll-reveal choreography in this build. |

All of it is wrapped in `gsap.matchMedia()` with a `reduce` branch. Under reduced motion no
choreographer is registered, so the seam lands on the measured worst point immediately with the
bracket drawn and the percentage printed, and it is draggable by pointer and by arrow key: the full
lesson, at the user's own pace. Nothing in the stylesheet sets `opacity: 0` waiting for JavaScript,
and the four elements that start hidden are not in the DOM until they are needed, so a script
failure cannot leave the page blank. Every sequence is interruptible: touching the divider, pressing
Esc, or loading a preset stops it in the same frame and hands control back.

## Credits

- OKLab and the gamut mapping follow Bjorn Ottosson's derivation and the CSS Color 4 specification.
- Color vision deficiency matrices from Machado, Oliveira and Fernandes, 2009.
- Icons: [Lucide](https://lucide.dev), ISC licence, path data inlined into `js/icons.js`.
- Type: Sora and Fragment Mono, both via Google Fonts.

Part of [hyperkit](../index.html).
