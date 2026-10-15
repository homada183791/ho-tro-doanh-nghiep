import path from 'path';
import http from 'http';
import https from 'https';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Proxy /ai-api cho npm run dev (tránh lỗi CORS khi gọi API chuẩn OpenAI từ trình duyệt).
 * Địa chỉ đích lấy từ header x-ai-target (do "Cài đặt API" trên web gửi kèm),
 * nếu không có thì dùng VITE_AI_BASE_URL trong .env.local.
 * Dùng http/https của Node (giống proxy mặc định của Vite) để chạy ổn định trên Windows.
 */
const aiProxy = (fallbackBase: string): Plugin => ({
  name: 'legalbiz-ai-proxy',
  configureServer(server) {
    server.middlewares.use('/ai-api', (req, res) => {
      const targetHeader = req.headers['x-ai-target'];
      const base = String((Array.isArray(targetHeader) ? targetHeader[0] : targetHeader) || fallbackBase).replace(/\/+$/, '');
      let target: URL;
      try {
        target = new URL(base + (req.url || ''));
        if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
      } catch {
        res.statusCode = 400;
        res.end('Địa chỉ API không hợp lệ: ' + base);
        return;
      }

      // Chỉ chuyển tiếp các header cần thiết (Authorization, Content-Type, header x-... riêng của nhà cung cấp)
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        const key = k.toLowerCase();
        const keep =
          ['authorization', 'content-type', 'accept', 'content-length'].includes(key) ||
          (key.startsWith('x-') && key !== 'x-ai-target' && !key.startsWith('x-forwarded'));
        if (keep) headers[key] = Array.isArray(v) ? v.join(', ') : v;
      }
      headers['host'] = target.host;

      const lib = target.protocol === 'https:' ? https : http;
      const upstream = lib.request(
        target,
        { method: req.method, headers, timeout: 300_000 },
        (up) => {
          res.statusCode = up.statusCode || 502;
          for (const [k, v] of Object.entries(up.headers)) {
            if (v !== undefined && !['connection', 'transfer-encoding'].includes(k)) res.setHeader(k, v as any);
          }
          up.pipe(res);
        }
      );
      upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('Quá thời gian chờ (5 phút)'), { code: 'ETIMEDOUT' })));
      upstream.on('error', (e: any) => {
        console.error('[ai-proxy]', target.href, e);
        if (res.headersSent) return res.end();
        res.statusCode = 502;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        const hint =
          e?.code === 'ENOTFOUND' ? ' (không tìm thấy tên miền, kiểm tra Địa chỉ API hoặc mạng)'
          : e?.code === 'ECONNREFUSED' ? ' (máy chủ từ chối kết nối)'
          : e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' ? ' (mạng chậm/bị chặn, thử tắt VPN/tường lửa hoặc thử lại)'
          : /certificate|CERT|SSL|TLS/i.test(String(e?.code || e?.message)) ? ' (lỗi chứng chỉ HTTPS, có thể do phần mềm diệt virus/proxy chặn)'
          : '';
        res.end(`Proxy không kết nối được tới ${target.host}: ${e?.code || ''} ${e?.message || e}${hint}`);
      });
      req.pipe(upstream);
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), aiProxy(env.VITE_AI_BASE_URL || 'https://api.openai.com/v1')],
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
