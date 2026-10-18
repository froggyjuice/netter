// 서버 호출: '회장에게 자랑하기' · 운영진 화면 (로그인 없음 — 회원은 동아리 앱이 맡는다)
import { ApiError } from '../shared/api.js';

const BRAGS_KEY = 'netball.bragIds'; // 이 기기에서 한 자랑 id (축하가 왔는지 보려고)
const CHEERS_SEEN_KEY = 'netball.cheersSeen'; // 이 기기에서 이미 본 축하 id
const NAME_KEY = 'netball.bragName'; // 자랑할 때 적은 이름 (다음에 다시 쓰려고)

/** store: main.js 의 안전한 localStorage 래퍼 { get, set } */
export function createHubClient(store) {
  const ids = (key) => {
    try {
      const v = JSON.parse(store.get(key) ?? '[]');
      return Array.isArray(v) ? v.filter(Number.isInteger) : [];
    } catch {
      return [];
    }
  };
  const addId = (key, id) => store.set(key, JSON.stringify([...new Set([...ids(key), id])].slice(-20)));

  async function call(url, { method = 'GET', body, adminCode } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminCode) headers['x-admin-code'] = adminCode;
    let res;
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError('network', 0);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* 본문 없음 */
    }
    if (!res.ok) throw new ApiError(data?.error ?? 'server_error', res.status);
    return data;
  }

  return {
    get bragName() {
      return store.get(NAME_KEY) ?? '';
    },
    /** 🏆 회장에게 자랑하기 → { ok, id, already } */
    async brag(name, kind) {
      const out = await call('/api/brag', { method: 'POST', body: { name, kind } });
      store.set(NAME_KEY, name.trim());
      addId(BRAGS_KEY, out.id);
      return out;
    },
    /** 이 기기에서 한 자랑 중 아직 안 본 축하 */
    async newCheers() {
      const mine = ids(BRAGS_KEY);
      if (!mine.length) return [];
      const seen = ids(CHEERS_SEEN_KEY);
      return (await call(`/api/brag?ids=${mine.join(',')}`)).cheers.filter((c) => !seen.includes(c.id));
    },
    cheersSeen(list) {
      for (const c of list) addId(CHEERS_SEEN_KEY, c.id);
    },

    // ----- 운영진 (운영진 코드 하나) -----
    adminList: (code) => call('/api/admin', { adminCode: code }),
    /** 자랑에 축하 보내기 (cheer: 한마디, 비우면 기본 문구) */
    adminCheer: (code, id, cheer) => call('/api/admin', { method: 'PATCH', body: { brag: id, cheer }, adminCode: code }),
    /** 자랑 목록을 봤다 */
    adminBragsSeen: (code) => call('/api/admin', { method: 'PATCH', body: { bragsSeen: true }, adminCode: code }),
    /** 받은 메시지 처리: status 'new' | 'done', note (선택) */
    adminReport: (code, id, status, note) => call('/api/admin', { method: 'PATCH', body: { report: id, status, ...(note !== undefined ? { note } : {}) }, adminCode: code }),
  };
}

export const HUB_ERROR_TEXT = {
  too_fast: '잠시 뒤 다시 시도해 주세요.',
  bad_admin_code: '운영진 코드가 맞지 않아요.',
  admin_not_configured: '서버에 운영진 코드가 아직 설정되지 않았어요.',
  storage_not_configured: '서버 저장소가 아직 설정되지 않았어요.',
  bad_name: '이름을 1~20자로 적어 주세요.',
  bad_brag: '자랑할 수 없는 항목이에요.',
  not_found: '찾지 못했어요. 새로고침해 주세요.',
  bad_report: '메시지를 처리하지 못했어요.',
  network: '인터넷 연결을 확인해 주세요.',
};
