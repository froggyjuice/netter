// 존 스네이크 순수 로직 (화면/Phaser와 분리 → 테스트 가능)
//
// 규칙
// - 선택한 포지션의 구역 안에서만 움직일 수 있다. 막힌 칸(코트 밖 벽, 허용되지 않은 구역)에
//   닿으면 옆으로 튕겨 계속 달린다. 양옆도 막혀 있으면 멈추고 방향 입력을 기다린다.
//   - 코트 밖 벽: 벌점 없음
//   - 허용되지 않은 구역: '오프사이드' −10점 (0점 아래로는 내려가지 않음)
// - 공격 모드(GS·GA·WA): 코트에 놓인 공을 먹으면 +10점, 몸이 길어진다.
//   GS·GA가 골 서클 안에서 먹으면 슈팅 성공 +30점.
// - 수비 모드(GK·GD·WD): 오른쪽(상대 공격 방향)에서 공이 굴러온다. 머리나 몸으로 막으면
//   차단 +10점(GK·GD가 수비 서클 안에서 막으면 +30점). 공이 내 구역을 빠져나가면 실점(기록만, 경기 시간은 계속).
// - 3초 패스: 공을 먹거나 막으면 근처에 같은 팀(패스 대상)이 나타난다. 3초 안에 닿으면 패스 성공 +20점.
//   놓쳐도 벌점은 없다. 패스하는 동안에는 다음 공이 나오지 않는다(공은 하나뿐).
//   근거: Rules of Netball 2024, Rule 11.4 (p.44) 공을 가진 선수는 3초 안에 패스하거나 슛해야 한다.
//   실제로는 공을 든 채 달릴 수 없지만(Rule 13 풋워크), 게임에서는 단순화했다.
// - 맞수: 상대 팀의 맞수(GS↔GK, GA↔GD, WA↔WD, C↔C)가 처음부터 나와 같은 구역에 있다.
//   센터 패스 때처럼 맞수 C만 센터 서드에, 나머지 맞수는 센터 서드 밖에서 시작한다 (Rule 8.9·8.11).
//   속도: 처음엔 내 1/4, 공 5개마다 빨라지지만 내 1/2보다 빨라지지 않는다.
//   공격 모드에서는 공·패스 대상을 쫓아 먼저 닿으면 가로챈다(0.9m를 지켰으므로 정당한 인터셉트, Rule 16.6).
//   수비 모드에서는 내 머리 앞을 막아선다.
// - 반칙 판정:
//   · 장애(맞수 반칙): 내가 공을 잡고 있는데 맞수가 0.9m(주변 8칸) 안으로 들어오면 → 페널티 패스.
//     맞수는 내 옆에 비켜서서 패스가 끝날 때까지 움직일 수 없고(아웃 오브 플레이), 내 3초는 다시 시작 (Rule 6.4·16.1).
//   · 접촉(내 반칙): 머리로 맞수에 부딪히면 → 공이 상대에게 (잡고 있던 패스·놓인 공이 사라짐).
//     맞수가 그 자리에서 페널티 패스를 하고(3초 안에 공을 놓음, Rule 11.4),
//     나는 그 공이 손을 떠날 때까지 아웃 오브 플레이로 멈춘다 (Rule 6.4c·17).
//   · GS·GA가 골 서클 안에서 페널티 패스를 얻으면 패스하거나 슛할 수 있다 (Rule 6.6):
//     동료(패스 +20)와 함께 골대 앞 '슛' 칸(+30)이 나타나고, 둘 중 먼저 닿는 쪽으로 처리된다.
// - 센터 패스로 시작: C만 센터 서드에서, 나머지는 자기 서드에서 출발한다 (Rule 8.10·8.11).
//   C를 플레이하면 센터 서클에서 공을 든 채 상대 C와 함께 출발하고(Rule 8.8·8.9),
//   첫 패스(센터 패스)는 센터 서드 안의 동료에게 해야 한다 (Rule 8.14).
//   다른 포지션도 쿼터의 첫 공은 센터 서클에서 시작해 센터 서드로 간다(state.centreBall: 화면 연출용 경로).
//   센터 서드에 들어갈 수 있으면(GA·WA·WD·GD·C) 그 자리에 첫 공이, 못 들어가면(GS·GK) 한 번 더 패스되어 내 구역으로.
//   휘슬 전에 움직이려 하면 '브레이킹' 안내(화면 쪽에서 처리).
// - 센터(C)는 시작할 때 공격/수비 중 하나를 고른다.
// - 교체 아이템(⇄)을 먹으면 현재 위치에서 허용되는 다른 포지션으로 바뀐다(모드도 따라 바뀜).
// - 자기 몸에 부딪히면 끝난다(경기에서는 그 쿼터만). 목숨은 없다(경기 시간이 정해져 있으므로).
import {
  COURT, POSITION_KEYS, MATCHUP, canShootAt, isAllowed, isAllowedForOpponent, allowedCells, zoneOf, positionsAllowingZone,
} from '../shared/zones.js';

/** 상대 페널티 패스에서 공이 손을 떠나기까지의 틱: 최소 2틱, 3초(Held ball) 전 */
export function penaltyReleaseTicks(balls, rng) {
  const max = passTicks(balls) - 1;
  return 2 + Math.floor(rng() * (max - 1));
}
export const BALL_POINTS = 10;
export const GOAL_POINTS = 30; // 골 서클 안에서 GS/GA가 공을 먹으면 '슈팅 성공'
export const BLOCK_POINTS = 10;
export const CIRCLE_BLOCK_POINTS = 30; // 수비 서클 안에서 GK/GD가 막으면
export const OFFSIDE_PENALTY = 10;
export const ROLL_EVERY = 3; // 굴러오는 공은 뱀이 3칸 갈 때 1칸 움직인다
export const PASS_POINTS = 20;
export const SHOT_BONUS = 10; // 공을 든 GS·GA가 패스하지 않고 3초 안에 골대(링 앞 칸)로 가서 슛하면 보너스
/** 우리 골대 링 바로 앞 칸 (골라인 가운데, 게임 좌표 오른쪽 끝) */
export const GOAL_POST_CELL = Object.freeze({ c: COURT.cols - 1, r: Math.floor(COURT.rows / 2) });
export const PASS_MS = 3000; // Rule 11.4: 3초
const PASS_DIST = [4, 7]; // 패스 대상은 머리에서 4~7칸(가로+세로) 떨어진 곳
export const ITEM_OFFSIDE_MARGIN = 1; // 공·교체 아이템은 오프사이드 칸에서 1칸 이내에는 나오지 않는다
export const PASS_OFFSIDE_MARGIN = 2; // 패스 대상은 오프사이드 칸에서 2칸 이내에는 나오지 않는다 (먹기 어려움)
/** 맞수가 한 칸 움직이는 데 걸리는 틱 수: 공 0~4개 4(내 1/4) → 5~9개 3 → 10개부터 2(내 1/2, 더 빨라지지 않음) */
export function oppEvery(balls) {
  return Math.max(2, 4 - Math.floor(balls / 5));
}
const OPP_SPAWN_DIST = 8; // 맞수는 머리에서 8칸 이상 떨어진 곳에 나타난다(가능하면)

const CIRCLE_DEFENDERS = ['GK', 'GD'];
const ATTACKERS = ['GS', 'GA', 'WA'];
const DEFENDERS = ['GK', 'GD', 'WD'];
export const MODES = Object.freeze(['attack', 'defence']);

export const DIRS = Object.freeze({
  up: { c: 0, r: -1 },
  down: { c: 0, r: 1 },
  left: { c: -1, r: 0 },
  right: { c: 1, r: 0 },
});

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SIDES = { up: ['left', 'right'], down: ['left', 'right'], left: ['up', 'down'], right: ['up', 'down'] };

/** 포지션의 플레이 모드. C처럼 양쪽 다 가능한 포지션은 preferred(없으면 공격)를 따른다. */
export function modeFor(position, preferred) {
  if (ATTACKERS.includes(position)) return 'attack';
  if (DEFENDERS.includes(position)) return 'defence';
  return MODES.includes(preferred) ? preferred : 'attack';
}

/** 틱 간격(ms). 공을 많이 먹을(막을)수록 빨라진다. */
export function tickMs(balls) {
  return Math.max(110, 200 - balls * 4);
}

/** 3초를 현재 속도의 틱 수로 바꾼다 (뱀이 멈춰 있는 동안은 시간이 흐르지 않는다) */
export function passTicks(balls) {
  return Math.ceil(PASS_MS / tickMs(balls));
}

function cellKey(c, r) {
  return `${c},${r}`;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/** 뱀과 맞수가 서 있는 칸 (아이템·패스 대상을 놓을 수 없는 곳) */
function occupiedSet(state) {
  const set = new Set(state.snake.map((s) => cellKey(s.c, s.r)));
  if (state.opp) set.add(cellKey(state.opp.c, state.opp.r));
  return set;
}

const same = (a, b) => Boolean(a && b && a.c === b.c && a.r === b.r);
const manhattan = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);

/** 구석 칸: 갈 수 있는 이웃 칸이 2개 이하 (들어가면 빠져나오기 어렵다) */
function isCorner(position, c, r) {
  const open = Object.values(DIRS).filter((d) => isAllowed(position, c + d.c, r + d.r)).length;
  return open <= 2;
}

/** 머리가 다음에 갈 수 있는 칸 수 (blocker 칸은 막힌 것으로 본다). 다음 틱에 빠지는 꼬리 칸은 빈 칸 */
function headExits(state, blocker) {
  const head = state.snake[0];
  const body = new Set(state.snake.slice(0, -1).map((x) => cellKey(x.c, x.r)));
  return Object.values(DIRS).filter((d) => {
    const n = { c: head.c + d.c, r: head.r + d.r };
    return isAllowed(state.position, n.c, n.r) && !body.has(cellKey(n.c, n.r)) && !same(n, blocker);
  }).length;
}

/** 맞수가 (c,r)에 서면 내 머리의 마지막 출구를 막는가 (구석에 가두지 않는다) */
function trapsHead(state, c, r) {
  const head = state.snake[0];
  if (!head || manhattan(head, { c, r }) !== 1) return false;
  return headExits(state, { c, r }) === 0;
}

/** 맞수가 내 머리를 가두고 있으면 옆 칸으로 비켜선다 */
function unblockHead(state, rng) {
  const o = state.opp;
  if (!o || !trapsHead(state, o.c, o.r)) return;
  const snakeCells = new Set(state.snake.map((x) => cellKey(x.c, x.r)));
  const moves = Object.values(DIRS)
    .map((d) => ({ c: o.c + d.c, r: o.r + d.r }))
    .filter((m) => isAllowedForOpponent(state.position, m.c, m.r) && !snakeCells.has(cellKey(m.c, m.r)) && !trapsHead(state, m.c, m.r));
  const to = moves.length ? pick(moves, rng) : null;
  if (to) {
    o.c = to.c;
    o.r = to.r;
  }
}

export function spawnItem(state, rng) {
  const occupied = occupiedSet(state);
  // 공을 5개 이상 먹은 뒤부터 가끔 교체 아이템이 나온다 (연속 등장 방지)
  const subOk = state.balls >= 5 && state.item?.type !== 'sub' && rng() < 0.12;

  if (state.mode === 'defence' && !subOk) {
    // 각 줄에서 허용 구역의 가장 오른쪽 칸에 나타나 왼쪽으로 굴러온다.
    // 나타나자마자 막히지 않도록 그 칸과 바로 왼쪽 칸이 비어 있는 줄만 고른다.
    const starts = [];
    for (let r = 0; r < COURT.rows; r++) {
      for (let c = COURT.cols - 1; c >= 0; c--) {
        if (!isAllowed(state.position, c, r)) continue;
        if (!occupied.has(cellKey(c, r)) && !occupied.has(cellKey(c - 1, r))) starts.push({ c, r });
        break;
      }
    }
    if (starts.length === 0) return null;
    const cell = pick(starts, rng);
    return { c: cell.c, r: cell.r, type: 'roll' };
  }

  const free = allowedCells(state.position).filter((cell) => !occupied.has(cellKey(cell.c, cell.r)));
  if (free.length === 0) return null;
  // 오프사이드 칸 바로 옆(1칸 이내)에는 놓지 않는다 (먹기 너무 어려움). 그런 칸밖에 없을 때만 허용.
  // 구석 칸에도 놓지 않는다 (맞수와 함께 몰리면 갇힌다)
  const safe = free.filter((cell) => !nearOffside(state.position, cell.c, cell.r, ITEM_OFFSIDE_MARGIN));
  const open = (safe.length ? safe : free).filter((cell) => !isCorner(state.position, cell.c, cell.r));
  const cell = pick(open.length ? open : safe.length ? safe : free, rng);
  return { c: cell.c, r: cell.r, type: subOk ? 'sub' : 'ball' };
}

/** C의 시작: 머리가 센터 서클에 걸친 칸(코트 한가운데 오른쪽 칸), 몸은 왼쪽으로 (Rule 8.8) */
export const CENTRE_START = Object.freeze({ c: COURT.cols / 2, r: Math.floor(COURT.rows / 2) });
/** 상대 C의 시작: 센터 서드 안, 내 머리에서 두 칸 떨어진 대각선 앞 (Rule 8.9) */
const OPP_CENTRE_START = Object.freeze({ c: CENTRE_START.c + 1, r: CENTRE_START.r + 2 });

/**
 * 시작 위치: 센터 패스 때처럼 C는 센터 서클, 나머지는 센터 서드 밖 자기 서드에서
 * 가운데에 가장 가까운 가로 3칸 (Rule 8.8·8.10·8.11)
 */
function startCells(position) {
  const centre = position === 'C';
  if (centre) return { c: CENTRE_START.c, r: CENTRE_START.r };
  const cells = allowedCells(position).filter((x) => centre || zoneOf(x.c, x.r) !== 3);
  const cx = (COURT.cols - 1) / 2;
  const cy = (COURT.rows - 1) / 2;
  // 머리와 몸이 모두 출발 가능한 칸 안에 있는 가로 3칸 후보 중 중앙에 가장 가까운 것
  const set = new Set(cells.map((x) => cellKey(x.c, x.r)));
  let best = null;
  for (const { c, r } of cells) {
    if (set.has(cellKey(c - 1, r)) && set.has(cellKey(c - 2, r))) {
      const d = Math.hypot(c - cx, r - cy);
      if (!best || d < best.d) best = { c, r, d };
    }
  }
  return best;
}

/** @param {{ mode?: 'attack'|'defence', ourCentrePass?: boolean }} opts  C의 모드 선택 · 이번 쿼터 센터 패스가 우리 팀인지 (Rule 8.1) */
export function createGame(position, rng = Math.random, opts = {}) {
  if (!POSITION_KEYS.includes(position)) throw new Error(`unknown position: ${position}`);
  const start = startCells(position);
  const snake = [
    { c: start.c, r: start.r },
    { c: start.c - 1, r: start.r },
    { c: start.c - 2, r: start.r },
  ];
  const state = {
    position,
    mode: modeFor(position, opts.mode),
    snake, // 머리가 index 0
    dir: null, // 첫 입력 전/튕길 곳이 없어 멈춘 뒤에는 정지
    queuedDir: null,
    queuedDir2: null, // 한 틱 안의 두 번째 꺾기
    item: null,
    grow: 0, // 몸으로 공을 막았을 때 늘어날 칸 수
    pass: null, // 패스 대상 { c, r, deadline, total }
    passes: 0,
    passChain: 0, // 연속 패스 성공
    bestChain: 0,
    goals: 0, // 골 서클 슈팅 성공
    circleBlocks: 0, // 수비 서클 차단(+30)
    blocks: 0, // 막은 공 (몸·머리)
    played: [position], // 이번 판에 뛴 포지션 (교체 포함)
    opp: null, // 맞수 { c, r, position, out } out: 아웃 오브 플레이(페널티 패스 동안 못 움직임)
    oppWait: 0, // 맞수가 다음 칸으로 가기까지 지난 틱
    contacts: 0, // 내 접촉 반칙
    penaltiesWon: 0, // 맞수 장애 반칙으로 얻은 페널티 패스
    intercepts: 0, // 맞수에게 가로채인 횟수
    ballsVsOpp: 0, // 맞수가 코트에 있을 때 잡은 공
    score: 0,
    balls: 0, // 먹은 공 + 막은 공
    frozen: 0, // 남은 아웃 오브 플레이 틱 (내 접촉 반칙 뒤, 맞수의 페널티 패스가 끝날 때까지)
    shot: null, // 골 서클 페널티 패스 때의 슛 칸 { c, r } (Rule 6.6)
    offsides: 0,
    conceded: 0,
    ticks: 0,
    over: false,
    overReason: null,
  };
  const ours = opts.ourCentrePass !== false;
  spawnOpp(state, [], rng, { centrePass: true });
  if (position === 'C' && isAllowedForOpponent(position, OPP_CENTRE_START.c, OPP_CENTRE_START.r)) {
    state.opp = { ...OPP_CENTRE_START, position: MATCHUP[position], out: false }; // 상대 C는 서클 옆
  }
  if (position === 'C' && ours) {
    // 내가 C이고 우리 팀 센터 패스: 공을 든 채 시작, 동료는 센터 서드 안에
    startPass(state, [], rng, { centrePass: true });
  } else {
    startFromCentre(state, rng, ours);
  }
  return state;
}

/** 센터 패스를 받는 자리: 센터 서드 가운데쪽(서드 경계에서 2칸 이상 안쪽), 서클에서 2~5칸, 빈 칸 */
function centreReceiver(state, rng) {
  const occupied = occupiedSet(state);
  const mid = { c: COURT.cols / 2, r: Math.floor(COURT.rows / 2) };
  const cells = [];
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = COURT.third + 2; c < COURT.third * 2 - 2; c++) {
      if (zoneOf(c, r) !== 3 || occupied.has(cellKey(c, r))) continue;
      const d = Math.abs(c - mid.c) + Math.abs(r - mid.r);
      if (d >= 2 && d <= 5) cells.push({ c, r });
    }
  }
  return pick(cells, rng);
}

/**
 * 쿼터의 첫 공: 센터 서클에서 센터 서드로 (Rule 8.8·8.14).
 * 받는 자리에 내가 갈 수 있으면 첫 공이 거기, 아니면 한 번 더 패스되어 내 구역으로 들어온다.
 * state.centreBall = { from(코트 좌표), via(센터 서드 칸), to(첫 공 칸), ours } — 화면에서 공이 날아가는 경로
 */
function startFromCentre(state, rng, ours) {
  const opp = state.opp;
  // 센터 패스를 하는 사람: 보통은 센터 서클의 C. 내가 C이고 상대 차례면 서클 옆의 상대 C
  const from = state.position === 'C' && !ours && opp ? { x: opp.c + 0.5, y: opp.r + 0.5 } : { x: COURT.cols / 2, y: COURT.rows / 2 };
  const via = centreReceiver(state, rng);
  const type = state.mode === 'attack' ? 'ball' : 'roll';
  state.item = isAllowed(state.position, via.c, via.r) ? { c: via.c, r: via.r, type } : spawnItem(state, rng);
  state.centreBall = { from, via: { ...via }, to: { c: state.item.c, r: state.item.r }, ours };
}

/** dir 로 한 칸 가면 바로 목(몸 둘째 칸)인가 — 그 방향으로 꺾으면 바로 몸에 부딪힌다 */
function intoNeck(state, dir) {
  if (state.snake.length < 2) return false;
  const [head, neck] = state.snake;
  return head.c + DIRS[dir].c === neck.c && head.r + DIRS[dir].r === neck.r;
}

/**
 * 방향 입력. 정반대 방향 · 목 쪽은 무시한다.
 * 한 틱 안에 두 번 꺾으면(예: 오른쪽으로 가다가 ↑ 다음 ←) 두 번째는 다음 틱으로 미뤄 둔다 (queuedDir2).
 * 예전에는 두 번째 입력이 첫 입력을 덮어써서, 옆으로 꺾었다 돌아오는 빠른 입력이 그대로 몸 쪽으로 꺾여 탈락했다.
 */
export function setDirection(state, name) {
  if (state.over || !DIRS[name]) return false;
  if (!state.queuedDir) {
    if (state.dir === name) return true;
    if (state.dir && OPPOSITE[state.dir] === name && state.snake.length > 1) return false;
    if (intoNeck(state, name)) return false; // 정지 상태에서도 몸 쪽으로는 못 간다
    state.queuedDir = name;
    state.queuedDir2 = null;
    return true;
  }
  if (state.queuedDir === name) {
    state.queuedDir2 = null;
    return true;
  }
  if (OPPOSITE[state.queuedDir] === name) return false;
  state.queuedDir2 = name; // 첫 꺾기 다음 틱에
  return true;
}

function ahead(state, dir) {
  const head = state.snake[0];
  return { c: head.c + DIRS[dir].c, r: head.r + DIRS[dir].r };
}

/** 이번 틱에 꼬리가 빠지지 않는가 (공을 먹거나 늘어날 칸이 남아 있음) */
function keepsTail(state, next) {
  const it = state.item;
  return state.grow > 0 || Boolean(it && it.c === next.c && it.r === next.r);
}

function hitsBody(state, next) {
  const body = keepsTail(state, next) ? state.snake : state.snake.slice(0, -1);
  return body.some((s) => s.c === next.c && s.r === next.r);
}

/** 막힌 방향에서 튕겨 나갈 옆 방향. 둘 다 되면 목표(패스 대상·아이템)에 가까운 쪽, 같으면 무작위. */
function bounceDir(state, rng) {
  const options = SIDES[state.dir].filter((d) => {
    const n = ahead(state, d);
    return isAllowed(state.position, n.c, n.r) && !hitsBody(state, n) && !same(n, state.opp);
  });
  if (options.length < 2) return options[0] ?? null;
  const it = state.pass ?? state.item;
  if (!it) return pick(options, rng);
  const dist = (d) => {
    const n = ahead(state, d);
    return Math.abs(n.c - it.c) + Math.abs(n.r - it.r);
  };
  const [a, b] = options.map(dist);
  return a === b ? pick(options, rng) : a < b ? options[0] : options[1];
}

function block(state, cell, events, by) {
  const circle = CIRCLE_DEFENDERS.includes(state.position) && zoneOf(cell.c, cell.r) === 5;
  const points = circle ? CIRCLE_BLOCK_POINTS : BLOCK_POINTS;
  state.score += points;
  state.balls += 1;
  state.blocks += 1;
  if (circle) state.circleBlocks += 1;
  if (state.opp) state.ballsVsOpp += 1;
  events.push({ type: 'block', score: state.score, points, circle, by, cell: { ...cell } });
}

/** (c,r)에서 PASS_OFFSIDE_MARGIN칸(가로+세로) 이내에 오프사이드 칸(코트 안의 금지 구역)이 있는가 */
export function nearOffside(position, c, r, margin = PASS_OFFSIDE_MARGIN) {
  for (let dr = -margin; dr <= margin; dr++) {
    for (let dc = -margin + Math.abs(dr); dc <= margin - Math.abs(dr); dc++) {
      const z = zoneOf(c + dc, r + dr);
      if (z !== 0 && !isAllowed(position, c + dc, r + dr)) return true;
    }
  }
  return false;
}

/** 공을 잡았다 → 패스 대상을 띄운다. 놓을 곳이 없으면 바로 다음 공. */
/** centrePass: 센터 패스는 센터 서드 안의 동료에게 (Rule 8.14) */
function startPass(state, events, rng, { centrePass = false } = {}) {
  const head = state.snake[0];
  const occupied = occupiedSet(state);
  const inRange = allowedCells(state.position).filter((x) => {
    const d = Math.abs(x.c - head.c) + Math.abs(x.r - head.r);
    if (centrePass && zoneOf(x.c, x.r) !== 3) return false;
    return d >= PASS_DIST[0] && d <= PASS_DIST[1] && !occupied.has(cellKey(x.c, x.r));
  });
  // 오프사이드 경계에서 떨어진 칸을 우선한다 (그런 칸이 없을 때만 경계 근처 허용)
  const safe = inRange.filter((x) => !nearOffside(state.position, x.c, x.r));
  const cells = safe.length ? safe : inRange;
  if (cells.length === 0) return respawn(state, events, rng);
  const cell = pick(cells, rng);
  const total = passTicks(state.balls);
  state.item = null;
  state.pass = { c: cell.c, r: cell.r, deadline: state.ticks + total, total, centre: centrePass };
  events.push({ type: 'passStart', cell: { ...cell }, total, centre: centrePass });
}

// ---------- 맞수 ----------
const near = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r)) <= 1; // 0.9m 안 (주변 8칸)

/** centrePass: 경기 시작 때는 맞수 C만 센터 서드에, 나머지 맞수는 센터 서드 밖에 선다 */
function spawnOpp(state, events, rng, { centrePass = false } = {}) {
  const occupied = occupiedSet(state);
  const head = state.snake[0];
  const who = MATCHUP[state.position];
  const cells = [];
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const cell = { c, r };
      if (!isAllowedForOpponent(state.position, c, r) || occupied.has(cellKey(c, r))) continue;
      if (same(cell, state.item) || same(cell, state.pass)) continue;
      if (centrePass && who !== 'C' && zoneOf(c, r) === 3) continue;
      cells.push({ ...cell, d: manhattan(cell, head) });
    }
  }
  if (cells.length === 0) return;
  const far = cells.filter((x) => x.d >= OPP_SPAWN_DIST);
  const cell = pick(far.length ? far : cells, rng);
  state.opp = { c: cell.c, r: cell.r, position: who, out: false };
  state.oppWait = 0;
  events.push({ type: 'oppEnter', who, cell: { c: cell.c, r: cell.r } });
}

/** 맞수가 향하는 곳: 공격 모드면 패스 대상·공, 수비 모드면 내 머리 두 칸 앞 */
function oppTarget(state) {
  if (state.mode === 'attack') {
    if (state.pass) return state.pass;
    if (state.item?.type === 'ball') return state.item;
  }
  const head = state.snake[0];
  const d = DIRS[state.dir ?? 'right'];
  const front = { c: head.c + d.c * 2, r: head.r + d.r * 2 };
  return isAllowedForOpponent(state.position, front.c, front.r) ? front : head;
}

/**
 * 페널티 패스: 맞수는 내 옆(두 칸 떨어진 곳)에 비켜서서 아웃 오브 플레이 (Rule 6.4), 내 3초는 다시 시작.
 * "방해하지 않게 옆에" (Rule 6.4b) → 내가 가는 방향 앞쪽은 피하고 옆(앞뒤 성분이 작은 칸)을 고른다.
 */
function callObstruction(state, events) {
  const o = state.opp;
  const head = state.snake[0];
  const fwd = DIRS[state.dir ?? 'right'];
  const ahead = (cell) => (cell.c - head.c) * fwd.c + (cell.r - head.r) * fwd.r; // 앞(+) · 뒤(−)
  const score = (cell) => [Math.abs(ahead(cell)), manhattan(cell, o)]; // 옆일수록, 원래 자리에 가까울수록
  const better = (a, b) => {
    const [x, y] = [score(a), score(b)];
    return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  };
  const occupied = occupiedSet(state);
  occupied.delete(cellKey(o.c, o.r));
  let spot = null;
  for (let r = head.r - 2; r <= head.r + 2; r++) {
    for (let c = head.c - 2; c <= head.c + 2; c++) {
      const cell = { c, r };
      if (Math.max(Math.abs(c - head.c), Math.abs(r - head.r)) !== 2) continue;
      if (!isAllowedForOpponent(state.position, c, r) || occupied.has(cellKey(c, r))) continue;
      if (same(cell, state.item) || same(cell, state.pass)) continue;
      if (!spot || better(cell, spot)) spot = cell;
    }
  }
  if (spot) {
    o.c = spot.c;
    o.r = spot.r;
  }
  o.out = true;
  state.penaltiesWon += 1;
  state.pass.deadline = state.ticks + state.pass.total;
  // GS·GA가 골 서클 안에서 받은 페널티 패스: 패스하거나 슛할 수 있다 (Rule 6.6)
  state.shot = canShootAt(state.position, head.c, head.r) ? shotCell(state) : null;
  events.push({ type: 'penalty', reason: 'obstruction', who: o.position, cell: { c: o.c, r: o.r }, shot: state.shot ? { ...state.shot } : null });
}

/** 페널티 슛 칸: 공격 골대 바로 앞(골 서클 안, 골라인 쪽 가운데) 중 비어 있는 칸 */
function shotCell(state) {
  const occupied = occupiedSet(state);
  const c = COURT.cols - 1;
  for (const r of [Math.floor(COURT.rows / 2), Math.floor(COURT.rows / 2) - 1, Math.floor(COURT.rows / 2) + 1]) {
    if (!occupied.has(cellKey(c, r)) && !same({ c, r }, state.pass) && canShootAt(state.position, c, r)) return { c, r };
  }
  return null;
}

function moveOpp(state, events, rng) {
  const o = state.opp;
  const target = oppTarget(state);
  const snakeCells = new Set(state.snake.map((x) => cellKey(x.c, x.r)));
  const canStand = (c, r) => {
    if (!isAllowedForOpponent(state.position, c, r) || snakeCells.has(cellKey(c, r))) return false;
    if (trapsHead(state, c, r)) return false; // 내 머리의 마지막 출구는 막지 않는다
    const it = state.item;
    // 공격 모드의 공·패스 대상은 가로채러 갈 수 있지만, 굴러오는 공·교체 아이템 칸에는 들어가지 않는다
    if (state.mode !== 'attack' && same({ c, r }, state.pass)) return false;
    return !(it && it.c === c && it.r === r && !(state.mode === 'attack' && it.type === 'ball'));
  };
  let moves = [{ c: o.c, r: o.r }, ...Object.values(DIRS).map((d) => ({ c: o.c + d.c, r: o.r + d.r }))].filter(
    (m, i) => i === 0 || canStand(m.c, m.r),
  );
  // 지금 자리가 내 머리를 가두고 있으면 그대로 서 있지 않는다
  if (trapsHead(state, o.c, o.r) && moves.length > 1) moves = moves.slice(1);
  const best = Math.min(...moves.map((m) => manhattan(m, target)));
  const to = pick(moves.filter((m) => manhattan(m, target) === best), rng);
  o.c = to.c;
  o.r = to.r;

  // 장애: 내가 공을 잡고 있는데 0.9m 안으로 들어왔다 → 페널티 패스
  if (state.pass && near(o, state.snake[0])) {
    callObstruction(state, events);
    return;
  }

  if (state.mode !== 'attack') return;
  if (same(o, state.pass)) {
    // 0.9m를 지킨 채 패스를 가로챘다 → 정당한 인터셉트 (Rule 16.6)
    state.pass = null;
    state.passChain = 0;
    state.intercepts += 1;
    events.push({ type: 'intercept', what: 'pass', legal: true, who: o.position, cell: { c: o.c, r: o.r } });
    respawn(state, events, rng);
  } else if (state.item?.type === 'ball' && same(o, state.item)) {
    state.intercepts += 1;
    events.push({ type: 'intercept', what: 'ball', who: o.position, cell: { c: o.c, r: o.r } });
    respawn(state, events, rng);
  }
}

/** 뱀 말고 나머지(굴러오는 공·맞수)를 한 틱 진행한다. spawned: 이번 틱에 공이 새로 나왔는가 */
function advanceWorld(state, events, rng, spawned) {
  if (!state.pass) state.shot = null; // 페널티 슛 기회는 그 페널티 패스가 끝나면 사라진다

  // 4) 굴러오는 공 (방금 나타난 공은 이번 틱에 움직이지 않는다 → 한 틱에 두 번 득점 방지)
  const roll = state.item;
  if (!state.over && !spawned && roll?.type === 'roll' && state.ticks % ROLL_EVERY === 0) {
    const to = { c: roll.c - 1, r: roll.r };
    if (state.snake.some((s) => s.c === to.c && s.r === to.r)) {
      state.grow += 1; // 몸으로 막아도 한 칸 자란다
      block(state, roll, events, 'body');
      startPass(state, events, rng);
    } else if (!isAllowed(state.position, to.c, to.r)) {
      state.conceded += 1; // 실점: 기록만 (목숨 없음)
      events.push({ type: 'conceded', cell: { c: roll.c, r: roll.r }, zone: zoneOf(to.c, to.r) });
      respawn(state, events, rng);
    } else {
      roll.c = to.c;
    }
  }

  // 5) 맞수: oppEvery 틱마다 한 칸. 아웃 오브 플레이 중에는 패스가 끝날 때까지 서 있는다
  if (!state.over) {
    const o = state.opp;
    if (o?.out && !state.pass) o.out = false; // 패스가 끝났다(성공·3초·교체) → 다시 플레이
    if (!o && !state.pass) {
      spawnOpp(state, events, rng); // 교체로 바뀐 포지션의 맞수
    } else if (o && !o.out && !o.taking) {
      state.oppWait += 1;
      if (state.oppWait >= oppEvery(state.balls)) {
        state.oppWait = 0;
        moveOpp(state, events, rng);
      }
    }
  }
}

function respawn(state, events, rng) {
  state.item = spawnItem(state, rng);
  if (!state.item) {
    state.over = true;
    state.overReason = 'full';
    events.push({ type: 'full' }, { type: 'over', reason: 'full' });
  }
}

/**
 * 한 틱 진행. 발생한 이벤트 배열을 돌려준다.
 * 이벤트: 'wall' | 'offside' | 'foul' | 'penaltyRelease' | 'unfreeze' | 'bump' | 'penalty' | 'ball' | 'block' | 'passStart' | 'pass' | 'held' | 'conceded'
 *        | 'oppEnter' | 'intercept' | 'sub' | 'crash' | 'full' | 'over'
 */
export function step(state, rng = Math.random) {
  const events = [];
  if (state.over) return events;

  if (state.frozen > 0) {
    // 아웃 오브 플레이: 방향 입력은 기억해 두고, 뱀은 서 있는다
    state.frozen -= 1;
    state.ticks += 1;
    advanceWorld(state, events, rng, false);
    if (state.frozen === 0) {
      // 맞수의 페널티 패스: 공이 손을 떠났다 → 나는 다시 플레이 (Rule 6.4c)
      if (state.opp) {
        state.opp.taking = false;
        unblockHead(state, rng); // 페널티 패스를 마친 맞수가 내 출구를 막고 있으면 비켜선다
      }
      events.push({ type: 'penaltyRelease', who: state.opp?.position, cell: state.opp ? { c: state.opp.c, r: state.opp.r } : null });
      events.push({ type: 'unfreeze' });
    }
    return events;
  }

  if (state.queuedDir) {
    const d = state.queuedDir;
    state.queuedDir = state.queuedDir2 ?? null;
    state.queuedDir2 = null;
    // 그 사이 벽에 튕겨 방향이 바뀌었으면, 몸 쪽이 된 입력은 버린다
    if (!intoNeck(state, d)) state.dir = d;
  }
  if (!state.dir) return events; // 입력 대기

  let next = ahead(state, state.dir);

  // 1) 막힌 칸 → 튕김 (벽은 벌점 없음, 다른 구역은 오프사이드 감점, 맞수에 부딪히면 접촉 반칙)
  const hitOpp = same(next, state.opp);
  if (hitOpp || !isAllowed(state.position, next.c, next.r)) {
    const zone = zoneOf(next.c, next.r);
    if (hitOpp && state.opp.out) {
      // 아웃 오브 플레이로 서 있는 맞수는 방해하지 않는 장애물: 반칙 없이 튕긴다
      events.push({ type: 'bump', who: state.opp.position, cell: next });
    } else if (hitOpp) {
      // 접촉(내 반칙) → 공이 상대에게: 잡고 있던 패스·놓인 공이 사라진다 (점수는 그대로)
      state.contacts += 1;
      const lost = state.pass ? 'pass' : state.item?.type === 'ball' ? 'ball' : null;
      state.frozen = penaltyReleaseTicks(state.balls, rng); // 맞수가 공을 놓을 때까지
      state.opp.taking = true; // 맞수가 공을 들고 페널티 패스 중
      events.push({ type: 'foul', reason: 'contact', who: state.opp.position, cell: next, lost, freeze: state.frozen });
      if (state.pass) {
        state.pass = null;
        state.passChain = 0;
        state.opp.out = false;
        respawn(state, events, rng);
      } else if (lost === 'ball') {
        respawn(state, events, rng);
      }
    } else if (zone === 0) {
      events.push({ type: 'wall', cell: next });
    } else {
      const penalty = Math.min(state.score, OFFSIDE_PENALTY);
      state.score -= penalty;
      state.offsides += 1;
      events.push({ type: 'offside', zone, cell: next, penalty, score: state.score });
    }
    const turn = bounceDir(state, rng);
    if (!turn) {
      state.dir = null; // 튕길 곳이 없으면 멈추고 입력을 기다린다
      unblockHead(state, rng); // 멈춘 동안 맞수는 움직이지 않으므로, 내 출구를 막고 있으면 바로 비켜선다
      return events;
    }
    state.dir = turn;
    next = ahead(state, turn);
  }

  const it = state.item;
  const eating = Boolean(it && it.c === next.c && it.r === next.r);

  // 2) 자기 몸 충돌 (꼬리가 빠지는 틱에는 꼬리 칸은 허용)
  if (hitsBody(state, next)) {
    state.over = true;
    state.overReason = 'crash';
    events.push({ type: 'crash' }, { type: 'over', reason: 'crash' });
    return events;
  }

  // 3) 이동
  state.snake.unshift(next);
  state.ticks += 1;
  if (eating) {
    // 먹은 칸만큼 자람 (꼬리 유지)
  } else if (state.grow > 0) {
    state.grow -= 1;
  } else {
    state.snake.pop();
  }

  let spawned = false;
  if (eating) {
    if (it.type === 'ball') {
      const goal = canShootAt(state.position, next.c, next.r);
      const points = goal ? GOAL_POINTS : BALL_POINTS;
      state.score += points;
      state.balls += 1;
      if (goal) state.goals += 1;
      if (state.opp) state.ballsVsOpp += 1;
      events.push({ type: 'ball', score: state.score, points, goal, cell: next });
      startPass(state, events, rng);
    } else if (it.type === 'roll') {
      block(state, next, events, 'head');
      startPass(state, events, rng);
    } else {
      // 교체: 현재 머리 위치를 허용하는 '다른' 포지션 중 무작위. 모드도 새 포지션을 따른다.
      const headZone = zoneOf(next.c, next.r);
      const options = positionsAllowingZone(headZone).filter((p) => p !== state.position);
      const from = state.position;
      const fromMode = state.mode;
      state.position = pick(options, rng);
      state.mode = modeFor(state.position, state.mode);
      if (!state.played.includes(state.position)) state.played.push(state.position);
      state.opp = null; // 맞수도 새 포지션의 맞수로 바뀐다 (다음 틱에 다시 등장)
      events.push({ type: 'sub', from, to: state.position, mode: state.mode, modeChanged: state.mode !== fromMode });
      respawn(state, events, rng);
    }
    spawned = true;
  } else if (state.pass) {
    // 패스 대상에 닿으면 성공, 3초가 지나면 놓친다(벌점 없음)
    const p = state.pass;
    if (same(next, state.shot)) {
      // 골 서클 페널티 패스에서 슛을 골랐다 (Rule 6.6)
      state.pass = null;
      state.shot = null;
      state.score += GOAL_POINTS;
      state.goals += 1;
      events.push({ type: 'ball', score: state.score, points: GOAL_POINTS, goal: true, penaltyShot: true, cell: { ...next } });
      respawn(state, events, rng);
      spawned = true;
    } else if (canShootAt(state.position, next.c, next.r) && same(next, GOAL_POST_CELL)) {
      // 패스 대신 골대로: 공을 든 GS·GA가 3초 안에 링 앞에 닿으면 슛 성공 보너스
      state.pass = null;
      state.score += SHOT_BONUS;
      state.goals += 1;
      events.push({ type: 'ball', score: state.score, points: SHOT_BONUS, goal: true, shotBonus: true, cell: { ...next } });
      respawn(state, events, rng);
      spawned = true;
    } else if (next.c === p.c && next.r === p.r) {
      state.pass = null;
      state.score += PASS_POINTS;
      state.passes += 1;
      state.passChain += 1;
      state.bestChain = Math.max(state.bestChain, state.passChain);
      events.push({ type: 'pass', points: PASS_POINTS, score: state.score, chain: state.passChain, centre: Boolean(p.centre), cell: { ...next } });
      respawn(state, events, rng);
      spawned = true;
    } else if (state.ticks >= p.deadline) {
      state.pass = null;
      state.passChain = 0;
      events.push({ type: 'held', cell: { c: p.c, r: p.r } });
      respawn(state, events, rng);
      spawned = true;
    }
  }

  advanceWorld(state, events, rng, spawned);
  return events;
}
