/**
 * The ALMAS mark (initial design, owner review pending, step 11): a faceted
 * diamond lit from the top right, an "AI" chip with circuit traces, and a
 * robot arm on the left facet, after docs/brand/almas-logo-v2.jpg.
 *
 * - `full`: every detail, for 64 px and larger (login and sign-up).
 * - `simple`: diamond, facets and chip only, for small sizes (header, tab icon).
 *
 * Colours come from the theme (--logo-facet, --logo-glow, --logo-steel in
 * tokens.css), so one drawing works on dark and light. docs/brand/almas-mark*.svg
 * are copies of these drawings with the dark theme's colours.
 */
import styles from './Logo.module.css';

interface LogoProps {
  variant: 'full' | 'simple';
  size: number;
  /** Accessible name; leave out when the logo sits next to the name it shows. */
  label?: string;
}

export function Logo({ variant, size, label }: LogoProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      className={styles.logo}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
    >
      {variant === 'full' ? <Full /> : <Simple />}
    </svg>
  );
}

/** The eight facets: crown (top) and pavilion (bottom), lit from the top right. */
const FACETS = [
  ['M4 24 18 12 25 24Z', 0.28],
  ['M18 12H32L25 24Z', 0.5],
  ['M32 12 39 24H25Z', 0.16],
  ['M32 12H46L39 24Z', 0.42],
  ['M46 12 60 24H39Z', 0.62],
  ['M4 24H25L32 58Z', 0.2],
  ['M25 24H39L32 58Z', 0.1],
  ['M39 24H60L32 58Z', 0.38],
] as const;
const FACET_LINES = 'M4 24H60M18 12 25 24 32 12 39 24 46 12M25 24 32 58M39 24 32 58';
const OUTLINE = 'M18 12H46L60 24 32 58 4 24Z';

function Facets({ boost }: { boost: number }) {
  return (
    <g className={styles.facet}>
      {FACETS.map(([d, opacity]) => (
        <path key={d} d={d} fillOpacity={Math.min(1, opacity * boost)} />
      ))}
    </g>
  );
}

function Full() {
  return (
    <>
      <Facets boost={1} />
      <path className={styles.glowLine} d={FACET_LINES} strokeWidth={0.8} strokeOpacity={0.85} />
      <path className={styles.steelLine} d={OUTLINE} strokeWidth={1.8} />
      {/* Circuit traces and the chip's pins. */}
      <g className={styles.glowLine} strokeWidth={0.9}>
        <path d="M39.5 30H43L46 27M39.5 35H45L49 31M34.5 25V21L37 18.5M32 40V47" />
        <path d="M24.5 30H26.5M24.5 35H26.5M37.5 30H39.5M37.5 35H39.5M29.5 25V27M34.5 25V27M29.5 38V40M34.5 38V40" />
      </g>
      <g className={styles.glowFill}>
        <circle cx={46} cy={27} r={1.1} />
        <circle cx={49} cy={31} r={1.1} />
        <circle cx={37} cy={18.5} r={1.1} />
        <circle cx={32} cy={47} r={1.1} />
      </g>
      {/* Robot arm: base plate, two links, ring joints, a two-jaw gripper reaching for the chip. */}
      <g className={styles.steelLine}>
        <path d="M23 47H28.5" strokeWidth={2.4} />
        <path d="M25.6 44.5 13.5 31.5 19.5 19.8" strokeWidth={2.8} />
        <path d="M19.5 19.8 22.8 18.2 24 19.6M19.5 19.8 22.4 22 21.9 23.6" strokeWidth={1.5} />
      </g>
      <g className={styles.steelFill}>
        <circle cx={25.6} cy={44.5} r={2.6} />
        <circle cx={13.5} cy={31.5} r={2.4} />
        <circle cx={19.5} cy={19.8} r={2} />
      </g>
      <g className={styles.facetFill}>
        <circle cx={25.6} cy={44.5} r={1} />
        <circle cx={13.5} cy={31.5} r={0.9} />
        <circle cx={19.5} cy={19.8} r={0.75} />
      </g>
      <rect
        className={styles.chip}
        x={26.5}
        y={27}
        width={11}
        height={11}
        rx={2}
        strokeWidth={0.8}
      />
      <path
        className={styles.letters}
        d="M28.6 36 30.4 29.5 32.2 36M29.2 34H31.6M34.6 29.5V36"
        strokeWidth={1.3}
      />
      {/* The sparkle on the top right corner. */}
      <path
        className={styles.glowFill}
        d="M47 6.5 48 10 51.5 11 48 12 47 15.5 46 12 42.5 11 46 10Z"
      />
    </>
  );
}

function Simple() {
  return (
    <>
      <Facets boost={1.25} />
      <path className={styles.glowLine} d={FACET_LINES} strokeWidth={1.4} />
      <path className={styles.steelLine} d={OUTLINE} strokeWidth={3.2} />
      <rect
        className={styles.chip}
        x={24.5}
        y={26}
        width={15}
        height={15}
        rx={3}
        strokeWidth={1.4}
      />
      <path
        className={styles.letters}
        d="M27.5 37.5 30 29.5 32.5 37.5M28.3 35H31.7M35.8 29.5V37.5"
        strokeWidth={2}
      />
    </>
  );
}
