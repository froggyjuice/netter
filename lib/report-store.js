// 오류·아이디어 신고 저장소. 점수 저장소(stores.js)와 같은 방식:
//   Supabase(배포) / 파일 .data/reports.json(로컬 개발) / 메모리(테스트)
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function memoryReportStore() {
  const rows = [];
  return {
    kind: 'memory',
    rows,
    async insert(row) {
      rows.push({ ...row, created_at: new Date().toISOString() });
    },
  };
}

export function fileReportStore(file = path.join(process.cwd(), '.data', 'reports.json')) {
  let queue = Promise.resolve(); // 동시에 들어온 쓰기를 순서대로 처리
  return {
    kind: 'file',
    insert(row) {
      const job = queue.then(async () => {
        let rows = [];
        try {
          rows = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
        rows.push({ ...row, created_at: new Date().toISOString() });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(rows, null, 2));
      });
      queue = job.catch(() => {}); // 실패해도 다음 쓰기는 정상 처리
      return job;
    },
  };
}

export function supabaseReportStore({ url, key, fetchImpl = globalThis.fetch }) {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/reports`;
  return {
    kind: 'supabase',
    async insert(row) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ kind: row.kind, message: row.message, meta: row.meta ?? null }),
      });
      if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    },
  };
}

export function createReportStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseReportStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 환경의 파일시스템은 영구 저장소가 아니다
  return fileReportStore();
}
