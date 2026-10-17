// Vercel 서버리스 함수: GET/POST /api/likes (개발 중인 게임 좋아요)
import { handleLikes } from '../lib/like-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleLikes({ method: req.method, query: req.query, body: req.body, ip });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
