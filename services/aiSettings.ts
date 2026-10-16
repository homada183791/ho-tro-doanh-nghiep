/// <reference types="vite/client" />
/**
 * Cấu hình AI có thể sửa ngay trên web (nút "Cài đặt API" ở thanh bên).
 * - Giá trị lưu trong trình duyệt (localStorage) được ưu tiên.
 * - Nếu chưa lưu gì trên web thì dùng giá trị trong file .env.local như trước.
 */

export type Provider = "gemini" | "openai";

export interface AISettings {
  provider: Provider;
  // Google Gemini
  geminiKey: string;
  geminiModel: string;
  geminiModelStrong: string;
  // API chuẩn OpenAI (dịch vụ trung gian, OpenAI, DeepSeek, OpenRouter...)
  baseUrl: string;
  apiKey: string;
  wire: "chat" | "responses";
  model: string;
  modelStrong: string;
  reasoning: "" | "low" | "medium" | "high";
  jsonMode: "json_schema" | "json_object";
  headers: string; // JSON
  // Số yêu cầu tối đa mỗi phút (0 = không giới hạn). Key Gemini miễn phí nên đặt khoảng 5.
  rpm: number;
}

const STORAGE_KEY = "legalbiz.aiSettings.v1";
export const AI_SETTINGS_EVENT = "legalbiz:ai-settings-changed";

const env = import.meta.env;

/** Giá trị mặc định lấy từ .env.local */
export const envDefaults = (): AISettings => ({
  // Mặc định Gemini; chỉ dùng chuẩn OpenAI khi .env.local chọn rõ, hoặc chỉ có key OpenAI
  provider:
    env.VITE_AI_PROVIDER === "openai" || (env.VITE_AI_PROVIDER !== "gemini" && env.VITE_AI_API_KEY && !env.VITE_GEMINI_API_KEY)
      ? "openai"
      : "gemini",
  geminiKey: String(env.VITE_GEMINI_API_KEY || ""),
  geminiModel: String(env.VITE_GEMINI_MODEL || ""),
  geminiModelStrong: String(env.VITE_GEMINI_MODEL_STRONG || ""),
  baseUrl: String(env.VITE_AI_BASE_URL || "https://api.openai.com/v1"),
  apiKey: String(env.VITE_AI_API_KEY || ""),
  wire: env.VITE_AI_WIRE_API === "responses" ? "responses" : "chat",
  model: String(env.VITE_AI_MODEL || "gpt-5.4-mini"),
  modelStrong: String(env.VITE_AI_MODEL_STRONG || ""),
  reasoning: (["low", "medium", "high"].includes(String(env.VITE_AI_REASONING)) ? env.VITE_AI_REASONING : "") as AISettings["reasoning"],
  jsonMode: env.VITE_AI_JSON_MODE === "json_object" ? "json_object" : "json_schema",
  headers: env.VITE_AI_HEADERS ? String(env.VITE_AI_HEADERS).replace(/^'|'$/g, "") : "",
  rpm: Math.max(0, Number(env.VITE_AI_RPM) || 0),
});

const readStored = (): Partial<AISettings> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/* ---------- Chế độ máy chủ quản lý key ----------
 * Khi web chạy bằng npm run dev / start-public.bat, máy chủ giữ key và cấu hình.
 * Trình duyệt chỉ nhận cấu hình KHÔNG có key, và gọi AI qua /ai-api, /gemini-api của máy chủ.
 */
export interface ServerState {
  isAdmin: boolean; // đang mở trên chính máy chủ (localhost) -> được sửa cấu hình
  source: 'file' | 'env';
  hasApiKey: boolean;
  hasGeminiKey: boolean;
  apiKeyHint?: string;
  geminiKeyHint?: string;
  settings: Partial<AISettings>;
}
let serverState: ServerState | null = null;
/** Dấu hiệu "có key trên máy chủ" (không phải key thật). */
export const SERVER_KEY = "(máy chủ)";

/** Gọi khi khởi động app. Nếu máy chủ không hỗ trợ thì dùng chế độ cũ (key lưu trên trình duyệt). */
export const loadServerConfig = async (): Promise<ServerState | null> => {
  try {
    const r = await fetch("/__ai/config", { cache: "no-store" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error("no server config");
    serverState = await r.json();
    // Xoá key cũ từng lưu trên trình duyệt (giờ key chỉ nằm trên máy chủ)
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* bỏ qua */ }
  } catch {
    serverState = null;
  }
  return serverState;
};
export const getServerState = () => serverState;
export const isServerMode = () => serverState !== null;

/** Lưu cấu hình lên máy chủ (chỉ làm được trên chính máy chủ). Key để trống = giữ key cũ. */
export const saveServerConfig = async (settings: AISettings, keys: { apiKey?: string; geminiKey?: string }) => {
  const { apiKey, geminiKey, ...rest } = settings;
  const r = await fetch("/__ai/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings: rest, ...keys }),
  });
  if (!r.ok) throw new Error((await r.text()) || `Lỗi ${r.status}`);
  await loadServerConfig();
  notify();
};

/** Xoá cấu hình đã lưu trên máy chủ, quay về dùng .env.local của máy chủ. */
export const resetServerConfig = async () => {
  const r = await fetch("/__ai/config", { method: "DELETE" });
  if (!r.ok) throw new Error((await r.text()) || `Lỗi ${r.status}`);
  await loadServerConfig();
  notify();
};

/** Cấu hình đang dùng: của máy chủ (nếu có), nếu không thì .env.local + cài đặt lưu trên trình duyệt. */
export const getAISettings = (): AISettings => {
  if (serverState) {
    return {
      ...envDefaults(),
      ...serverState.settings,
      apiKey: serverState.hasApiKey ? SERVER_KEY : "",
      geminiKey: serverState.hasGeminiKey ? SERVER_KEY : "",
    } as AISettings;
  }
  return { ...envDefaults(), ...(readStored() || {}) };
};

/** Có đang dùng cấu hình lưu trên web không (thay vì .env.local). */
export const hasWebSettings = (): boolean => readStored() !== null;

const notify = () => {
  try {
    window.dispatchEvent(new Event(AI_SETTINGS_EVENT));
  } catch { /* bỏ qua */ }
};

export const saveAISettings = (s: AISettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    throw new Error("Trình duyệt không cho lưu cài đặt (có thể đang ở chế độ ẩn danh).");
  }
  notify();
};

/** Xoá cài đặt trên web, quay về dùng .env.local */
export const resetAISettings = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* bỏ qua */ }
  notify();
};

/** Đã có key cho nhà cung cấp đang chọn chưa. */
export const isConfigured = (s: AISettings = getAISettings()): boolean =>
  s.provider === "gemini" ? !!s.geminiKey.trim() : !!s.apiKey.trim();

/** Hiện key dạng rút gọn: AQ.Ab8R…eIQ */
export const maskKey = (k: string): string => {
  const t = k.trim();
  if (!t) return "(chưa có)";
  if (t.length <= 10) return "•".repeat(t.length);
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
};
