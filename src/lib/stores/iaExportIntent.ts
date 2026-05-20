import { writable } from 'svelte/store';
import type { IAExportIntent } from '$lib/ai/iaExportRunner';

/** 트랙 A 템플릿 종류 — `buildIaStructureMarkdownFromTree` / `buildWireframesMarkdownFromTree` */
export type IaTemplateKind = 'ia' | 'wireframes';

/** 상단 출력 → IA 탭에서 즉시 실행할 구조보내기(템플릿, LLM 없음) */
export const pendingIaTemplateExport = writable<IaTemplateKind | null>(null);

/** 출력 메뉴 → IA 패널에서 즉시 실행할 L5 인텐트(트랙 B, 한 번 소비) */
export const pendingIaExportIntent = writable<IAExportIntent | null>(null);
