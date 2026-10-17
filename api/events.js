// Vercel 서버리스 함수: GET/POST /api/events (훈련 캘린더 · 참석 투표 · 포지션 배정)
import { handleEvents } from '../lib/event-handler.js';

export default async function handler(req, res) {
  const out = await handleEvents({ method: req.method, query: req.query, body: req.body, headers: req.headers });
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
