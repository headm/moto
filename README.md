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

## Current state: M4 — it keeps score

Riding works, landings are rated, there are ramps, and what you do between the lip and the landing is
now worth something. Terrain, suspension, steering, lean, air rotation, jump, boost, trick detection,
scoring, combos, landing feedback, the chase camera and a full set of features are in.

## Tricks

Tricks need no new keys. They are the air controls you already have, held long enough to come all the
way round.

| Trick | How | Base value |
|---|---|---|
| Backflip / Frontflip | `↓` / `↑` held in the air | 250 |
| 360, 720, 1080 | `A` / `D` held in the air | 150 per turn |
| Barrel roll | `←` / `→` held in the air | 200 |
| Whip | kick the bike sideways of where it's going, then straighten it before you land | 120 |

Rotation is counted **signed**, and that one choice is what separates a spin from a whip: a 360 sums
to 360, while a whip out and back sums to roughly nothing even though the bike passes through the same
angles. So a completed spin can't also bank a whip — and a whip still hanging out at touchdown doesn't
count either, because at that point it's just a sideways landing, which the landing rating already
punishes.

The first revolution completes at **350°, not 360**. The bike leaves a lip already pitched up and
lands on a downslope, so a flip that reads as finished to the rider is a few degrees short of a
geometric turn. Every turn *after* the first still costs a full 360 — 700° is a single, not a double.

Combined rotations name themselves: `Backflip 360`, `Double Backflip`, `Backflip 360 Whip`.

Poses — superman, nac-nac, heel clicker — are deliberately not in yet. The rider is six boxes welded
to the chassis, and a pose that scores without visibly happening is a key press for points. They
arrive with the rider rig in M5.

## Scoring

```
(airTime² × airGain + trick values) × combo
```

**Airtime is squared.** Two seconds pays four times one, not twice. A bigger jump has to be worth
disproportionately more than a safe one or nobody takes it, and that arithmetic is the whole of design
pillar #1 expressed as a number.

**Points are banked by landings, not by air.** Everything earned in flight is at risk until the wheels
are down, so a huge run is a real gamble rather than a formality:

| Landing | Banks | Combo |
|---|---|---|
| Clean | all of it | +1, up to ×10 |
| Sketchy | half | held where it is |
| Bad | nothing | back to ×1 |

The combo also drops after two seconds of unbroken ground contact, which makes it a hot streak rather
than a balance — and makes the whoops worth riding. Chain small clean hops to build the multiplier,
then cash it on something big: a backflip off #7 at ×7 is worth more than four of them taken cold.

Session best persists to `localStorage`. `R` keeps your score, because respawn is how you cross the
park and travelling shouldn't cost points, but it does drop the combo — nothing was landed.

Both trick detection and scoring are stepped at **physics rate, not render rate**. Two landings can
fall inside one rendered frame, and the second must not erase the first's effect on the combo.

## The park

Features are numbered in this table and in `npm run sim`, so a feature can be named the same way in the
harness and in conversation. The numbers are not signposted in the world — flags on poles at every
approach turned out to be more clutter than help.

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
| 9 | the motte | 30 m tall | — | — | **5 hops riding up it** |
| 10 | the far peak | 26 m tall | — | — | the target |
| 11 | the drop | 3.4 m | — | 0.40 m | boosted: **peak to peak** |
| 12 | the ziggurat | 5 tiers, 20 m | — | — | jump *up* it |
| 13 | the pinnacle | 3.0 m | — | — | off the top, 20 m up |

**#9/#10 is the castle.** Two stone mounds, 30 m and 26 m high, each with a **gatehouse straddling its
ride line** — twin spired towers, a lintel with battlements, a portcullis hanging in the arch — so you
ride *through* the gate and off the rim beyond. Stand on the first summit and you can see the second
gate framed inside the first arch.

Like the fire ring, the gates are decoration with nothing to collide with, which means the arch only
reads correctly if it is centred on where the bike actually goes. Both are placed on their motte's
ride line for exactly that reason.

**#9 to #10 is a gap jump between summits.** Boosted, the launch off #9's rim carries you across the
saddle onto the far peak, 28 m from its centre. Unboosted you come up short and land on the flank in
between. The two peaks *have* to share a massif — a launch off #9 reaches barely past #9's own outer
edge, 79 m against the 120+ m a separate mound would need — so mottes compose by **max** rather than by
replacement, and two overlapping cones make one massif with a saddle.

**#9's flank is terraced into four banks**, so riding up it is a sequence of jumps rather than a grind:
near-flat treads separated by 44° banks, each cresting hard enough to throw the bike. Straight up the
face that is 5 hops, the longest 0.94 s, 3.5 s airborne in total, summiting in about 6 seconds. The
banks land *sketchy* if you don't tuck the nose, so each one costs 20% of your speed — the climb is a
landing drill, not a ramp.

Real step-up tiers were the first attempt and don't fit: a tread has to be ~10 m to land on and a rise
≤5 m to be jumpable, which needs a 90 m flank, and widening #9 that far absorbs the far peak entirely.
The terracing is a *sine* superimposed on the cone instead — amplitude set so its peak slope equals the
cone's, which flattens the treads and doubles the bank slope while staying smooth. Hard steps at this
scale would put risers inside a single mesh quad and draw as vertical fins.

Widening #9 to 100 m did mean shrinking #10 into a small steep tor (44 m radius, 26 m tall) so it still
stands clear of #9's flank and remains a target worth aiming at.

The mounds' surface is otherwise a **cone you traverse**, not a spiral ramp, and that is forced rather
than chosen. A heightfield stores one height per point, so the surface cannot gain height around a closed
loop: ride a terrace at constant radius through a full revolution and you return to the same point,
which must be the same height. Built as a helicoid it became concentric terraces separated by risers
the bike fell off — it orbited forever without ever summiting. Along a real spiral's centre-line the
height depends only on radius, which *is* a cone. So a cone is the honest form: take whatever line up
it you like, and traversing keeps more speed than charging straight up.

**#12 the ziggurat** is five 6 m tiers you gain height on by *jumping*, not climbing: platform, crest
kicker, void, then the next tier's face 6 m higher, to a summit 20 m up with a launch off the top.

The rideable stairway is unavoidably shallow — each tier needs horizontal run to be jumpable, and the
height one jump can gain is capped by what the suspension throws at the speed a short platform allows,
so the along-axis profile can never exceed about 10°. The monument read therefore comes from the
**cross-section**: the block is 88 m wide, stepped and stone-shaded, with the 30 m stairway cut up the
middle of it. From the side it is a terraced platform; ridden, it is a stairway.

Note what a riser can and cannot be. The bike climbs anything up to roughly 60°, and a face steeper
than about 45° cannot be drawn at this mesh resolution — so a riser is never a hard gate. It is a
**momentum** gate: clear the tier and you keep everything, come up short and you grind up a 35° face
having lost your flow. Same currency as water and as a bad landing.

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
ramp geometry. It still has no supply cost beyond its cooldown — now that there is a scoring loop to
spend against, earning charges from clean landings is the obvious next thing to try.

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
src/bike/      state, physics, landing bands, model
src/game/      chase camera, boost fx, trick detection, scoring
src/ui/        HUD, tuning panel
scripts/sim.ts headless physics harness
```

The one structural thing worth knowing: terrain *and* (from M2) every ramp live in a single
heightfield, so ground contact is an O(1) height sample rather than a mesh raycast. No tunneling at
speed, no collider/visual desync. The cost is that overhangs are impossible — fine for motocross.

In dev builds, `window.__moto` exposes the bike state, the trick and score trackers, a `probe()`
snapshot and a `fastForward(seconds, input)` that steps physics without waiting for frames.
