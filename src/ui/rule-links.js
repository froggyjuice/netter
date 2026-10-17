// 게임 설명 속 규칙 낱말 → 넷볼 규칙 사전(#/rules/장) 링크
// 예) '오프사이드' → Rule 14, '(Rule 9.6a)' → Rule 9. 설명 칸(info-panel)마다 같은 낱말은 처음 한 번만 링크한다.
import { chapterOf } from '../shared/rulebook.js';

/** 낱말 → 규칙 사전의 장 번호 (긴 낱말을 먼저 찾는다) */
export const RULE_TERMS = Object.freeze({
  '서드 건너뛰기': 12,
  'Over a third': 12,
  '숏 패스': 12,
  오프사이드: 14,
  '페널티 패스': 6,
  '프리 패스': 6,
  '아웃 오브 플레이': 6,
  스로인: 15,
  '센터 패스': 8,
  브레이킹: 8,
  'Held ball': 11,
  '3초': 11,
  리바운드: 11,
  'Incorrect shot': 9,
  '슛 방해': 9,
  '골 서클': 9,
  장애: 16,
  '0.9m': 16,
  인터셉트: 16,
  접촉: 17,
  풋워크: 13,
  피벗: 13,
  어드밴티지: 7,
  '진영 교대': 2,
});

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERM_RE = Object.keys(RULE_TERMS)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|');
const PATTERN = new RegExp(`Rule \\d+(?:\\.\\d+[a-z]?)?|${TERM_RE}`, 'g');

/**
 * 글을 [글 | 링크] 조각으로 나눈다 (DOM 없이 테스트할 수 있게).
 * used: 이 설명 칸에서 이미 링크한 낱말 (같은 낱말은 한 번만). 'Rule 숫자'는 매번 링크한다.
 * @returns {{ text: string, chapter?: number }[]}
 */
export function ruleLinkSegments(text, used = new Set()) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const word = m[0];
    const isRule = word.startsWith('Rule ');
    const chapter = isRule ? chapterOf(word) : RULE_TERMS[word];
    if (!chapter || (!isRule && used.has(word))) continue;
    if (!isRule) used.add(word);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: word, chapter });
    last = m.index + word.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * root 안의 글에 규칙 사전 링크를 단다. 링크·버튼·제목 안의 글은 그대로 둔다.
 * newTab: 게임 중(일시정지 화면)에는 경기를 잃지 않도록 새 탭으로 연다.
 */
export function linkifyRules(root, { newTab = false } = {}) {
  const panels = [...root.querySelectorAll('.info-panel')];
  const others = [...root.querySelectorAll('p')].filter((p) => !p.closest('.info-panel'));
  const groups = panels.length || others.length ? [...panels, ...others] : [root];
  for (const group of groups) {
    const used = new Set();
    const walker = document.createTreeWalker(group, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('a, button, h3, h4, .info-tabs') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = ruleLinkSegments(node.nodeValue, used);
      if (!parts.some((p) => p.chapter)) continue;
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (!p.chapter) {
          frag.append(p.text);
          continue;
        }
        const a = document.createElement('a');
        a.className = 'rule-link';
        a.href = `#/rules/${p.chapter}`;
        a.title = `넷볼 규칙 사전 Rule ${p.chapter}에서 보기`;
        a.textContent = p.text;
        if (newTab) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
        frag.append(a);
      }
      node.replaceWith(frag);
    }
  }
}
