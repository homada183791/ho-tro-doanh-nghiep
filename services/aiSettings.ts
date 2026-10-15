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
});

const readStored = (): Partial<AISettings> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Cấu hình đang dùng = .env.local, ghi đè bởi những gì đã lưu trên web. */
export const getAISettings = (): AISettings => ({ ...envDefaults(), ...(readStored() || {}) });

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
