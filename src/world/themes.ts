import { T } from '../core/tunables';

/**
 * Visual themes: the palette and lighting of a world, with none of its shape.
 *
 * A theme touches four things and deliberately nothing else — the sky dome's
 * three gradient stops, the seven slope bands the terrain shades with, the
 * colour and strength of the two lights, and the fog. The heightfield, the park
 * layout and the set-piece props are all theme-independent, so switching is a
 * recolour and a mesh rebuild rather than a world regeneration.
 *
 * Two constraints shape every palette here, both inherited from how the world is
 * drawn rather than from taste:
 *
 *   1. **Colour has to encode slope.** `shadeTriangle` picks a band from
 *      `normalY`, and readability at speed depends on a lip reading differently
 *      from its approach. Every theme therefore needs real contrast between its
 *      flat, packed and steep colours — a monochrome world would look fine in a
 *      screenshot and be unrideable.
 *   2. **Fog hides the world edge.** It is tinted to the horizon stop so terrain
 *      dissolves into sky rather than stopping at a line 1024 m out. A theme with
 *      no atmosphere still needs it; `lunar` solves that by fading to black
 *      against a black sky, which is the one honest way to keep the trick.
 *
 * The `scrub` band is the most theme-dependent of the seven. It is driven by its
 * own patchy noise field rather than by slope, so it reads as *something
 * scattered across the terrain* — vegetation on Earth, coarse debris on Mars,
 * mare basalt on the Moon, sulfur staining on a volcano.
 */

export interface Theme {
  /** Shown in the tuning panel. */
  label: string;
  /** The sky dome's vertical gradient, and the fog colour (= `horizon`). */
  sky: { zenith: string; horizon: string; ground: string };
  /** The seven bands `shadeTriangle` chooses between. */
  terrain: {
    dirt: string;
    packed: string;
    rock: string;
    scrub: string;
    groomed: string;
    stone: string;
    stoneDark: string;
  };
  sun: string;
  /** Bounce light from above. This is the colour that says which sky you're under. */
  hemiSky: string;
  hemiGround: string;
  /**
   * Written into `T.light` and `T.render` when the theme is applied, so the dials
   * in the panel follow the theme rather than fighting it. Tuning a theme means
   * moving these dials and then copying the values back here.
   */
  sunIntensity: number;
  hemiIntensity: number;
  sunElevationDeg: number;
  exposure: number;
  fogDensity: number;
}

export const THEMES = {
  /**
   * The world as built. Kept exactly as it was so there is always an unchanged
   * reference to switch back to and compare against.
   */
  desert: {
    label: 'Desert',
    sky: { zenith: '#3f6da8', horizon: '#cbb896', ground: '#8f7a5c' },
    terrain: {
      dirt: '#b58a55',
      packed: '#8a6b45',
      rock: '#6b6560',
      scrub: '#6f7a44',
      groomed: '#a06a42',
      stone: '#8d8779',
      stoneDark: '#5f5b52',
    },
    sun: '#fff1d8',
    hemiSky: '#bcd8ff',
    hemiGround: '#6b5436',
    sunIntensity: 2.8,
    hemiIntensity: 0.75,
    sunElevationDeg: 28,
    exposure: 1,
    fogDensity: 0.0009,
  },

  /**
   * Mars. The cheapest of the three new themes and the one that changes least
   * structurally, because the sky dome is *already* the right tool: a two-stop
   * vertical gradient with a ground haze term is exactly what a butterscotch
   * Martian sky is, and the terrain only has to rotate from tan toward oxide.
   *
   * The load-bearing value is `hemiSky`. Mars is dusty enough that its sky light
   * is orange rather than blue, so shadow sides fill warm instead of cool — that
   * single colour does more to say "not Earth" than the terrain does, and getting
   * it wrong leaves the world reading as a redder desert.
   *
   * `scrub` stops being vegetation and becomes coarse debris fields, since the
   * one thing Mars certainly has no patches of is plant life.
   */
  mars: {
    label: 'Mars',
    sky: { zenith: '#9c6b4a', horizon: '#e0b184', ground: '#7d5236' },
    terrain: {
      dirt: '#a85f3c',
      packed: '#8a4a2e',
      rock: '#6e4a3a',
      scrub: '#5a4436',
      groomed: '#b06844',
      stone: '#8a7568',
      stoneDark: '#5c4c42',
    },
    sun: '#ffe8cc',
    hemiSky: '#c99a72',
    hemiGround: '#6b3f28',
    sunIntensity: 2.5,
    hemiIntensity: 0.7,
    sunElevationDeg: 24,
    exposure: 1,
    fogDensity: 0.0012,
  },

  /**
   * The Moon. The signature is not the grey — it is `hemiIntensity` at 0.12.
   * With no atmosphere there is nothing to fill a shadow, so shadow sides go
   * nearly black and every slope reads as a hard light/dark split. That single
   * value is what separates this from "a grey desert", and it *increases* the
   * slope contrast the whole readability pillar runs on.
   *
   * The fog is the compromise. Vacuum has no aerial perspective at all, so
   * distant terrain should stay perfectly sharp — but then the world edge is
   * visible at 1024 m. Fading to near-black against a near-black sky keeps the
   * edge hidden and reads as distance falling into shadow, which is the least
   * dishonest version of the trick available.
   */
  lunar: {
    label: 'Lunar',
    sky: { zenith: '#05060a', horizon: '#0b0d13', ground: '#070809' },
    terrain: {
      dirt: '#8e8b86',
      packed: '#6e6b67',
      rock: '#55534f',
      scrub: '#5f5d59',
      groomed: '#9a9791',
      stone: '#a5a29b',
      stoneDark: '#63615c',
    },
    sun: '#fffdf5',
    hemiSky: '#232833',
    hemiGround: '#131315',
    sunIntensity: 3.4,
    hemiIntensity: 0.12,
    sunElevationDeg: 18,
    exposure: 1.05,
    fogDensity: 0.0016,
  },

  /**
   * Basalt, ash and sulfur. The highest-contrast palette of the four: pale ash
   * settles on the flats while fresh black rock is exposed on the steep faces,
   * which maps onto the slope bands better than any other theme here — a lip
   * reads against its own approach with no help needed.
   *
   * `scrub` becomes mineral staining, and this is the best use the patchy noise
   * field gets in any of the four: sulfur yellow scattered across black rock is
   * exactly what that band's shape wants to draw.
   *
   * The risk is darkness. Flats are lifted well above true basalt so the world
   * keeps its tonal range under the tone mapper, and the payoff is that the boost
   * exhaust light stops being an effect and becomes the brightest warm thing in
   * the world.
   */
  volcanic: {
    label: 'Volcanic',
    sky: { zenith: '#33363d', horizon: '#7a4a33', ground: '#3d2b22' },
    terrain: {
      // Ash is a genuinely *pale* grey, not a dark one. The first pass had the
      // flats down at #5c5751 and the whole world crushed to mud under the tone
      // mapper — the theme's entire argument is a pale-flat/black-steep split, so
      // the flats have to carry real luminance or there is nothing to split.
      dirt: '#837c72',
      packed: '#544e49',
      rock: '#2b2827',
      scrub: '#9c7833',
      groomed: '#8f867b',
      stone: '#5a5550',
      stoneDark: '#302d2a',
    },
    sun: '#ffd9a8',
    hemiSky: '#5a4436',
    hemiGround: '#3a2018',
    sunIntensity: 2.6,
    hemiIntensity: 0.6,
    sunElevationDeg: 22,
    exposure: 1.05,
    fogDensity: 0.0016,
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

/** Falls back to `desert` so a stale saved preset can't leave the world untextured. */
export function activeTheme(): Theme {
  return THEMES[T.theme as ThemeName] ?? THEMES.desert;
}

/**
 * Push the theme's lighting onto the tunables. Called on switch, so the panel's
 * Light and Render dials show what the theme actually set rather than whatever
 * the previous one left behind.
 */
export function applyThemeTunables() {
  const t = activeTheme();
  T.light.sunIntensity = t.sunIntensity;
  T.light.hemiIntensity = t.hemiIntensity;
  T.light.sunElevationDeg = t.sunElevationDeg;
  T.light.exposure = t.exposure;
  T.render.fogDensity = t.fogDensity;
}
