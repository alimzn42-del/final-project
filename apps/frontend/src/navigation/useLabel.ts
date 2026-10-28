/** Translates a name from machine.json: the label, with each param translated first (doc 03). */
import { useTranslation } from 'react-i18next';

import type { Label } from './places';

export function useLabel(): (label: Label) => string {
  const { t } = useTranslation();
  return ({ labelKey, labelParams }) =>
    t(
      labelKey,
      Object.fromEntries(Object.entries(labelParams ?? {}).map(([name, key]) => [name, t(key)])),
    );
}
