// Vercel 서버리스 함수: GET/PUT/POST /api/me (내 정보 · 놀이터 기록 계정 저장 · 회장에게 자랑하기)
import { handleMe } from '../lib/hub-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleMe({ method: req.method, query: req.query, body: req.body, ip, headers: req.headers });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
