// Vercel 서버리스 함수: POST /api/report (오류·아이디어 신고)
import { handleReport } from '../lib/report-handler.js';

export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';

  const out = await handleReport({ method: req.method, body: req.body, ip });

  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
