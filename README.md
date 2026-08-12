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

Five features run in a straight line from the spawn pad toward the bowl: warmup whoops, a first
kicker, a tabletop, a big-air ramp, and a hip off to the right. Just hold `W` and you meet all of
them in order. Boost the big one — it gives about 2 s of air and 11 m of height, which is enough
time for a full backflip.

Ramps are height *stamps* written into the same heightfield as the terrain, so ground contact stays
an O(1) sample: no meshes, no colliders, nothing to desync. They mask-*blend* rather than add, which
levels a feature onto whatever it sits on so the same kicker launches identically anywhere. Each one
also carves a level approach corridor, so you never hit a lip off-camber. Edit `src/world/park.ts`
to move things around — it's plain data — then `Regenerate terrain` in the panel, or reload.

`npm run sim` validates the park: it rides every feature at base and boosted speed and reports air
time, height and the landing band, so an unclearable gap shows up before you ever ride it.

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
