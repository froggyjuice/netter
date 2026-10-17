// 코트 칸 색 (게임 화면과 포지션 미리보기가 함께 쓴다)
import { canShootAt, zoneOf } from './zones.js';
import { THEME } from './theme.js';

/**
 * 우리 팀 골 서클(공격 서클)은 황금색으로 구분한다.
 * GS·GA처럼 슛할 수 있으면 밝은 황금색, 들어갈 수 없는 포지션이면 채도 낮은 황금색(빗금은 그대로).
 */
export function cellColor(position, c, r, allowed) {
  if (zoneOf(c, r) === 1) {
    if (canShootAt(position, c, r)) return THEME.goalZone;
    if (!allowed) return THEME.goalZoneMuted;
  }
  return allowed ? THEME.allowed : THEME.forbidden;
}
