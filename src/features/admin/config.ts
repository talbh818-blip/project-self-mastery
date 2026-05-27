// Single source of truth for the admin allowlist.
// Mirrors the email check in supabase/migrations/0011_profiles_and_admin.sql:
//   public.is_admin()
// If you add or remove emails here you MUST update the SQL function too,
// otherwise RLS will block (or wrongly allow) the admin features.
export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  'talbh818@gmail.com',
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
