import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const html = readFileSync(join(process.cwd(), 'public/index.html'), 'utf8');
  res.status(200).send(html);
}
