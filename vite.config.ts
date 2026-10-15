import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Proxy /ai-api cho npm run dev (tránh lỗi CORS khi gọi API chuẩn OpenAI từ trình duyệt).
 * Địa chỉ đích lấy từ header x-ai-target (do "Cài đặt API" trên web gửi kèm),
 * nếu không có thì dùng VITE_AI_BASE_URL trong .env.local.
 */
const aiProxy = (fallbackBase: string): Plugin => ({
  name: 'legalbiz-ai-proxy',
  configureServer(server) {
    server.middlewares.use('/ai-api', async (req, res) => {
      try {
        const targetHeader = req.headers['x-ai-target'];
        const base = String((Array.isArray(targetHeader) ? targetHeader[0] : targetHeader) || fallbackBase).replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(base)) {
          res.statusCode = 400;
          res.end('Địa chỉ API không hợp lệ: ' + base);
          return;
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue;
          if (['host', 'connection', 'content-length', 'origin', 'referer', 'x-ai-target', 'accept-encoding'].includes(k)) continue;
          headers[k] = Array.isArray(v) ? v.join(', ') : v;
        }
        const upstream = await fetch(base + (req.url || ''), {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        res.statusCode = upstream.status;
        upstream.headers.forEach((value, key) => {
          if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) res.setHeader(key, value);
        });
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (e: any) {
        res.statusCode = 502;
        res.end('Proxy không kết nối được tới máy chủ AI: ' + (e?.message || e));
      }
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
