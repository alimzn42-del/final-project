/**
 * Locale files (config/locales/en.json, ar.json) and the rules from
 * docs/04-architecture.md: every label key exists in both languages, and on
 * any one page every name is unique.
 */
import { z } from 'zod';

import type { Issue } from './issues.js';
import type { Machine, MachineComponent } from './machine.schema.js';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A locale file is a flat map: i18n key -> text. */
export const localeSchema = z.record(z.string(), z.string());
export type LocaleDict = z.infer<typeof localeSchema>;
export type Locales = Record<Language, LocaleDict>;

/** The `{{name}}` placeholders in a text, in order. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '');
}

/**
 * Translates a key and fills its placeholders. Each param is itself an i18n
 * key, translated first (doc 03): part.dyeTank + {color: color.cyan} ->
 * "Cyan dye tank". Returns undefined if any key is missing.
 */
export function translate(
  dict: LocaleDict,
  key: string,
  params: Record<string, string> = {},
): string | undefined {
  const text = dict[key];
  if (text === undefined) return undefined;
  const values = new Map<string, string>();
  for (const name of placeholders(text)) {
    const paramKey = params[name];
    const value = paramKey === undefined ? undefined : dict[paramKey];
    if (value === undefined) return undefined;
    values.set(name, value);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values.get(name) ?? '');
}

export function componentName(dict: LocaleDict, c: MachineComponent): string | undefined {
  return translate(dict, c.labelKey, c.labelParams);
}

export function checkLocales(machine: Machine, locales: Locales): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const { en, ar } = locales;

  // 1. Both files have the same keys, with the same placeholders.
  for (const [lang, dict, other, otherLang] of [
    ['en', en, ar, 'ar'],
    ['ar', ar, en, 'en'],
  ] as const) {
    for (const key of Object.keys(dict)) {
      if (!(key in other)) add(`locales.${otherLang}["${key}"]`, `missing (exists in ${lang})`);
    }
  }
  for (const [key, enText] of Object.entries(en)) {
    const arText = ar[key];
    if (arText === undefined) continue;
    const a = placeholders(enText).sort().join(',');
    const b = placeholders(arText).sort().join(',');
    if (a !== b) add(`locales["${key}"]`, `placeholders differ: en {${a}}, ar {${b}}`);
  }

  // 2. Every key machine.json uses exists in both files.
  const requireKey = (path: string, key: string) => {
    for (const lang of LANGUAGES) {
      if (!(key in locales[lang])) add(path, `label key "${key}" is missing in ${lang}.json`);
    }
  };
  for (const s of machine.sections) {
    requireKey(`sections[${s.id}].labelKey`, s.labelKey);
    for (const sub of s.subsections) {
      requireKey(`sections[${s.id}].subsections[${sub.id}].labelKey`, sub.labelKey);
    }
  }
  for (const c of machine.components) {
    const path = `components[${c.id}]`;
    requireKey(`${path}.labelKey`, c.labelKey);
    for (const [name, key] of Object.entries(c.labelParams ?? {})) {
      requireKey(`${path}.labelParams.${name}`, key);
    }
    for (const s of c.sensors) {
      requireKey(`${path}.sensors[${s.id}].labelKey`, s.labelKey);
      for (const [code, key] of Object.entries(s.valueLabels ?? {})) {
        requireKey(`${path}.sensors[${s.id}].valueLabels.${code}`, key);
      }
    }

    // 3. labelParams match the label's placeholders exactly.
    const text = en[c.labelKey];
    if (text !== undefined) {
      const wanted = new Set(placeholders(text));
      const given = new Set(Object.keys(c.labelParams ?? {}));
      for (const name of wanted) {
        if (!given.has(name)) add(`${path}.labelParams`, `"${c.labelKey}" needs param "${name}"`);
      }
      for (const name of given) {
        if (!wanted.has(name))
          add(`${path}.labelParams.${name}`, `"${c.labelKey}" has no {{${name}}}`);
      }
    }
  }

  // 4. Names are unique on every page, in every language.
  for (const lang of LANGUAGES) {
    for (const page of pages(machine)) {
      const seen = new Map<string, string>();
      for (const item of page.items) {
        const name = translate(locales[lang], item.labelKey, item.labelParams);
        if (name === undefined) continue; // reported above as a missing key
        const first = seen.get(name);
        if (first) {
          add(item.path, `${lang} name "${name}" is also used by ${first} on ${page.name}`);
        } else {
          seen.set(name, item.path);
        }
      }
    }
  }

  return issues;
}

interface PageItem {
  path: string;
  labelKey: string;
  labelParams?: Record<string, string> | undefined;
}

/**
 * Every list of names shown together on screen (doc 03 navigation):
 * the line page, each section page, each subsection page, each component's
 * values panel and each sensor's value words.
 */
function pages(machine: Machine): { name: string; items: PageItem[] }[] {
  const out: { name: string; items: PageItem[] }[] = [];
  const asItem = (c: MachineComponent): PageItem => ({
    path: `components[${c.id}]`,
    labelKey: c.labelKey,
    labelParams: c.labelParams,
  });

  out.push({
    name: 'the line page',
    items: machine.sections.map((s) => ({ path: `sections[${s.id}]`, labelKey: s.labelKey })),
  });

  for (const section of machine.sections) {
    const inSection = machine.components.filter((c) => c.section === section.id);
    out.push({
      name: `page ${section.id}`,
      items: [
        ...section.subsections.map((sub) => ({
          path: `sections[${section.id}].subsections[${sub.id}]`,
          labelKey: sub.labelKey,
        })),
        ...inSection.filter((c) => c.subsection === null).map(asItem),
      ],
    });
    for (const sub of section.subsections) {
      out.push({
        name: `page ${section.id}/${sub.id}`,
        items: inSection.filter((c) => c.subsection === sub.id).map(asItem),
      });
    }
  }

  for (const c of machine.components) {
    out.push({
      name: `the values panel of ${c.id}`,
      items: c.sensors.map((s) => ({
        path: `components[${c.id}].sensors[${s.id}]`,
        labelKey: s.labelKey,
      })),
    });
    for (const s of c.sensors) {
      out.push({
        name: `the values of ${s.id}`,
        items: Object.entries(s.valueLabels ?? {}).map(([code, key]) => ({
          path: `components[${c.id}].sensors[${s.id}].valueLabels.${code}`,
          labelKey: key,
        })),
      });
    }
  }
  return out;
}
