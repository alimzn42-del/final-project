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

/**
 * Plural forms (i18next, owner step 11): a number followed by a counted noun is
 * one message written once per form, as `key_one`, `key_other`... The forms
 * each language needs come from the browser's own plural rules: English one
 * and other; Arabic zero, one, two, few, many and other.
 */
const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;

export function pluralForms(lang: Language): string[] {
  return new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
}

interface Message {
  plural: boolean;
  /** For a plain message, one form named "text". */
  forms: Record<string, string>;
}

/** The messages of a locale file: plain keys, and plural keys grouped by their base key. */
function messagesOf(dict: LocaleDict): Map<string, Message> {
  const out = new Map<string, Message>();
  for (const [key, text] of Object.entries(dict)) {
    const [, base, form] = PLURAL_SUFFIX.exec(key) ?? [];
    if (base && form) {
      // Every form joins its group; forms the language does not use are reported by the rules.
      const msg = out.get(base) ?? { plural: true, forms: {} };
      msg.forms[form] = text;
      out.set(base, msg);
    } else {
      out.set(key, { plural: false, forms: { text } });
    }
  }
  return out;
}

/**
 * `value.*` keys in the locale files that no sensor uses (no `valueLabels`
 * entry in machine.json). A test keeps this empty, so value words that were
 * removed from the line do not linger (owner, step 11).
 */
export function unusedValueKeys(machine: Machine, locales: Locales): string[] {
  const used = new Set(
    machine.components.flatMap((c) => c.sensors.flatMap((s) => Object.values(s.valueLabels ?? {}))),
  );
  const keys = new Set(LANGUAGES.flatMap((lang) => Object.keys(locales[lang])));
  return [...keys].filter((k) => k.startsWith('value.') && !used.has(k)).sort();
}

export function componentName(dict: LocaleDict, c: MachineComponent): string | undefined {
  return translate(dict, c.labelKey, c.labelParams);
}

export function checkLocales(machine: Machine, locales: Locales): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const { en, ar } = locales;

  // 1. Both files have the same messages, with the same placeholders. A plural message is a
  //    group of keys (`key_one`, `key_other`...) with exactly the forms its language needs.
  const messages = { en: messagesOf(en), ar: messagesOf(ar) };
  for (const [lang, otherLang] of [
    ['en', 'ar'],
    ['ar', 'en'],
  ] as const) {
    for (const [id, msg] of messages[lang]) {
      const other = messages[otherLang].get(id);
      if (!other) {
        add(`locales.${otherLang}["${id}"]`, `missing (exists in ${lang})`);
      } else if (msg.plural !== other.plural) {
        add(`locales.${otherLang}["${id}"]`, `plural in one language only`);
      }
    }
    for (const [id, msg] of messages[lang]) {
      if (!msg.plural) continue;
      const wanted = pluralForms(lang);
      const forms = Object.keys(msg.forms);
      const missing = wanted.filter((f) => !forms.includes(f));
      const extra = forms.filter((f) => !wanted.includes(f));
      if (missing.length)
        add(`locales.${lang}["${id}"]`, `plural forms missing: ${missing.join(', ')}`);
      if (extra.length)
        add(`locales.${lang}["${id}"]`, `plural forms ${lang} does not use: ${extra.join(', ')}`);
      if (msg.forms.other !== undefined && !placeholders(msg.forms.other).includes('count')) {
        add(`locales.${lang}["${id}_other"]`, 'a plural text needs {{count}}');
      }
    }
  }
  for (const [id, enMsg] of messages.en) {
    const arMsg = messages.ar.get(id);
    if (arMsg?.plural !== enMsg.plural) continue;
    // In plural texts {{count}} may be left out of a form ("two characters" in Arabic).
    const names = (m: Message) =>
      [...new Set(Object.values(m.forms).flatMap(placeholders))]
        .filter((n) => !(m.plural && n === 'count'))
        .sort()
        .join(',');
    const a = names(enMsg);
    const b = names(arMsg);
    if (a !== b) add(`locales["${id}"]`, `placeholders differ: en {${a}}, ar {${b}}`);
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
