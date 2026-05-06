/**
 * AI 응답 문자열에서 plannode.tree JSON 추출 후 `parsePlannodeTreeV1ImportText`로 검증.
 */
import type { Node, Project } from '$lib/supabase/client';
import { parsePlannodeTreeV1ImportText } from '$lib/plannodeTreeV1';

export interface AgendaParseSuccess {
  project: Project;
  nodes: Node[];
  rawJson: string;
  nodeCount: number;
}

function replaceProjectIdPlaceholder(s: string, projectId: string): string {
  return s.replace(/\{\{projectId\}\}/g, projectId);
}

/**
 * AI 응답에서 ```json ... ``` 펜스를 우선 추출. 없으면 전체 문자열을 파서에 넘김.
 */
export function extractAndParseTree(aiResponse: string, projectId: string): AgendaParseSuccess {
  const fenceMatch = aiResponse.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : aiResponse.trim();

  if (!candidate) {
    throw new Error('AI 응답에서 JSON을 찾을 수 없어. 다시 시도해줘.');
  }

  const withIds = replaceProjectIdPlaceholder(candidate, projectId);
  const parsed = parsePlannodeTreeV1ImportText(withIds);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const roots = parsed.nodes.filter((n) => !n.parent_id);
  if (roots.length !== 1) {
    throw new Error('루트 노드는 parent_id 없이 정확히 1개여야 해.');
  }
  if (parsed.nodes.length < 2) {
    throw new Error('노드가 너무 적어. AI 응답을 다시 받아줘.');
  }

  const project: Project = {
    ...parsed.project,
    id: projectId
  };

  const nodes: Node[] = parsed.nodes.map((n) => ({
    ...n,
    id: replaceProjectIdPlaceholder(n.id, projectId),
    project_id: projectId,
    parent_id: n.parent_id ? replaceProjectIdPlaceholder(n.parent_id, projectId) : undefined
  }));

  return {
    project,
    nodes,
    rawJson: withIds,
    nodeCount: nodes.length
  };
}
