// 설명 글 옆에 붙이는 작은 캐릭터 아이콘 (게임 화면의 모습과 같게, 색은 theme.js 와 맞춤)

/** 파란 동료 애벌레 (패스 대상) */
export const TEAMMATE_ICON = `<svg class="char-icon" viewBox="0 0 22 16" aria-hidden="true">
  <circle cx="6" cy="10" r="5" fill="#93c5fd"/>
  <circle cx="14" cy="8" r="7" fill="#6b9be0"/>
  <circle cx="12" cy="6.5" r="2" fill="#fff"/><circle cx="16.5" cy="6.5" r="2" fill="#fff"/>
  <circle cx="12.4" cy="6.8" r="1" fill="#2b2a26"/><circle cx="16.9" cy="6.8" r="1" fill="#2b2a26"/>
  <circle cx="14.2" cy="11" r="1.5" fill="#0b2e6b"/>
</svg>`;

/** 보라색 꼬마 유령 (맞수) */
export const OPP_ICON = `<svg class="char-icon" viewBox="0 0 16 16" aria-hidden="true">
  <path d="M2 14V7a6 6 0 0 1 12 0v7l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z" fill="#6f55a8"/>
  <circle cx="5.6" cy="7.5" r="1.9" fill="#fff"/><circle cx="10.4" cy="7.5" r="1.9" fill="#fff"/>
  <circle cx="6" cy="7.8" r="0.9" fill="#2b2a26"/><circle cx="10.8" cy="7.8" r="0.9" fill="#2b2a26"/>
  <path d="M3.6 4.6l3 1.2M12.4 4.6l-3 1.2" stroke="#2b2a26" stroke-width="1" stroke-linecap="round"/>
</svg>`;

/** 넷볼 공 (공격: 코트에 놓인 공) */
export const BALL_ICON = `<svg class="char-icon ball-icon" viewBox="0 0 16 16" aria-hidden="true">
  <circle cx="8" cy="8" r="6.3" fill="#eda15e" stroke="#a8520e" stroke-width="1.4"/>
  <path d="M1.7 8h12.6M8 1.7v12.6" stroke="#a8520e" stroke-width="1.1"/>
</svg>`;

/** 굴러오는 공 (수비): 공 + 뒤쪽 속도선 */
export const ROLL_ICON = `<svg class="char-icon roll-icon" viewBox="0 0 24 16" aria-hidden="true">
  <path d="M15 4.5h7M16 8h8M15 11.5h7" stroke="#a8520e" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/>
  <circle cx="8" cy="8" r="6.3" fill="#eda15e" stroke="#a8520e" stroke-width="1.4"/>
  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#a8520e" stroke-width="1.1"/>
</svg>`;
