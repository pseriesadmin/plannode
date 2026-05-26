-- P2-B2: ai_generations 3-stage pipeline — 클라이언트 insertAiGenerationL5 확장 (2026-05)
-- 선행: docs/supabase/plannode_ai_generations.sql (skeleton_output · deepened_output · validated_output 컬럼 이미 존재)
-- 적용: 신규 배포만 plannode_ai_generations.sql 실행. 기존 DB는 컬럼 있으면 **추가 SQL 불필요**.
-- 클라이언트: pipeline_stage = '3-stage' + skeleton/deepened/validated/final_output 채움 (insertAiGenerationL5)

comment on column public.ai_generations.skeleton_output is
  'P2-B2 generationPipeline stage 1 — PRD §10.3';

comment on column public.ai_generations.deepened_output is
  'P2-B2 generationPipeline stage 2';

comment on column public.ai_generations.validated_output is
  'P2-B2 generationPipeline stage 3 ([GAP] 포함)';

notify pgrst, 'reload schema';
