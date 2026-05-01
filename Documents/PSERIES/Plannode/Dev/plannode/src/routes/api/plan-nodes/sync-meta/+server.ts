import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSupabaseUserForRequest } from '$lib/server/supabaseUser';

type Row = {
  id: string;
  name?: string;
  num?: string;
  description?: string;
  badges?: string[];
  metadata?: unknown;
  node_type?: string;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * plan_projects.id (UUID) 기준으로 plan_nodes 메타(배지 3트랙) upsert
 * 선행: plan_nodes.app_node_id 열 + 유니크 인덱스 (docs/supabase/plan_nodes_app_node_id.sql)
 */
export const POST: RequestHandler = async ({ request }) => {
  const authed = await getSupabaseUserForRequest(request);
  if ('error' in authed) {
    if (authed.error === 'no_config') {
      return error(503, { message: 'Supabase env 미구성' });
    }
    return error(401, { message: '로그인이 필요해' });
  }

  const { supabase } = authed;

  let body: { planProjectId?: unknown; nodes?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(400, { message: 'JSON 본문이 필요해' });
  }

  const planProjectId = String(body?.planProjectId ?? '').trim();
  const list = body?.nodes;
  if (!isUuid(planProjectId)) {
    return error(400, { message: 'planProjectId(uuid)가 올바르지 않아' });
  }
  if (!Array.isArray(list) || list.length === 0) {
    return json({ ok: true, upserted: 0 });
  }

  const rows = (list as Row[]).map((n) => {
    if (!n?.id) {
      return null;
    }
    const name = n.name && String(n.name).trim() ? String(n.name) : '노드';
    return {
      project_id: planProjectId,
      app_node_id: String(n.id),
      name,
      node_type: n.node_type && String(n.node_type).trim() ? String(n.node_type) : 'feature',
      num: n.num != null && String(n.num).trim() ? String(n.num) : null,
      description: n.description != null ? String(n.description) : null,
      badges: Array.isArray(n.badges) ? n.badges.map((b) => String(b)) : [],
      meta:
        n.metadata && typeof n.metadata === 'object' && n.metadata !== null
          ? (n.metadata as Record<string, unknown>)
          : {}
    };
  });

  const clean = rows.filter((x): x is NonNullable<typeof x> => x != null);
  if (clean.length === 0) {
    return json({ ok: true, upserted: 0 });
  }

  const { error: upError } = await supabase.from('plan_nodes').upsert(clean, {
    onConflict: 'project_id,app_node_id'
  });

  if (upError) {
    return error(400, { message: upError.message || 'plan_nodes upsert 실패' });
  }

  return json({ ok: true, upserted: clean.length });
};
