// 배지 규칙 (순수 함수, 화면과 분리 → 테스트 가능)
// 지금은 브라우저(localStorage)에 저장하고, 2단계 로그인 이후 saves 테이블의 state로 옮긴다.
//
// profile: { badges: { [id]: 획득시각 ISO }, played: [포지션...], best: { [id]: 지금까지 한 판 최고 기록 } }
// result : 존 스네이크 한 판의 결과 (snake.js의 snapshot + reason/durationMs)
//
// 배지는 goal(목표)과 stat(한 판에서 그 배지에 해당하는 기록)으로 정의한다.
// 한 판 최고 기록(best)이 목표에 닿으면 획득. 올라운더만 여러 판에 걸친 '뛴 포지션 수'로 센다.
// total: true 인 배지는 한 판 최고가 아니라 여러 판에 걸쳐 더한 값으로 센다.
// 게임마다 배지 목록이 다르다: createBadgeBook(배지 목록)으로 같은 규칙의 함수 묶음을 만든다
// (존 스네이크 = 아래 BADGES · 리듬 슈팅 = games/rhythm-records.js).
import { POSITION_KEYS } from './zones.js';

export const BADGES = Object.freeze([
  { id: 'first-goal', icon: '🎯', title: '첫 슈팅', desc: 'GS·GA로 골 서클 안에서 공을 먹어 슈팅 성공', goal: 1, stat: (r) => r.goals },
  { id: 'iron-circle', icon: '🧱', title: '서클 철벽', desc: 'GK·GD로 수비 서클 안에서 공을 막기', goal: 1, stat: (r) => r.circleBlocks },
  // 오프사이드가 한 번이라도 있으면 그 판은 0점으로 친다
  { id: 'clean', icon: '🧼', title: '클린 플레이', desc: '오프사이드 없이 100점 이상', goal: 100, unit: '점', stat: (r) => (r.offsides === 0 ? r.score : 0) },
  { id: 'pass-chain', icon: '🔗', title: '패스 체인', desc: '3초 패스 5번 연속 성공', goal: 5, unit: '연속', stat: (r) => r.bestChain },
  { id: 'vs-opp', icon: '🥷', title: '맞수 따돌리기', desc: '맞수가 코트에 있을 때 공 10개 잡기', goal: 10, unit: '개', stat: (r) => r.ballsVsOpp },
  { id: 'defence-king', icon: '🛡️', title: '수비왕', desc: '한 판에 공 15개 막기', goal: 15, unit: '개', stat: (r) => r.blocks },
  { id: 'score-300', icon: '🏆', title: '300점 돌파', desc: '한 판에 300점 이상', goal: 300, unit: '점', stat: (r) => r.score },
  { id: 'all-rounder', icon: '🌈', title: '올라운더', desc: '7개 포지션을 모두 뛰어 보기 (교체 포함)', goal: POSITION_KEYS.length, unit: '개', stat: null },
]);

export function emptyProfile() {
  return { badges: {}, played: [], best: {} };
}

const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** 배지 목록 하나로 저장값 읽기 · 진행도 · 결과 반영 함수를 만든다 */
export function createBadgeBook(badges) {
  /** 저장된 값을 안전하게 읽는다 (깨졌거나 예전 형식이면 빈 값으로) */
  function parse(textOrObject) {
    try {
      const raw = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
      const got = {};
      const best = {};
      for (const b of badges) {
        if (typeof raw?.badges?.[b.id] === 'string') got[b.id] = raw.badges[b.id];
        if (b.stat && count(raw?.best?.[b.id]) > 0) best[b.id] = Math.min(count(raw.best[b.id]), 1_000_000);
      }
      const played = Array.isArray(raw?.played) ? raw.played.filter((p) => POSITION_KEYS.includes(p)) : [];
      return { badges: got, played: [...new Set(played)], best };
    } catch {
      return emptyProfile();
    }
  }

  /** 배지까지의 진행도 { value, goal } (value는 goal을 넘지 않는다) */
  function progressOf(badge, profile) {
    const value = badge.stat ? (profile.best?.[badge.id] ?? 0) : profile.played.length;
    return { value: Math.min(value, badge.goal), goal: badge.goal };
  }

  /**
   * 한 판의 결과를 반영한다. 원래 profile은 바꾸지 않는다.
   * @returns {{ profile: object, earned: object[] }} earned: 이번에 새로 얻은 배지
   */
  function apply(profile, result, now = new Date()) {
    const played = [...new Set([...profile.played, ...(result.played ?? [result.position])])].filter((p) =>
      POSITION_KEYS.includes(p),
    );
    const best = { ...(profile.best ?? {}) };
    for (const b of badges) {
      if (!b.stat) continue;
      const v = count(b.stat(result));
      best[b.id] = b.total ? Math.min((best[b.id] ?? 0) + v, 1_000_000) : Math.max(best[b.id] ?? 0, v);
    }
    const next = { badges: { ...profile.badges }, played, best };
    const earned = [];
    for (const b of badges) {
      if (next.badges[b.id]) continue;
      const p = progressOf(b, next);
      if (p.value >= p.goal) {
        next.badges[b.id] = now.toISOString();
        earned.push(b);
      }
    }
    return { profile: next, earned };
  }

  return { badges, parse, progress: progressOf, apply };
}

// 존 스네이크 배지 (예전 이름 그대로 내보낸다)
const snakeBook = createBadgeBook(BADGES);
export const parseProfile = snakeBook.parse;
export const progress = snakeBook.progress;
export const applyResult = snakeBook.apply;

/** 올라운더 배지까지 아직 뛰어 보지 않은 포지션 (화면에 보여주는 순서대로) */
export function remainingPositions(profile) {
  return POSITION_KEYS.filter((p) => !profile.played.includes(p));
}
