# moto

Third-person browser motocross. Open dirt park, hit kickers, get air, land clean.

See [PLAN.md](PLAN.md) for the design and milestone breakdown.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run sim` | Headless physics checks — see PLAN.md §13 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck, then production build into `dist/` |

## Controls

WASD rides the bike, the arrow cluster rotates it.

| | |
|---|---|
| `W` / `S` | Throttle / brake (hold `S` at a standstill to reverse) |
| `A` `D` | Steer on the ground, spin in the air |
| `↓` / `↑` | Lean back / forward — pull back to loop backwards |
| `←` / `→` | Barrel roll |
| `Space` | Jump |
| `Shift` (either) or `E` | Boost — tap it, ground only |
| `R` | Respawn |
| `H` | Show/hide the tuning panel |

A gamepad works too: triggers for throttle and brake, left stick to steer and pitch, bumpers to roll,
`A` to jump, `B` to boost.

**Boost** is a tap, not a hold: one press gives a 2.5 s burst that takes you from about 91 to 122 km/h,
then a 1.5 s cooldown. It only starts on the ground, and an airborne press is ignored rather than
consumed. A burst already running keeps going through the air, so launching mid-boost isn't punished.

That matters more than the speed suggests. A bike leaves the ground when `v² · curvature > gravity`,
so launchability scales with the *square* of speed — boosting takes the share of this map that can
throw you from 7% to 18%. Boost doesn't just make you faster, it turns terrain into ramps.

Visually a burst lights twin exhaust flames, throws a flickering pool of orange light across the dirt
behind you, widens the camera FOV and punches the shake. There is also a pooled ember and dust trail,
switched off by default (`emberRate` / `dustRate` are 0) — turn either up if you want it back. All of
it is on dials under `Boost` in the tuning panel.

The jump is a bunny hop that spends whatever the suspension has stored, so one taken just after a
compression goes noticeably higher than one from a settled bike — about 1.3 m flat, 1.6 m loaded. You
get exactly one per ground contact, so it can't be mashed into a hover.

## Current state: M3 — a proving strip of ramps

Riding works, landings are rated, and there are ramps. Terrain, suspension, steering, lean, air
rotation, jump, boost, landing feedback, the chase camera and a first set of features are in. There
are no tricks and no scoring yet — that's M4.

Features are numbered, with a flag on a pole at the mouth of each approach. The same numbers print in
`npm run sim`, so a feature can be named the same way in the world, in the harness and in
conversation.

| # | Feature | Lip | Pop at 25 m/s | Susp. used | Air (base / boosted) |
|---|---|---|---|---|---|
| 1 | warmup whoops | — | — | — | rhythm section |
| 2 | first kicker | 1.9 m | 60 m/s² | 0.30 m | 1.28 / 1.47 s |
| 3 | tabletop | 2.3 m | 60 m/s² | 0.31 m | 1.42 / 1.63 s |
| 4 | big air | 5.2 m | 49 m/s² | 0.27 m | 2.04 / **2.44 s, 14 m up** |
| 5 | sharp kicker | 1.7 m | 98 m/s² | 0.37 m | 1.30 / 1.45 s |
| 6 | side hip | 2.4 m | 30 m/s² | 0.25 m | 1.36 / 1.55 s |
| 7 | the gauntlet | 5.6 m | **328 m/s²** | 0.40 m | 2.87 / **3.13 s, 25 m up** |
| 8 | gator pond | — | — | — | the bit you'd rather clear |

**#7 is the set piece**, and it continues the run: spawn, ride #1–#4, then straight into it. 3.12 s of
air boosted, through a burning loop 20 m up on ten-metre legs, over a pond with alligators in it.

Riding south means riding into *rising* ground, which is the hard case — a level landing pad cut across
it becomes a trench, and an earlier version of this jump launched from the natural bowl floor and put
the ring level with the surrounding hillsides. What fixes it is siting the ramp at the end of **#4's
landing pad**, which already holds the ground at -7 where the bowl floor here is -18. Launching off the
pad rather than off the low point is 11 m of world height for free, and that is the whole difference
between a ring that towers and a ring that sinks.

Its face is a **crest**, not an angled lip. Riding the back side of #4 turned out to be the most fun
jump in the park, and the reason is that a back side is a different shape: steepest in the *middle*,
flat on top, so it throws you off convex curvature instead of off an edge. You leave nearly level and
get lofted rather than angled. #7 is that shape built deliberately — 8 m rising 5.6 m, 328 m/s² at the
crest, which drives the spring to its stop on the way up.

Height above the ground under your wheels is not what reads as height; height against the horizon is.

The ring sits at `z=-153`, short of the apex at `z=-163`. At the apex vertical speed is zero, which is
the least dynamic instant of the flight; 10 m earlier the bike is still climbing at ~10 m/s and it
reads as being fired through the ring rather than drifting past it at the top.

Its 60 m approach bridges #4's runout into one continuous pad, which also leaves room to rebuild speed
and clear the boost cooldown — boost #4 and you are ready again about 45 m before #7's crest.

Boosted you clear the water. Unboosted you land in it and spend nearly three seconds submerged, which
costs you almost all your speed — water punishes the same way everything else here does, by taking
momentum and never by ending the run.

The loop is **decoration, not collision**: ground contact is a heightfield sample, which by
construction cannot represent an overhang, so there is nothing to hit. That only works if the hole is
genuinely on the flight path, so its position comes from a traced trajectory using the real physics
rather than from the ballistic formula (which lands several metres low, because the ramp kicks). The
harness asserts the bike still passes inside the ring, so retuning #7 breaks that loudly instead of
silently.

**Pop comes from face curvature, not height.** The suspension loads at a rate set by `v² × curvature`
and releases at the lip, so what throws you is the curvature the face carries *where you leave it*.
For a face of `H·tⁿ` at a fixed launch angle that works out to `tanθ·(n−1)/L` — so a short cubic face
throws you far harder than a long parabola of the same height, and being lower, costs less speed to
climb. `exponent` is the dial: 2 is mellow, 3 pops.

There are two ways to be thrown, and they read differently:

- **Concave face, angled lip** (`face: 'power'`) — the spring loads up the face and releases at the
  edge. Bounded by suspension travel: past roughly 120 m/s² there is only 0.40 m of it left to give.
- **Convex crest** (`face: 'crest'`) — the ground drops away faster than gravity can follow, which is
  the same criterion as terrain launchability. Not bounded by travel at all, which is how #7 reaches
  328 m/s² and stays fun rather than harsh.

That distinction corrects something stated here earlier: bottoming the suspension was described as
reading like hitting a kerb. It doesn't. #7 bottoms it completely on every launch and is the best jump
in the park — the mechanism matters more than the number.

Ramps are height *stamps* written into the same heightfield as the terrain, so ground contact stays
an O(1) sample: no meshes, no colliders, nothing to desync. They mask-*blend* rather than add, which
levels a feature onto whatever it sits on so the same kicker launches identically anywhere. Each one
also carves a level approach corridor, so you never hit a lip off-camber. Edit `src/world/park.ts`
to move things around — it's plain data — then `Regenerate terrain` in the panel, or reload.

**The main line shares one datum** (`LINE_Y`). Each feature otherwise sits at its own local ground
height, and the step between consecutive pads has to be absorbed by the lead-in fade: a 3.5 m
difference into #4 was a 12° climb that cost speed, and the 9 m one into #7 was a 48° drop you landed
on hard and then arrived at the ramp with nothing left. Pinning #1–#4 and #7 to a single plane removes
every step rather than smoothing it, and the run from spawn to the ring is now flat except for the
ramps themselves. Where the datum sits above the natural ground — 11 m in the bowl at #7 — that fill
becomes the platform the fire ring needs.

`npm run sim` validates the park: it rides every feature at base and boosted speed and reports air
time, height and the landing band, so an unclearable gap shows up before you ever ride it. It measures
only the flight that leaves the feature's *own* face and stops when that flight lands — reporting peak
values over a longer run credited each feature with whatever came next, which hid a tabletop that had
stopped jumping entirely. There is now also a check that every jump gets airborne at all, which is the
one thing every jump exists to do and the thing nothing had been asserting.

**An approach may cut natural terrain, but never another feature's dirt.** Approaches reach back a long
way — their own length plus a 26 m lead-in — so without that guard each feature quietly flattens the
tail of the one before it. It had reduced a 2.31 m tabletop lip to 0.45 m and shaved the whoops, which
reads as dead space where a jump used to be.

**Landings are never fatal.** There is no crash and no respawn: the bike always snaps back upright
and carries on. Every landing over 0.25 s of air gets rated on the angle between the bike and the
ground it touches, and the only consequence is speed:

| Band | Angle | Keeps |
|---|---|---|
| Clean | under 25° pitch / 30° roll | all of it |
| Sketchy | up to 50° / 60° | 80% |
| Bad | beyond | 45% |

A worse landing also shakes the camera harder and snaps back more slowly, so it reads as a scramble
rather than a teleport.

Landings came before ramps because tolerance is an *input* to ramp geometry — you can't size a
landing slope without knowing what counts as clean — and because the jump and boost already provide
enough air to tune against. Boost is deliberately ahead of the ramps: because launchability goes as v², it converts existing
terrain into jumps, which is the cheapest way to find out how much air is fun *before* committing to
ramp geometry. It currently has no supply cost beyond its cooldown; earning charges from clean
landings comes with the scoring loop in M3.

**The tuning panel is the point of these milestones.** Press `H`, and change things while riding —
every number that affects feel is in there, and nothing downstream hardcodes a constant. `Presets →
Save to browser` keeps a setup across reloads; `Reset to defaults` gets you back.

If the bike feels wrong, the dials that matter most, in order: `Bike → engineAccel` and `rollDrag`
(how it pulls), `Suspension → springK` and `springC` (how it sits and how it lands), `Steering &
lean → maxYawRate` and `leanGain` (how it corners), and `Camera → distGround` / `posDampGround` (how
big it all feels).

## Layout

```
src/core/      loop (fixed timestep), input, tunables
src/world/     heightfield, terrain mesh, sky
src/bike/      state, physics, model
src/game/      chase camera
src/ui/        HUD, tuning panel
scripts/sim.ts headless physics harness
```

The one structural thing worth knowing: terrain *and* (from M2) every ramp live in a single
heightfield, so ground contact is an O(1) height sample rather than a mesh raycast. No tunneling at
speed, no collider/visual desync. The cost is that overhangs are impossible — fine for motocross.

In dev builds, `window.__moto` exposes the bike state, a `probe()` snapshot and a `fastForward(seconds,
input)` that steps physics without waiting for frames.
