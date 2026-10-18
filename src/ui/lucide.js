// 선 아이콘 (lucide, ISC 라이선스) — 동아리 앱과 같은 아이콘. 쓰는 것만 불러와 번들을 작게.
import {
  House, Gamepad2, BookOpen, CalendarDays, ExternalLink, MessageCircle, Trophy, Sun, Moon, Download, Settings, ChevronRight, Sparkles,
} from 'lucide';

const ICONS = { House, Gamepad2, BookOpen, CalendarDays, ExternalLink, MessageCircle, Trophy, Sun, Moon, Download, Settings, ChevronRight, Sparkles };

const attrs = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
/** 아이콘 SVG 문자열 (innerHTML 템플릿에 바로 넣는다) */
export function icon(name, size = 18) {
  const node = ICONS[name];
  if (!node) return '';
  const [, base, children] = node;
  const inner = children.map(([tag, a]) => `<${tag}${attrs(a)}/>`).join('');
  return `<svg${attrs({ ...base, width: size, height: size, class: 'lu', 'aria-hidden': 'true' })}>${inner}</svg>`;
}

/** data-icon="이름" 이 붙은 요소의 맨 앞에 아이콘을 넣는다 (index.html 의 고정 메뉴 · 버튼) */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.querySelector(':scope > svg.lu')?.remove();
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, Number(el.dataset.iconSize) || 18));
  });
}
