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
| `npm run sim` | Headless physics and park checks — see PLAN.md §13 |
| `npm run map` | Top-down PNG of the park with the tracks drawn on it |
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
| `T` | Start (or restart) a 3-minute time trial |
| `H` | Show/hide the tuning panel |

A gamepad works too: triggers for throttle and brake, left stick to steer and pitch, bumpers to roll,
`A` to jump, `B` to boost.

## Time trial

Press `T`. Three minutes, back to the spawn pad, score from zero — bank as much as you can and the
run is a number you can beat.

**Three minutes is measured rather than picked.** The harness's autopilot laps the circuit — spawn,
the dirt track, the back road, the ribbon, home — in **84 seconds** flat out, banking 31 landings and
6,478 points, and a person riding it is slower than that. Three minutes is therefore a lap and most of
another: long enough that the *route* is a decision (the ziggurat's tiers are the biggest points in
the park and cost 40 s to reach) and that a lost combo can be rebuilt, short enough that a bad start
is worth abandoning and running again straight away. `T` restarts from anywhere, `R` drops back to
free riding, and the duration is on a dial in the tuning panel under `Tricks & score`.

Two rules do most of the work:

- **The last flight counts.** If the clock hits zero while you're in the air, the run stays open until
  you land. Points are only ever banked by a landing, so ending mid-flight would silently delete
  whatever was riding on it — and the last ten seconds are precisely when a rider throws everything at
  one more jump. Measured, a run typically overruns by about 1.4 s to finish the jump it's on.
- **Respawning doesn't stop the clock.** `R` is how you cross the park, and spending ten seconds
  travelling to the ziggurat is part of the route decision rather than an escape from it.

The trial keeps its own best, separate from the free-ride one, because an unlimited session's total
would never be threatened by a three-minute run. During a trial the `BEST` readout switches to the one
you're actually chasing.

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
scoring, combos, landing feedback and the chase camera are all in.

The park is **thirty-four features on three tracks that close into one lap**: the dirt track, the
castle and the ziggurat, each one's end feeding the next's beginning and the last of them finishing
where you started. A run down any of them is a continuous sequence of jumps rather than a drive
between set pieces, which is what the combo multiplier needs — it dies after two seconds on the
ground, so a track is worth riding exactly as far as its next feature is close.

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

Session best persists to `localStorage`, as does the separate time-trial best. `R` keeps your score,
because respawn is how you cross the park and travelling shouldn't cost points, but it does drop the
combo — nothing was landed.

Both trick detection and scoring are stepped at **physics rate, not render rate**. Two landings can
fall inside one rendered frame, and the second must not erase the first's effect on the combo.

## Visual themes

`H` → **Visual theme** switches the world's palette and lighting between four
looks. It's a live switch: the heightfield, the park and the props are all
theme-independent, so nothing regenerates and nothing respawns — you can flip
themes mid-flight and judge them on the same jump.

| Theme | What it is | The value that carries it |
|---|---|---|
| Desert | the world as built — the reference | — |
| Mars | butterscotch sky, oxide terrain | `hemiSky` orange, so shadows fill warm |
| Lunar | black sky, grey regolith | `hemiIntensity` 0.12 — near-black shadows |
| Volcanic | pale ash on flats, black basalt on steeps | the flats' luminance |

A theme sets seven terrain bands, three sky gradient stops, both light colours,
and the `Light`/`Render` dials — so switching moves those sliders, and tuning a
theme means moving them and copying the values back into `src/world/themes.ts`.

Two constraints shape every palette, and both come from how the world is drawn
rather than from taste. **Colour has to encode slope**, because `shadeTriangle`
picks its band from `normalY` and a lip has to read against its own approach — a
monochrome world would screenshot well and be unrideable. And **fog hides the
world edge**, tinted to the horizon stop so terrain dissolves instead of stopping
at a line 1024 m out; the lunar theme keeps that trick by fading to near-black
against a near-black sky rather than by removing the fog.

The `scrub` band is the most theme-dependent of the seven, because it is driven
by its own patchy noise rather than by slope — so it reads as something scattered
across the terrain. Vegetation in the desert, coarse debris on Mars, mare basalt
on the Moon, sulfur staining on the volcano.

Set-piece props — water, the burning loop, the alligators, the gatehouses — are
*not* themed, so they keep their own colours whichever theme is up.

## The park

Thirty-four features on **three tracks joined into one lap**. Each is ridden start to finish rather
than passed by, and each one's end is somebody else's beginning: the ziggurat's slip road merges into
the dirt track's westbound leg, the dirt track's back road runs up behind the mounds onto the ribbon,
and the castle's finish lands beside the spawn pad you started from.

Features are numbered in these tables and in `npm run sim`, so a feature can be named the same way in
the harness and in conversation. The numbers are not signposted in the world — flags on poles at every
approach turned out to be more clutter than help.

`npm run map` renders the park from above: the same heightfield the game collides against, hillshaded,
with each track's line drawn over it. Reading a park otherwise costs a ride, and an overlapping
corridor or a landing pad standing proud as a causeway is obvious from above and nearly invisible from
behind the bike.

### Track 1 — the dirt track

South out of the spawn on one datum, then a banked right-hander into a westbound rhythm section. No
masonry and no boost required: this is the track you learn the bike on, and the one a long combo is
easiest to hold, because every landing runs straight into the next run-up.

| # | Feature | Lip | Pop at 25 m/s | Air (base / boosted) |
|---|---|---|---|---|
| 1 | warmup whoops | — | — | rhythm section |
| 2 | first kicker | 1.9 m | 60 m/s² | 1.28 / 1.47 s |
| 3 | tabletop | 2.3 m | 60 m/s² | 1.43 / 1.64 s |
| 4 | big air | 5.2 m | 49 m/s² | 2.02 / **2.41 s, 14 m up** |
| 5 | sharp kicker *(side line)* | 1.7 m | 98 m/s² | 1.30 / 1.45 s |
| 6 | side hip *(side line)* | 2.4 m | 30 m/s² | 1.36 / 1.55 s |
| 7 | the gauntlet | 5.6 m | **328 m/s²** | 2.87 / **3.13 s, 25 m up** |
| 8 | gator pond | — | — | the bit you'd rather clear |
| 9 | the south turn | banked 4.5 m | — | 48 m radius, 90° |
| 10 | the west whoops | — | — | rhythm section |
| 11 | the trench | 2.1 m | 66 m/s² | 1.39 / 1.42 s — **a real pit under it** |
| 12 | the drop-off | 2.3 m | 60 m/s² | 1.55 / 1.66 s, lands 5 m lower |
| 13 | the last kicker | 3.0 m | 58 m/s² | 1.65 / 1.85 s |
| 14 | the far turn | banked 4.5 m | — | 107°, 45 m radius — the corner |
| 15 | the hairpin table | 2.3 m | 60 m/s² | 1.39 / 1.58 s |
| 16 | the back road | 1.8 m | 66 m/s² | 1.29 / 1.44 s, up behind the mounds |

### Track 2 — the castle

| # | Feature | Lip | Pop at 25 m/s | Air (base / boosted) |
|---|---|---|---|---|
| 17 | the motte | 30 m tall | — | **5 hops riding up it** |
| 18 | the far peak | 26 m tall | — | the target |
| 19 | the drop | 3.4 m | 199 m/s² | boosted: **peak to peak** |
| 20 | the far drop | 2.4 m | 250 m/s² | off #18, at the ribbon |
| 21 | the ribbon | — | — | 150° curve back toward spawn |
| 22 | the home whoops | — | — | rhythm section |
| 23 | the home table | 2.3 m | 60 m/s² | 1.16 / 1.36 s |
| 24 | the last step | 2.0 m | 51 m/s² | 1.21 / 1.31 s, lands **4 m higher** |
| 25 | the finish | 2.7 m | 60 m/s² | 1.53 / 1.71 s, into the spawn pad |

### Track 3 — the ziggurat

| # | Feature | Lip | Pop at 25 m/s | Air (base / boosted) |
|---|---|---|---|---|
| 26 | the ziggurat kicker | 2.1 m | 66 m/s² | 1.38 / 1.57 s |
| 27 | the stone table | 2.3 m | 60 m/s² | 1.16 / 1.36 s |
| 28 | the ziggurat whoops | — | — | rhythm into the tiers |
| 29 | the ziggurat | 6 tiers, 26 m | — | jump *up* it |
| 30 | the pinnacle | 3.0 m | 176 m/s² | **3.31 / 3.37 s, 42 m up** |
| 31 | the shadow table | 2.3 m | 60 m/s² | 1.43 / 1.69 s |
| 32 | the ziggurat turn | banked 4 m | — | 106°, folds the tail west |
| 33 | the shadow kicker | 2.7 m | 60 m/s² | 1.53 / 1.73 s |
| 34 | the slip road | 1.8 m | 66 m/s² | 1.27 / 1.40 s, onto the dirt track |

### What a run is worth

The harness rides each line with a waypoint autopilot and reports the result, because a per-feature
check cannot see a track. Measured:

| Stretch | Scored landings | Best combo | Points | Longest spell on the ground |
|---|---|---|---|---|
| Track 1, spawn to the castle | 22 | **×10** | 5,030 | 4.0 s (the corner) |
| Track 2, the ribbon home | 10 | **×10** | 1,889 | 1.9 s |
| Track 3, the warm-up | 6 | ×6 | 672 | 1.2 s |
| Track 3, the pinnacle out | 6 | ×4 | 692 | 2.3 s |

**A corner costs you the combo**, and that's a layout fact rather than a scoring bug. A 48 m berm is
75 m of arc, which with its entry and exit is three to four seconds on the ground against a two second
window — so the multiplier always resets in a turn, and a track can only afford a corner if what
follows it is long enough to build a new one. That's why the ziggurat runs straight south rather than
turning east into the 150 m that was left over there, and why a lap reads as a series of runs rather
than one unbroken one. Track 1 chains ×9, resets in the south turn, chains again down the westbound
leg, and resets once more in the far turn — which makes the corner the place you cash in.

The motte's climb and the ziggurat's tiers are the two stretches the autopilot doesn't drive, and the
gap is honest rather than arbitrary: one means traversing a cone at an angle chosen by eye, the other
means timing a boost off each lip. Both are ridden fine by a person and neither is expressible as
"steer at the next waypoint", so they have their own checks instead.

### The lap

Each track used to run out into open desert and stop. Individually they were fine; the flaw only
exists one level up, where a lap either closes or it doesn't. Two banked turns and four features join
them:

- **The ziggurat's slip road** — a 106° turn folds the tail west, and 168 m of straight lands on the
  south turn's own ride line three quarters of the way round it, so the ziggurat doesn't end *near*
  the dirt track, it merges onto it.
- **The far turn and the back road** — a little over a right angle at the bottom-left of the world,
  coming out pointing just east of north, and then 180 m of run that passes *behind* both mounds and
  finishes alongside the ribbon a fifth of the way round its sweep. The bank's outer edge runs into
  the rim berm, which is welcome: the world boundary becomes the outside wall of the turn.

  Behind the mounds rather than at them, and that is forced rather than chosen. The castle has exactly
  one rideable entrance from the ground — the motte's east flank — and everything past it is reached
  by *jumping*, so a connector arriving from the south-west has nothing to join until the castle comes
  back down to the desert, which it does at the ribbon. An earlier version turned 166° to aim
  east-north-east at the mounds and ran out onto the motte's south-west skirt: measurably a
  connection, and from any view of it plainly a path driving at the far peak. The back road is
  shorter, leaves the mounds alone, and puts the two lines side by side where you can actually cross
  between them — ride up the ribbon's 38° bank and you are on the castle's deck.
- **The castle's finish** already landed beside the spawn pad, which is the third join for free.

The exit heading of each turn is a *number chosen to make the run arrive somewhere*, and the straight
off it is derived from the arc's measured exit rather than authored beside it — so retuning a turn
carries its connector with it instead of quietly disconnecting the track. `HANDOVERS` writes the three
joins down and the harness measures each one:

```
the ziggurat -> the dirt track 5m/30, the dirt track -> the castle 10m/40, the castle -> the spawn pad 64m/90
```

The obvious version of that measurement was wrong, and worth recording: comparing the end of one line
to the nearest *point* of the next called a run finishing on the motte's skirt a 99 m miss, because a
mound's line is its centre and it's ridden from anywhere on its flank. Reaching the outer radius is
reaching it.

**#20/#21 is the way home.** Land the #17→#18 gap jump, cross the far peak, and #20
fires you off its western rim at **the ribbon** — a 12 m wide stone causeway
curving 150° to the left and spitting you out pointing within 8° of the spawn pad,
350 m away across the park. It closes the castle into a loop instead of leaving
you stranded on a summit with nothing to do but respawn.

The gap is 26 m and it lands from **18 m/s upward** — at 14 you come up short onto
the desert. So it's a jump you carry speed into rather than one you dribble off
the edge of.

**The shoulder width is derived, not authored**, and that's the whole trick to
building anything elevated here. Nothing steeper than ~45° can be drawn (the mesh
renders at 4 m quads while colliding at 1 m cells) or ridden (past
`susp.climbSlopeDeg` the suspension stops pushing you up it), so the bank is tied
to the deck's height above whatever ground it crosses — `shoulderRatio` 1.3, a 38°
bank. That gives the shape for free: a broad embankment where it leaves the peak
9 m up, tapering to a thin ribbon as it descends. A fixed width would have been
undrawable at one end or absurd at the other.

Two things the harness caught that riding might not have. The dunes under the arc
swell 6 m across its middle third, and since the stamp only ever *raises* ground,
the ribbon simply wasn't there over them — a hole in the path, not a visible
fault. And the first placement put the arc's start 10 m too far out, so every
launch landed at exactly the right radius on open desert, because the sweep hadn't
begun yet. Landing short of an arc's start reads precisely like landing short of
the jump.

**#17/#18 is the castle.** Two stone mounds, 30 m and 26 m high, each with a **gatehouse straddling its
ride line** — twin spired towers, a lintel with battlements, a portcullis hanging in the arch — so you
ride *through* the gate and off the rim beyond. Stand on the first summit and you can see the second
gate framed inside the first arch.

Like the fire ring, the gates are decoration with nothing to collide with, which means the arch only
reads correctly if it is centred on where the bike actually goes. Both are placed on their motte's
ride line for exactly that reason.

**#17 to #18 is a gap jump between summits.** Boosted, the launch off #17's rim carries you across the
saddle onto the far peak, 28 m from its centre. Unboosted you come up short and land on the flank in
between. The two peaks *have* to share a massif — a launch off #17 reaches barely past #17's own outer
edge, 79 m against the 120+ m a separate mound would need — so mottes compose by **max** rather than by
replacement, and two overlapping cones make one massif with a saddle.

**#17's flank is terraced into four banks**, so riding up it is a sequence of jumps rather than a grind:
near-flat treads separated by 44° banks, each cresting hard enough to throw the bike. Straight up the
face that is 5 hops, the longest 0.94 s, 3.5 s airborne in total, summiting in about 6 seconds. The
banks land *sketchy* if you don't tuck the nose, so each one costs 20% of your speed — the climb is a
landing drill, not a ramp.

Real step-up tiers were the first attempt and don't fit: a tread has to be ~10 m to land on and a rise
≤5 m to be jumpable, which needs a 90 m flank, and widening #17 that far absorbs the far peak entirely.
The terracing is a *sine* superimposed on the cone instead — amplitude set so its peak slope equals the
cone's, which flattens the treads and doubles the bank slope while staying smooth. Hard steps at this
scale would put risers inside a single mesh quad and draw as vertical fins.

Widening #17 to 100 m did mean shrinking #18 into a small steep tor (44 m radius, 26 m tall) so it still
stands clear of #17's flank and remains a target worth aiming at.

The mounds' surface is otherwise a **cone you traverse**, not a spiral ramp, and that is forced rather
than chosen. A heightfield stores one height per point, so the surface cannot gain height around a closed
loop: ride a terrace at constant radius through a full revolution and you return to the same point,
which must be the same height. Built as a helicoid it became concentric terraces separated by risers
the bike fell off — it orbited forever without ever summiting. Along a real spiral's centre-line the
height depends only on radius, which *is* a cone. So a cone is the honest form: take whatever line up
it you like, and traversing keeps more speed than charging straight up.

**#29 the ziggurat** is six 6 m tiers you gain height on by *jumping*, not climbing: platform, crest
kicker, void, then the next tier's face 6 m higher, to a summit 26 m up with the pinnacle off the top —
3.31 s of air and 42 m of clearance, the biggest thing in the park.

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

### The shapes

Seven stamp types build all thirty features.

| Kind | What it is |
|---|---|
| `kicker` | a face and a lip. `power` loads the spring and fires off an edge; `crest` is flat on top and throws you off convex curvature |
| `tabletop` | kicker, flat deck, landing ramp. Coming up short is a non-event, which is what makes it the friendly shape |
| `gap` | take-off, a **void**, then a landing at any height — one shape covering doubles, step-ups and step-downs |
| `rollers` | whoops, for rhythm |
| `berm` | a banked turn, and the climb between two straights at different datums |
| `motte` / `staircase` / `causeway` | the cone, the stepped monument and the elevated ribbon |
| `pond` | water, which takes your momentum and nothing else |

**`gap` is one shape doing three jobs**, and they differ only in where the far side sits: dig `pitY`
below the datum and put `landY` back at it and you have a double; raise `landY` and it is a step-up
that hands you the height; drop it and it is a step-down with half again the airtime. What separates
all three from a tabletop is that the far wall is pointing at you — come up short and you are in the
pit with a climb out, paying in the only currency this game charges in.

Two things about that shape were not obvious and both came out of measurement. **The landing zone
decides whether it works**: the touchdown for a mid-size kicker at 25 m/s is about 32 m past the
origin, and if the *rise* is there — the wall out of the pit, or the drop off the back — you land on
44° of slope and a 15° attitude reads as a 62° error. So a step-down finishes its descent before the
touchdown and lands flat; a step-up stretches its rise *through* it, and a 6 m gain over 18 m lands
cleaner than flat ground does, because pitch error is measured against the slope. And **the back side
has to carry the lip plus the pit** — `back` sized against a 2 m lip is a 65° cliff once 3 m are dug
out under it, so the harness measures it.

**A berm is carved, not raised**: the ride line is levelled onto a datum and the ground *outside* it
banked up, so the faster you come in the higher you ride and the more of the corner the geometry does.
Its bank is `h·(u/run)^1.7` rather than a wedge — a constant slope makes riding high no different from
riding low, while a face that steepens gives the corner a lip to lean on. `startY`/`endY` also make the
turn the climb: track 1's westbound leg sits 8 m above the gauntlet's landing pad, which as a step on a
26 m lead-in fade would be a 17° wall and across 75 m of arc is 6° you never notice.

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
time, height and the landing band, so an unclearable gap shows up before you ever ride it. It then
rides each **track** end to end with a waypoint autopilot, because a per-feature check cannot see a
track — starting the bike on one feature's approach at a speed you handed it answers "does this ramp
work" and can never answer "does landing this one put you on the run-up to the next". That second
measurement is what found the gaps too long for the combo window, and two bugs in itself first: the
run ended at the last waypoint so the final flight was never scored, and it counted its own run-in to
the first lip as combo-breaking ground time. It measures
only the flight that leaves the feature's *own* face and stops when that flight lands — reporting peak
values over a longer run credited each feature with whatever came next, which hid a tabletop that had
stopped jumping entirely. There is now also a check that every jump gets airborne at all, which is the
one thing every jump exists to do and the thing nothing had been asserting.

**An approach may cut natural terrain, but never another feature's dirt.** Approaches reach back a long
way — their own length plus a 26 m lead-in — so without that guard each feature quietly flattens the
tail of the one before it. It had reduced a 2.31 m tabletop lip to 0.45 m and shaved the whoops, which
reads as dead space where a jump used to be.

That guard is **one-sided**, and the other side only shows up once something sits *below* the datum: an
approach will not cut another feature's dirt but it will happily fill it, so a pit that lands inside
the next feature's run-in is quietly levelled and the double becomes a speed bump with a name. The
harness measures each pit's floor rather than trusting the parameter, which caught it twice. The layout
answer is to spend the constraint where it costs nothing — order a section kicker-then-double rather
than double-then-kicker, so the only pit with nothing after it is the last feature on the track.

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
src/game/      chase camera, boost fx, trick detection, scoring, time trial
src/ui/        HUD, tuning panel
scripts/sim.ts headless physics and park harness
scripts/map.ts top-down park map
```

The one structural thing worth knowing: terrain *and* (from M2) every ramp live in a single
heightfield, so ground contact is an O(1) height sample rather than a mesh raycast. No tunneling at
speed, no collider/visual desync. The cost is that overhangs are impossible — fine for motocross.

In dev builds, `window.__moto` exposes the bike state, the trick and score trackers, a `probe()`
snapshot and a `fastForward(seconds, input)` that steps physics without waiting for frames.
