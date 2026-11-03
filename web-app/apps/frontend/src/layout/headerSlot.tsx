/**
 * Places in the header that a page can fill (docs/06-brand.md "Layout"):
 * - "title": the page title and the breadcrumbs;
 * - "status": next to the language switch, for the SIMULATION badge (step 14).
 */
import { createContext, type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';

export type HeaderPlace = 'title' | 'status';

export const HeaderSlotContext = createContext<Record<HeaderPlace, HTMLElement | null>>({
  title: null,
  status: null,
});

/** Shows its children in the header (nothing on pages without the app's header). */
export function InHeader({
  children,
  place = 'title',
}: {
  children: ReactNode;
  place?: HeaderPlace;
}) {
  const slot = useContext(HeaderSlotContext)[place];
  return slot ? createPortal(children, slot) : null;
}
