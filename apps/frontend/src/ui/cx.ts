/** Joins CSS class names, skipping missing ones (CSS module classes are typed as maybe missing). */
export function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
