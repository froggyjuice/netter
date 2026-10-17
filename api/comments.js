// Vercel 서버리스 함수: GET/POST/DELETE /api/comments (로그인 없는 댓글)
import { handleComments } from '../lib/comment-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleComments({ method: req.method, query: req.query, body: req.body, ip });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
