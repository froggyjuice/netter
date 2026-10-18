// 홈 화면의 존 스네이크 '맛보기' (순수 로직 → 테스트 가능). 그리기는 ui/snake-taste.js.
// 실제 게임(snake-logic.js)에서 구역 감각만 떼어 낸 축소판: 공 먹기 · 벽 튕김 · 오프사이드(빨간 선)만.
// 맞수·패스·쿼터·점수 등록은 없다.
import { isAllowed, allowedCells, zoneOf, canShootAt } from '../shared/zones.js';
import { DIRS, nearOffside, ITEM_OFFSIDE_MARGIN } from './snake-logic.js';

export const TASTE_MS = 20_000; // 맛보기 시간
export const TASTE_TICK_MS = 230; // 한 칸 이동 간격 (실제 게임 처음 속도와 비슷하게)
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SIDES = { up: ['left', 'right'], down: ['left', 'right'], left: ['up', 'down'], right: ['up', 'down'] };
const key = (c, r) => `${c},${r}`;
const same = (a, b) => Boolean(a && b && a.c === b.c && a.r === b.r);

/** 시작 자리: 허용 구역 가운데에 가까운 칸, 몸(왼쪽 두 칸)도 허용 구역 안 */
function startSnake(position) {
  const cells = allowedCells(position);
  const cx = cells.reduce((s, x) => s + x.c, 0) / cells.length;
  const cy = cells.reduce((s, x) => s + x.r, 0) / cells.length;
  let best = null;
  for (const { c, r } of cells) {
    if (!isAllowed(position, c - 1, r) || !isAllowed(position, c - 2, r)) continue;
    const d = Math.abs(c - cx) + Math.abs(r - cy);
    if (!best || d < best.d) best = { c, r, d };
  }
  return [0, 1, 2].map((i) => ({ c: best.c - i, r: best.r }));
}

function spawnBall(state, rng) {
  const body = new Set(state.snake.map((x) => key(x.c, x.r)));
  const free = allowedCells(state.position).filter((x) => !body.has(key(x.c, x.r)));
  const safe = free.filter((x) => !nearOffside(state.position, x.c, x.r, ITEM_OFFSIDE_MARGIN));
  const pool = safe.length ? safe : free;
  return pool.length ? { ...pool[Math.floor(rng() * pool.length)] } : null;
}

export function createTaste(position, rng = Math.random) {
  const state = { position, snake: startSnake(position), dir: null, queued: null, grow: 0, balls: 0, goals: 0, offsides: 0, walls: 0, item: null };
  state.item = spawnBall(state, rng);
  return state;
}

/** 방향 입력 (게임 방향). 몸 쪽(정반대)으로는 바로 돌 수 없다 */
export function steer(state, dir) {
  if (!DIRS[dir]) return false;
  // 지금 진행 방향의 정반대 · 목 쪽은 막는다 (한 틱 안에 꺾었다 되돌아와도 몸 쪽으로 꺾이지 않게, 기준은 실제 방향)
  if (state.dir && OPPOSITE[state.dir] === dir) return false;
  const [h, n] = state.snake;
  if (n && h.c + DIRS[dir].c === n.c && h.r + DIRS[dir].r === n.r) return false;
  state.queued = dir;
  return true;
}

const ahead = (state, dir) => ({ c: state.snake[0].c + DIRS[dir].c, r: state.snake[0].r + DIRS[dir].r });
const hitsBody = (state, n) => state.snake.slice(0, state.grow > 0 || same(n, state.item) ? undefined : -1).some((x) => same(x, n));

/** 한 칸 진행. 이벤트: wall · offside(zone) · ball(goal) · crash */
export function tasteStep(state, rng = Math.random) {
  const events = [];
  if (state.queued) {
    state.dir = state.queued;
    state.queued = null;
  }
  if (!state.dir) return events;
  let next = ahead(state, state.dir);
  if (!isAllowed(state.position, next.c, next.r)) {
    const zone = zoneOf(next.c, next.r);
    if (zone === 0) {
      state.walls += 1;
      events.push({ type: 'wall', cell: next });
    } else {
      state.offsides += 1;
      events.push({ type: 'offside', zone, cell: next });
    }
    // 옆으로 튕긴다 (실제 게임과 같음). 둘 다 막히면 멈춘다
    const turns = SIDES[state.dir].filter((d) => {
      const n = ahead(state, d);
      return isAllowed(state.position, n.c, n.r) && !hitsBody(state, n);
    });
    if (!turns.length) {
      state.dir = null;
      return events;
    }
    state.dir = turns[Math.floor(rng() * turns.length)];
    next = ahead(state, state.dir);
  }
  if (hitsBody(state, next)) {
    // 맛보기에서는 끝나지 않고 멈추기만 한다
    state.dir = null;
    events.push({ type: 'crash', cell: next });
    return events;
  }
  const eating = same(next, state.item);
  state.snake.unshift(next);
  if (eating) {
    const goal = canShootAt(state.position, next.c, next.r);
    state.balls += 1;
    if (goal) state.goals += 1;
    events.push({ type: 'ball', goal, cell: next });
    state.item = spawnBall(state, rng);
  } else if (state.grow > 0) {
    state.grow -= 1;
  } else {
    state.snake.pop();
  }
  return events;
}

