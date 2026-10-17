// 플레이하면서 겪은 실제 넷볼 규칙 (경기 후 '규칙 복습'에 모아 보여준다)
// 모두 World Netball「Rules of Netball」2024 에서 확인한 내용을 직접 풀어 쓴 것이다.
export const RULE_NOTES = Object.freeze({
  quarters: {
    rule: 'Rule 2.1',
    title: '경기 시간',
    text: '15분씩 4쿼터로 경기해요. 1·2쿼터와 3·4쿼터 사이는 4분, 하프타임은 12분 쉬어요.',
  },
  changeEnds: { rule: 'Rule 2.2', title: '진영 교대', text: '팀은 쿼터마다 코트 끝을 바꿔요. 우리 팀이 슛하는 골이 반대편이 돼요.' },
  centreAlternate: { rule: 'Rule 8.1', title: '센터 패스는 번갈아', text: '센터 패스는 두 팀의 C가 번갈아 해요.' },
  centrePass: {
    rule: 'Rule 8.8·8.14',
    title: '센터 패스',
    text: 'C는 센터 서클 안에서 공을 들고 시작하고, 센터 패스는 센터 서드 안에 있는 같은 팀 선수가 받아야 해요.',
  },
  breaking: {
    rule: 'Rule 8.11',
    title: '브레이킹',
    text: '센터 패스 휘슬 전에는 양 팀 C만 센터 서드에 있을 수 있어요. 먼저 들어가면 상대 팀 프리 패스예요.',
  },
  offside: {
    rule: 'Rule 14.1',
    title: '오프사이드',
    text: '내 포지션에게 허용되지 않은 구역에 들어가면 오프사이드예요. 상대 팀 프리 패스.',
  },
  heldBall: {
    rule: 'Rule 11.4',
    title: '3초 룰 (Held ball)',
    text: '공을 가진 선수는 3초 안에 패스하거나 슛해야 해요. 넘기면 상대 팀 프리 패스.',
  },
  shooting: { rule: 'Rule 9.6·11.5', title: '슈팅', text: '슛은 GS·GA만, 골 서클 안에서만 할 수 있어요.' },
  goalScored: {
    rule: 'Rule 9.1',
    title: '골',
    text: 'GS·GA가 골 서클 안(선 포함)에서 쏜 공이 링을 위에서 완전히 통과하면 골이에요.',
  },
  incorrectShot: {
    rule: 'Rule 9.6a',
    title: '잘못된 슛 (Incorrect shot)',
    text: '골 서클 밖 땅을 밟은 채 슛하면 골이 인정되지 않고 상대 팀 프리 패스예요. 서클 밖에서는 패스해요.',
  },
  rebound: {
    rule: 'Rule 11.1c·16.8b',
    title: '리바운드',
    text: '골대(링)에 맞고 튕긴 공은 누구나 잡을 수 있어요. 리바운드를 다툴 때는 0.9m 안에서도 팔을 뻗어도 돼요.',
  },
  blockLegal: {
    rule: 'Rule 16.6a',
    title: '정당한 블록',
    text: '0.9m를 지킨 수비는 슈터 쪽으로 뛰어올라 공을 막을 수 있어요. 공이 손을 떠나 올라갈 때 막아야 해요.',
  },
  repossession: {
    rule: 'Rule 11.6',
    title: '다시 잡기 금지 (Repossession)',
    text: '공을 놓은 선수는 다른 선수가 만지거나 골대에 맞기 전까지 다시 만질 수 없어요. 링에도 안 닿은 에어볼은 슛한 사람이 못 잡아요.',
  },
  onTheLine: {
    rule: 'Rule 9.1·9.6a',
    title: '골 서클 선',
    text: '골 서클 선 위는 서클 안이에요. 선 밖에서 잡았다면 한 발 들어가도 슛할 수 없어요(잡을 때 밖을 밟았으니까).',
  },
  shotHeld: { rule: 'Rule 9.6b', title: '슛도 3초 안에', text: '공을 잡고 3초 안에 슛해야 해요. 넘기면 Held ball, 상대 팀 프리 패스.' },
  shotDefence: {
    rule: 'Rule 16.1',
    title: '슈터 수비 거리',
    text: '슛하려는 선수를 수비할 때도 0.9m 이상 떨어져서 손을 들어 막아요.',
  },
  interference: {
    rule: 'Rule 9.7',
    title: '슛 방해 (Interference with shot)',
    text: '수비가 골대를 흔들거나 링으로 떨어지는 공을 건드리면 페널티 패스예요. 그 슛이 들어갔다면 골은 인정돼요.',
  },
  circleDefence: { rule: 'Rule 3 (p.20)', title: '수비 서클', text: '우리 골 서클(수비 서클)에는 수비수 GK·GD만 들어갈 수 있어요.' },
  obstruction: {
    rule: 'Rule 16.1',
    title: '장애 (Obstruction)',
    text: '공을 가진 선수를 수비할 때는 0.9m 이상 떨어져야 해요. 어기면 상대 팀 페널티 패스.',
  },
  penaltyShoot: {
    rule: 'Rule 6.6',
    title: '골 서클 페널티 패스',
    text: 'GS·GA가 골 서클 안에서 페널티 패스를 받으면 패스하거나 슛할 수 있어요.',
  },
  interception: { rule: 'Rule 16.6', title: '정당한 인터셉트', text: '0.9m를 지킨 수비수는 공을 가로채거나 쳐 낼 수 있어요.' },
  contact: {
    rule: 'Rule 17.1',
    title: '접촉 (Contact)',
    text: '상대를 밀거나 부딪쳐서 플레이를 방해하면 접촉 반칙이에요. 상대 팀 페널티 패스.',
  },
  outOfPlay: {
    rule: 'Rule 6.4',
    title: '아웃 오브 플레이',
    text: '페널티 패스 때 반칙한 선수는 패스하는 선수 옆에 비켜서서, 공이 손을 떠날 때까지 움직이거나 플레이에 끼어들 수 없어요.',
  },
});

/** 한 경기 동안 겪은 규칙을 모은다 (처음 겪은 순서 · 횟수) */
export function createRuleLog() {
  const seen = new Map();
  return {
    add(id) {
      if (!RULE_NOTES[id]) return;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    },
    entries() {
      return [...seen].map(([id, count]) => ({ id, count, ...RULE_NOTES[id] }));
    },
  };
}
