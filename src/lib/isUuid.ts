/** RFC 4122 문자열 검사 — `plan_projects.id` / `plan_nodes.id` 등 Supabase UUID 컬럼과 정합 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(String(s ?? '').trim());
}
