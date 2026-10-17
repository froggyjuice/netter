// 넷볼 포지션별 이동 가능 구역 데이터
// 근거: World Netball "Rules of Netball" 2024, Rule 3 (Team) 표 (p.20)
// 구역 번호: 1 = 공격 서클, 2 = 공격 서드(서클 밖), 3 = 센터 서드,
//            4 = 수비 서드(서클 밖), 5 = 수비 서클
// 이 파일은 모든 게임이 공유하는 단일 규칙 출처입니다. 규칙이 바뀌면 여기만 고치세요.

// 코트 30.5m x 15.25m 를 1m 격자(30 x 15)로 근사합니다. 오른쪽이 공격 방향입니다.
export const COURT = Object.freeze({
  cols: 30,
  rows: 15,
  third: 10, // 가로를 3등분 (수비 0-9 / 센터 10-19 / 공격 20-29)
  circleRadius: 4.9, // 골 서클 반경(m)
});

export const ZONE_NAMES = Object.freeze({
  1: '공격 서클',
  2: '공격 서드',
  3: '센터 서드',
  4: '수비 서드',
  5: '수비 서클',
});

export const POSITIONS = Object.freeze({
  GS: { name: '골 슈터', zones: [1, 2], note: '공격 서드 전체(서클 포함). 슈팅 가능' },
  GA: { name: '골 어택', zones: [1, 2, 3], note: '공격 서드 + 센터 서드. 슈팅 가능' },
  WA: { name: '윙 어택', zones: [2, 3], note: '서클 안에는 들어갈 수 없음' },
  C: { name: '센터', zones: [2, 3, 4], note: '두 서클을 제외한 모든 구역' },
  WD: { name: '윙 디펜스', zones: [3, 4], note: '서클 안에는 들어갈 수 없음' },
  GD: { name: '골 디펜스', zones: [3, 4, 5], note: '센터 서드 + 수비 서드(서클 포함)' },
  GK: { name: '골 키퍼', zones: [4, 5], note: '수비 서드 전체(서클 포함)' },
});

export const POSITION_KEYS = Object.freeze(Object.keys(POSITIONS));

const GOAL_Y = COURT.rows / 2; // 골 라인 중앙

/** (col,row) 셀이 속한 구역 번호(1~5). 코트 밖이면 0. */
export function zoneOf(col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return 0;
  if (col < 0 || row < 0 || col >= COURT.cols || row >= COURT.rows) return 0;
  const x = col + 0.5;
  const y = row + 0.5;
  const dy = y - GOAL_Y;
  const attackDist = Math.hypot(x - COURT.cols, dy);
  const defenceDist = Math.hypot(x - 0, dy);
  if (attackDist <= COURT.circleRadius) return 1;
  if (defenceDist <= COURT.circleRadius) return 5;
  if (col < COURT.third) return 4;
  if (col < COURT.third * 2) return 3;
  return 2;
}

export function isAllowed(position, col, row) {
  const p = POSITIONS[position];
  if (!p) return false;
  return p.zones.includes(zoneOf(col, row));
}

export function allowedCells(position) {
  const cells = [];
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      if (isAllowed(position, c, r)) cells.push({ c, r });
    }
  }
  return cells;
}

/** 해당 구역을 허용하는 포지션 목록 */
export function positionsAllowingZone(zone) {
  return POSITION_KEYS.filter((k) => POSITIONS[k].zones.includes(zone));
}

// 맞수: 같은 구역에서 서로 맞서는 상대 팀 포지션 (GS↔GK, GA↔GD, WA↔WD, C↔C)
export const MATCHUP = Object.freeze({ GS: 'GK', GA: 'GD', WA: 'WD', C: 'C', WD: 'WA', GD: 'GA', GK: 'GS' });

/**
 * 상대 팀 포지션의 구역을 우리 코트 기준으로 뒤집은 것 (상대의 공격 방향은 반대).
 * 상대 구역 z ↔ 우리 구역 6−z. 맞수는 결과적으로 나와 같은 구역에서 뛴다.
 */
export function opponentZones(position) {
  const opp = POSITIONS[MATCHUP[position]];
  return opp ? opp.zones.map((z) => 6 - z) : [];
}

/** 내 포지션의 맞수가 (col,row)에 설 수 있는가 */
export function isAllowedForOpponent(position, col, row) {
  return opponentZones(position).includes(zoneOf(col, row));
}

// 슈팅은 GS·GA만, 공격 골 서클(1구역) 안에서만 (Rules of Netball 2024, Rule 9.6a·11.5)
export const SHOOTERS = Object.freeze(['GS', 'GA']);

/** 이 포지션이 (col,row)에서 슛할 수 있는가 */
export function canShootAt(position, col, row) {
  return SHOOTERS.includes(position) && zoneOf(col, row) === 1;
}
