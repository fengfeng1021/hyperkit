# Mockup Loom

**The print bends with the cloth, not on top of it.**

A browser tool for print-on-demand sellers. Put a design on a garment, watch it
follow every fold instead of sitting on it like a sticker, then do that for N
designs across M templates and walk away with a structured ZIP that is already
named correctly.

Free, unlimited, no account, no watermark, nothing uploaded.

---

## What it does

- **Real displacement, not a flat paste.** A WebGL2 fragment shader samples the
  design through a procedurally generated cloth height field. The `FLAT` /
  `WOVEN` switch below the stage moves one scalar, and that scalar gates five
  things at once: the UV offset along the height gradient, a normal parallax
  term that sinks the print into the fold, the diffuse light landing on the ink,
  the ambient occlusion pressing on it, and the weave and seam biting its edge.
  The fabric stays lit either way, so the comparison is honest: only the print
  changes.
- **Six forms.** Tee, hoodie, tote, mug, poster, sticker, each with its own
  colourways, print area and fold recipe. The mug and the sticker use a macro
  height profile, so the print genuinely wraps the cylinder and domes over the
  vinyl.
- **Placement.** Drag, scale from any corner, rotate from the grip. Or type the
  numbers. Or use the keyboard: arrows move, `[` `]` rotate, `-` `=` scale.
- **A light you can turn.** Azimuth on a dial, elevation and intensity on
  sliders. Everything re-lights live, including the whole batch wall.
- **Batch.** N designs times M templates, one render per animation frame so the
  tab keeps breathing. Cards exist before their renders do, so the wall never
  reflows under your cursor.
- **Export.** A structured ZIP with a folder tree you can preview before you
  commit to it, filenames from a token pattern you control, and a MANIFEST.txt
  that records exactly what produced each file.

## How to use it

1. Press **Load the sample set**, or drop your own PNG, JPG or WEBP anywhere on
   the page. Transparent PNG works best.
2. Throw the **FLAT / WOVEN** switch. That is the whole product in 300ms.
3. Pick a form and a colourway on the left, adjust placement and light on the
   right.
4. Switch to **Batch**, tick the designs and forms you want, press **Render N**.
5. Press **Preview the ZIP** to see the folder tree, then **Export ZIP**.

### Keyboard

| Key | Action |
|---|---|
| `W` | Throw the weave switch |
| `F` | Hold to peek at FLAT |
| `1` - `6` | Switch template form |
| `B` | Cycle the blend mode |
| `E` | Export ZIP |
| `R` | Render the batch |
| `?` | Open and close the keyboard map |
| `Esc` | Step back one layer |

Every composite control is a single tab stop with arrow keys inside it, so six
templates and six colourways cost two tabs, not twelve.

## Procedural templates, stated plainly

There is no photography in this project. Every template is generated in your
browser from a seed, using value noise, fbm, domain warping and a ridged crease
term, plus Canvas 2D for the silhouettes, seams and baked structure. The seed is
printed under the render and written into MANIFEST.txt, because a generated
template is reproducible in a way a photograph is not: the same seed always
weaves the same cloth.

Two textures feed the shader:

| Texture | R | G | B | A |
|---|---|---|---|---|
| Field (512, square) | height | occlusion | heather | thread |
| Shape (1024, aspect correct) | coverage | print area | baked shading and contact shadow | seam |

Colourways are content, not interface, so they live in
`js/templates/colorways.js` and never in CSS.

## Privacy

Your designs stay in this tab. Nothing is uploaded.

This is a technical fact, not a marketing line:

- No network request carries image data. The only outbound requests the page
  makes at all are for the Google Fonts stylesheet and the GSAP CDN bundle, both
  at load time, before you have given the page anything.
- Designs live in memory and in GPU textures. They are never written to
  localStorage, IndexedDB, cookies or anywhere else.
- localStorage holds settings only: last template, colourway, light, blend,
  output size, naming pattern and folder grouping. Under a kilobyte. If
  localStorage is disabled the tool runs on defaults and says nothing about it.
- There is no analytics, no error reporting, no telemetry.

Because designs are deliberately not persisted, the page asks before you leave
if you have finished renders that have not been exported yet.

## Technical notes

- Static. No build step, no bundler, no npm, no framework. Native HTML, native
  CSS custom properties, native ES modules. GSAP 3 comes from a CDN.
- Every path is relative, so the folder works at any depth.
- **Exactly two WebGL2 contexts** for the whole page: one interactive stage, one
  export oven. Batch wall cards are `<img>` elements backed by blob URLs, so
  five hundred results do not mean five hundred contexts. Blob URLs are revoked
  when a card is replaced or the wall is cleared.
- **The ZIP writer is written here** (`js/export/zip.js`), STORE method, with a
  CRC32 table, explicit folder entries and an offset check against the end of
  central directory. PNG data is already deflated, so compressing it again would
  only cost you time. A one-file archive is built and measured before every real
  export; if the writer is broken you find out in milliseconds rather than after
  waiting for five hundred renders.
- **Reduced mode.** Without WebGL2 the tool does not break, it does less: a
  Canvas 2D composite with baked shading, no displacement, no live lighting.
  Placement, blending, batch and ZIP export all still work, a banner says
  exactly what changed, and MANIFEST.txt records that the export was made in
  reduced mode.
- **Context loss** is handled: the last good render stays on screen, textures
  and programs are rebuilt on restore, and a batch pauses rather than losing the
  work it already finished.
- Template maps are generated once per form and cached. If the first one comes
  in over budget on your machine, later ones drop an octave rather than making
  you wait.
- `?calib=1` loads a straight 20x20 grid as a design. That is the calibration
  card: the lines must be dead straight on `FLAT` and visibly bent on `WOVEN`.

## Running it

The tool is a static folder. Serve it with any static server and open it:

```
python -m http.server 8000
# then open http://localhost:8000/mockup-loom/
```

A local server is needed because browsers refuse to load ES modules over
`file://`. No server-side code runs; the server only hands over files.

## Files

```
mockup-loom/
  index.html
  css/          tokens.css, style.css
  js/
    main.js           wiring and state
    stage.js          the render surface and its overlays
    placement.js      move, scale, rotate
    weave-switch.js   the signature control and the one gating scalar
    batch.js          the wall and the render queue
    designs.js        import, validation, the design store
    samples.js        the four sample designs, drawn in code
    loom/             noise.js, weave.js  (the procedural core)
    templates/        forms.js, colorways.js, index.js
    render/           shader.js, gl.js, fallback2d.js, oven.js
    export/           zip.js, naming.js, manifest.js, tree.js
    ui/               the component layer
  PRODUCT.md
  docs/             INTERACTION.md, DESIGN-DIRECTION.md
```

Part of [Hyperkit](../index.html).
