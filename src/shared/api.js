// 리더보드 API 클라이언트 (/api/score)
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('network', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 본문이 JSON이 아닌 경우 */
  }
  if (!res.ok) throw new ApiError(data?.error ?? 'server_error', res.status);
  return data;
}

export async function fetchTop(game, limit = 10) {
  const data = await request(`/api/score?game=${encodeURIComponent(game)}&limit=${limit}`);
  return data.scores ?? [];
}

/** payload: { game, nickname, score, durationMs, meta } → { ok, rank } */
export function submitScore(payload) {
  return request('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** payload: { kind: 'bug'|'idea', message, context } → { ok } */
export function submitReport(payload) {
  return request('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** 댓글 목록 (최신순). before: 이 id보다 오래된 것만 (더 보기) */
export async function fetchComments({ limit = 20, before = null } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) q.set('before', String(before));
  const data = await request(`/api/comments?${q}`);
  return data.comments ?? [];
}

/** payload: { nickname, message } → { comment, deleteToken } */
export function postComment(payload) {
  return request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** payload: { id, token } → { ok } */
export function deleteComment(payload) {
  return request('/api/comments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** 개발 중인 게임 좋아요 수 { [game]: 수 } */
export async function fetchLikes() {
  const data = await request('/api/likes');
  return data.counts ?? {};
}

/** payload: { game, token, like } → { ok, counts } */
export function sendLike(payload) {
  return request('/api/likes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export const ERROR_TEXT = {
  bad_nickname: '닉네임은 한글·영문·숫자·공백·_-. 로 12자까지 쓸 수 있어요.',
  bad_score: '점수를 확인할 수 없어요.',
  implausible_score: '플레이 기록과 점수가 맞지 않아 등록하지 못했어요.',
  too_fast: '조금 전에 등록했어요. 잠시 뒤 다시 눌러 주세요.',
  bad_message: '내용을 2자 이상 500자 이하로 적어 주세요.',
  storage_not_configured: '서버의 점수 저장소가 아직 설정되지 않았어요.',
  network: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
};
