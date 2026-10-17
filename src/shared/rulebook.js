// 넷볼 규칙 사전: World Netball「Rules of Netball」2024 의 Rule 1~21을 풀어 쓴 요약.
// 원문(규정집)은 저작권이 있어 싣지 않는다. 줄마다 근거 조항 · 쪽 · 원문의 짧은 핵심 구절(en)만 적고,
// 전체 원문은 공식 사이트(OFFICIAL_RULES_URL)에서 무료로 볼 수 있다.
// games: 이 규칙을 연습할 수 있는 게임 id (registry.js). 개발 중인 게임도 넣고, 화면에는 회색 글씨로 보인다.
// points: [{ t: 요약 한 줄, ref: '16.1' (조항), p: 53 (규정집 쪽), en: 원문 핵심 구절 (짧게) }]
export const OFFICIAL_RULES_URL = 'https://netball.sport/game/the-rules-of-netball';

const P = (t, ref, p, en) => Object.freeze({ t, ref, p, en });

export const RULEBOOK = Object.freeze([
  {
    no: 1,
    title: '코트와 장비',
    games: ['snake', 'rhythm'],
    points: [
      P('코트는 길이 30.5m, 너비 15.25m인 직사각형이에요. 골라인과 나란한 선 두 개가 코트를 똑같이 셋으로 나눠요. 가운데는 센터 서드, 양 끝은 골 서드예요.', '1.2–1.4', 13, 'divide the court into three equal areas'),
      P('코트 한가운데에 지름 0.9m인 센터 서클이 있고, 양쪽 골라인 가운데에는 반지름 4.9m 반원인 골 서클이 있어요.', '1.5–1.6', 13, 'a semi-circle of radius 4.9 m'),
      P('선은 그 선이 둘러싼 구역에 속해요. 두 구역 사이의 경계선은 양쪽 구역 모두에 속해요.', '1.7', 13, 'part of the court area they outline'),
      P('골대는 골라인 가운데에 서 있어요. 높이는 3.05m, 링 안지름은 38cm이고, 링은 기둥 꼭대기에서 15cm 앞으로 나온 막대에 달려 있어요.', '1.13–1.14', 14, 'an internal diameter of 380 mm'),
      P('공은 둘레 69~71cm, 무게 400~450g이에요.', '1.15', 15, 'Weigh 400-450 g'),
    ],
  },
  {
    no: 2,
    title: '경기 시간',
    games: ['snake', 'rhythm'],
    points: [
      P('경기는 15분씩 4쿼터예요. 1·2쿼터 사이와 3·4쿼터 사이에는 4분, 하프타임에는 12분(대회와 두 팀이 합의하면 8분) 쉬어요.', '2.1', 16, 'four quarters, each of 15 minutes'),
      P('쿼터마다 두 팀이 공격하는 골 방향을 바꿔요.', '2.2', 16, 'Teams change ends each quarter'),
      P('쿼터가 끝나기 전에 공격 골 서클 안에서 페널티 패스를 얻었다면, 시간이 다 돼도 그 페널티 패스는 마저 해요.', '2.3', 16, 'time is being extended for the penalty pass'),
      P('연장전(대회가 미리 정한 경우): 4분 쉬고 7분 이하로 전반·후반을 해요(사이에 1분 휴식). 그래도 비기면 한 팀이 2골 앞설 때까지 계속해요.', '2.5–2.8', 17, 'until one team leads by two goals'),
    ],
  },
  {
    no: 3,
    title: '팀과 포지션',
    games: ['snake', 'pass'],
    points: [
      P('코트 위에는 한 팀에 5~7명이 있어야 하고, 그중 한 명은 반드시 C(센터)를 맡아요. 5명이 안 되면 상대 팀이 이긴 것으로 해요.', '3.2', 18, 'one of whom must play as Centre'),
      P('포지션은 GS · GA · WA · C · WD · GD · GK 7개예요. 포지션마다 뛸 수 있는 구역이 정해져 있어요(존 스네이크의 1~5구역).', '3.10–3.11', 19, 'specified areas of the court'),
      P('포지션 글자(높이 15cm)는 허리 위, 몸 앞과 뒤에 잘 보이게 달아요.', '3.9', 19, 'worn above the waist, front and back'),
      P('귀걸이 같은 피어싱은 할 수 없어요. 손톱은 짧고 매끄럽게, 머리는 단정하게 묶어야 해요.', '3.12', 21, 'Fingernails must be short and smooth'),
      P('경기 전에 두 주장이 동전 던지기를 해요. 이긴 쪽이 첫 센터 패스와 공격 방향 중 하나를 고르고, 다른 하나는 상대 팀이 가져요.', '3.13', 21, 'first centre pass or to choose a goal end'),
      P('늦게 온 선수는 심판에게 알린 뒤, 다음 경기 중단 때 비어 있는 포지션으로 들어가요.', '3.8', 19, 'at the next break in play'),
    ],
  },
  {
    no: 4,
    title: '심판',
    games: ['whistle'],
    points: [
      P('심판은 두 명이고, 각자 코트의 절반을 맡아요. 사이드라인을 따라, 그리고 골라인 뒤에서 움직이며 판정해요.', '4.8–4.9', 24, 'one half of the court'),
      P('휘슬은 쿼터를 시작하고 끝낼 때, 골이 들어간 뒤 경기를 다시 시작할 때, 반칙을 부를 때 불어요.', '4.6', 23, 'Restarts play after a goal has been scored'),
      P('반칙을 부를 때는 휘슬을 불고 → 반칙 이름을 말하고 → 수신호를 한 뒤 → 어디서 공을 줄지 가리켜요.', '4.7', 24, 'state the infringement using the correct terminology'),
      P('공이 코트 안에 있는 심판에게 맞아도 경기는 계속돼요. 그 때문에 한 팀이 억울하게 불리해졌을 때만 그 팀에게 공을 줘요.', '4.10', 24, 'unless one team has been unfairly disadvantaged'),
      P('예비 심판은 심판이 아프거나 다치면 대신 들어가고, 일시 퇴장·퇴장당한 선수를 지켜봐요.', '4.14', 25, 'Supervises a suspended player'),
    ],
  },
  {
    no: 5,
    title: '기록원 · 계시원',
    games: [],
    points: [
      P('기록원은 골과 빗나간 슛을 기록하고, 다음 센터 패스가 어느 팀 차례인지 챙겨요.', '5.5', 26, 'Keep a record of the centre passes'),
      P('계시원은 경기 시간과 쉬는 시간을 재고, 일시 퇴장(2분)과 퇴장(4분) 시간도 재요.', '5.7', 27, 'suspension period of two minutes playing time'),
    ],
  },
  {
    no: 6,
    title: '판정의 종류 (프리 패스 · 페널티 패스 · 스로인 · 포제션)',
    games: ['snake', 'rhythm', 'pass', 'whistle', 'throwin'],
    points: [
      P('작은 반칙에는 프리 패스를 줘요. 반칙이 일어난 자리에서 상대 팀이 패스해요. 프리 패스로는 바로 슛할 수 없어요.', '6.3', 30, 'may not shoot for goal'),
      P('큰 반칙(장애 반칙 · 접촉 반칙 등)에는 페널티 패스를 줘요. 반칙한 선수가 서 있던 자리에서 하되, 그게 반칙을 당한 팀에 불리하면 당한 선수 자리에서 해요.', '6 (표)', 29, 'Where the infringer was standing'),
      P('페널티 패스 동안 반칙한 선수는 패스하는 선수 옆으로 비켜서서, 공이 손을 떠날 때까지 움직이거나 말을 할 수도 없어요 (아웃 오브 플레이).', '6.4', 30, 'not move or take any part in play'),
      P('골 서클 안에서 페널티 패스를 얻은 GS·GA는 패스해도 되고 바로 슛해도 돼요.', '6.6', 30, 'may either pass or shoot for goal'),
      P('공이 코트 밖으로 나가면 스로인을 해요. 코트 밖에서 한 발을 라인에서 15cm 안에 두고 던지고, 공을 놓기 전에는 선을 밟거나 코트에 들어오면 안 돼요. 던진 공은 꼭 코트 안으로 들어가야 해요.', '6.11–6.14', 31, 'within 15 cm (6 in) of the line'),
      P('프리 패스 · 페널티 패스 · 스로인도 평소처럼 3초 · 풋워크 · 패스 거리 규칙을 지켜야 해요. 그 구역에 들어갈 수 있는 선수라면 누구나 할 수 있어요.', '6.2 · 6.18–6.19', 29, 'any player allowed in the area'),
    ],
  },
  {
    no: 7,
    title: '어드밴티지',
    games: ['whistle'],
    points: [
      P('반칙을 당한 팀이 그대로 계속하는 편이 더 유리하면, 심판은 휘슬 대신 "어드밴티지"라고 외치고 경기를 계속시켜요.', '7.1–7.3', 34, 'apply advantage and allow play to continue'),
      P('위험한 플레이, 머리·목에 닿은 충돌, 선수가 크게 다쳤을 수 있는 상황, 바로 퇴장감인 반칙에는 어드밴티지를 주지 않아요.', '7.4', 34, 'Advantage must not be applied'),
      P('이미 휘슬을 불었더라도, 반칙을 당한 팀의 슛이 들어갔다면 골로 인정해요.', '7.5', 34, 'the umpire will award the goal'),
    ],
  },
  {
    no: 8,
    title: '센터 패스',
    games: ['snake'],
    points: [
      P('쿼터를 시작할 때와 골이 들어간 뒤에는 센터 패스로 경기를 시작해요. 두 팀의 C가 번갈아 해요.', '8.1', 35, 'taken alternately by the Centre of each team'),
      P('센터 패스를 하는 C는 한 발 이상을 센터 서클 안에 완전히 넣고 서요. 상대 팀 C는 센터 서드 안에서 자유롭게 움직일 수 있어요.', '8.8–8.9', 36, 'at least one foot wholly within the centre circle'),
      P('두 C를 뺀 나머지 선수는 휘슬이 울리기 전에 센터 서드에 들어가면 안 돼요 (브레이킹 반칙 · Breaking).', '8.11', 36, 'must not enter the centre third until the whistle'),
      P('C는 휘슬 뒤 3초 안에 공을 놓아야 해요. 센터 패스는 센터 서드 안에 서 있거나 그 안에 착지한 선수가 받아야 해요.', '8.13–8.14', 37, 'release the ball within three seconds'),
      P('센터 패스가 아무에게도 닿지 않고 센터 서드 옆 사이드라인 밖으로 나가면 상대 팀 스로인이에요.', '8.15', 37, 'may not go untouched over the side line'),
    ],
  },
  {
    no: 9,
    title: '골',
    games: ['rhythm', 'snake'],
    points: [
      P('GS·GA가 골 서클 안(선 포함)에서 슛한 공이 링을 위에서 아래로 완전히 통과하면 골이에요.', '9.1', 38, 'passes above and completely through the ring'),
      P('슛하는 선수는 공을 잡는 순간부터 골 서클 밖 바닥에 닿아 있으면 안 돼요. 공을 잡고 3초 안에 슛해야 하고, 풋워크 규칙도 지켜야 해요.', '9.6', 38, 'no physical contact with the ground outside the goal circle'),
      P('수비가 슛을 건드려 방향이 바뀌어도, 공이 링을 통과하면 골이에요.', '9.3', 38, 'a goal is still scored'),
      P('수비가 골대를 흔들어 슛을 방해하거나, 링으로 떨어지는 공을 건드리면 페널티 패스예요. 그 슛이 들어갔다면 골도 인정해요.', '9.7', 39, 'Deflect a ball on its downward flight'),
      P('쿼터 끝 휘슬이 울리기 전에 슛한 공이 손을 떠났다면, 그 공이 들어가면 골이에요.', '9.2', 38, 'after the ball has left the hands'),
    ],
  },
  {
    no: 10,
    title: '경기 중단과 교체',
    games: [],
    points: [
      P('선수 교체와 포지션 바꾸기는 쉬는 시간, 부상·질병·출혈로 경기가 멈췄을 때, 그리고 골이 들어간 직후(코트 위 선수가 요청)에 할 수 있어요. 횟수 제한은 없어요.', '10.1–10.4', 40, 'unlimited during a match'),
      P('다쳤거나 피가 나는 선수는 30초 안에 코트 밖으로 나가 치료를 받아요.', '10.13', 42, 'leave the court within 30 seconds'),
      P('교체할 선수가 없으면 그 포지션을 비워 둔 채 경기해요. 다만 C가 빠지면 다른 선수가 C를 맡아야 해요.', '10.20', 42, 'one player must move to play as Centre'),
      P('경기는 멈췄을 때 공이 있던 자리에서 다시 시작해요.', '10.8', 41, 'from where the ball was when play stopped'),
    ],
  },
  {
    no: 11,
    title: '공 다루기',
    games: ['rhythm', 'snake', 'pass', 'steps'],
    points: [
      P('공은 한 손이나 두 손으로 잡을 수 있어요. 한 번 쳐 낸 뒤 잡기, 한 번 튕긴 뒤 잡기, 골대에 맞고 나온 공 잡기도 돼요.', '11.1', 44, 'Bat the ball once, then catch it'),
      P('공 위로 넘어지며 잡거나, 눕거나 앉거나 무릎 꿇은 채로 공을 잡으면 안 돼요. 골대를 짚고 버텨도 안 돼요.', '11.2–11.3', 44, 'lying, sitting or kneeling on the ground'),
      P('공을 잡으면 3초 안에 패스하거나 슛해야 해요 (Held ball).', '11.4', 44, 'within three seconds'),
      P('공을 놓은 뒤에는, 그 공이 다른 선수나 골대에 닿기 전에 다시 잡을 수 없어요 (Repossession).', '11.6', 44, 'before it touches another player'),
      P('공을 발로 차기, 주먹으로 치기, 다른 선수에게 굴려 주기, 눕거나 앉은 채로 패스·슛하기는 안 돼요.', '11.8', 45, 'Strike the ball with a fist'),
    ],
  },
  {
    no: 12,
    title: '패스 거리',
    games: ['pass'],
    points: [
      P('패스할 때는 상대가 공을 건드리거나 가로챌 수 있을 만큼 두 선수 사이에 공간이 있어야 해요 (숏 패스 반칙 · Short pass).', '12.1', 46, 'sufficient space on the court for an opposing player'),
      P('같은 팀 두 명이 거의 동시에 공을 잡으면, 먼저 잡은 선수가 공을 갖고 나중에 잡은 선수는 손을 떼야 해요.', '12.2', 46, 'gained possession of the ball first'),
      P('공은 세 서드 모두에서 누군가에게 잡히거나 닿아야 해요. 한 서드를 건너뛰어 던지면 서드 건너뛰기 반칙이에요 (Over a third).', '12.3', 46, 'caught or touched by a player in each third'),
      P('공을 잡은 뒤 옆 서드로 한 발 내디뎌도 괜찮아요. 이때 다음 패스는 처음 착지한 서드에서 한 것으로 봐요.', '12.5', 46, 'deemed to have been made from the third'),
    ],
  },
  {
    no: 13,
    title: '풋워크',
    games: ['pass', 'steps'],
    points: [
      P('한 발로 착지했다면: 다른 발은 어느 방향으로든 디딜 수 있고, 착지 발을 축으로 몸을 돌릴(피벗) 수도 있어요. 착지 발을 들었다면 다시 딛기 전에 패스하거나 슛해야 해요.', '13.1', 48, 'pass or shoot before regrounding it'),
      P('두 발로 동시에 착지했다면: 한 발을 먼저 옮기는 순간, 남은 발이 착지 발이 돼요.', '13.2', 48, 'the foot not first moved'),
      P('착지 발을 끌거나 미끄러뜨리기, 한 발로 깡충 뛰기, 두 발로 뛰어 두 발로 착지하기, 넘어진 뒤 착지 발을 다시 딛기는 반칙이에요.', '13.3', 49, 'Drag or slide the landing foot'),
    ],
  },
  {
    no: 14,
    title: '오프사이드',
    games: ['snake', 'pass'],
    points: [
      P('자기 포지션이 들어갈 수 없는 구역에 들어가면, 공을 건드리지 않았어도 오프사이드 반칙이에요 → 상대 팀 프리 패스.', '14.1', 50, 'whether the player has contact with the ball or not'),
      P('선을 밟는 것까지는 괜찮아요. 몸이 선을 넘어가면 오프사이드예요.', '14.1', 50, 'in contact with, but not over, the line'),
      P('두 팀 선수가 차례로 금지 구역에 들어가면, 먼저 들어간 선수가 반칙이에요.', '14.2', 50, 'the first player is penalised'),
      P('금지 구역 바닥을 밟지 않는다면, 몸을 뻗어 그 안의 공을 집거나 공을 짚어도 돼요.', '14.3', 50, 'reach across and pick up a ball'),
    ],
  },
  {
    no: 15,
    title: '아웃 오브 코트',
    games: ['throwin'],
    points: [
      P('공이 코트 밖 바닥에 닿거나, 코트 밖에 있는 사람·물건에 닿으면 아웃이에요. 마지막에 공을 건드리지 않은 팀이 공이 나간 곳에서 스로인해요.', '15.1', 51, 'the team that did not touch the ball last'),
      P('선 위에 떨어진 공과, 골대에 맞고 코트로 튕겨 들어온 공은 아웃이 아니에요.', '15.4', 51, 'lands on but not over any part'),
      P('선 위에 서 있는 선수는 아직 코트 안이에요. 코트 안에서 뛰어올라 밖에 착지하기 전에 패스하거나 슛하는 건 괜찮아요.', '15.5–15.6', 52, 'before landing outside the court'),
      P('코트 밖에 서서 코트 안의 상대를 수비하면 페널티 패스예요.', '15.10', 52, 'may not attempt to defend a player on the court'),
    ],
  },
  {
    no: 16,
    title: '장애 반칙 (Obstruction)',
    games: ['snake', 'rhythm', 'whistle'],
    points: [
      P('공을 가진 선수를 수비할 때는 0.9m 이상 떨어져야 해요. 거리는 공 가진 선수의 착지 발에서 수비수의 가까운 발까지, 바닥에서 재요.', '16.1', 53, 'not less than 0.9 m (3 ft)'),
      P('0.9m를 지켰다면 위로 또는 앞으로 뛰어올라 막거나 가로채도 돼요. 패스·슛 동작을 방해하지 않으면 0.9m 안에 착지해도 괜찮아요.', '16.6', 54, 'landing within 0.9 m (3 ft)'),
      P('0.9m 안에 있더라도, 막으려고 하지 않고 패스·슛 동작을 방해하지 않으면 반칙이 아니에요.', '16.7', 54, 'provided there is no interference'),
      P('공이 없는 상대에게도, 0.9m 안에서 팔을 몸 밖으로 벌려 움직임을 막으면 안 돼요. 패스나 리바운드를 잡으려고 팔을 뻗는 건 괜찮아요.', '16.8–16.9', 54, 'take the arms away from the body'),
      P('장애 반칙을 하면 상대 팀에게 페널티 패스를 줘요.', '16 (첫 문단)', 53, 'Penalty Pass where the infringer was standing'),
    ],
  },
  {
    no: 17,
    title: '접촉 반칙 (Contact)',
    games: ['snake', 'whistle'],
    points: [
      P('밀기 · 걸기 · 붙잡기 · 기대기 · 치기, 상대가 든 공에 손대기처럼 몸이 닿아 상대 플레이를 부당하게 방해하면 접촉 반칙 → 페널티 패스예요. 일부러든 실수든 똑같아요.', '17.1', 55, 'whether accidental or deliberate'),
      P('플레이를 방해하지 않은 가벼운 몸싸움은 정당한 경합이라 반칙이 아니에요.', '17.3', 55, 'deemed fair contest'),
      P('공중에 뛴 선수가 내려올 자리를 차지하거나, 달려오는 상대 바로 앞을 갑자기 막아서면 안 돼요.', '17.6–17.7', 56, 'Move into the landing place'),
      P('머리·목에 닿는 충돌은 위험한 플레이로 보고, 페널티 패스에 더해 일시 퇴장 같은 더 무거운 처분이 따라요.', '17.9', 57, 'head and/or neck contact'),
    ],
  },
  {
    no: 18,
    title: '경기 관리 (경고 · 일시 퇴장 · 퇴장)',
    games: [],
    points: [
      P('심판은 반칙 판정과 함께, 선수의 행동을 바로잡으려고 단계별로 조치해요: 말로 주의 주기 → 패스 자리 앞당기기 또는 프리 패스를 페널티 패스로 올리기 → 경고 → 일시 퇴장(2분) → 퇴장.', '18.6', 58, 'Advance and/or escalate a sanction'),
      P('"패스 자리 앞당기기"는 반칙을 당한 팀이 패스할 자리를, 그 팀이 공격하는 골 쪽으로 서드 길이의 절반까지 옮겨 주는 거예요. 골 서드에서 일어난 반칙이면 골 서클 안까지 옮길 수도 있어요.', '18.17', 60, 'up to half a third'),
      P('보통은 차례대로 올라가지만, 심각한 행동이면 바로 높은 단계로 갈 수 있어요.', '18.8', 59, 'serious enough to require a higher level'),
      P('경고 · 일시 퇴장 · 퇴장을 줄 때는 시간을 멈추고, 수신호로 기록석에 알려요.', '18.10', 59, 'Hold time and signal to the official bench'),
    ],
  },
  {
    no: 19,
    title: '파울 플레이',
    games: ['whistle'],
    points: [
      P('불공정 플레이: 시간 끌기, 일부러 반칙하기, 반칙 되풀이하기, 판정에 항의하기, 위협하기(눈 가리기, 갑자기 큰 소리 내기, 발 구르기, 팔 마구 흔들기, 상대 놀리기 등) → 페널티 패스를 주고 그 자리를 앞당겨요.', '19.1–19.6', 64, 'Penalty pass which is advanced'),
      P('비신사적 행동: 보복, 욕설이나 모욕하는 말·몸짓 등 → 페널티 패스와 함께 경고 또는 일시 퇴장, 심하면 퇴장이에요.', '19.7–19.10', 65, 'either given a warning or suspended'),
      P('위험한 플레이(특히 머리·목이 닿는 행동) → 페널티 패스와 함께 일시 퇴장, 심하면 퇴장. 일부러 했거나 매우 무모했다면 반드시 퇴장이에요.', '19.11', 65, 'must always be ordered off'),
    ],
  },
  {
    no: 20,
    title: '동시 반칙',
    games: ['whistle'],
    points: [
      P('두 팀 선수가 동시에 공을 잡거나, 동시에 공을 밖으로 내보내거나, 동시에 오프사이드하며 공을 건드리거나, 서로 동시에 부딪히면 → 바로 전에 공을 갖고 있던 팀에게 공을 줘요 (포제션).', '20.1', 67, 'last had possession of the ball'),
      P('두 팀 선수가 동시에 금지 구역에 들어갔더라도 아무도 공을 건드리지 않았다면, 반칙 없이 경기를 계속해요.', '20.3', 67, 'neither player touches the ball'),
      P('두 심판이 서로 다른 팀의 반칙을 동시에 불면, 더 무거운 반칙(파울 플레이 > 큰 반칙 > 작은 반칙) 쪽 판정을 따라요.', '20.4', 67, 'the more significant sanction or action'),
    ],
  },
  {
    no: 21,
    title: '다른 수준의 경기',
    games: [],
    points: [
      P('이 규칙은 국제 경기 기준이에요. 어린이 경기나 다른 수준의 경기에서는 낮은 골대, 작은 공처럼 바꿔서 할 수 있어요.', '21.1 · 21.3', 68, 'a lower goalpost or a smaller ball'),
      P('무엇을 바꿀지는 대회를 운영하는 쪽이 정하고, 바꾸더라도 넷볼다운 경기 방식은 지켜야 해요.', '21.4', 68, 'should not change the way it is played'),
    ],
  },
]);

/** 검색: 제목 · 요약에 모든 단어가 들어 있는 규칙 (대소문자 무시) */
export function searchRules(query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return RULEBOOK;
  return RULEBOOK.filter((r) => {
    const text = `rule ${r.no} ${r.title} ${r.points.map((p) => p.t).join(' ')}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** 'Rule 9.6a' · 'Rule 8.8·8.14' · 'Rule 3 (p.20)' → 9 · 8 · 3 (규칙 사전의 장 번호) */
export function chapterOf(ruleText) {
  const m = /(\d+)/.exec(String(ruleText ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 21 ? n : null;
}
