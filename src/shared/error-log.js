// 브라우저 오류 자동 기록: 생긴 오류를 /api/log 로 보낸다 (닉네임·이름은 보내지 않는다).
// 한 번 열 때(세션) 최대 5개, 같은 오류는 한 번만. 브라우저 확장·다른 사이트 스크립트의 오류는 버린다.
export const MAX_PER_SESSION = 5;

/**
 * 오류를 걸러 보내는 기록기 (window 없이 테스트할 수 있게 send · origin · storage 를 받는다)
 * @param {{ send: (payload) => void, getContext?: () => object, origin: string, storage?: { get(k), set(k, v) } }} opts
 */
export function createErrorLogger({ send, getContext = () => ({}), origin, storage = null }) {
  const seen = new Set();
  let sent = Number(storage?.get('netball.errors.sent') ?? 0) || 0;
  let last = null;

  /** info: { kind, message, source, line, col, stack } → 보냈으면 true */
  function report(info) {
    const message = String(info?.message ?? '').trim();
    if (!message) return false;
    const source = info.source ? String(info.source) : '';
    // 다른 출처 스크립트의 오류는 브라우저가 'Script error.'로만 알려준다 → 고칠 수 없으니 버림
    if (/^Script error\.?$/i.test(message) && !source) return false;
    // 브라우저 확장 · 다른 사이트 스크립트
    if (source && !source.startsWith(origin)) return false;
    if (/^(chrome|moz|safari)-extension:/.test(String(info.stack ?? ''))) return false;
    const key = `${info.kind}|${message}|${source}|${info.line ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    last = { kind: info.kind, message: message.slice(0, 200) };
    if (sent >= MAX_PER_SESSION) return false;
    sent += 1;
    storage?.set('netball.errors.sent', String(sent));
    send({
      kind: info.kind,
      message,
      source: source || undefined,
      line: Number.isInteger(info.line) ? info.line : undefined,
      col: Number.isInteger(info.col) ? info.col : undefined,
      stack: info.stack ? String(info.stack).slice(0, 1000) : undefined,
      context: getContext(),
    });
    return true;
  }

  return { report, lastError: () => last };
}

/** 브라우저에 기록기를 단다: error · unhandledrejection 이벤트 */
export function installErrorLogging({ getContext }) {
  const session = {
    get(k) {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        sessionStorage.setItem(k, v);
      } catch {
        /* 저장 못 해도 동작 */
      }
    },
  };
  const send = (payload) => {
    try {
      fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
    } catch {
      /* 오류 기록이 또 오류를 내지 않게 */
    }
  };
  const logger = createErrorLogger({ send, getContext, origin: location.origin, storage: session });
  window.addEventListener('error', (e) => {
    logger.report({ kind: 'error', message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    logger.report({ kind: 'rejection', message: r?.message ?? String(r), stack: r?.stack });
  });
  return logger;
}
