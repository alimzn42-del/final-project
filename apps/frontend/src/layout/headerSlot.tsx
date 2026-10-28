/**
 * A place in the header that a page can fill (docs/06-brand.md "Layout": the
 * header holds the page title and the breadcrumbs).
 */
import { createContext, type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';

export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/** Shows its children in the header (nothing on pages without the app's header). */
export function InHeader({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  return slot ? createPortal(children, slot) : null;
}
