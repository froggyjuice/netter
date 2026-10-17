// 코트 색상 (Phaser 게임과 포지션 미리보기가 함께 쓴다)
// 눈의 피로를 줄이려고 색(색상)은 그대로 두고 채도·대비를 낮춘 파스텔 톤을 쓴다.
export const THEME = Object.freeze({
  allowed: 0xd6ead3, // 갈 수 있는 구역
  forbidden: 0xcdd0cc, // 갈 수 없는 구역 (오프사이드)
  hatch: 0x6f7a6f,
  line: 0xffffff,
  border: 0x4a7a52,
  ink: 0x3a3a36,
  ball: 0xeda15e,
  ballEdge: 0xb06e35,
  snakeHead: 0xe07a4f,
  snakeBody: 0xefb183,
  snakeBody2: 0xf4cba7,
  sub: 0x5fae9f,
  pass: 0x6b9be0, // 패스 대상(같은 팀 애벌레) 머리
  passBody: 0xaecbf0, // 패스 대상 몸통
  goalZone: 0xf6e3a3, // 슈팅할 수 있는 골 서클 (GS·GA로 뛸 때)
  goalZoneMuted: 0xdcd5b6, // 우리 팀 골 서클이지만 이 포지션은 못 들어갈 때 (채도 낮은 황금색)
  goalRing: 0xe07a4f, // 골대 링
  opp: 0x8b6fc4, // 맞수(상대 팀)
  oppOut: 0xb9aed3, // 아웃 오브 플레이 중인 맞수 (흐린 보라)
  danger: 0xd96464,
  offside: 0xd96464, // 오프사이드 경계선 (빨강)
  // 포지션 조끼 (공격 진한 초록 · 수비 연한 초록 · 센터 노랑) — style.css 의 --attack/--defence/--centre 와 같음
  bibAttack: 0x3f7a4c,
  bibDefence: 0xcfe8c8,
  bibCentre: 0xf3d77e,
  cue: 0x5b7fd0, // 타이밍 원 (파랑)
  hot: 0xf2cf6b, // 딱 맞는 순간 (노랑)
  good: 0x4a8559, // 초록 (선 위 · 지킴)
});

export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export const FONT = "'Netter', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";
