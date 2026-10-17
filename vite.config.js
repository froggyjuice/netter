import { defineConfig, loadEnv } from 'vite';

// 로컬 개발 서버(npm run dev)에서 /api/* 를 Vercel 함수와 똑같은 로직으로 처리한다.
const ROUTES = {
  '/api/score': ['/lib/score-handler.js', 'handleScore'],
  '/api/report': ['/lib/report-handler.js', 'handleReport'],
  '/api/comments': ['/lib/comment-handler.js', 'handleComments'],
  '/api/likes': ['/lib/like-handler.js', 'handleLikes'],
  '/api/log': ['/lib/log-handler.js', 'handleLog'],
  '/api/auth': ['/lib/hub-handler.js', 'handleAuth'],
  '/api/me': ['/lib/hub-handler.js', 'handleMe'],
  '/api/admin': ['/lib/hub-handler.js', 'handleAdmin'],
};

function devApi(mode) {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(mode, process.cwd(), '')); // .env 의 SUPABASE_* 를 읽는다
      for (const [route, [file, name]] of Object.entries(ROUTES)) {
        server.middlewares.use(route, async (req, res) => {
          try {
            const handle = (await server.ssrLoadModule(file))[name];
            const url = new URL(req.url, 'http://localhost');
            let body;
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              const text = Buffer.concat(chunks).toString('utf8');
              try {
                body = text ? JSON.parse(text) : undefined;
              } catch {
                body = null;
              }
            }
            const out = await handle({
              method: req.method,
              query: Object.fromEntries(url.searchParams),
              body,
              ip: req.socket.remoteAddress ?? 'local',
              headers: req.headers, // 로그인 토큰 · 운영진 코드
            });
            res.statusCode = out.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(out.body));
          } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'dev_api_error' }));
          }
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [devApi(mode)],
  // 오류 기록에 붙는 앱 버전 (Vercel 빌드면 커밋 앞 7자리)
  define: { __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)) },
  build: { chunkSizeWarningLimit: 1500 }, // Phaser 청크가 크다 (게임 시작 시에만 로드됨)
}));
