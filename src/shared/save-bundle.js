// 놀이터 기록 묶음: 이 기기(localStorage) ↔ 내 계정(/api/me) 사이에서 옮기는 단위.
// 존 스네이크 배지 · 리듬 슈팅 최고 기록과 배지 · 패스 퍼즐 별 (각 키의 저장 문자열 그대로)
export const SAVE_KEYS = Object.freeze(['netball.profile', 'netball.rhythm', 'netball.pass']);
export const SAVE_LABELS = Object.freeze({
  'netball.profile': '🐍 존 스네이크 배지',
  'netball.rhythm': '🎯 리듬 슈팅 최고 기록 · 배지',
  'netball.pass': '🧩 패스 퍼즐 별',
});

/** 이 기기의 기록을 묶는다. get: (key) => 문자열|null */
export function collectSave(get) {
  const out = {};
  for (const k of SAVE_KEYS) {
    const v = get(k);
    if (typeof v === 'string' && v.length) out[k] = v;
  }
  return out;
}

/** 묶음을 이 기기에 쓴다 (정해진 키 · 문자열만). 반환: 쓴 키 목록 */
export function applySave(data, set) {
  const written = [];
  if (!data || typeof data !== 'object') return written;
  for (const k of SAVE_KEYS) {
    if (typeof data[k] === 'string') {
      set(k, data[k]);
      written.push(k);
    }
  }
  return written;
}

/** 묶음이 비었는지 (옮기기 전에 '덮어써도 될까요?' 확인용) */
export const isEmptySave = (data) => !data || !SAVE_KEYS.some((k) => typeof data[k] === 'string' && data[k].length > 2);
