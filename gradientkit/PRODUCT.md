# GradientKit / 漸層工坊 - PRODUCT

Slug: `gradientkit`
Deploy: `https://fengfeng1021.github.io/hyperkit/gradientkit/`
Interface language: English
Assigned visual world: VISUAL-WORLDS.md #5 (pinned, not negotiable)

---

## 1. The unique mechanism, in one sentence

Every other gradient generator interpolates in sRGB, which physically cannot avoid the desaturated
grey band between two saturated colors; GradientKit interpolates in OKLCH, shows you the exact
moment the grey band disappears, and hands you production CSS with a fallback.

That is the whole product. Everything else (mesh, grain, exports, contrast probe, colorblind
simulation) exists to make that one sentence usable at work.

---

## 2. Who, where, when, what emotion

### The primary user

A front-end engineer or product designer who has been handed a hero section, a button, or a card
background, and has 20 minutes before standup to make it not look cheap.

**Where:** a second monitor, dark room or dim office, between 10:00 and 17:00, VS Code open on the
other screen. Never on a phone as a first session. Phone is the *share receive* device only:
someone sends the link in Slack, they open it on the train, they look, they do not edit.

**When exactly:** the moment they typed `linear-gradient(135deg, #6D23B6, #00D4FF)` into a stylesheet,
looked at it, and thought "why does the middle look like dishwater". That is the entry keyword and
the entry emotion: mild, specific, professional irritation. Not curiosity. Not browsing.

**Emotional arc we are designing for:**

| Beat | Feeling | Our job |
|---|---|---|
| Arrival | Skeptical. "Another gradient site." | Show a real, running instrument in the first viewport, no marketing hero |
| +3 seconds | Recognition. "That is the exact problem I have." | The sRGB → OKLCH sweep, on one keypress |
| +40 seconds | Trust. "The numbers are real." | Live OKLCH readouts, real gamut clipping notices, real contrast ratios |
| +3 minutes | Ownership. "This is my gradient now." | URL hash carries the whole state, share link is an editable link |
| Next sprint | Habit. | They bookmark it, because the CSS output pastes into production without a rewrite |

### The secondary user

A designer who does not write CSS but has to explain to an engineer why the mockup and the build
look different. For them the four-space comparison strip is the artifact they screenshot into the
ticket. We design that strip so a screenshot of it is self-explanatory with no caption.

### Not our user

Someone who wants to browse 400 pretty presets and copy one. uiGradients already does that and does
it fine. We ship 12 presets, all authored here, all of them specimens that demonstrate a specific
color-science behaviour. The shelf is a reference set, not a catalogue.

---

## 3. What this interface must prove

1. **That the color math is actually correct.** Not "we support OKLCH" as a marketing bullet. The
   OKLCH values on screen must match what a browser computes, the gamut mapping must match the CSS
   Color 4 algorithm, and the hue interpolation must take the short path with powerless-hue carry.
   An engineer will paste our output next to a browser render and diff it. We must survive that.

2. **That the interface has no opinion about color.** A color tool with a brand accent is a broken
   instrument. Every hue on screen belongs to the user. Chrome is black, white hairline, one grey
   step. Success is not green. Error is not red. Focus is not blue. This is the single most
   important constraint in the entire build and it is also the thing that will make the site
   memorable, because nobody else does it.

3. **That the output is production-safe.** CSS ships with an `@supports` fallback that degrades to
   an sRGB multi-stop approximation, not to a two-stop guess. Tailwind output targets v4 `@theme`.
   SVG output is a real `<linearGradient>`/`<radialGradient>` with correct `gradientTransform`.
   PNG export is rendered by the same shader, not a screenshot of the canvas element.

4. **That measurement is a first-class citizen.** Worst-point contrast ratio on the gradient, chroma
   deficit percentage per interpolation space, gamut-clip delta per stop. Real computed numbers,
   never decorative ones.

---

## 4. Where it must never break

Ranked. If we have to cut scope, we cut from the bottom.

1. **The color conversion round-trip.** `hex → OKLCH → hex` must return the identical hex for every
   one of the 16,777,216 sRGB colors. This is testable and we will test it on a sample. If this is
   wrong, everything downstream is a lie.
2. **The `@supports` fallback must be valid CSS.** If we emit something that breaks a build, we
   have actively harmed a user. Every emitted string gets validated by round-tripping through
   `CSS.supports()` before it is offered for copy.
3. **The URL hash must never produce a crash.** Someone will edit the hash by hand, someone will
   truncate it in Slack, someone will paste a hash from a future version. Malformed hash loads the
   default gradient and says so in one sentence. Never a blank canvas, never a thrown error.
4. **The canvas must never go black-on-black.** WebGL2 missing, context lost, shader compile
   failure: all three fall through to the Canvas2D path, which uses the same math at 1/6 resolution.
   A user with a locked-down GPU driver still gets a working tool.
5. **Dragging a stop must feel like dragging a physical slider.** Pointer capture, no lag, no
   snapping unless Shift is held, and the value readout updates on the same frame. If dragging feels
   cheap, the "precision instrument" claim collapses and no amount of correct math rescues it.
6. **Copy to clipboard must confirm.** A silent copy is indistinguishable from a failed copy.
7. **Keyboard-only must reach every value.** Stop positions, stop colors, mesh points, grain,
   export. Arrow keys on a color stop are the difference between a tool and a toy.

---

## 5. Where the competition disappoints

| Product | What it gets right | Where it loses the user |
|---|---|---|
| **cssgradient.io** | Enormous organic traffic, dead simple, instant | sRGB interpolation only. Two saturated colors always produce a muddy middle and the tool does not tell you why or offer a fix. No OKLCH, no grain, no contrast check. The output is a bare `linear-gradient` with vendor prefixes nobody has needed since 2016. |
| **uiGradients** | Beautiful curated set, fast to browse | A 2017 catalogue. Two stops, sRGB, no editing beyond angle. You cannot bring your own colors, so the moment your brand palette is involved it is useless. |
| **webgradients** | Big free pack | Abandoned. Static images plus copyable CSS. No editor at all. |
| **gradient.style** | The only tool that is technically correct about OKLCH | Almost no discoverability, minimal UI, no mesh, no grain, no export beyond CSS, and it never explains *why* OKLCH matters. It assumes you already know, which means it only serves people who do not need convincing. |
| **Mesh gradient tools (meshgradient.com and clones)** | Pretty output | Blend in sRGB, so mesh fields go grey where lobes meet. No color readout, no export beyond PNG, no contrast awareness. |
| **Figma's native gradient** | In the designer's tool already | sRGB only, no dithering, so a large-area gradient bands visibly the moment it is exported at 8-bit. Designers work around this by hand-adding noise layers. We automate exactly that workaround. |

### The single gap we are walking into

Every high-traffic tool in this category is technically wrong, and the one technically-right tool has
no traffic and no teaching. The differentiator is not "we also do OKLCH". It is that we make the
difference **visible in three seconds without the user reading anything**. That is the sweep.

### The thing that will get shared

Not the tool. The three-second sweep, screen-recorded. It answers "why does my gradient look muddy"
better than any blog post, and it is the same asset for SEO, for social, and for the product itself.
The build must treat the sweep as a deliverable, not as a flourish.

---

## 6. Scope boundary for v1

**In:** linear / radial / conic editing, stops (drag, add, delete, numeric entry), four interpolation
spaces with side-by-side comparison, mesh field, grain and dither, CSS / SVG / Tailwind v4 / PNG
export, colorblind simulation, worst-point contrast probe, URL hash share, 12 authored presets
plus 3 mesh fields, extract-palette-from-image, localStorage saved library.

**Out (named so we do not drift):** accounts, cloud sync, preset marketplace, Figma plugin, animated
mesh export, video export, team libraries, AI palette suggestions. All of those are listed in the
portfolio monetization note as later moves. None of them belong in the first shipped build, and
three of them would require a backend we do not have.
