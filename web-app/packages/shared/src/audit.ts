/**
 * The audit log (owner, step 16): every change to an account or a department, with who made it,
 * on whom, what it was before and after, and when. Append-only (docs/04-architecture.md).
 * Language and theme changes are not recorded. Passwords and their hashes never are.
 * The viewer page is deferred (docs/05-roadmap.md); these types are for it and for the backend.
 */
export const AUDIT_ACTIONS = [
  'accountCreated',
  'signedUp',
  'temporaryPasswordIssued',
  'passwordChanged',
  'accountDisabled',
  'accountEnabled',
  'departmentChanged',
  'departmentCreated',
  'departmentRenamed',
  'departmentDeleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGETS = ['user', 'department'] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

/** Only the fields that changed. */
export type AuditValues = Readonly<Record<string, string | number | boolean | null>>;

export interface AuditEntry {
  /** Who made the change; null = the system (the first manager, created from .env). */
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  before: AuditValues | null;
  after: AuditValues | null;
}

/**
 * Why an account action was refused (the `code` of the API's error answer), so the page can
 * explain it in the user's language.
 */
export const ACCOUNT_CODES = {
  /** At login, after a correct password, and on any request of a disabled account. */
  disabled: 'ACCOUNT_DISABLED',
  /** Owner, step 16: a manager may never disable their own account. */
  cannotDisableSelf: 'CANNOT_DISABLE_SELF',
  /** Owner, step 16: the line may never be left without an active manager. */
  lastActiveManager: 'LAST_ACTIVE_MANAGER',
  /** Only workers have a department. */
  notAWorker: 'NOT_A_WORKER',
} as const;
