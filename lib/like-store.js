// 개발 중인 게임 '좋아요' 저장소. 점수·댓글 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/likes.json(로컬 개발) / 메모리(테스트)
// 인터페이스: counts(games) → { [game]: 수 } · add(game, voterHash) · remove(game, voterHash)
// 한 기기(voterHash)는 게임마다 한 번만 센다. 기기 토큰 원문은 저장하지 않는다(해시만).
import { promises as fs } from 'node:fs';
import path from 'node:path';

function countFrom(rows, games) {
  const out = Object.fromEntries(games.map((g) => [g, 0]));
  for (const r of rows) if (r.game in out) out[r.game] += 1;
  return out;
}

export function memoryLikeStore() {
  const rows = [];
  return {
    kind: 'memory',
    rows,
    async counts(games) {
      return countFrom(rows, games);
    },
    async add(game, voterHash) {
      if (!rows.some((r) => r.game === game && r.voter_hash === voterHash)) rows.push({ game, voter_hash: voterHash });
    },
    async remove(game, voterHash) {
      const i = rows.findIndex((r) => r.game === game && r.voter_hash === voterHash);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

export function fileLikeStore(file = path.join(process.cwd(), '.data', 'likes.json')) {
  let queue = Promise.resolve();
  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  };
  const write = async (rows) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(rows, null, 2));
  };
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {}); // 한 요청이 실패해도 다음 요청은 정상 처리
    return run;
  };
  return {
    kind: 'file',
    async counts(games) {
      await queue;
      return countFrom(await read(), games);
    },
    add(game, voterHash) {
      return serial(async () => {
        const rows = await read();
        if (rows.some((r) => r.game === game && r.voter_hash === voterHash)) return;
        rows.push({ game, voter_hash: voterHash, created_at: new Date().toISOString() });
        await write(rows);
      });
    },
    remove(game, voterHash) {
      return serial(async () => {
        const rows = await read();
        await write(rows.filter((r) => !(r.game === game && r.voter_hash === voterHash)));
      });
    },
  };
}

export function supabaseLikeStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/likes`;
  async function call(query, init = {}) {
    const res = await fetchImpl(`${base}${query}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  }
  return {
    kind: 'supabase',
    async counts(games) {
      // 좋아요 수는 많지 않으므로 game 열만 받아 세어 본다
      const q = new URLSearchParams({ select: 'game', game: `in.(${games.join(',')})` });
      return countFrom(await (await call(`?${q}`)).json(), games);
    },
    async add(game, voterHash) {
      // (game, voter_hash)가 이미 있으면 무시 (한 기기 한 번)
      await call('?on_conflict=game,voter_hash', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ game, voter_hash: voterHash }),
      });
    },
    async remove(game, voterHash) {
      const q = new URLSearchParams({ game: `eq.${game}`, voter_hash: `eq.${voterHash}` });
      await call(`?${q}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    },
  };
}

export function createLikeStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseLikeStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 파일시스템은 영구 저장소가 아니다
  return fileLikeStore();
}
