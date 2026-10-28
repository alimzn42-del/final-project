/** Lint fixture: hardcoded UI text. The i18n lint rule must reject lines 5, 6 and 7. */
export function Hardcoded() {
  return (
    <form>
      <p>Welcome back</p>
      <input placeholder="Your email" />
      <button type="button" aria-label="Close" />
    </form>
  );
}
