// 리듬 슈팅 최고 기록 · 업적 배지 (순수 로직 → 테스트 가능). 브라우저(localStorage 'netball.rhythm')에 저장한다.
// 최고 기록은 모드(공격 attack · 수비 defence) × 난이도(easy · normal · hard) 6칸으로 따로 센다
// (판정 범위와 점수가 달라서 한 칸으로 합치면 비교가 안 된다).
// 저장 형식: { records: { 'attack:normal': { score, combo, position, date } }, badges, best, played }
import { createBadgeBook } from '../shared/badges-logic.js';

export const RECORD_MODES = Object.freeze(['attack', 'defence']);
export const RECORD_DIFFS = Object.freeze(['easy', 'normal', 'hard']);
export const recordKey = (mode, difficulty) => `${mode}:${difficulty}`;

const attack = (r) => r.mode !== 'defence';
const defence = (r) => r.mode === 'defence';

/** 리듬 슈팅 배지: stat = 한 판 기록(total 이면 여러 판 누적) */
export const RHYTHM_BADGES = Object.freeze([
  { id: 'r-first-goal', icon: '🎯', title: '첫 골', desc: '공격 모드(GS·GA)로 골 넣기 (Rule 9.1)', goal: 1, stat: (r) => (attack(r) ? r.goals : 0) },
  { id: 'r-perfect-10', icon: '✨', title: '퍼펙트 10', desc: '한 판에 Perfect 10번', goal: 10, unit: '번', stat: (r) => (attack(r) ? r.perfects : 0) },
  { id: 'r-combo-20', icon: '🔥', title: '콤보 20', desc: '한 판 최대 연속 20번 (공격·수비 모두)', goal: 20, unit: '연속', stat: (r) => r.bestCombo },
  {
    id: 'r-clean', icon: '🧼', title: '클린 슈터', desc: '서클 밖 슛·3초 지남 없이 한 판에 골 10개 (Rule 9.6a·9.6b)', goal: 10, unit: '골',
    stat: (r) => (attack(r) && !r.incorrectShots && !r.helds ? r.goals : 0),
  },
  { id: 'r-rebounder', icon: '🏀', title: '리바운더', desc: '한 판에 리바운드 5번 잡기 (Rule 11.1c)', goal: 5, unit: '번', stat: (r) => r.rebounds },
  { id: 'r-line', icon: '👣', title: '선 위의 슈터', desc: '서클 선 위에서 골 3번 (여러 판 누적 · Rule 9.1)', goal: 3, unit: '골', total: true, stat: (r) => (attack(r) ? r.lineGoals : 0) },
  { id: 'r-block-10', icon: '✋', title: '블록왕', desc: '수비 모드 한 판에 정당한 블록 10번 (Rule 16.6a)', goal: 10, unit: '번', stat: (r) => (defence(r) ? r.blocks : 0) },
  {
    id: 'r-gap-master', icon: '🧍', title: '0.9m 장인', desc: '수비 모드 한 판에 장애 없이 멈춤 Perfect 10번 (Rule 16.1)', goal: 10, unit: '번',
    stat: (r) => (defence(r) && !r.obstructions ? r.stopPerfects : 0),
  },
  { id: 'r-hard-1000', icon: '🌟', title: '어려움 정복', desc: '어려움으로 한 판 1,000점 이상', goal: 1000, unit: '점', stat: (r) => (r.difficulty === 'hard' ? r.score : 0) },
]);

export const rhythmBook = createBadgeBook(RHYTHM_BADGES);

const num = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** 저장값 읽기 (깨졌거나 비어 있으면 빈 값) */
export function parseRhythmSave(text) {
  let raw = null;
  try {
    raw = JSON.parse(text ?? 'null');
  } catch {
    raw = null;
  }
  const records = {};
  for (const m of RECORD_MODES) {
    for (const d of RECORD_DIFFS) {
      const k = recordKey(m, d);
      const v = raw?.records?.[k];
      if (v && num(v.score) > 0) {
        records[k] = {
          score: Math.min(num(v.score), 1_000_000),
          combo: num(v.combo),
          position: typeof v.position === 'string' ? v.position.slice(0, 2) : '',
          date: typeof v.date === 'string' ? v.date.slice(0, 10) : '',
        };
      }
    }
  }
  return { records, ...rhythmBook.parse(raw) };
}

/** 이 모드·난이도의 최고 기록 (없으면 null) */
export const bestFor = (save, mode, difficulty) => save.records[recordKey(mode, difficulty)] ?? null;

/**
 * 한 판 결과 반영. 원래 save는 바꾸지 않는다.
 * @returns {{ save, newRecord: boolean, prev: object|null, earned: object[] }}
 */
export function applyRhythmResult(save, result, now = new Date()) {
  const key = recordKey(result.mode === 'defence' ? 'defence' : 'attack', result.difficulty ?? 'normal');
  const prev = save.records[key] ?? null;
  const score = num(result.score);
  const records = { ...save.records };
  const newRecord = score > 0 && score > (prev?.score ?? 0);
  if (newRecord) {
    records[key] = { score, combo: num(result.bestCombo), position: result.position ?? '', date: now.toISOString().slice(0, 10) };
  } else if (prev && num(result.bestCombo) > prev.combo) {
    records[key] = { ...prev, combo: num(result.bestCombo) }; // 점수는 못 넘었어도 연속 기록은 갱신
  }
  const { profile, earned } = rhythmBook.apply({ badges: save.badges, played: save.played, best: save.best }, result, now);
  return { save: { records, ...profile }, newRecord, prev, earned };
}

/** 저장용 JSON */
export const serializeRhythmSave = (save) =>
  JSON.stringify({ records: save.records, badges: save.badges, best: save.best, played: save.played });
