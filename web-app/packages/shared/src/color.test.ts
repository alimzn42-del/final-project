import { describe, expect, it } from 'vitest';

import {
  absorbanceToLab,
  deltaE2000,
  type Lab,
  labToAbsorbance,
  labToHex,
  labToLinearRgb,
  linearRgbToLab,
  mixtureAbsorbance,
  type Rgb,
} from './color.js';

/**
 * The 34 published test pairs for CIEDE2000: Sharma, Wu and Dalal, "The CIEDE2000
 * Color-Difference Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations", Color Research and Application 30 (2005), table 1. Pairs 7 to 16 sit on the
 * hue-angle edge cases that simple implementations get wrong.
 */
const SHARMA: [Lab, Lab, number][] = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.001], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [[50, 2.49, -0.001], [50, -2.49, 0.0012], 7.2195],
  [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
  [[50, -0.001, 2.49], [50, 0.001, -2.49], 4.8045],
  [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.903],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
  [[50, 2.5, 0], [50, 3.2972, 0], 1.0],
  [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0],
  [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

/** Example dye strengths for the tests (absorbance per g/kg per cm, red, green, blue). */
const DYES = {
  cyan: [0.3, 0.07, 0.02],
  magenta: [0.03, 0.28, 0.08],
  yellow: [0.01, 0.04, 0.3],
  black: [0.18, 0.18, 0.17],
} satisfies Record<string, Rgb>;
type Dye = keyof typeof DYES;
const none: Record<Dye, number> = { cyan: 0, magenta: 0, yellow: 0, black: 0 };
const seen = (c: Partial<Record<Dye, number>>) =>
  absorbanceToLab(mixtureAbsorbance({ ...none, ...c }, DYES, 1.5));

const closeLab = (actual: Lab, expected: Lab, digits = 4) => {
  actual.forEach((v, i) => {
    expect(v).toBeCloseTo(expected[i] ?? NaN, digits);
  });
};

describe('CIEDE2000', () => {
  it.each(SHARMA.map(([x, y, d], i) => [i + 1, x, y, d] as const))(
    'pair %i: %j vs %j = %f',
    (_, x, y, expected) => {
      expect(deltaE2000(x, y)).toBeCloseTo(expected, 4);
    },
  );

  it('is zero for the same colour and the same both ways round', () => {
    for (const [x, y] of SHARMA) {
      expect(deltaE2000(x, x)).toBe(0);
      expect(deltaE2000(y, x)).toBeCloseTo(deltaE2000(x, y), 10);
    }
  });
});

describe('L*a*b* and linear sRGB (white D65)', () => {
  it('white is L* 100 and black is L* 0', () => {
    closeLab(linearRgbToLab([1, 1, 1]), [100, 0, 0]);
    closeLab(linearRgbToLab([0, 0, 0]), [0, 0, 0]);
  });

  it('goes back and forth without loss', () => {
    for (const rgb of [
      [0.2, 0.5, 0.8],
      [0.9, 0.1, 0.05],
      [0.001, 0.002, 0.003],
    ] satisfies Rgb[]) {
      const back = labToLinearRgb(linearRgbToLab(rgb));
      back.forEach((v, i) => {
        expect(v).toBeCloseTo(rgb[i] ?? NaN, 5);
      });
    }
  });

  it.each([
    [[100, 0, 0], '#ffffff'],
    [[0, 0, 0], '#000000'],
    [[53.2408, 80.0925, 67.2032], '#ff0000'], // pure red
    [[87.737, -86.1846, 83.1812], '#00ff00'], // pure green
    [[32.297, 79.1875, -107.8602], '#0000ff'], // pure blue
    [[50, 0, 0], '#777777'], // mid grey
  ])('screen colour of %j is %s', ([l, a, b], hex) => {
    expect(labToHex(l ?? 0, a ?? 0, b ?? 0)).toBe(hex);
  });

  it('clips colours the screen cannot show', () => {
    expect(labToHex(50, 200, 200)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('Beer–Lambert: the colour of a dye mixture', () => {
  it('clear water is white', () => {
    closeLab(seen({}), [100, 0, 0]);
  });

  it('absorbances add: ε·c·ℓ for each dye, summed per channel', () => {
    const a = mixtureAbsorbance({ ...none, cyan: 2, yellow: 1 }, DYES, 1.5);
    expect(a[0]).toBeCloseTo(1.5 * (0.3 * 2 + 0.01 * 1));
    expect(a[1]).toBeCloseTo(1.5 * (0.07 * 2 + 0.04 * 1));
    expect(a[2]).toBeCloseTo(1.5 * (0.02 * 2 + 0.3 * 1));
  });

  it('more of any dye is always darker, never lighter', () => {
    for (const dye of Object.keys(DYES) as Dye[]) {
      let previous = 100.0001;
      for (const c of [0, 0.5, 1, 2, 4, 8]) {
        const [l] = seen({ [dye]: c });
        expect(l, `${dye} ${String(c)} g/kg`).toBeLessThan(previous);
        previous = l;
      }
    }
  });

  it('mixes like real dyes: cyan + yellow is green, magenta + yellow is orange', () => {
    const [, ga, gb] = seen({ cyan: 2, yellow: 2.5 });
    expect(ga).toBeLessThan(-20);
    expect(gb).toBeGreaterThan(20);
    const [, oa, ob] = seen({ magenta: 1.2, yellow: 3 });
    expect(oa).toBeGreaterThan(20);
    expect(ob).toBeGreaterThan(20);
  });

  it('black alone stays grey', () => {
    const [, a, b] = seen({ black: 2 });
    expect(Math.hypot(a, b)).toBeLessThan(3);
  });

  it('reads the absorbance back from the colour', () => {
    const a = mixtureAbsorbance({ ...none, cyan: 1, magenta: 0.5, yellow: 2 }, DYES, 1.5);
    labToAbsorbance(absorbanceToLab(a)).forEach((v, i) => {
      expect(v).toBeCloseTo(a[i] ?? NaN, 5);
    });
  });
});

describe('the flow cell: seen through the window, against the white patch (owner, step 17)', () => {
  const cell = { windowTransmission: 0.96, glare: 0 };

  it('reads clear water a little darker than the patch: the light passes the glass twice', () => {
    const [l, a, b] = absorbanceToLab([0, 0, 0], cell);
    // 0.96 each way lets 92.16 % through: L* = 116 * 0.9216^(1/3) - 16.
    expect(l).toBeCloseTo(116 * Math.cbrt(0.9216) - 16, 4);
    expect(Math.hypot(a, b)).toBeLessThan(1e-3);
  });

  it('reads the absorbance back through the window and the glare', () => {
    const optics = { windowTransmission: 0.96, glare: 0.03 };
    const a = mixtureAbsorbance({ ...none, magenta: 1, yellow: 1.5 }, DYES, 2);
    labToAbsorbance(absorbanceToLab(a, optics), optics).forEach((v, i) => {
      expect(v).toBeCloseTo(a[i] ?? NaN, 5);
    });
  });

  it('glare off the glass lightens a dark colour (the 45-degree lights keep it at 0)', () => {
    const dark = mixtureAbsorbance({ ...none, black: 4 }, DYES, 2);
    const [withoutGlare] = absorbanceToLab(dark, cell);
    const [withGlare] = absorbanceToLab(dark, { ...cell, glare: 0.04 });
    expect(withGlare).toBeGreaterThan(withoutGlare + 5);
  });
});
