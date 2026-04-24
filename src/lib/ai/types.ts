/**
 * Plannode AI 문서 자동화 타입 정의
 * - BadgeSet: 3트랙(DEV/UX/PRJ) 배지 체계
 * - NodeMetadata: 노드 확장 메타데이터
 * - OutputIntent: 문서 생성 목적
 */

export type DevBadge = 'TDD' | 'CRUD' | 'API' | 'AUTH' | 'REALTIME' | 'PAYMENT';
export type UxBadge = 'NAVI' | 'HEAD' | 'LIST' | 'CARD' | 'FORM' | 'BUTT' | 'MODAL' | 'FEED' | 'DASH' | 'MEDIA';
export type PrjBadge = 'USP' | 'MVP' | 'AI' | 'I18N' | 'MOBILE';

export type Badge = DevBadge | UxBadge | PrjBadge;

export interface BadgeSet {
  dev: DevBadge[];
  ux: UxBadge[];
  prj: PrjBadge[];
}

export interface NodeMetadata {
  badges?: BadgeSet;
  [key: string]: unknown;
}

export type OutputIntent = 'PRD' | 'WIREFRAME_SPEC' | 'SCREEN_LIST' | 'FUNCTIONAL_SPEC' | 'IA_STRUCTURE';

export interface GenerationResult {
  success: boolean;
  content?: string;
  error?: string;
}
