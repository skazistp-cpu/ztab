# The Ztab street (3D): handoff for the landing

A real-time isometric street that the camera travels along as the page scrolls. It has five stations, one per step
of a tab, and a wide reveal at the end that falls into night. This folder is self-contained: `three` (MIT) is its only
dependency, there are no textures or fonts, and nothing is fetched from another origin.

## Load it

```ts
// Only when motion is allowed, and only when the section is about one viewport away (Lighthouse never sees it).
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try {
      const { mountStreet } = await import('./street3d/index.ts');
      const street = await mountStreet(stageEl, { onReady: () => stageEl.classList.add('street-ready') });
      // ...wire it up (below)
    } catch {
      // No WebGL 2 (or anything else): keep the static pictures.
    }
  }, { rootMargin: '100% 0px' });
  io.observe(sectionEl);
}
```

- **The host element:**
  - `mountStreet(host)` appends a `<canvas aria-hidden="true">` that fills the host (`width: 100%; height: 100%`).
  - Give the host a size: the pinned stage, e.g. `position: sticky; top: 0; height: 100svh`.
  - The canvas is transparent, so the page's background shows through.
- **It rejects** if WebGL 2 is unavailable or setup throws. On a rejection, keep the fallback images.

## The handle

| Member | What it does |
|---|---|
| `setProgress(p)` | `p` runs 0..1 through the pinned section; call it on scroll. The module eases toward `p` itself with a critically damped spring, so pass the raw scroll progress, not an eased one. |
| `setPaused(on)` | Hooks into the page's "Pause motion". Paused, idle motion and easing freeze and nothing redraws. A later `setProgress` jumps straight to the new progress and draws that one still frame, with no animation. |
| `resize()` | Optional: a `ResizeObserver` on the host already handles resizes. |
| `dispose()` | Stops everything, frees the GPU resources and removes the canvas. |
| `stations` | `[0.15, 0.322, 0.54, 0.72, 0.87]`: the progress at which each station is centred, for the captions and the progress rail. |
| `anchors()` | Screen positions (CSS px, relative to the canvas) of the six people's objects as `{ id, x, y, visible }`, for DOM labels such as "Lena $56.00". Ids are `lena ana dragan tomas priya jonas`. The objects are the cards at stations 1–2, the phones or name tags at 3, the phones at 4 and the board's rows at 5. On portrait screens nothing is `visible` at stations 2–4; use `items()` there. |
| `items()` | Each person's state at the current station as `{ id, active, done }`, for a compact legend on phones. `active` means their card, phone, coin or tick is moving now; `done` means it has finished at this station. |
| `dusk` | `[0.94, 1.0]`: nightfall. Over this span the street goes from day to night: blue-grey ink tones, every lamp, window and the gold inlay lit. Fade the page's own background from white to ink over the same span. The canvas stays transparent. |
| `debug` | For tests and the lab only: `jump(p)` (no easing), `time(t)`, `look(at, h)`, `stats()`, `meshes()`, `canvas`. |

## The story on the scroll (p)

| p | What happens |
|---|---|
| 0–0.012 | A pure charcoal close-up of the printer top: the match cut from the hero's dark bill folder. |
| 0.01–0.09 | The camera pulls back. The receipt prints, curls and hangs. The gold bar drops at 0.088. |
| 0.09–0.215 | Six strips are cut: five equal, Jonas's narrower. They rise as a fan, fold and widen into gold-framed cards. |
| 0.22–0.47 | The cards fly to the link post and rise on wires into a 2×3 grid. Packets glide along the gold inlay to the café. |
| 0.47–0.615 | Phones rise round the table code. A scan ray reaches each phone and blank name tags pop up. |
| 0.615–0.79 | The phones glide to the bank. A coin arcs from each into the phone-shaped door, which glows. |
| 0.79–0.9 | A packet runs to the ledger. Six ticks land and the ring fills. |
| 0.9–0.97 | Every lamp comes on and the camera pulls back over the whole street (on phones: a medium shot of stations 4–5). |
| 0.94–1 | Nightfall. |

Lamps come on as the camera passes them. Idle motion (leaves sway, cards and phones bob, bulbs twinkle) runs while
the section is on screen and motion is not paused.

## Life (all on the idle clock: it stops with `setPaused(true)`, off screen and in a hidden tab)

- **Ambient:**
  - Cloud shadows drift over the street by day, at about 7% darkening, gone by nightfall.
  - The camera breathes a little when the page is still (about 0.15% of the frame, 7–9 s), never while it is scrolled.
  - String lights and hanging lamps sway, awning scallops ripple, crowns rustle and potted leaves sway.
  - Steam rises from the café's cups and machine as thin grey strokes.
  - Now and then a pair of ink birds glides over, by day only.
- **Beats:**
  - Station 1: the printer shakes and its gold light blinks while it prints. Gold sparks and a flash along the blade
    mark the cut, and the strips flutter.
  - Station 1: each card flips as it forms, and a light sweeps its frame.
  - Station 2: the wires pulse as packets pass, and the kiosk window glows at each launch.
  - Station 3: each phone wiggles when scanned, the scan line glints, and the tags pop with a soft overshoot.
  - Station 4: coins tumble and glint, and a gold ring spreads on the vault door with each one.
  - Station 5: ticks land with spark bursts and their rows brighten. The ring's fill has a bright head.
  - A slow shimmer runs down the gold inlay now and then.
- **Nightfall:**
  - The lamps come up one by one from the far end, each with a flicker.
  - The shop windows light in no particular order and warm the pavement in front.
  - Dust motes drift in the lamplight.

## Framing

- **Wide screens:** each station sits right of centre (60% from the left), leaving the left for the captions.
- **Portrait (aspect under 0.8):**
  - The camera is closer, with the station in the upper part and the bottom 30% left for a caption block.
  - Station 1's cards form two rows of three.
  - The bank's phones form two rows.
  - The café's name tags sit at alternating heights.

## Sizes and performance (measured)

- **Chunk:** the module with `three` is 204.4 KB gzip (174.3 KB brotli). The landing's own chunks are unaffected
  because it is a dynamic import.
- **Rendering:**
  - Per frame at most 56 draw calls and 148k triangles, counting the main pass, the shadow pass and post together.
  - Draws happen only while the easing settles or idle motion runs. None while paused, off screen, with the tab
    hidden, or after `dispose()`.
- **Speed:** Chromium on an Apple M3 Pro, with a real 4× CPU throttle and a full scroll from 0 to 1:
  - 1440×900 at DPR 1.75 and 390×844 at DPR 1.5 both ran at 120 fps, p99 frame 9.3 ms, no frames over 20 ms.
  - CPU per frame under that throttle is about 1–2.5 ms.
  - DPR is capped at 1.75 (1.5 on phones) and steps down by 0.25 if frames run over 20 ms.
- **WebKit** (Playwright, Safari 26.5 engine): renders every station and the night, with no console errors.
- **The table's QR** is decoration: a 23-module noise grid, which is not a size any QR version has. jsQR decodes
  nothing from it in 12 rendered close-ups (zooms down to h = 0.3) or 10 pattern variants (5 module sizes, both
  polarities).

## How it draws

- **Camera:** orthographic, true isometric (azimuth 45°, elevation 35.264°), matching the café picture's 30° tile edges.
- **Main pass:** one toon material draws everything into colour plus info (view normal, part id, crease flag) and depth.
  The toon ramp is fitted to the station art (lit faces 0.909 against the art's 0.916, right faces 0.729 against
  0.732, warm shade).
- **Ink pass:** draws the outlines from the info and depth.
- **Anti-aliasing:** SMAA, with 8-bit targets.
- **Glows:** halos and scan rays are added on top.
- **Shadows:** one soft shadow map, redrawn only when the camera or something that casts a shadow moves.
- **Static geometry:** merged into x-chunks, so both passes cull what is off screen.

## Files

- **Entry and wiring:**
  - `index.ts`: `mountStreet`, the spring, the loop, lamps, nightfall.
  - `pipeline.ts`: render passes.
  - `materials.ts`: shaders.
  - `world.ts`: scene, halos, beams.
- **The street and its stations:**
  - `street.ts`, `props.ts`: pavement, shops, trees, lamps, benches.
  - `act12.ts`: stations 1–2.
  - `act345.ts`: stations 3–5.
- **Shared:**
  - `camera.ts`: the path of keys, wide and tall.
  - `spots.ts`, `layout.ts`, `palette.ts`, `geo.ts`, `ease.ts`.

The lab page in `apps/street3d-lab` (`npm run dev` / `npm run build` there; it uses `apps/web`'s Vite) shows the module
with captions, labels, the phone legend and the night fade. URL parameters: `?p=0.5&still=1` holds a still,
`hud=0` hides the stats, and `tags=0` / `cap=0` hide the labels and captions.
