// 코트를 화면에 그리는 방향 (순수 함수 → 테스트 가능)
// 게임 규칙은 항상 30×15 격자(오른쪽 = 공격 방향)로 계산하고, 화면에 그릴 때만 이 변환을 거친다.
//   landscape: 그대로 (가로 30 × 세로 15)
//   portrait : 90° 돌려 공격 방향이 화면 위쪽 (가로 15 × 세로 30)
//   swapEnds : 진영 교대(Rule 2.2) — 화면에서 코트를 180° 돌린다. 우리 골이 반대편(왼쪽 / 아래)에 온다.
import { COURT } from './zones.js';

export const ORIENTATIONS = Object.freeze(['landscape', 'portrait']);

// 세로 화면에서 화면 방향 → 게임 방향 (화면 ↑ = 공격 방향 →)
const PORTRAIT_FROM_SCREEN = { up: 'right', down: 'left', right: 'down', left: 'up' };
const PORTRAIT_TO_SCREEN = { right: 'up', left: 'down', down: 'right', up: 'left' };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SCREEN_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function createView(orientation = 'landscape', swapEnds = false) {
  const portrait = orientation === 'portrait';
  const W = portrait ? COURT.rows : COURT.cols;
  const H = portrait ? COURT.cols : COURT.rows;
  const turn = (d) => (swapEnds ? OPPOSITE[d] : d); // 180° 회전하면 화면 방향이 모두 반대
  const toScreenDir = (d) => turn(portrait ? PORTRAIT_TO_SCREEN[d] : d);
  return Object.freeze({
    orientation: portrait ? 'portrait' : 'landscape',
    swapEnds,
    /** 화면 크기(칸 단위) */
    cols: W,
    rows: H,
    /** 코트 좌표(칸 단위, 소수 가능: x는 코트 길이 방향 0~30, y는 폭 방향 0~15) → 화면 좌표(칸 단위) */
    toScreen(x, y) {
      const p = portrait ? { x: y, y: COURT.cols - x } : { x, y };
      return swapEnds ? { x: W - p.x, y: H - p.y } : p;
    },
    /** 칸 (c,r)이 화면에서 차지하는 칸의 왼쪽 위 (칸 단위) */
    cellOrigin(c, r) {
      const p = portrait ? { x: r, y: COURT.cols - 1 - c } : { x: c, y: r };
      return swapEnds ? { x: W - 1 - p.x, y: H - 1 - p.y } : p;
    },
    /** 칸 (c,r)의 화면 중심 (칸 단위) */
    cellCenter(c, r) {
      return this.toScreen(c + 0.5, r + 0.5);
    },
    /** 화면 방향(스와이프·방향 버튼·방향키) → 게임 방향 */
    dirFromScreen(dir) {
      const d = turn(dir);
      return portrait ? PORTRAIT_FROM_SCREEN[d] : d;
    },
    /** 게임 방향 → 화면 방향 */
    dirToScreen: toScreenDir,
    /** 게임 방향의 화면 단위 벡터 [dx, dy] */
    screenVec(dir) {
      return SCREEN_VEC[toScreenDir(dir)];
    },
  });
}
