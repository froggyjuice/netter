// Vercel 서버리스 함수: GET/PATCH /api/admin (운영진 코드: 받은 메시지 · 자랑 목록)
import { handleAdmin } from '../lib/hub-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleAdmin({ method: req.method, query: req.query, body: req.body, ip, headers: req.headers });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
