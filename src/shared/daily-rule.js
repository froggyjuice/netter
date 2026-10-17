// 오늘의 규칙 한 줄: 넷볼 규칙 사전(rulebook.js) 요약에서 고른 한 줄 + 그 장면(ui/rule-scenes.js).
// 날마다(한국 시간 기준) 모두에게 같은 규칙이 나오고, 목록을 한 바퀴 다 돌기 전에는 다시 나오지 않는다.
export const DAILY_RULES = Object.freeze([
  { rule: 1, scene: 'courtMap', text: '골 서클은 반지름 4.9m 반원, 센터 서클은 지름 0.9m예요.' },
  { rule: 1, scene: 'onLine', text: '선은 그 선이 둘러싼 구역에 포함돼요. 선 위는 아직 그 구역 안!' },
  { rule: 2, scene: 'quarters', text: '경기는 15분씩 4쿼터, 쿼터마다 공격하는 골(진영)을 바꿔요.' },
  { rule: 3, scene: 'team', text: '코트 위에는 최대 7명, 그중 한 명은 꼭 C(센터)여야 해요.' },
  { rule: 4, scene: 'umpires', text: '반칙을 부를 땐 휘슬 → 반칙 이름 → 수신호 → 다시 할 곳 순서예요.' },
  { rule: 5, scene: 'scorer', text: '기록원은 골 · 빗나간 슛 · 다음 센터 패스 차례를 기록해요.' },
  { rule: 6, scene: 'freePass', text: '작은 반칙은 프리 패스! 프리 패스로는 슛할 수 없어요.' },
  { rule: 6, scene: 'penaltyAside', text: '페널티 패스 때 반칙한 선수는 옆에 비켜서서, 공이 떠날 때까지 꼼짝 마!' },
  { rule: 6, scene: 'throwIn', text: '스로인은 라인 밖에서, 한 발을 라인 가까이(15cm 안) 두고 던져요.' },
  { rule: 7, scene: 'advantage', text: '반칙을 당한 팀이 더 유리하면, 심판은 "어드밴티지!"를 외치고 계속시켜요.' },
  { rule: 8, scene: 'centrePass', text: '센터 패스 때 C는 한 발 이상을 센터 서클 안에 두고, 휘슬 뒤 3초 안에 패스해요.' },
  { rule: 8, scene: 'breaking', text: '센터 패스 휘슬 전에 두 C 말고 다른 선수가 센터 서드에 들어가면 브레이킹 반칙!' },
  { rule: 9, scene: 'goalIn', text: '골은 GS · GA만, 골 서클 안에서 쏴야 들어가요.' },
  { rule: 9, scene: 'goalOut', text: '골 서클 밖 땅을 밟고 쏜 슛은 골이 아니에요.' },
  { rule: 9, scene: 'goalTouched', text: '수비가 건드린 슛도 링을 통과하면 골이에요.' },
  { rule: 10, scene: 'subs', text: '교체는 쉬는 시간 · 부상 · 골 직후에 할 수 있고, 횟수 제한이 없어요.' },
  { rule: 11, scene: 'held3s', text: '공을 잡으면 3초 안에 패스하거나 슛해야 해요.' },
  { rule: 11, scene: 'replay', text: '놓은 공은 다른 선수나 골대에 닿기 전에 다시 잡을 수 없어요.' },
  { rule: 12, scene: 'overThird', text: '공은 세 서드 모두에서 잡혀야 해요. 한 서드를 건너뛰면 반칙!' },
  { rule: 12, scene: 'shortPass', text: '상대가 가로챌 공간도 없이 바로 옆에 주는 숏 패스는 반칙이에요.' },
  { rule: 13, scene: 'footOk', text: '한 발로 착지하면 다른 발은 디딜 수 있고, 착지 발로 피벗할 수 있어요.' },
  { rule: 13, scene: 'footBad', text: '착지 발 끌기 · 깡충 뛰기는 풋워크 반칙이에요.' },
  { rule: 14, scene: 'offside', text: '내 포지션이 못 가는 구역에 들어가면, 공을 안 건드려도 오프사이드!' },
  { rule: 15, scene: 'ballOnLine', text: '선 위에 떨어진 공은 아직 코트 안이에요.' },
  { rule: 15, scene: 'jumpPass', text: '코트 안에서 뛰어올라, 밖에 착지하기 전에 패스하면 괜찮아요.' },
  { rule: 15, scene: 'throwIn', text: '공이 나가면 마지막에 건드리지 않은 팀이, 나간 곳에서 스로인해요.' },
  { rule: 16, scene: 'distOk', text: '공 가진 선수와 0.9m 이상 떨어졌다면 뛰어올라 막아도 돼요.' },
  { rule: 16, scene: 'distBad', text: '0.9m 안에서 팔을 뻗어 막으면 장애 반칙(Obstruction) → 페널티 패스예요.' },
  { rule: 17, scene: 'contact', text: '밀기 · 잡기 · 기대기처럼 상대 플레이를 방해하는 접촉 반칙(Contact)은 페널티 패스!' },
  { rule: 18, scene: 'sanctions', text: '심판은 조언 → 패스 위치 앞으로 → 경고 → 일시 퇴장(2분) → 퇴장 순서로 조치해요.' },
  { rule: 19, scene: 'dissent', text: '판정에 항의하면 불공정 플레이 → 앞으로 옮긴 페널티 패스예요.' },
  { rule: 20, scene: 'together', text: '두 상대가 동시에 공을 잡으면, 바로 전에 공을 가졌던 팀 공이에요 (토스업 없음).' },
  { rule: 21, scene: 'kids', text: '어린이 경기는 낮은 골대 · 작은 공처럼 바꿔서 할 수 있어요.' },
]);

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

/** 한국 시간 기준 날짜 번호 (1970-01-01 = 0) */
export const dayNumber = (t = Date.now()) => Math.floor((t + KST_MS) / DAY_MS);

/** 날짜 번호 → '10월 17일' */
export function dayLabel(day) {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 씨앗이 같으면 늘 같은 난수 (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** cycle 번째 바퀴의 순서 (0..n-1 섞기) */
function shuffled(cycle, n) {
  const r = rng(cycle * 7919 + 17);
  const o = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}
function orderOf(cycle, n) {
  const o = shuffled(cycle, n);
  // 바퀴가 바뀌는 날에 어제와 같은 규칙이 나오지 않게
  if (cycle > 0 && n > 1 && o[0] === shuffled(cycle - 1, n)[n - 1]) [o[0], o[1]] = [o[1], o[0]];
  return o;
}

/** 오늘(t)의 규칙 한 줄 → { rule, scene, text, day } */
export function ruleOfDay(t = Date.now(), pool = DAILY_RULES) {
  const day = dayNumber(t);
  const n = pool.length;
  const o = orderOf(Math.floor(day / n), n);
  return { ...pool[o[day % n]], day };
}
