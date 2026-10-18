// Vercel 서버리스 함수: POST/GET /api/brag ('회장에게 자랑하기' · 받은 축하)
import { handleBrag } from '../lib/hub-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleBrag({ method: req.method, query: req.query, body: req.body, ip });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
