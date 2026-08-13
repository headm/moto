# Moto — Third-Person Motocross Jump Game

A browser game: third-person view behind a dirt bike in an open jump park. Hit kickers, get air,
flip and spin, land clean, chain combos.

## 1. Design pillars

1. **Air is the reward.** Everything — camera, audio, scoring, terrain layout — exists to make
   leaving the ground feel enormous. Time slows slightly, camera pulls back, engine note opens up.
2. **Arcade, not simulation.** The bike is forgiving on the ground and expressive in the air.
   No stalling, no clutch, no realistic weight transfer. Landing is the only skill gate.
3. **Zero friction to play.** Loads in under 3 seconds, keyboard-only, no menus between you and
   the first jump. Nothing ever interrupts a session — landings are rated, never fatal.
4. **Readable at a glance.** Low-poly flat-shaded world so the horizon, ramp lips, and landing
   slopes are unambiguous at speed.

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Instant HMR, zero-config, static output deployable anywhere |
| Rendering | Three.js (WebGLRenderer) | Mature, good docs, shadow maps and instancing out of the box |
| Physics | **Hand-rolled arcade physics** | Full control over feel; a rigid-body engine fights you on bike tuning |
| Audio | Web Audio API directly | Need per-frame playback-rate control on the engine loop; `<audio>` can't do it |
| UI/HUD | Plain DOM overlay + CSS | HUD is text and bars; no reason to pay for canvas text or a UI framework |
| Debug | lil-gui | Live tuning panel — non-negotiable for getting bike feel right |
| State | Plain modules + one `World` object | Game is small; ECS would be overhead |

No physics engine, no game engine, no React. Total dependency count: 3.

## 3. Architecture

```
src/
  main.ts                 bootstrap, canvas, resize, RAF loop
  core/
    loop.ts               fixed-timestep accumulator + render interpolation
    input.ts              keyboard/gamepad → normalized InputState
    tunables.ts           every magic number, in one place, wired to lil-gui
  world/
    heightfield.ts        the terrain data model + h(x,z) and normal(x,z) sampling
    ramps.ts              ramp/kicker/gap definitions as height "stamps"
    park.ts               the feature layout and set-piece props, as plain data
    props.ts              water, the burning loop, alligators, castle gatehouses
    terrainMesh.ts        heightfield → BufferGeometry with slope-based vertex colors
    scatter.ts            instanced rocks, shrubs, banners, markers
    sky.ts                gradient sky, fog, sun, hemisphere light
  bike/
    state.ts              BikeState: position, velocity, yaw/pitch/roll, suspension, flags
    physics.ts            the integrator — ground contact, drive, steer, air, landing
    landing.ts            landing band classification, shared by physics/HUD/overlay
    model.ts              visual bike: frame, wheels, forks, rider rig
    rider.ts              rider pose blending (tuck, whip, superman, dead-sailor)
  game/
    camera.ts             spring-arm chase camera, FOV kick, shake
    tricks.ts             rotation accumulator → trick detection
    scoring.ts            airtime, trick points, combo multiplier, session best
    boostFx.ts            exhaust flames, exhaust light, ember/dust trail
  ui/
    hud.ts                speed, airtime, trick banner, score, combo
    overlays.ts           title card, controls hint
  audio/
    engine.ts             looped engine sample with RPM-driven playbackRate
    sfx.ts                land, scrape, whoosh, dirt, one-shot pool
```

### The loop

Fixed 1/120 s physics steps drained from an accumulator, capped at 8 steps per frame to survive
tab-switch stalls. Rendering interpolates bike transform between the last two physics states, so
the picture stays smooth at any display refresh rate. Physics must never see a variable `dt` —
that is where jump heights start depending on framerate.

## 4. The bike physics model (the heart of it)

The bike is a **single body with two probe points**, not two constrained wheels. This is the key
simplification and it's what makes the feel tunable.

**State:** `position: Vec3`, `velocity: Vec3`, `yaw`, `pitch`, `roll`, `wheelSpin`,
`suspFront`, `suspRear`, `grounded: bool`, `airTime`.

### Ground query

The entire world — base terrain *and every ramp* — lives in one heightfield, so ground contact is
an O(1) bilinear sample instead of a mesh raycast. Ramps are **mask-blended height stamps** (see §5) —
blended to a target rather than added, so a feature is levelled onto whatever it sits on.
Benefits: no tunneling at speed, no raycast cost, no mesh/collider desync. Cost: no overhangs or
quarter-pipes. Correct trade for a motocross game.

```
sampleHeight(x, z) -> number        // bilinear over the heightfield grid
sampleNormal(x, z) -> Vec3          // central differences, cached per cell
```

### Grounded behaviour

- Probe front and rear contact points at `position ± forward * wheelBase/2`.
- Each probe drives a **spring-damper**: `F = k * compression + c * compressionRate`, clamped
  to a max travel. This is the suspension, and it's what absorbs landings instead of stopping you dead.
  Two details turned out to decide whether it works at all (both found in M1, see §14):
  - `compressionRate` is *the ground rising minus the chassis rising*, not just the chassis. Omit the
    ground's own vertical velocity and the damper goes blind to a rising slope, so the spring alone
    has to absorb terrain arriving at several m/s and the bike rides permanently bottomed out.
  - The suspension force is **clamped to be non-negative**. A wheel can push the chassis up but
    cannot pull it down toward the ground. Allow negative force and the damper sucks the bike over
    every crest: terrain tracking becomes flawless and you never get air again.
- **Ground stick:** a gap smaller than a few centimetres still counts as grounded. The bike sits a
  little into its travel at equilibrium, so without a tolerance it detaches and re-attaches over
  every small bump — `airTime` becomes noise, and so do the trick detection and combo counter built
  on top of it in M3.
- **Pitch follows the ground automatically** from the front/rear height difference. This single
  line is what makes riding up a ramp feel right — the bike visibly noses up the face and points
  you at the sky at the lip.
- Drive: throttle → force along `forward` projected onto the ground plane. Brake → opposing force,
  stronger on rear. Rolling resistance always.
- Steering: `yawRate = steer * steerAuthority * speedFactor(speed)`, where `speedFactor` falls off
  at very low and very high speed. Lateral velocity is damped hard (the bike rails, it doesn't drift
  by default).
- **Lean is visual, derived:** `roll = -yawRate * speed * leanGain`, smoothed. Free-looking cornering
  for zero physics complexity.

### Preload / pop

Holding **brake + throttle** while grounded compresses the suspension beyond its rest point.
Releasing — or hitting a lip while compressed — adds a vertical impulse proportional to stored
compression. This gives the player a skill-expressive way to boost off a kicker and is the single
mechanic that most rewards learning the park. Tunable `popGain`.

### Airborne behaviour

- Gravity plus light quadratic drag. Nothing else touches velocity.
- **Air control is explicit and does not auto-level.** Pitch input rotates the bike freely
  (flips), steer input yaws (spins/whips), modifier + steer rolls (barrel rolls). Rotation rates
  are constant, so flip timing is learnable muscle memory.
- Accumulate signed rotation per axis for trick detection (§6).

### Landing

On the frame contact resumes:

1. Compute `pitchError` = bike pitch vs terrain slope along travel direction, and `rollError`.
2. Within tolerance → **clean landing.** Suspension eats the impact, forward speed is preserved
   (bonus speed if landing on a downslope), combo continues.
3. Near the edge → **sketchy landing:** big suspension compression, speed loss, camera shake,
   combo survives. This band is where the game feels generous.
4. Beyond it → **bad landing.** Heavy speed loss, hard camera shake, and a slower snap back upright
   so it reads as a scramble.

**There is no crash and no respawn.** The bike always recovers and keeps riding; lost speed is the
entire penalty. That keeps a freeride session in flow, and it turns tolerance from the difficulty
gate of the whole game into a feedback dial — which is a far smaller risk to carry into ramp design.

Landing tolerance is the primary difficulty dial and it must be exposed in the debug panel from day one.

## 5. World: the jump park

**Base terrain**: 1024×1024 world units, heightfield at 2-unit resolution (513² samples). Generated
from layered value noise — gentle rolling desert with a natural bowl in the middle — then flattened
along the ride lines so approaches are predictable.

**Ramps as stamps.** Each feature is a function that adds height over a footprint, applied in order
into the heightfield before mesh generation:

- `kicker(pos, dir, length, height, curve)` — the bread and butter, launches you
- `tabletop(pos, dir, length, height, deckLength)` — kicker + flat deck + landing ramp, with a gap
- `stepUp` / `stepDown` — height changes across a gap
- `berm(pos, arcCenter, radius, bankAngle)` — banked turn to link features
- `roller(pos, dir, count, spacing, height)` — whoops for rhythm sections
- `hip(pos, dir, height, twist)` — launches you off-axis; rewards spins
- `bigAir(pos, dir)` — the one enormous ramp with a long, forgiving landing slope

Ramp faces get a **cubic ease** rather than a straight wedge, so the transition at the base is
smooth and the lip kicks. A linear wedge feels like hitting a curb.

**Layout**: a hand-authored `park.ts` array of feature definitions arranged as a loop — start gate,
warmup rollers, three progressively bigger tabletops, a hip into the bowl, the big air ramp, and
berms linking it back to the start. Data-only, so iterating on the park costs an HMR reload.

**Rendering**: one non-indexed BufferGeometry, flat-shaded, vertex colors driven by slope and
height (dirt on flats, darker packed dirt on ramp faces, rock on steep slopes, sparse grass in
hollows). One directional light with a cascaded-ish single shadow map fitted to the camera
frustum. Exponential-squared fog to hide the terrain edge. Instanced scatter for rocks, shrubs,
and jump-side banners, skipped on ramp faces and ride lines.

## 6. Tricks and scoring

Trick detection reads the rotation accumulators at the moment of landing:

| Trick | Detection |
|---|---|
| Backflip / Frontflip | `abs(pitchAccum) ≥ 350°`, sign decides which |
| 360 / 720 spin | `abs(yawAccum) ≥ 350°` per rotation |
| Barrel roll | `abs(rollAccum) ≥ 350°` |
| Whip | yaw held > 25° off travel direction for > 0.4 s, returned before landing |
| Poses (superman, nac-nac, heel clicker, dead sailor) | pose key held ≥ 0.3 s in air, released before landing |

Combined rotations name themselves ("Flip Whip", "360 Superman"). Poses stack with rotations.

**Scoring**: `airTime² * airGain` + sum of trick base values, then `× comboMultiplier`.
Multiplier increments on each clean landing and resets on a bad landing or on being grounded for
more than 2 s. Banked score only lands when you touch down clean — so a huge run is a real gamble. Session
best is persisted to `localStorage`.

HUD: speed, live airtime counter that grows and changes color, trick names streaming in as they
complete, combo multiplier, score, session best.

## 7. Camera

Spring-arm chase camera, the piece most responsible for whether air feels big:

- Target sits behind and above the bike along a **smoothed travel direction**, not the bike's yaw —
  otherwise spins make the camera whip and induce nausea.
- Position critically damped toward the target; look-at point leads the bike slightly.
- **Airborne**: arm extends ~35%, FOV widens, damping loosens. The world falling away below you
  is the whole feeling.
- FOV kick with speed (a few degrees, eased).
- Landing shake scaled by impact impulse; crash shake plus a brief orbit.
- Never clip terrain: raise the camera if `sampleHeight` at its position is above it.
- Optional slight time dilation (0.85×) above a height threshold, off by default until it's tested
  against the scoring loop.

## 8. Controls

WASD rides, the arrow cluster rotates. Keeping the two jobs on separate hands means no chord is ever
needed to fly the bike.

| Action | Keyboard | Gamepad |
|---|---|---|
| Throttle | W | RT |
| Brake / reverse | S | LT |
| Steer (spin in air) | A D | Left stick X |
| Lean back (backflip) | ↓ or K | Left stick back |
| Lean forward (frontflip) | ↑ or I | Left stick forward |
| Barrel roll | ← → | Bumpers |
| Jump | Space | A |
| Boost | Shift (either) or E | B |
| Trick pose *(M3)* | 1–4 | B / X / Y |
| Respawn | R | Start |
| Tuning panel | H | — |

Pitch is on the vertical axis rather than a modifier chord: pull back to loop backwards, which is
the convention every MX game uses and the only one that survives being played rather than read.

**Jump** is a bunny hop, scaled by stored suspension compression (§4) — one per ground contact,
re-armed on landing rather than on a timer, so a held or mashed key can't hover. It overlaps with the
preload/pop mechanic below, and the two should probably merge in M3: hold Space to crouch, release at
the lip to pop. That also frees the trick poses to sit on 1–4 alone.

**Boost** is a tap, not a hold — a 2.5 s burst multiplying engine force and top speed (1.65× / 1.35×),
then a cooldown. Raising `maxSpeed` alongside acceleration is not optional: engine force is scaled by
`1 - along/maxSpeed`, so extra acceleration alone does nothing at exactly the moment you want it.
Ground-only activation, and an airborne press is ignored rather than consumed, because losing a boost
to a mis-tap in the air feels awful. A burst already running keeps counting through the air so
launching mid-boost isn't punished.

It is deliberately sequenced **before** the ramps. Launchability goes as `v²`, so boost converts
existing terrain into jumps — measured, it takes this map from 7% to 18% launchable. That makes it the
cheapest possible way to learn how much air is actually fun before ramp geometry is committed, which
de-risks M2. Three keys are bound at once (`RShift`, `LShift`, `E`) to be settled by riding; a tap
rather than a hold means which hand owns it barely matters. Supply is currently just the cooldown —
charges earned from clean landings arrive with the M3 scoring loop.

Input is polled into a normalized `InputState` each physics step, never read directly in physics
code — keeps the door open for replays and ghost recording.

## 9. Audio

- **Engine**: one looped sample, `playbackRate` driven by a synthetic RPM derived from wheel speed
  and throttle, with a gear-shift-like fold so the pitch doesn't rise forever. Volume ducks in air
  (no load on the engine), which is a surprisingly strong air cue.
- Wind whoosh crossfaded in with airborne speed.
- One-shots from a small pool: dirt scuff, suspension bottom-out, clean land, crash, trick chime.
- All audio gated behind the first input (browser autoplay policy) and behind a mute toggle.

## 10. Milestones

Each milestone ends at something playable in the browser.

**M0 — Skeleton (½ day).** Vite + TS + Three, canvas, resize, fixed-step loop, orbit camera, a flat
lit plane, lil-gui panel, stats overlay.

**M1 — It drives (1–2 days).** Heightfield + noise terrain + mesh with slope colors. Bike as a box.
Ground probes, suspension, throttle/brake/steer, auto-pitch. Chase camera. **Gate:** driving around
rolling terrain feels good with no ramps at all. If it doesn't, tune here — every later problem is
worse if this step is wrong.

**M2 — Landings (~1 day). Done.** Three-band landing rating, speed consequence, band-dependent snap
back, HUD feedback. No crash, no respawn.

A predicted-landing arc overlay was built here and then removed: from a chase camera directly behind
the bike it foreshortens into a near-vertical line, so the ground marker did all the work and the
line was noise. Worth remembering before reaching for it again as a ramp-authoring tool in M3.

Boost visuals also landed here, ahead of the M5 art pass, because a mechanic with no feedback is hard
to judge: twin exhaust flames, a flickering point light that pools on the dirt, and a pooled
ember/dust trail as instanced low-poly cubes. The light does most of the work — the terrain is
MeshLambert, so a moving orange pool costs almost nothing and sells the effect in a way additive
sprites cannot. It is added at startup with zero intensity so no material recompiles mid-ride.

Sequenced before the ramps deliberately: landing tolerance is an *input* to ramp geometry — a landing
slope can't be sized without knowing what counts as clean — and the jump plus boost-over-crests
already supply enough air to tune against. Tolerance is also about *angles*, not altitude, so a
bunny hop can present the system with a 180 deg error just as well as a tabletop can.

**M3 — Ramps (~1.5 days). Proving strip done.** Heightfield at 1 m cells, mask-blend stamps with
approach corridors, kicker/tabletop/rollers, five features in `park.ts`, and a validator that rides
every one at base and boosted speed. Remaining: berms, step-ups, and the full loop park.

Four things this turned up, all of which change the sketch below:

1. **Blend widths are bounded by the mesh, not the heightfield.** At `meshStride` 4 the rendered
   quads are 4 m, so the original 3 m lateral fade was narrower than a single quad and rendered as a
   cliff along the corridor edge. Fades need to span several quads — 14 m lateral, 8 m longitudinal.
2. **A ramp kicks harder than an ideal projectile.** The suspension releases at the lip, so measured
   apex ran 4.2 m where `launchRange` predicted 2.6 m. Sizing a landing from the ballistic formula
   alone puts the touchdown past the level part and onto the taper, which reads as an off-angle
   landing. The level section has to cover the *measured* range.
3. **A long levelled landing becomes a raised causeway** where terrain falls away. Tapering the
   stamp *weight* over the trailing flat — rather than the target height — keeps the touchdown zone
   level while reconnecting the far end to the hillside.
4. **Decorative geometry is the only kind available above the ground.** A heightfield cannot express
   an overhang, so anything you pass *through* — a loop, a tunnel, a gantry — is a prop with no
   collision. That is fine, and cheap, but it means such a prop is only correct if it sits on the
   actual flight path: place it from a *traced* trajectory, not from `launchRange`, and assert the
   pass with a check so retuning the ramp cannot silently move the bike out of the hole.
5. **Height reads against the horizon, not against the ground under the wheels.** The set piece
   originally launched *uphill*: 19.6 m of measured clearance, and it still felt sunken, because a
   110 m level landing pad cut across rising ground became a trench 16 m below the surrounding
   desert, leaving the ring level with the hillsides. Turning it to fire downhill — same ramp, same
   pop — put the apex 26 m above the desert floor with the ring against sky. Big features need to be
   sited against the *grade*, and a long level pad on sloping ground is always either a trench or a
   causeway.

   When the ride direction is fixed by flow and cannot be chosen — the player should meet features in
   one continuous run, not double back — the lever that remains is **pinning a run of features to a
   shared datum** (`baseY`). Each feature otherwise sits at its own local ground height, and the step
   between two pads lands on the lead-in fade: 3.5 m became a 12 deg climb that cost speed, 9 m became
   a 48 deg drop that cost the speed needed for the next ramp. A datum removes the steps instead of
   smoothing them, and where it sits above natural ground the fill *is* the platform a big feature
   needs — 11 m of it in the bowl, which is what gets #7's ring clear of the terrain.

   Two corollaries. The lead-in fade wants to be much longer than the trailing one (26 m vs 8 m),
   because it is where a pad meets whatever came before it. And the spawn height has to be
   re-sampled after stamping, or a pinned pad raises the ground and the bike starts buried in it.
6. **A convex crest throws harder than any angled lip, and is not bounded by suspension travel.**
   Two distinct mechanisms hide behind the word "pop". A concave face loads the spring and releases it
   at the lip, so it is capped by the 0.40 m of travel available — roughly 120 m/s². A convex crest
   (flat on top, steepest mid-face — i.e. the *back side* of a kicker) throws you because the ground
   falls away faster than gravity can follow, the same criterion as terrain launchability, and has no
   such cap: #7 runs at 328 m/s². An earlier note here claimed bottoming out "reads as hitting a
   kerb"; that was wrong. #7 bottoms the spring on every launch and is the best jump in the park.
7. **Put a gate short of the apex, not on it.** Vertical speed is zero at the apex, so it is the
   flattest-feeling instant of a jump. Moving the ring 9 m earlier, where the bike is still climbing
   at ~8 m/s, is the difference between being fired through it and drifting past it.
8. **Water fits the existing punishment model exactly.** Heavy drag below the surface takes your
   momentum and nothing else, which is the same rule the landing bands follow — no reset, no
   interruption. It needed no new failure state, just a `waterLevelAt` lookup and two lines of drag.
9. **Stamps must not cut into each other's dirt, and the validator must not credit a feature with
   its neighbour's air.** These two bugs concealed each other for several milestones. Approach
   corridors reach back their own length plus a 26 m lead-in, so each feature was flattening the tail
   of the one before it — a 2.31 m tabletop lip reduced to 0.45 m, and whoops shaved down. Meanwhile
   the park validator reported peak air over a run that continued past its target, so the flattened
   tabletop was reported at 1.40 s when it was actually managing 0.21 s. The lesson is that a
   measurement which ranges wider than the thing it names will eventually launder a failure. The
   validator now measures only the flight leaving the feature's own face, and asserts that every jump
   gets airborne — the one property nothing had checked, being too obvious to think of.

   Worth recording how the wrong fix looked right: the first diagnosis was that a tabletop's deck must
   sit below its lip, and a `lipDrop` parameter was built for it. It moved the measurement from 0.21 s
   to 0.23 s. Held against the real fix afterwards it made no difference at all (1.43 s vs 1.42 s), so
   it was removed. A plausible mechanism that produces almost no effect is evidence against itself.
10. **A single-valued surface cannot gain height around a closed loop**, which rules out a spiral
   ramp as *geometry*. Ride a terrace at constant radius through a full revolution and you arrive back
   at the same (x, z) — necessarily the same height — so the climb has to be given back somewhere.
   Built as a helicoid, the motte became concentric terraces separated by risers of `height / turns`
   that the bike simply fell off; it orbited indefinitely and never summited. Along a real spiral's
   centre-line the height depends only on radius, and that is a cone. So a rideable mound is a cone
   traversed diagonally, and the spiral is a *line* across it — marked with props, chosen because
   traversing keeps speed, not enforced by walls.

   The corollary for any launch off such a mound: it has to clear the entire flank or it lands back on
   the hillside. That wants a wide summit (run-up) and a narrow flank (less to clear), and the crest
   placed at the *rim* — a launch from the summit centre still has the whole summit to cross before the
   flank even begins.
11. **Landforms compose by max; corridors compose by replacement.** A second mound placed to overlap
   the first would carve a bite out of it under replacement semantics. Taking the maximum instead makes
   two cones merge into one massif with a natural saddle — which is the only way to get two summits
   close enough to jump between, since a launch off a mound's rim reaches barely past its own outer
   edge (79 m, against the 120+ m a separate mound would need).
12. **A riser can never be a hard gate.** The bike climbs up to roughly 60 degrees, and anything above
   45 cannot be drawn at this mesh resolution, so there is no such thing as an unclimbable face here.
   Step-ups work as *momentum* gates instead — clear the tier and keep everything, come up short and
   grind up a 35 degree face having lost your flow. That is the same currency water and bad landings
   use, so it needs no new failure state.
13. **A jumpable step-up sequence is inherently shallow.** Each tier needs horizontal run to be
   jumped, and the height a single jump can gain is capped by what the suspension throws at the speed a
   short platform allows — so the along-axis profile of a step-up monument cannot exceed roughly 10
   degrees however the numbers are arranged. Monumentality has to come from the *cross-section*
   instead: a wide stepped stone block with a narrow stairway cut up the middle reads as a monument
   from the side while staying rideable along its length.
14. **Terrace a slope with a sine, not with steps.** Making a flank jumpy wants treads and banks, but
   hard steps on a steep flank put the riser inside a single mesh quad, where it draws as a row of
   vertical fins. A sine superimposed on the cone, with amplitude set so its peak slope equals the
   cone's own, flattens the treads and doubles the bank slope while staying everywhere smooth — same
   terraced result, nothing undrawable, and the endpoints stay exactly where the cone put them.

   The sizing rule that ruled out real step-up tiers is worth keeping: a tread must be ~10 m to land
   on and a rise must be under ~5 m to be jumpable, so a stepped climb needs roughly 3 m of horizontal
   run per metre of height. Anything steeper than that has to be banks-and-crests instead.
15. **Launch angle sets the do-nothing landing.** There's no auto-level, so the bike leaves a lip
   holding the lip's pitch; on flat ground the resulting error *is* the launch angle. Angles at or
   under ~24 deg therefore land clean with no input, which correctly reserves the sketchy and bad
   bands for failed rotations rather than for ordinary jumping.

Original sketch, still to do: Heightfield to 1 m cells (`res: 1025`, `meshStride` 4 to hold the
triangle count) so a lip is actually resolved. Mask-blend stamps — *not* additive, or a ramp on a
slope comes out lopsided — with approach corridors. Kicker and tabletop with geometry derived from
the ballistic arc: a projectile returning to launch height always arrives at exactly its launch
angle, so a landing pitched at -theta is aligned across the whole speed band. Boost widens the
required landing zone by ~25 m on a single ramp, so landings are long slopes, not platforms. Proving
strip first, then the park, then a validator that sweeps every feature across the speed band.
**Gate:** hitting a kicker and landing a backflip is satisfying.

**M4 — It's a game (2 days).** Trick detection, scoring, combos, HUD, session best. Full park
layout with all feature types. Preload/pop mechanic. **Gate:** a five-minute session where you want
to beat your score.

**M5 — It looks made (2–3 days).** Real bike model with animated wheels/forks, rider rig with pose
blending, shadows, sky, fog, scatter props, particles (dirt kick-up, landing puff, dust trail).

**M6 — It sounds made (1 day).** Engine RPM loop, wind, one-shots, mixing.

**M7 — Ship (1 day).** Title card, controls overlay, pause, mobile detection message, perf pass
(instancing, shadow budget, geometry merge), Lighthouse check, static deploy.

Roughly 10–12 focused days to M6; M3 is the point where it's worth showing anyone.

## 11. Performance budget

- 60 fps on integrated graphics at 1080p. Frame budget 16.6 ms, target ≤ 8 ms CPU.
- Draw calls under 60: merged terrain, instanced scatter, one bike.
- Triangles under 250k.
- Single 2048² shadow map, tight frustum fit, `needsUpdate` only when the sun or camera moves far.
- No per-frame allocation in physics or camera code — scratch vectors are module-level singletons.
  This is the difference between smooth and a GC hitch every few seconds.
- Bundle under 500 KB gzipped excluding audio; audio streamed and lazily decoded.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bike feel is "off" and hard to diagnose | Every constant in `tunables.ts` behind lil-gui, with save/load of presets to JSON. Gate M1 on feel before adding ramps. |
| Landing tolerance too harsh → frustrating | Three bands (clean / sketchy / bad), none fatal, generous middle; all thresholds in the debug panel |
| Ramp transitions feel like curbs | Cubic-eased ramp faces, and a debug overlay drawing the sampled ground normal along the ride line |
| Camera makes spins unreadable or nauseating | Camera follows smoothed *travel* direction, not bike yaw; damping tuned separately for ground and air |
| Heightfield-only world limits features | Accepted. If a quarter-pipe becomes essential later, add mesh-based colliders as a second ground query source behind the same `sampleHeight` interface. |
| Scope creep into multiplayer / progression | Explicitly out of scope for v1; noted below |

## 13. Verification

Feel is judged by riding it, but feel is impossible to judge on top of a model that is quietly
unstable. `npm run sim` runs the real physics modules headless — no mocks — with scripted input, and
asserts the things that otherwise take an hour of riding to notice:

- terminal speed lands in a usable band, and nothing ever goes NaN
- the suspension keeps travel in reserve and never rides on its stop
- pitch actually tracks the slope it's riding (a sign error here doubles the error instead of
  halving it, so this check also pins the orientation conventions)
- steering right turns right and leans *into* the corner, not out of it
- contact doesn't flicker, and the terrain can still launch the bike at speed
- a 25 m drop is survived, doesn't trampoline, and settles back to ride height
- three minutes of pseudo-random input stays finite and bounded

Every one of these was written because it caught something. Add to it rather than replacing it as
the model grows.

## 14. What M1 turned up

Recorded because these were not obvious from the design, and all three change §4:

1. **The damper must see the ground's velocity, not just the chassis'.** Climbing at speed, terrain
   arrives at several m/s; a damper that only opposes chassis motion leaves the spring to absorb it
   alone, needing more travel than exists. The bike rode bottomed out 19% of the time. Computing the
   ground's vertical velocity analytically from the terrain gradient (`-∇h · v`) rather than by
   differencing samples keeps it stable at any timestep.
2. **Then the opposite failure appears.** With a correct damper the suspension tracks terrain so well
   it sucks the bike over crests and air disappears entirely. Clamping the suspension force to be
   non-negative fixes it and is the physically honest constraint: a wheel cannot pull.
3. **Steering shipped mirrored, and a passing test hid it.** Rotation about +Y is counter-clockwise
   seen from above, so increasing yaw is a *left* turn — steering right has to decrease it. Compounding
   that, the bike model is authored nose-toward +Z while Three's convention is -Z, which makes the
   model's local +X the rider's *left*. The two errors cancel in the lean-versus-turn relationship, so
   the bike leaned correctly into every corner and the "leans into the corner" check passed: it was
   comparing roll against yaw, both expressed in the same flipped frame, and so validated internal
   consistency rather than direction. Direction assertions have to be anchored to something outside
   the convention under test — here, that pressing right moves the bike toward world +X on screen.
   §4's sign conventions are now stated explicitly at the top of `physics.ts`.
4. **Terrain launchability is a measurable property, not a matter of taste.** A bike leaves the
   ground when `v² · curvature > gravity`. Surveying curvature across the world showed the original
   roll-band amplitude made only 0.5% of the map able to throw the bike at top speed — hence no air.
   At 6 m it's ~5%, with slopes still topping out around 29°. Reaching for more fine-grained noise
   instead would have produced the same statistic through short sharp bumps, which read as
   suspension chatter rather than as a jump.

## 15. Out of scope for v1

Multiplayer, ghosts and replays, bike customization, progression and unlocks, multiple parks,
mobile touch controls, weather. The `InputState` indirection and data-driven park layout are there
so the first three are cheap to add later.
