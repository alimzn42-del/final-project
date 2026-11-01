/** Where each user belongs (owner, step 11): staff on the line, customers on their page. */
import type { PublicUser, Role } from '@mixline/shared';

/** Roles that may open the line pages (monitoring). */
export const STAFF: readonly Role[] = ['manager', 'worker'];

export function landingPath(user: PublicUser): string {
  // A temporary password must be replaced before anything else (owner, step 9).
  if (user.mustChangePassword) return '/change-password';
  return user.role === 'customer' ? '/customer' : '/line';
}
