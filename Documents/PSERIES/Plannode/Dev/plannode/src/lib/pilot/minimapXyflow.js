/**
 * 미니맵 좌표계 — XY Flow React MiniMap과 동일한 viewBox 수학.
 *
 * 참고(라이선스 MIT): xyflow/xyflow
 * packages/react/src/additional-components/MiniMap/MiniMap.tsx
 * — boundingRect = union(노드 bounds, 시야 viewBB)
 * — scaledWidth/Height, viewScale = max(...), offset = offsetScale * viewScale
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * 노드 AABB와 메인 캔버스 시야(그래프 좌표) 직사각형을 합친 bounds.
 * MiniMap.tsx 의 getBoundsOfRects(nodesBounds, viewBB) 에 대응.
 * @param {Rect} nodeBounds
 * @param {Rect} viewBB
 * @returns {Rect}
 */
export function unionNodeBoundsAndViewport(nodeBounds, viewBB) {
  const maxX = Math.max(nodeBounds.x + nodeBounds.width, viewBB.x + viewBB.width);
  const maxY = Math.max(nodeBounds.y + nodeBounds.height, viewBB.y + viewBB.height);
  const x = Math.min(nodeBounds.x, viewBB.x);
  const y = Math.min(nodeBounds.y, viewBB.y);
  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y),
  };
}

/**
 * MiniMap.tsx 내 viewBox 계산과 동일.
 * @param {Rect} boundingRect 그래프 좌표계 AABB
 * @param {number} elementWidth 미니맵 위젯 CSS 너비(px)
 * @param {number} elementHeight 미니맵 위젯 CSS 높이(px)
 * @param {number} [offsetScale=5] Flow 기본값 — 시야 마스크 바깥 여백(그래프 단위)
 * @returns {{ viewBox: Rect, viewScale: number }}
 */
export function computeMinimapViewBox(boundingRect, elementWidth, elementHeight, offsetScale = 5) {
  const bw = Math.max(1, boundingRect.width);
  const bh = Math.max(1, boundingRect.height);
  const scaledWidth = bw / elementWidth;
  const scaledHeight = bh / elementHeight;
  const viewScale = Math.max(scaledWidth, scaledHeight);
  const viewWidth = viewScale * elementWidth;
  const viewHeight = viewScale * elementHeight;
  const offset = offsetScale * viewScale;
  const x = boundingRect.x - (viewWidth - bw) / 2 - offset;
  const y = boundingRect.y - (viewHeight - bh) / 2 - offset;
  const width = viewWidth + offset * 2;
  const height = viewHeight + offset * 2;
  return {
    viewBox: { x, y, width, height },
    viewScale,
  };
}

/**
 * 그래프 좌표 → 미니맵 캔버스 로컬 픽셀 (0…mw, 0…mh)
 * @param {number} gx
 * @param {number} gy
 * @param {Rect} viewBox
 * @param {number} mw
 * @param {number} mh
 */
export function worldToMinimapPixel(gx, gy, viewBox, mw, mh) {
  return {
    px: ((gx - viewBox.x) / viewBox.width) * mw,
    py: ((gy - viewBox.y) / viewBox.height) * mh,
  };
}

/**
 * 미니맵 로컬 픽셀 → 그래프 좌표 (클릭 역변환)
 * @param {number} px
 * @param {number} py
 * @param {Rect} viewBox
 * @param {number} mw
 * @param {number} mh
 */
export function minimapPixelToWorld(px, py, viewBox, mw, mh) {
  return {
    gx: (px / mw) * viewBox.width + viewBox.x,
    gy: (py / mh) * viewBox.height + viewBox.y,
  };
}

/**
 * SVG preserveAspectRatio xMidYMid meet 와 동일 — 그래프 단위는 각축 동일 배율(원형 유지).
 * viewBox 에 offset 이 있어 가로세로 픽셀 배율이 달라지면 비균일 stretch 가 되면서
 * 노드·시야가 미니맵 밖으로 밀리는 문제가 생김.
 * @returns {{ scale: number, padX: number, padY: number }}
 */
export function minimapUniformFit(viewBox, mw, mh) {
  const scale = Math.min(mw / viewBox.width, mh / viewBox.height);
  const drawnW = viewBox.width * scale;
  const drawnH = viewBox.height * scale;
  const padX = (mw - drawnW) / 2;
  const padY = (mh - drawnH) / 2;
  return { scale, padX, padY };
}

/**
 * 그래프 좌표 → 미니맵 픽셀 (균일 스케일 + 중앙 여백)
 */
export function worldToMinimapPixelUniform(gx, gy, viewBox, mw, mh) {
  const { scale, padX, padY } = minimapUniformFit(viewBox, mw, mh);
  return {
    px: (gx - viewBox.x) * scale + padX,
    py: (gy - viewBox.y) * scale + padY,
  };
}

/**
 * 미니맵 픽셀 → 그래프 좌표 (클릭, 균일 스케일 역변환)
 */
export function minimapPixelToWorldUniform(px, py, viewBox, mw, mh) {
  const { scale, padX, padY } = minimapUniformFit(viewBox, mw, mh);
  if (scale <= 1e-12) return { gx: viewBox.x, gy: viewBox.y };
  return {
    gx: (px - padX) / scale + viewBox.x,
    gy: (py - padY) / scale + viewBox.y,
  };
}
