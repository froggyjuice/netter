// 넷볼 규칙 사전 형광펜: 요약 한 줄(키 '16-0' = Rule 16의 첫 줄)마다 칠한 글자들을 저장한다.
// 위치(몇 번째 글자)가 아니라 칠한 글자 자체를 저장해서, 요약 문장이 조금 바뀌어도 그 글자가 남아 있으면 다시 칠해진다.
// 저장 키 'netball.highlights' (놀이터 기록과 함께 이 기기 / 계정에 저장)
export const HIGHLIGHT_KEY = 'netball.highlights';
const MAX_PER_LINE = 20;
const MAX_LINES = 300;

export const lineKey = (ruleNo, index) => `${ruleNo}-${index}`;

/** 저장값 읽기 → { '16-0': ['0.9m 이상', …] } (깨졌으면 빈 값) */
export function parseHighlights(text) {
  let raw;
  try {
    raw = JSON.parse(text ?? '{}');
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, MAX_LINES)) {
    if (!/^\d{1,2}-\d{1,2}$/.test(k) || !Array.isArray(v)) continue;
    const subs = v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.slice(0, 300)).slice(0, MAX_PER_LINE);
    if (subs.length) out[k] = subs;
  }
  return out;
}

/** 줄 글에서 칠할 구간들 (겹치거나 붙은 구간, 띄어쓰기만 사이에 둔 구간은 하나로) → [[시작, 끝), …] */
export function rangesFor(text, subs = []) {
  const rs = [];
  for (const s of subs) {
    const i = text.indexOf(s);
    if (i >= 0) rs.push([i, i + s.length]);
  }
  rs.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of rs) {
    const last = merged[merged.length - 1];
    if (last && (r[0] <= last[1] || !text.slice(last[1], r[0]).trim())) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

const store = (map, key, text, ranges) => {
  const next = { ...map };
  const subs = ranges.filter(([a, b]) => b > a).map(([a, b]) => text.slice(a, b));
  if (subs.length) next[key] = subs;
  else delete next[key];
  return next;
};

/** [start, end) 를 칠한다 (앞뒤 공백은 빼고) → 새 map */
export function addHighlight(map, key, text, start, end) {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start) return map;
  const ranges = rangesFor(text, map[key]);
  ranges.push([start, end]);
  return store(map, key, text, rangesFor(text, ranges.map(([a, b]) => text.slice(a, b))));
}

/** at 글자를 포함한 칠한 구간을 지운다 → 새 map */
export function removeHighlight(map, key, text, at) {
  const ranges = rangesFor(text, map[key]).filter(([a, b]) => !(at >= a && at < b));
  return store(map, key, text, ranges);
}

/** 칠한 부분을 <mark> 로 감싼 HTML (esc: 글자를 HTML 안전하게) */
export function markedHtml(text, subs, esc) {
  let html = '';
  let at = 0;
  for (const [a, b] of rangesFor(text, subs)) {
    html += esc(text.slice(at, a)) + `<mark class="hl" data-at="${a}">${esc(text.slice(a, b))}</mark>`;
    at = b;
  }
  return html + esc(text.slice(at));
}
