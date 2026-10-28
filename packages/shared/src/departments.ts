/**
 * Worker departments (owner, step 9). Kept in the database, managed by
 * managers through the API (and later the user-management page). Each has an
 * English and an Arabic name, since managers create them while the app runs.
 * A department that still has workers cannot be deleted. Later a department
 * will decide which sections a worker can open (open item in
 * docs/05-roadmap.md); for now it is a label.
 */
import { z } from 'zod';

const name = z.string().trim().min(1, 'required').max(50, 'at most 50 characters');

/** Add a department: both names required. */
export const createDepartmentSchema = z.strictObject({ nameEn: name, nameAr: name });
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

/** Rename a department: one or both names. */
export const renameDepartmentSchema = z
  .strictObject({ nameEn: name.optional(), nameAr: name.optional() })
  .refine((d) => d.nameEn !== undefined || d.nameAr !== undefined, {
    message: 'give nameEn, nameAr or both',
  });
export type RenameDepartmentInput = z.infer<typeof renameDepartmentSchema>;

/** A department as the API returns it. */
export interface Department {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Workers in this department; it can be deleted only when this is 0. */
  workerCount: number;
}
