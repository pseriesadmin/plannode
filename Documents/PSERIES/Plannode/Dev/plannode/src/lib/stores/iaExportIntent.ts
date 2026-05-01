import { writable } from 'svelte/store';
import type { IAExportIntent } from '$lib/ai/iaExportRunner';

/** 출력 메뉴 → IA 패널에서 즉시 실행할 L5 인텐트(한 번 소비) */
export const pendingIaExportIntent = writable<IAExportIntent | null>(null);
