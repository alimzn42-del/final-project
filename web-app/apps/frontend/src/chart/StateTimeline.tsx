/**
 * A digital or enum sensor's trend as a state timeline (owner, step 14): one
 * horizontal band over time, a neutral grey per value with the value's word
 * written in it where it fits, and a legend of every word below. Missing data
 * is empty space, never a grey band. Time runs left to right in both
 * languages, the latest value at the right.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { formatTime } from '../live/format';
import { cx } from '../ui/cx';
import styles from './chart.module.css';
import { useHoverTime } from './hover';
import { at, type ChartProps, Readout, TimeAxis } from './parts';
import { bands } from './series';
import { shadeOf, valueCodes } from './shades';

/** Room a word needs inside its band, beyond its own width (the band's padding). */
const WORD_PADDING_PX = 8;

/** Hides each band's word where it does not fit (never cut it); without a layout (tests), leaves them. */
function fitWords(row: HTMLElement | null) {
  if (!row) return;
  for (const band of row.querySelectorAll<HTMLElement>('[data-band]')) {
    const word = band.firstElementChild;
    if (!(word instanceof HTMLElement) || band.clientWidth === 0) continue;
    word.dataset.fits = String(word.offsetWidth + WORD_PADDING_PX <= band.clientWidth);
  }
}

export function StateTimeline({ sensor, points, from, to, name, windowText }: ChartProps) {
  const { t, i18n } = useTranslation();
  const hover = useHoverTime(from, to);
  const row = useRef<HTMLDivElement>(null);
  const codes = valueCodes(sensor);
  const word = (value: number) => {
    const key = sensor.valueLabels?.[String(value)];
    return key ? t(key) : '';
  };
  const shown = bands(points, from, to);

  // After every render the bands have moved; on resize their widths change.
  useLayoutEffect(() => {
    fitWords(row.current);
  });
  useEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      fitWords(element);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const pointer = hover.at;
  let readout = '';
  if (pointer !== undefined) {
    const pointed = shown.find((b) => b.from <= pointer && pointer < b.to);
    const what = pointed ? word(pointed.value) : t('chart.gap');
    readout = `${what} ${t('live.at', { time: formatTime(pointer) })}`;
  }

  // The spoken summary: each value's share of the window, and the missing part.
  const span = to - from;
  const time = new Map<number, number>();
  for (const b of shown) time.set(b.value, (time.get(b.value) ?? 0) + (b.to - b.from));
  const known = [...time.values()].reduce((a, b) => a + b, 0);
  const share = (what: string, ms: number) =>
    t('chart.share', { word: what, percent: Math.round((ms / span) * 100) });
  const shares = codes.flatMap((code) => {
    const ms = time.get(code);
    return ms ? [share(word(code), ms)] : [];
  });
  if (shares.length && (span - known) / span >= 0.005)
    shares.push(share(t('chart.gap'), span - known));
  const list = new Intl.ListFormat(i18n.language, { type: 'unit' });
  const summary = shares.length
    ? t('chart.timelineSummary', { name, window: windowText, shares: list.format(shares) })
    : t('chart.emptySummary', { name, window: windowText });

  return (
    <div className={styles.timeline}>
      <div className={styles.plotArea} dir="ltr">
        <div
          ref={row}
          className={styles.bands}
          role="img"
          tabIndex={0}
          aria-label={summary}
          data-chart="timeline"
          {...hover.handlers}
        >
          {shown.map((b) => {
            const shade = shadeOf(codes, b.value);
            const width = at(from + (b.to - b.from), from, to);
            return (
              <div
                key={b.start}
                className={cx(styles.band, styles[`shade${String(shade)}`])}
                style={{
                  left: at(b.from, from, to),
                  // A 2 px gap of the panel's colour between touching bands.
                  width: b.touchesNext ? `calc(${width} - 2px)` : width,
                }}
                data-band=""
                data-shade={shade}
              >
                <span className={styles.bandWord}>{word(b.value)}</span>
              </div>
            );
          })}
          {hover.at !== undefined && (
            <div className={styles.crosshairBar} style={{ left: at(hover.at, from, to) }} />
          )}
          {shown.length === 0 && <p className={styles.empty}>{t('chart.noData')}</p>}
        </div>
        <Readout
          text={readout}
          pointerShare={pointer === undefined ? 0 : (pointer - from) / span}
        />
      </div>
      <div dir="ltr">
        <TimeAxis from={from} to={to} />
      </div>
      <ul className={styles.legend}>
        {codes.map((code) => (
          <li key={code} data-shade={shadeOf(codes, code)}>
            <span
              className={cx(styles.swatch, styles[`shade${String(shadeOf(codes, code))}`])}
              aria-hidden="true"
            />
            {word(code)}
          </li>
        ))}
      </ul>
    </div>
  );
}
