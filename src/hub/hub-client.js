// 동아리 허브 클라이언트: 로그인 세션(이 기기에 저장) · 서버 호출 · 놀이터 기록 저장 위치
import { ApiError } from '../shared/api.js';
import { collectSave, applySave, SAVE_KEYS } from '../shared/save-bundle.js';

const SESSION_KEY = 'netball.session';
const MODE_KEY = 'netball.saveMode'; // 'device' | 'account'

/** store: main.js 의 안전한 localStorage 래퍼 { get, set } */
export function createHubClient(store) {
  let session = null;
  try {
    const s = JSON.parse(store.get(SESSION_KEY) ?? 'null');
    if (s?.token && s?.member?.name) session = s;
  } catch {
    session = null;
  }

  async function call(url, { method = 'GET', body, adminCode } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
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
    if (res.status === 401 && data?.error === 'not_logged_in') logout(); // 토큰이 만료됐거나 회원이 비활성화됨
    if (!res.ok) throw new ApiError(data?.error ?? 'server_error', res.status);
    return data;
  }

  function logout() {
    session = null;
    store.set(SESSION_KEY, '');
  }

  return {
    get session() {
      return session;
    },
    isAdmin: () => session?.member?.role === 'admin',
    async login(name, phone) {
      const out = await call('/api/auth', { method: 'POST', body: { name, phone } });
      session = { token: out.token, member: out.member };
      store.set(SESSION_KEY, JSON.stringify(session));
      return session.member;
    },
    logout,
    /** 등록 안 된 이름 + 번호로 가입 승인 요청 → { ok, already } */
    requestJoin: (name, phone, message) => call('/api/auth', { method: 'POST', body: { name, phone, join: true, message } }),
    /** 서버의 내 정보로 이름·역할을 새로 고친다 */
    async me() {
      const out = await call('/api/me');
      session = { ...session, member: out.member };
      store.set(SESSION_KEY, JSON.stringify(session));
      return out;
    },

    // ----- 놀이터 기록 저장 위치 -----
    get saveMode() {
      return session && store.get(MODE_KEY) === 'account' ? 'account' : 'device';
    },
    setSaveMode(mode) {
      store.set(MODE_KEY, mode === 'account' ? 'account' : 'device');
    },
    /** 이 기기 → 계정 */
    async uploadSave() {
      const save = collectSave((k) => store.get(k));
      return call('/api/me', { method: 'PUT', body: { save } });
    },
    /** 계정 → 이 기기. 반환: 쓴 키 목록 (계정에 기록이 없으면 []) */
    async downloadSave() {
      const out = await call('/api/me');
      return applySave(out.save?.data, (k, v) => store.set(k, v));
    },
    async accountSave() {
      return (await call('/api/me')).save;
    },
    isSaveKey: (k) => SAVE_KEYS.includes(k),
    /** 🏆 회장에게 자랑하기 → { ok, already } */
    brag: (kind) => call('/api/me', { method: 'POST', body: { brag: kind } }),

    // ----- 운영진 -----
    adminList: (code) => call('/api/admin', { adminCode: code }),
    adminAdd: (code, member) => call('/api/admin', { method: 'POST', body: member, adminCode: code }),
    adminUpdate: (code, patch) => call('/api/admin', { method: 'PATCH', body: patch, adminCode: code }),
    /** 엑셀 일괄 등록 → { results: [{ ok, member | error }] } */
    adminBulk: (code, members) => call('/api/admin', { method: 'POST', body: { members }, adminCode: code }),
    /** 자랑 목록을 봤다 (홈 알림 끄기) */
    adminBragsSeen: (code) => call('/api/admin', { method: 'PATCH', body: { bragsSeen: true }, adminCode: code }),
    /** 받은 메시지 처리: status 'new' | 'done', note (선택) */
    adminReport: (code, id, status, note) => call('/api/admin', { method: 'PATCH', body: { report: id, status, ...(note !== undefined ? { note } : {}) }, adminCode: code }),
    /** 가입 요청: action 'approve' | 'reject' */
    adminJoin: (code, id, action, role = 'member') => call('/api/admin', { method: 'PATCH', body: { join: id, action, role }, adminCode: code }),
  };
}

export const HUB_ERROR_TEXT = {
  not_member: '등록된 회원이 아니에요. 이름과 전화번호를 확인하거나 운영진에게 등록을 부탁해 주세요.',
  bad_login: '이름과 휴대폰 번호(010…)를 입력해 주세요.',
  too_fast: '잠시 뒤 다시 시도해 주세요.',
  not_logged_in: '로그인이 풀렸어요. 다시 로그인해 주세요.',
  not_admin: '운영진만 볼 수 있어요.',
  bad_admin_code: '운영진 코드가 맞지 않아요.',
  admin_not_configured: '서버에 운영진 코드가 아직 설정되지 않았어요.',
  storage_not_configured: '서버 저장소가 아직 설정되지 않았어요.',
  duplicate_phone: '이미 등록된 전화번호예요.',
  bad_member: '이름(20자까지)과 휴대폰 번호를 확인해 주세요.',
  cannot_demote_self: '자기 자신은 운영진에서 빼거나 비활성화할 수 없어요.',
  too_many: '한 번에 200명까지 등록할 수 있어요.',
  save_too_large: '기록이 너무 커서 저장하지 못했어요.',
  bad_brag: '자랑할 수 없는 항목이에요.',
  already_member: '이미 등록된 회원이에요. 그대로 로그인해 주세요.',
  join_done: '이미 처리된 가입 요청이에요.',
  bad_join: '가입 요청을 처리하지 못했어요.',
  bad_report: '메시지를 처리하지 못했어요.',
  network: '인터넷 연결을 확인해 주세요.',
};
