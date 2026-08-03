# GradientKit - DESIGN DIRECTION

Assigned world: VISUAL-WORLDS.md #5, pinned. `concept-seed` is not run, per the pinned-brief rule.
This document expands the pinned world into a complete token table and component spec.

---

## 1. Direction contract (the six blocks, verbatim as they will appear in `index.html`)

These six blocks go into an HTML comment as the first child of `<body>`.

**THESIS**
A color tool with a brand color is a broken instrument. GradientKit removes every hue from its own
interface so that the only color on screen belongs to the user, and then proves, in three seconds,
that the way every other tool blends color is measurably wrong.

**OWN-WORLD**
A spectrophotometer bench in a dark measurement room. Pure black ground, white hairlines, engraved
rules with numbered ticks, a specimen mounted under a lamp. Nothing is styled; everything is
calibrated. The chrome is the instrument body, machined and unpainted. The gradient is the specimen.
Reference points: a Minolta CS-2000 readout, an optical rail with vernier scales, a densitometer
step wedge, a Kodak Q-13 grey card. Explicitly not: cyberpunk neon, glassmorphism, dark-mode SaaS
dashboards, or a black page with a purple glow.

**STORY**
The user arrives irritated by a specific problem: the middle of their gradient looks like dishwater.
The first viewport is not a pitch, it is the instrument already running with a specimen mounted.
One keypress sends a scan line across the specimen. Behind the line the color is corrected; ahead of
it, it is not. The line stops at the exact worst point, brackets it, prints the real number, and
moves on. In the right rail, the code they need updates itself. They copy it and leave. The next
time the problem happens, they know where to go.

**FIRST VIEWPORT**
48px bar with the wordmark and one sentence of proposition. Below it, edge to edge, the instrument:
a 280px left rail of composition controls, the specimen stage, a 320px right rail of measurement and
output. Under the stage, a 56px engraved rule carrying the color stops. Zero scroll required to use
the product. Zero marketing copy above the tool. The brightest thing on the page is a 1px white
hairline around the interpolation-space control, because that is the first action.

**FORM**
Type: Sora for display and UI, Fragment Mono for every number, color value, and code line. Color:
pure black ground, one raised black, white and two grey steps, and hairlines expressed as white
alphas. Zero hue in the chrome, no exceptions, including for success, error, and focus. Radius: 0 or
2px, nothing else. Depth: hairlines and negative space only; exactly one element in the product
(a stop handle mid-drag) is allowed a shadow, and that shadow has offset and blur. Motion: 90 to
260ms for everything functional, `cubic-bezier(0.16, 1, 0.3, 1)` as the default ease out from an
already-visible state, and exactly one authored moment over one second.

**FINISH**
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

---

## 2. Design read and dials

**Reading this as:** a precision editing tool for front-end engineers and product designers, working
in a dim room on a second monitor, with a measurement-instrument language, leaning toward native CSS
custom properties plus WebGL2 and a fully achromatic chrome.

| Dial | Value | Reasoning |
|---|---|---|
| `DESIGN_VARIANCE` | 5 | A workbench earns its character from precision, not from asymmetry. The three-column instrument layout is deliberately regular because the user needs muscle memory. Variance is spent on the rule/tick language and on the sweep, not on layout games. |
| `MOTION_INTENSITY` | 5 | Below the landing-page default on purpose. Almost all motion is sub-260ms feedback. The budget is concentrated into a single 3-second authored moment rather than spread across scroll reveals. |
| `VISUAL_DENSITY` | 7 | Cockpit territory. Numbers everywhere, 1px lines instead of card boxes, tight paddings. Mandatory `Fragment Mono` on every numeral, which is exactly the case where monospace is legitimate rather than a costume: these are measurements. |

---

## 3. Color tokens

### 3.1 The color contract

The interface uses **no hue**. Every value below is either pure achromatic or a white alpha. There is
no accent token, and adding one later is a regression, not a feature. All hue on screen is produced
at runtime by the user's gradient, rendered to the WebGL canvas or read from it.

Two derived tokens are set by JavaScript from the user's own work and are the only "colored" values
in the entire stylesheet:

- `--user-mid` - the gradient's color at `t = 0.5`, used at 22% alpha for the code wipe highlight.
- `--user-edge` - the gradient's color at `t = 0`, used at 10% alpha behind the active preset tile.

Both are written as `oklch()` strings by JS onto `:root`. Nothing else in the CSS carries hue.

### 3.2 Surfaces

| Token | Value | Role | Contrast of white on it |
|---|---|---|---|
| `--surface-void` | `#000000` | The Stage's own backdrop, the checkerboard's dark square, and the page ground behind the instrument. True black because any lift here would contaminate the user's color judgement. | 21.00:1 |
| `--surface-0` | `#0A0A0A` | Rails, bar, panels. The instrument body. | 19.80:1 |
| `--surface-1` | `#121212` | Popovers, the shortcut sheet, the drawer on tablet. One step of lift, no more. | 18.51:1 |
| `--surface-inverse` | `#FFFFFF` | The selected state of the interpolation-space control, and only that. | (black on it: 19.80:1) |

### 3.3 Foreground

Measured against `--surface-0` (`#0A0A0A`). Against `--surface-void` every ratio is slightly higher,
so `--surface-0` is the binding case.

| Token | Value | Ratio | Permitted use |
|---|---|---|---|
| `--fg-primary` | `#FFFFFF` | 19.80:1 | Headings, values, active labels, code |
| `--fg-secondary` | `#B4B4B4` | 9.55:1 | Body copy, inactive control labels, table text |
| `--fg-muted` | `#8A8A8A` | 5.74:1 | Captions, units, ruler numerals, the bar's proposition line. Floor for any text a user must read. |
| `--fg-disabled` | `#6E6E6E` | 3.88:1 | Disabled control labels only. Passes AA for large text; never used below 18px except on `aria-disabled` controls whose reason is exposed separately. |
| `--fg-tick` | `#4A4A4A` | 2.23:1 | Ruler tick marks and code line numbers. Non-text graphics only. Never carries information that is not also available elsewhere. |
| `--fg-on-inverse` | `#0A0A0A` | 19.80:1 on white | Label inside the selected space cell |

Note on the craft floor rule "secondary text on colored surfaces must be tinted from that hue, never
grey": it does not bind here, because there is no colored surface in the chrome. The one place text
sits on the user's color is the contrast probe's sample text, and that text's color is chosen by the
user and measured live, which is the entire point of that panel.

### 3.4 Hairlines

Expressed as white alphas so they composite correctly over both `--surface-void` and the Stage.

| Token | Value | Composited over `#0A0A0A` | Role |
|---|---|---|---|
| `--line-faint` | `rgba(255,255,255,0.08)` | `#252525` | Disabled borders, internal rules inside a panel |
| `--line` | `rgba(255,255,255,0.14)` | `#2C2C2C` | Default separator: rail edges, panel dividers, control outlines at rest |
| `--line-strong` | `rgba(255,255,255,0.42)` | `#767676` | Hover, stop-handle ring at rest, the arming state |
| `--line-full` | `rgba(255,255,255,1)` | `#FFFFFF` | The interpolation-space control at rest (the single brightest affordance), active hover, the sweep line, the dead-zone bracket |

### 3.5 Focus

| Token | Value |
|---|---|
| `--focus-ring` | `2px solid #FFFFFF` |
| `--focus-offset` | `2px` |
| `--focus-inner` | `0 0 0 1px #000000 inset` |

White at 2px against every possible background including a bright user gradient, guarded by the 1px
black inner ring. Contrast against any background is at minimum 1.6:1 for the white and 1.6:1 for the
black in the worst case, and the pair together is always visible because no single color can be
simultaneously close to both black and white. This is why the ring is a pair and not a single stroke.

### 3.6 The checkerboard

Transparency is shown with a 2-color checker at 8px squares: `--surface-void` and `#141414`. It is
drawn in the shader, not as a CSS background image, so it stays pixel-aligned during zoom and is
included correctly in PNG export decisions.

---

## 4. Type

### 4.1 Faces

| Role | Family | Weights loaded | Why |
|---|---|---|---|
| Display and UI | **Sora** | 400, 500, 600 | Assigned by the pinned world. A geometric grotesque with narrow apertures and a mechanical `a` and `g` that reads as instrumentation rather than as a startup sans. Not on the banned-defaults list. |
| Numerals, color values, code | **Fragment Mono** | 400 (plus 400 italic, used only for units) | Assigned by the pinned world. Single-story `a`, tall x-height, unusually low contrast, so long strings of digits stay even. Monospace here is legitimate: every use is a measurement, a color value, or code. |

Loaded via Google Fonts with `preconnect` and `display=swap`. Fallback stacks carry `size-adjust`
so the swap does not shift layout.

```
--font-ui:   'Sora', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif;
--font-mono: 'Fragment Mono', ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace;
```

### 4.2 Scale

Base 16px. Display is capped well under the 6rem craft-floor ceiling because this is a workbench, not
a poster: the largest type in the product is the Section B heading at 3rem.

| Token | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `--t-display` | `clamp(2rem, 4.2vw, 3rem)` | 1.02 | -0.035em | 600 | Section B heading, the one large moment below the fold |
| `--t-h1` | `1.5rem` | 1.08 | -0.03em | 600 | Section C and D headings |
| `--t-h2` | `1.125rem` | 1.2 | -0.02em | 600 | Sub-headings in Section D |
| `--t-panel` | `0.8125rem` (13px) | 1.25 | -0.005em | 500 | Panel titles. Sentence case, never uppercase. |
| `--t-body` | `0.9375rem` (15px) | 1.6 | 0 | 400 | Body copy. Measure capped at 68ch. |
| `--t-ui` | `0.8125rem` (13px) | 1.35 | 0 | 400 | Control labels, button labels |
| `--t-caption` | `0.75rem` (12px) | 1.4 | 0 | 400 | Helper sentences under controls |
| `--t-num` | `0.8125rem` (13px) | 1.2 | 0.01em | 400 | Fragment Mono. Field values, readouts. |
| `--t-num-lg` | `1.375rem` (22px) | 1.1 | 0 | 400 | Fragment Mono. The contrast ratio and the chroma deficit. The only large numbers in the product, and both are real measurements. |
| `--t-code` | `0.78125rem` (12.5px) | 1.55 | 0 | 400 | Fragment Mono. Output blocks. |
| `--t-tick` | `0.6875rem` (11px) | 1.1 | 0.02em | 400 | Fragment Mono. Ruler numerals only. |

Steps between adjacent sizes are at least 1.15x, and weight carries the rest of the hierarchy. There
is no uppercase style token, because there is no uppercase micro-label anywhere in this build
(see Section 8).

### 4.3 Typographic rules

- Every numeral in the product is Fragment Mono with `font-variant-numeric: tabular-nums`, so a
  changing value never reflows its neighbours.
- Fixed decimal places per field: position `0.00`, angle `0`, `L` `0.000`, `C` `0.000`, `H` `0.0`,
  contrast `0.00`, delta E `0.000`.
- Body measure is capped at `68ch` in Section D, the only place with running prose.
- Headings get more space above than below: `--space-9` above, `--space-6` below, everywhere.
- No italic in display type anywhere, so the descender-clearance rule has no surface to bite on. The
  one italic in the product is Fragment Mono italic on unit suffixes (`px`, `deg`, `%`), at 12px, with
  `line-height: 1.4`, well clear of any clipping.

---

## 5. Space, shape, depth, motion

### 5.1 Space

A 2px base grid, because the product's own subject is sub-pixel precision and the layout should not
contradict it.

| Token | Value | Typical use |
|---|---|---|
| `--space-1` | `2px` | Hairline offsets, tick spacing |
| `--space-2` | `4px` | Icon-to-label gaps |
| `--space-3` | `8px` | Inside a control |
| `--space-4` | `12px` | Between related controls |
| `--space-5` | `16px` | Panel padding |
| `--space-6` | `24px` | Between panels inside a rail |
| `--space-7` | `32px` | Between rail groups |
| `--space-8` | `48px` | Above a below-fold section heading's body |
| `--space-9` | `72px` | Above a below-fold section heading |
| `--space-10` | `112px` | Between below-fold sections |

Rhythm rule, applied everywhere: within a group, `--space-3` or `--space-4`; between groups,
`--space-6` or `--space-7`; above a heading, one full step more than below it.

Fixed dimensions: bar `48px` (44 on mobile), left rail `280px`, right rail `320px`, track `56px`
(48 on mobile), stop handle `12 x 22`, focus offset `2px`, hairline `1px` at every DPR (drawn with
`0.5px` on DPR >= 2 where the browser supports it, guarded by `@media (min-resolution: 2dppx)`).

### 5.2 Shape

Two radii. That is the whole system.

| Token | Value | Applies to |
|---|---|---|
| `--radius-0` | `0` | Rails, panels, the Stage, the Track, code blocks, thumbnails, tiles, the Notice |
| `--radius-1` | `2px` | Buttons, fields, stop handles, popovers, preset tiles, the loupe |

Nothing is pill-shaped. Nothing is circular except the mesh points' influence rings, which are
circles because they represent a radial falloff and are drawn in the canvas, not in CSS.

### 5.3 Depth

There are no elevation levels. Depth comes from hairlines and negative space. Exactly one shadow
token exists and it is applied to exactly two things: a stop handle while it is being dragged, and
the color popover.

```
--shadow-lift: 0 12px 32px -10px rgba(0,0,0,0.92), 0 2px 6px -2px rgba(0,0,0,0.7);
```

Real offset, real blur, no zero-offset halo, no colored glow. On a black ground a shadow is nearly
invisible, which is correct: the popover is separated from the page by its 1px hairline, and the
shadow only does work where the popover overlaps the bright Stage.

### 5.4 Motion

| Token | Value | Use |
|---|---|---|
| `--dur-1` | `90ms` | `:active` press |
| `--dur-2` | `160ms` | Hover, hairline changes, crosshair fade |
| `--dur-3` | `260ms` | Notice enter, sheet slide, counter tween, settle |
| `--dur-4` | `420ms` | Code wipe highlight, image cross-dissolve |
| `--dur-sweep` | `2400ms` | The signature moment's total travel |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default. Exponential out from an already-visible state. GSAP equivalent: `expo.out`. |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | Layout changes where the exponential snap is too aggressive. GSAP: `power3.out`. |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | The breathe. GSAP: `power2.inOut`. |
| `--ease-settle` | GSAP only: `back.out(2)` | New stop insertion |
| `--ease-measure` | `linear` | Only the sweep travel and the reset countdown, both of which are literal measures of a quantity. Never a default. |

Everything animates from a visible default state. No element in the stylesheet has `opacity: 0` or
`visibility: hidden` waiting for JavaScript. The four elements that start hidden (the Notice, the
popover, the shortcut sheet, the sweep overlay) are not in the DOM until they are needed, so a
JavaScript failure cannot leave the page blank.

All motion is wrapped in `gsap.matchMedia()` with a `reduce` branch. Content is complete and usable
with every animation removed.

---

## 6. Component specifications

### 6.1 Bar
48px tall, `--surface-0`, `border-bottom: 1px solid var(--line)`. Grid:
`[wordmark] [proposition] 1fr [mode] [actions]`. Wordmark is Sora 600 at 15px with `-0.03em`,
linked to `../index.html`. Proposition in `--t-caption` / `--fg-muted`, hidden below 900px. Actions
are three text buttons at 32px tall. Single line at every width; below 640px the proposition and the
`Reset` label collapse to an icon button. Height never exceeds 48px.

### 6.2 Rail and Panel
Rail: fixed width, `--surface-0`, `overflow-y: auto`, `scrollbar-width: thin`, one hairline on the
edge facing the Stage. Panel: no background, no border, no radius. A panel is defined only by its
title, its `--space-5` padding, and a `1px solid var(--line)` top border. Panels never nest.

### 6.3 Segmented / radio group (type, mode, space, vision)
Cells with `1px solid var(--line)`, `--radius-1`, 32px tall, `--t-ui`. Adjacent cells share a border
via `margin-left: -1px`. Selected cell: `background: var(--surface-inverse)`, `color: var(--fg-on-inverse)`.
The interpolation-space group is the exception that sits at `--line-full` at rest, in a 2x2 grid of
64x32 cells, because it is the product's primary control.

### 6.4 Stage
`<canvas>` at `width = clientWidth * dpr`, capped at `dpr <= 2` to bound fragment cost. CSS size is
100% of its grid cell. `image-rendering: auto`. Its focus ring is drawn inside its bounds via a
sibling `outline` element so it is never clipped by `overflow: hidden`.

### 6.5 Track
56px tall, `--surface-0`, hairline top and bottom. A ruler is drawn with `repeating-linear-gradient`
using `--fg-tick`: 8px ticks every 2%, 12px ticks every 10%. Numerals in `--t-tick` at 0/25/50/75/100,
`--fg-muted`, `transform: translateX(-50%)` with the two ends nudged inward so they never clip.

### 6.6 Stop handle
12 x 22, `--radius-1`, background is the stop's color, `box-shadow: 0 0 0 1px var(--line-strong)`
at rest and `0 0 0 1px #FFFFFF` on hover. `transform-origin: bottom center` so hover growth reads as
rising out of the rule. Dragging adds `--shadow-lift` and a 1px `#FFFFFF` guide line up the Stage.

### 6.7 Numeric field
Height 28px, `--radius-1`, transparent background, `border-bottom: 1px solid var(--line)`, no other
borders. Value right-aligned in `--t-num`. Label to the left in `--t-ui` / `--fg-muted` with
`cursor: ew-resize`. Error state swaps the bottom border to `2px dashed #FFFFFF` and reveals a
`--t-caption` sentence in `--fg-secondary`.

### 6.8 Slider
Rail 1px `--line`, full width, 20px hit area. Thumb 10x10, `--radius-1`, `#FFFFFF`. A 1px tick marks
the default value; double-click on the rail returns the thumb to it. Hover thickens the rail to 2px.

### 6.9 Toggle
Track 22x12, `--radius-1`, `1px solid var(--line)`. Knob 8x8 square, `--radius-0`, `#FFFFFF`, inset
2px. On: track fills `#FFFFFF`, knob becomes `--surface-0` and translates to the right edge.
160ms `--ease-out`. Not a pill, not a switch metaphor: a throw switch on a bench.

### 6.10 Code block
`<pre>` on `--surface-void` with a `1px solid var(--line)` frame, `--t-code`, `padding: --space-4`,
`max-height: 260px`, scrollable, `tabindex="0"`. Line numbers in a 32px gutter, `--fg-tick`,
`user-select: none`. Copy button pinned top-right with an 8px inset, 84px fixed width.

### 6.11 Contrast probe
Text input at `--t-ui`, a size stepper (12 / 16 / 20 / 32 / 48), a weight toggle (400 / 600), and a
foreground swatch (white / black / custom). Readout in `--t-num-lg` with the verdict word in
`--t-ui` / weight 600 beneath it. The worst point renders on the Stage as a 6px hollow square with a
1px white stroke and a 1px black inner stroke, plus a leader line to the readout.

### 6.12 Vision thumbnails
Four 68x44 canvases, `--radius-1`, `1px solid var(--line)`, names in `--t-caption` / `--fg-muted`
below. The selected one carries a `2px solid #FFFFFF` frame drawn as an outline with `--focus-offset`
so it does not shift the layout.

### 6.13 Loupe
88x88, `--radius-1`, `1px solid var(--line)`, `image-rendering: pixelated` at 8x magnification, with
a 1px crosshair at its center. A `--t-tick` line under it reads the sampled `#RRGGBB`.

### 6.14 Preset tile (Section C shelf)
168x112, `--radius-1`, `1px solid var(--line)`, the gradient rendered inside. Name in `--t-ui` and
the interpolation space in `--t-tick` / `--fg-muted` beneath. Hover raises the frame to `--line-full`.
The currently-loaded tile shows a 2px white outline and a `--user-edge` at 10% alpha behind its label.
`scroll-snap-type: x mandatory`, `scroll-snap-align: start`, focus scrolls the tile into view.

### 6.15 Comparison band (Section B)
Four full-width bands, 88px tall, stacked with a 1px `--line` between them. Left edge carries the
space name in `--t-panel` on a `--surface-0` plate 96px wide. Right edge carries the computed chroma
deficit in `--t-num`. The bands share the same two endpoint colors, taken live from the user's
current first and last stop, so the teaching artifact is always about the user's own colors.

### 6.16 Notice
36px tall, full width of the Stage column, `--surface-0`, hairline top and bottom, 16px icon, one
sentence in `--t-ui` / `--fg-secondary`, optional text action in `--fg-primary`, close button 24x24.

### 6.17 Icons
Sourced from **Lucide** (ISC licence, credited in `README.md`), path data copied inline into
`js/icons.js` as an ES module exporting a `{ name: pathString }` map. Rendered at 16px from a
`0 0 24 24` viewBox with `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`,
`fill="none"`, `stroke="currentColor"`. One family, one stroke weight, no exceptions. Set used:
`copy`, `check`, `download`, `link`, `undo-2`, `redo-2`, `plus`, `minus`, `pipette`, `x`,
`chevron-down`, `image`, `alert-triangle`, `bookmark`. Zero emoji anywhere in markup or copy.

---

## 7. Layout families and section inventory

| Section | Family | Appears |
|---|---|---|
| The instrument | Three-column workbench with a horizontal rule beneath the stage | once |
| B. Four spaces | Four stacked full-width measurement bands | once |
| C. Reference set | Horizontal scroll-snap shelf | once |
| D. Output reference | Two-column prose with a support table | once |

Four sections, four distinct families, zero repetition, zero zigzag, zero card grids, zero marquees.

---

## 8. Three things this project deliberately refuses

These are named because they are the defaults this build would otherwise fall into, and refusing
them is a design decision with a stated replacement, not an omission.

### 8.1 No uppercase micro-labels. Anywhere. Zero.

**The default we are refusing:** `11px uppercase letter-spacing: 0.2em` labels above every panel and
every section. In a dense tool this is the strongest pull of all, because a workbench has fifteen
panels and each one seems to want a header, and the uppercase-tracked label is the reflex.

**What we do instead:** panel titles are `13px Sora 500, sentence case, --fg-muted, no tracking`,
separated from their content by a `1px --line` rule and `--space-4`. The rule does the work the
tracking was pretending to do. There is no `--t-eyebrow` token in `tokens.css`, and no
`text-transform: uppercase` declaration in the entire stylesheet, so the pattern cannot creep back in
during implementation. The only capitals in the product are sentence-initial capitals, proper nouns,
the space names (`sRGB`, `HSL`, `OKLab`, `OKLCH`), and the `PASS AA` / `FAIL AA` verdict words, which
are capitalised because they are quoting the WCAG conformance level, not decorating a heading.

**Verification:** `grep -c "uppercase" css/*.css` must return 0.

### 8.2 No cards, no elevation, no rounded surfaces above 2px.

**The default we are refusing:** the dark-SaaS-dashboard reflex, where every functional region
becomes a `border-radius: 12px` panel with `background: #16161A`, a subtle border, and a soft shadow,
and the page becomes a field of floating rectangles at three elevation levels.

**What we do instead:** the entire chrome is one continuous `--surface-0` plane, subdivided by 1px
hairlines and by negative space. There is exactly one lifted surface tier (`--surface-1`, used only
for the popover and the sheet, both of which genuinely float above the page), exactly one shadow
token, and exactly two radii, of which the larger is 2px. Nothing nests. A panel inside a panel is a
build error. The result reads as a machined instrument face rather than as a stack of cards, and it
also means the Stage is the only thing on screen with visual weight, which is correct: it is the
specimen.

**Verification:** no `border-radius` value above `2px` in `tokens.css` or `style.css`; exactly one
`box-shadow` token; no element with both a `background` different from its parent and a `border`.

### 8.3 No marketing hero. The tool is the first viewport.

**The default we are refusing:** a 100dvh hero with a large headline, a subhead, two CTAs, and the
actual product two scrolls down. Every tool site in this category does this, and it costs the user
the four seconds in which they decide whether the tool understands their problem.

**What we do instead:** the first viewport is the instrument, already loaded with a real specimen,
fully interactive, with the CSS output already generated and visible in the right rail. The only
prose above the tool is one sentence, 6 words, in the 48px bar. The product's argument is not made in
a headline; it is made by the sweep, which the user triggers themselves within the first ten seconds.
The below-fold sections exist to teach and to give search engines something to index, not to sell a
tool the user is already using.

This also means the build-standard hero rules apply to Section B's heading rather than to a top-of-
page hero: one line, no eyebrow above it, no split header beside it, and the body beneath it capped
at 20 words.

**Verification:** the `<main>` element's first child is the instrument grid; no `<h1>` renders above
the fold larger than the 15px wordmark; zero CTA buttons exist on the page whose action is "scroll
down" or "get started".

---

## 9. Motion contract summary

One authored moment (the sweep, Section 6 of `INTERACTION.md`). Everything else is sub-260ms
functional feedback, itemised in `INTERACTION.md` Section 8 with a one-sentence justification each.
No scroll-reveal choreography, no section entrance animations, no parallax, no marquee, no infinite
loops. `ScrollTrigger` is loaded for exactly one job: suspending the render loop when the Stage
leaves the viewport.

---

## 10. Cross-project check

| Project | Light/dark | Base family | Accent | Display face |
|---|---|---|---|---|
| gradientkit | Pure black | Achromatic black / white / two greys | **None** | Sora |

No overlap with the other five: it is the only pure-black build, the only build with zero accent, the
only user of Sora, and the only user of Fragment Mono. If a hue ever appears in this project's chrome,
that is the failure condition for the whole portfolio's cross-check table.
