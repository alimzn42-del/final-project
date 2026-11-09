/**
 * Colour maths shared by the simulator, the web app and later the digital twin (plan step 15).
 *
 * - CIE L*a*b* with the standard daylight white D65, from and to linear sRGB (the web app uses
 *   the same white for the live mix colour, owner, step 14).
 * - CIEDE2000 (ΔE00): how far apart two colours look, the way the paint industry measures it.
 * - Beer–Lambert: the light a mixture of dyes lets through, per colour channel.
 *
 * Each dye absorbs part of the light that passes: the share that gets through is T = 10^(−A),
 * with absorbance A = Σ ε·c·ℓ over the dyes (ε: how strongly the dye absorbs that colour of
 * light, c: how concentrated it is, ℓ: how far the light travels through the liquid).
 * Absorbances of several dyes add up. Done for red, green and blue separately, the three shares
 * are the colour the camera sees.
 *
 * The flow cell (owner, step 17): the camera looks straight through a glass window at the liquid
 * in front of a white back, lit by LED strips at 45 degrees. So the light crosses the liquid
 * twice (ℓ is twice the depth), passes the glass twice, and the glare off the glass misses the
 * camera. Every reading is relative to a white patch of the same white plastic beside the window
 * (`CellOptics`), so clear water reads a little darker than white. Without optics, the colour is
 * white-balanced on clear water (water = white = L* 100).
 */

/** CIE L*a*b*: L* 0 (black) to 100 (white), a* green (−) to red (+), b* blue (−) to yellow (+). */
export type Lab = readonly [l: number, a: number, b: number];
/** One number per colour channel (red, green, blue): linear sRGB (0..1) or absorbance. */
export type Rgb = readonly [r: number, g: number, b: number];

/** The D65 white point (X, Y, Z) of sRGB. */
const WHITE: Rgb = [0.95047, 1, 1.08883];
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
/** Darkest transmission the camera can tell apart; keeps the logarithm finite. */
const MIN_TRANSMISSION = 1e-4;

/** Linear sRGB (white = 1, 1, 1) to L*a*b*. */
export function linearRgbToLab([r, g, b]: Rgb): Lab {
  const [xn, yn, zn] = WHITE;
  const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / xn);
  const fy = f((0.2126729 * r + 0.7151522 * g + 0.072175 * b) / yn);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** L*a*b* to linear sRGB. Colours a screen cannot show come out below 0 or above 1. */
export function labToLinearRgb([l, a, b]: Lab): Rgb {
  const [xn, yn, zn] = WHITE;
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);
  const x = xn * f(fx);
  const y = yn * (l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA);
  const z = zn * f(fz);
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

/** L*a*b* to an sRGB hex colour for the screen; colours outside its range are clipped. */
export function labToHex(l: number, a: number, b: number): string {
  const channel = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${labToLinearRgb([l, a, b]).map(channel).join('')}`;
}

const RAD = Math.PI / 180;
const cosDeg = (deg: number) => Math.cos(deg * RAD);

/** Hue angle in degrees, 0..360; 0 for a grey (a = b = 0). */
function hueDeg(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / RAD;
  return h >= 0 ? h : h + 360;
}

/**
 * CIEDE2000 colour difference (CIE 142-2001, with kL = kC = kH = 1), as written out by Sharma,
 * Wu and Dalal (2005), whose published test pairs the tests check. About 1 is the smallest
 * difference most people notice side by side.
 */
export function deltaE2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  // Stretch a* for greyish colours, where the eye judges hue differently.
  const cMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = hueDeg(b1, a1p);
  const h2p = hueDeg(b2, a2p);
  const grey = c1p * c2p === 0;

  // Differences in lightness, chroma and hue.
  const dL = l2 - l1;
  const dC = c2p - c1p;
  let dh = grey ? 0 : h2p - h1p;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh * RAD) / 2);

  // Means, with the hue mean taken the short way round the circle.
  const lMean = (l1 + l2) / 2;
  const cMeanP = (c1p + c2p) / 2;
  let hMean = h1p + h2p;
  if (!grey) {
    if (Math.abs(h1p - h2p) <= 180) hMean /= 2;
    else hMean = hMean < 360 ? (hMean + 360) / 2 : (hMean - 360) / 2;
  }

  // Weights: how sensitive the eye is in that part of colour space.
  const t =
    1 -
    0.17 * cosDeg(hMean - 30) +
    0.24 * cosDeg(2 * hMean) +
    0.32 * cosDeg(3 * hMean + 6) -
    0.2 * cosDeg(4 * hMean - 63);
  const sL = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sC = 1 + 0.045 * cMeanP;
  const sH = 1 + 0.015 * cMeanP * t;
  // Rotation term for blues, where chroma and hue differences interact.
  const dTheta = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cMeanP ** 7 / (cMeanP ** 7 + 25 ** 7));
  const rT = -Math.sin(2 * dTheta * RAD) * rC;

  const l = dL / sL;
  const c = dC / sC;
  const h = dH / sH;
  return Math.sqrt(l * l + c * c + h * h + rT * c * h);
}

/**
 * How strongly each dye absorbs red, green and blue light: absorbance per (g of dye per kg of
 * mixture) per cm of light path.
 */
export type DyeAbsorbance<D extends string> = Readonly<Record<D, Rgb>>;

/**
 * Absorbance of a mixture per channel (Beer–Lambert): A = ℓ · Σ ε·c over the dyes.
 * `concentration`: g of each dye per kg of mixture. `pathCm`: light path through the liquid.
 */
export function mixtureAbsorbance<D extends string>(
  concentration: Readonly<Record<D, number>>,
  absorbance: DyeAbsorbance<D>,
  pathCm: number,
): Rgb {
  let [r, g, b] = [0, 0, 0];
  for (const dye of Object.keys(concentration) as D[]) {
    const c = concentration[dye] * pathCm;
    const [er, eg, eb] = absorbance[dye];
    r += er * c;
    g += eg * c;
    b += eb * c;
  }
  return [r, g, b];
}

/**
 * What stands between the liquid and the camera (owner, step 17), relative to the white patch.
 * The patch is the same white plastic as the cell's back, so the back's own whiteness cancels.
 */
export interface CellOptics {
  /** Share of the light the window lets through each way; the light passes it twice. */
  windowTransmission: number;
  /** Share of the patch's brightness the glass reflects straight into the camera. */
  glare: number;
}

/** No window and no glare: white-balanced on clear water. */
export const NO_OPTICS: CellOptics = { windowTransmission: 1, glare: 0 };

/** The share of the patch's light the camera sees, for liquid that lets `t` through. */
function seen(t: number, optics: CellOptics): number {
  return optics.glare + (1 - optics.glare) * optics.windowTransmission ** 2 * t;
}

/** The colour seen through a liquid with this absorbance (white-balanced without optics). */
export function absorbanceToLab([r, g, b]: Rgb, optics: CellOptics = NO_OPTICS): Lab {
  const t = (a: number) => Math.max(MIN_TRANSMISSION, seen(10 ** -a, optics));
  return linearRgbToLab([t(r), t(g), t(b)]);
}

/** The inverse: the absorbance per channel that gives this colour. */
export function labToAbsorbance(lab: Lab, optics: CellOptics = NO_OPTICS): Rgb {
  const throughWindow = (1 - optics.glare) * optics.windowTransmission ** 2;
  const a = (s: number) => {
    const t = (s - optics.glare) / throughWindow;
    return -Math.log10(Math.min(1, Math.max(MIN_TRANSMISSION, t)));
  };
  const [r, g, b] = labToLinearRgb(lab);
  return [a(r), a(g), a(b)];
}
