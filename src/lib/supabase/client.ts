import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * createClient('', '') 는 모듈 로드 시 예외(supabaseUrl is required) → SSR 500.
 * 미설정 시에만 형식상 유효한 placeholder(실제 호출은 sync에서 isSupabaseCloudConfigured로 차단).
 */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_ANON_KEY,
  { auth: { persistSession: typeof window !== 'undefined' } }
);

export type Project = {
  id: string;
  name: string;
  author: string;
  start_date: string;
  end_date: string;
  description?: string;
  /** Supabase Auth 사용자 id — 프로젝트 생성 시 설정, ACL 소유자 판별 */
  owner_user_id?: string | null;
  /** 초대 프로젝트: 클라우드 상 데이터가 담긴 소유자 워크스페이스 user_id (동기화 시 merge/fetch 대상) */
  cloud_workspace_source_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type Node = {
  id: string;
  project_id: string;
  name: string;
  num?: string;
  description?: string;
  badges?: string[];
  mx?: number;
  my?: number;
  parent_id?: string;
  /** 파일럿·IA 직렬화용 (root|module|feature|detail 등) */
  node_type?: string;
  depth: number;
  created_at: string;
  updated_at: string;
};
