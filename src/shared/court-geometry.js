// 코트를 그릴 때 쓰는 기하 정보. 화면에 보이는 선 = 게임이 실제로 막는 경계가 되도록
// 구역 판정(zoneOf)에서 직접 경계선을 뽑는다. (좌표 단위: 셀)
import { COURT, zoneOf, isAllowed } from './zones.js';

let cachedEdges = null;

/** 서로 다른 구역이 맞닿는 셀 경계선 [x1, y1, x2, y2] 목록 */
export function zoneEdges() {
  if (cachedEdges) return cachedEdges;
  const edges = [];
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const z = zoneOf(c, r);
      if (c + 1 < COURT.cols && zoneOf(c + 1, r) !== z) edges.push([c + 1, r, c + 1, r + 1]);
      if (r + 1 < COURT.rows && zoneOf(c, r + 1) !== z) edges.push([c, r + 1, c + 1, r + 1]);
    }
  }
  cachedEdges = edges;
  return edges;
}

/** 구역 번호 라벨 위치 (셀 단위) */
export const ZONE_LABELS = Object.freeze([
  { zone: 5, c: 2.8, r: 7.5 },
  { zone: 4, c: 7.5, r: 7.5 },
  { zone: 3, c: 15, r: 4 },
  { zone: 2, c: 22.5, r: 7.5 },
  { zone: 1, c: 27.2, r: 7.5 },
]);

/** 센터 서클 (지름 0.9m) */
export const CENTRE_CIRCLE = Object.freeze({ c: COURT.cols / 2, r: COURT.rows / 2, radius: 0.45 });

/** 포지션의 오프사이드 경계: 갈 수 있는 칸과 갈 수 없는 칸이 맞닿는 셀 경계선 [x1, y1, x2, y2] 목록 */
export function offsideEdges(position) {
  const edges = [];
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const a = isAllowed(position, c, r);
      if (c + 1 < COURT.cols && isAllowed(position, c + 1, r) !== a) edges.push([c + 1, r, c + 1, r + 1]);
      if (r + 1 < COURT.rows && isAllowed(position, c, r + 1) !== a) edges.push([c, r + 1, c + 1, r + 1]);
    }
  }
  return edges;
}
