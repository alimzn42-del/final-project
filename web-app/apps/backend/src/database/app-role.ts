/**
 * The backend's own database role (owner, step 16). The backend no longer connects as the
 * database owner: it uses a role that can read and change the app's tables, but may only add
 * and read rows of the audit log, never change, delete or empty it. The migrations still run as
 * the owner (prisma.config.ts), then grantAppRole() creates or updates this role.
 *
 * Run again after every migration, so new tables get their privileges at once. Idempotent.
 */
import type pg from 'pg';

export interface AppRole {
  name: string;
  password: string;
}

/** Lower-case letters, digits and underscores, so the name never needs quoting tricks. */
export const APP_ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
export const DEFAULT_APP_ROLE = 'mixline_app';

/** Tables the backend reads and changes in full (every table except these). */
const NOT_FOR_THE_APP = ['_prisma_migrations'];
/** Append-only tables: the backend may add and read rows, nothing else. */
const APPEND_ONLY = ['audit_log'];

export async function grantAppRole(owner: pg.Client, role: AppRole): Promise<void> {
  if (!APP_ROLE_NAME.test(role.name)) {
    throw new Error(`database role name "${role.name}": use lower-case letters, digits and _`);
  }
  if (role.password.length < 12) throw new Error('the database role password needs 12+ characters');
  const name = owner.escapeIdentifier(role.name);
  const password = owner.escapeLiteral(role.password);
  const database = (await owner.query<{ db: string }>('SELECT current_database() AS db')).rows[0]
    ?.db;
  if (!database) throw new Error('cannot read the current database');

  await owner.query('BEGIN');
  try {
    // Roles belong to the whole server, so another database may have created it already.
    const exists = await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
    if (exists.rowCount === 0) await owner.query(`CREATE ROLE ${name} LOGIN`);
    // No special powers: not an administrator, cannot create databases or roles, and inherits
    // nothing from other roles.
    await owner.query(
      `ALTER ROLE ${name} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${password}`,
    );
    await owner.query(`GRANT CONNECT ON DATABASE ${owner.escapeIdentifier(database)} TO ${name}`);
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${name}`);
    // Start from nothing, then grant exactly what the backend needs.
    await owner.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${name}`);
    await owner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${name}`,
    );
    for (const table of NOT_FOR_THE_APP) {
      await owner.query(`REVOKE ALL ON TABLE ${owner.escapeIdentifier(table)} FROM ${name}`);
    }
    for (const table of APPEND_ONLY) {
      await owner.query(`REVOKE ALL ON TABLE ${owner.escapeIdentifier(table)} FROM ${name}`);
      await owner.query(
        `GRANT SELECT, INSERT ON TABLE ${owner.escapeIdentifier(table)} TO ${name}`,
      );
    }
    // Ids that count up (the audit log's) come from sequences.
    await owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${name}`);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}
