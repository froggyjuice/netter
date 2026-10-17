// Vercel 서버리스 함수: POST /api/log (브라우저 오류 자동 기록)
import { handleLog } from '../lib/log-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleLog({ method: req.method, query: req.query, body: req.body, ip });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
