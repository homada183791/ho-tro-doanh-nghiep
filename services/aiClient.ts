/// <reference types="vite/client" />
/**
 * Lớp chuyển đổi (adapter) cho mọi API chuẩn OpenAI (OpenAI, Codex/GPT qua dịch vụ trung gian,
 * DeepSeek, Qwen, OpenRouter...). Hỗ trợ cả Chat Completions và Responses API.
 *
 * Giữ nguyên cách gọi kiểu Gemini để không phải sửa các prompt trong gemini.ts:
 *   ai.models.generateContent({ model, contents, config }) -> { text }
 *   ai.chats.create({ model, config }).sendMessage({ message }) -> { text }
 *
 * Cấu hình trong file .env.local (KHÔNG commit file này):
 *   VITE_AI_BASE_URL=https://api.openai.com/v1      (địa chỉ API của nhà cung cấp)
 *   VITE_AI_API_KEY=key_cua_ban
 *   VITE_AI_WIRE_API=chat                            (chat | responses)
 *   VITE_AI_MODEL=gpt-5.4-mini                       (model cho tác vụ thường)
 *   VITE_AI_MODEL_STRONG=gpt-5.4                     (model cho tác vụ khó, tuỳ chọn)
 *   VITE_AI_REASONING=low                            (low | medium | high, tuỳ chọn, chỉ cho responses)
 *   VITE_AI_JSON_MODE=json_schema                    (json_schema | json_object, tuỳ chọn)
 *   VITE_AI_HEADERS={"x-ten-header":"gia-tri"}       (header bổ sung dạng JSON, tuỳ chọn)
 */

import { GoogleGenAI } from "@google/genai";
import { getAISettings, AISettings, AI_SETTINGS_EVENT, isServerMode, getServerState } from "./aiSettings";

/**
 * Cấu hình được đọc lại MỖI LẦN GỌI từ getAISettings() (cài đặt trên web, nếu không có thì .env.local),
 * nên đổi key / model trên web có hiệu lực ngay, không cần chạy lại npm run dev.
 *   provider = gemini  -> gọi thẳng Google Gemini (giữ được Google Search, đọc PDF/ảnh)
 *   provider = openai  -> dùng API chuẩn OpenAI theo baseUrl / apiKey
 */
const env = import.meta.env;
const cfg = (): AISettings => getAISettings();
const baseUrlOf = (s: AISettings) => (s.baseUrl.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");

// Nếu dịch vụ không hỗ trợ json_schema thì tự chuyển sang json_object; đặt lại khi đổi cài đặt.
let jsonFallback = false;
try {
  window.addEventListener(AI_SETTINGS_EVENT, () => { jsonFallback = false; });
} catch { /* không chạy trong trình duyệt */ }
const jsonModeOf = (s: AISettings): "json_schema" | "json_object" =>
  jsonFallback || s.jsonMode === "json_object" ? "json_object" : "json_schema";

const headersOf = (s: AISettings): Record<string, string> => {
  if (!s.headers.trim()) return {};
  try {
    return JSON.parse(s.headers);
  } catch {
    console.warn("[AI] Header bổ sung không phải JSON hợp lệ, bỏ qua.");
    return {};
  }
};

/** Các tên model Gemini cũ trong code được đổi sang model đã cấu hình. */
const resolveModel = (geminiModel?: string): string => {
  const s = cfg();
  const model = s.model.trim() || "gpt-5.4-mini";
  if (geminiModel && /pro/i.test(geminiModel)) return s.modelStrong.trim() || model;
  return model;
};

type Part = { text?: string; inlineData?: { data: string; mimeType: string } };
type Contents = string | { parts: Part[] };

/** Nội dung tin nhắn ở dạng trung gian, sau đó đổi sang định dạng của từng loại API. */
type Item =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string }
  | { kind: "file"; dataUrl: string; filename: string };
type Msg = { role: "system" | "user" | "assistant"; items: Item[] };

/** Chuyển schema kiểu Gemini (Type.OBJECT, Type.STRING...) sang JSON Schema chuẩn. */
const toJsonSchema = (s: any): any => {
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toJsonSchema(v);
  }
  if (s.required) out.required = s.required;
  return out;
};

const toItems = (contents: Contents): Item[] => {
  if (typeof contents === "string") return [{ kind: "text", text: contents }];
  return contents.parts.map((p, i): Item => {
    if (p.inlineData) {
      const { data, mimeType } = p.inlineData;
      const dataUrl = `data:${mimeType};base64,${data}`;
      if (mimeType === "application/pdf") return { kind: "file", dataUrl, filename: `tai-lieu-${i}.pdf` };
      return { kind: "image", dataUrl };
    }
    return { kind: "text", text: p.text || "" };
  });
};

const textOf = (items: Item[]) => items.map((it) => (it.kind === "text" ? it.text : "")).join("\n");

/** Bỏ ```json ... ``` nếu model lỡ bọc kết quả trong khối code. */
const cleanJson = (text: string): string =>
  text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

/**
 * Tìm tất cả khối JSON hoàn chỉnh trong câu trả lời (model hay trả kèm chữ, hoặc 2 khối JSON liền nhau),
 * rồi chọn khối có nhiều nội dung nhất. Trả về chuỗi JSON hợp lệ, hoặc null nếu không có.
 */
const pickJson = (text: string): string | null => {
  const t = cleanJson(text);
  try {
    JSON.parse(t);
    return t;
  } catch { /* lọc tiếp bên dưới */ }
  const found: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { if (depth > 0) inStr = true; continue; }
    if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if ((c === "}" || c === "]") && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = t.slice(start, i + 1);
        try { JSON.parse(chunk); found.push(chunk); } catch { /* bỏ khối hỏng */ }
        start = -1;
      }
    }
  }
  if (!found.length) return null;
  return found.reduce((a, b) => (b.length > a.length ? b : a));
};

type JsonFormat = { mode: "json_schema"; schema: any } | { mode: "json_object" } | null;

// ---------- Chat Completions ----------
const buildChatBody = (model: string, msgs: Msg[], fmt: JsonFormat) => {
  const messages = msgs.map((m) => {
    if (m.role !== "user") return { role: m.role, content: textOf(m.items) };
    const onlyText = m.items.every((it) => it.kind === "text");
    if (onlyText) return { role: "user", content: textOf(m.items) };
    return {
      role: "user",
      content: m.items.map((it) =>
        it.kind === "text"
          ? { type: "text", text: it.text }
          : it.kind === "image"
          ? { type: "image_url", image_url: { url: it.dataUrl } }
          : { type: "file", file: { filename: it.filename, file_data: it.dataUrl } }
      ),
    };
  });
  const body: any = { model, messages };
  if (fmt?.mode === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: { name: "ket_qua", schema: fmt.schema, strict: false } };
  } else if (fmt?.mode === "json_object") {
    body.response_format = { type: "json_object" };
  }
  return body;
};

const readChat = (data: any): string => data.choices?.[0]?.message?.content ?? "";

// ---------- Responses API ----------
const buildResponsesBody = (model: string, msgs: Msg[], fmt: JsonFormat) => {
  // Hướng dẫn hệ thống gửi dạng tin nhắn "developer" vì một số dịch vụ trung gian ghi đè trường instructions.
  const input = msgs
    .map((m) => ({
      role: m.role === "system" ? "developer" : m.role,
      content: m.items.map((it) => {
        if (m.role === "assistant") return { type: "output_text", text: it.kind === "text" ? it.text : "" };
        if (it.kind === "text") return { type: "input_text", text: it.text };
        if (it.kind === "image") return { type: "input_image", image_url: it.dataUrl };
        return { type: "input_file", filename: it.filename, file_data: it.dataUrl };
      }),
    }));
  const body: any = { model, input, store: false };
  const reasoning = cfg().reasoning;
  if (reasoning) body.reasoning = { effort: reasoning };
  if (fmt?.mode === "json_schema") {
    body.text = { format: { type: "json_schema", name: "ket_qua", schema: fmt.schema, strict: false } };
  } else if (fmt?.mode === "json_object") {
    body.text = { format: { type: "json_object" } };
  }
  return body;
};

const readResponses = (data: any): string => {
  if (typeof data.output_text === "string") return data.output_text;
  const texts: string[] = [];
  for (const out of data.output ?? []) {
    if (out.type !== "message") continue;
    for (const c of out.content ?? []) if (c.type === "output_text" && c.text) texts.push(c.text);
  }
  return texts.join("");
};

// ---------- Hạn mức (429): giãn yêu cầu + tự chờ rồi gửi lại ----------
export const AI_WAIT_EVENT = "legalbiz:ai-waiting";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emitWait = (seconds: number, reason: "rpm" | "quota") => {
  try {
    window.dispatchEvent(new CustomEvent(AI_WAIT_EVENT, { detail: { seconds, reason } }));
  } catch { /* bỏ qua */ }
};

const errText = (e: any) => String(e?.message || e);
export const isQuotaError = (e: any) => e?.status === 429 || /RESOURCE_EXHAUSTED|"code"\s*:\s*429|quota/i.test(errText(e));
/** Model không có hạn mức miễn phí (limit: 0) hoặc key không được dùng model này. */
const isModelUnavailable = (e: any) => {
  const m = errText(e);
  return (isQuotaError(e) && /limit:\s*0\b/.test(m)) || e?.status === 404 || /NOT_FOUND|is not found|not supported for generateContent|does not have access/i.test(m);
};
/** Nên thử model khác: model không có lượt / không tồn tại, hoặc đã hết lượt trong ngày của riêng model đó. */
const shouldFallback = (e: any) => {
  const raw = { message: e?.raw || errText(e), status: e?.status };
  return isModelUnavailable(e) || isModelUnavailable(raw) || (isQuotaError(e) && /PerDay|per day/i.test(raw.message));
};
const parseRetrySeconds = (msg: string): number | null => {
  const m = msg.match(/retry in ([\d.]+)\s*s/i) || msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i) || msg.match(/retry-after:\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
};

const quotaError = (e: any, model: string): Error => {
  const m = errText(e);
  let text: string;
  if (/limit:\s*0\b/.test(m)) {
    text = `Model ${model} không có lượt miễn phí với key này. Vào "Cài đặt API" chọn model khác (ví dụ gemini-3-flash-preview hoặc gemini-2.5-flash), hoặc bật thanh toán cho key.`;
  } else if (/PerDay|per day/i.test(m)) {
    text = `Đã hết lượt miễn phí trong ngày của model ${model}. Đổi sang model khác trong "Cài đặt API", bật thanh toán cho key, hoặc đợi hạn mức được làm mới.`;
  } else {
    text = `Vượt giới hạn số yêu cầu mỗi phút của model ${model}. Đã tự chờ và thử lại nhưng vẫn bị chặn; đợi khoảng 1 phút rồi thử lại.`;
  }
  const err: any = new Error(text);
  err.status = 429;
  err.raw = m;
  return err;
};

// Giãn yêu cầu theo "Giới hạn yêu cầu/phút" trong cài đặt (0 = không giới hạn)
let recentCalls: number[] = [];
const throttle = async () => {
  for (;;) {
    const rpm = Math.max(0, Math.floor(Number(cfg().rpm) || 0));
    if (!rpm) return;
    const now = Date.now();
    recentCalls = recentCalls.filter((t) => now - t < 60_000);
    if (recentCalls.length < rpm) {
      recentCalls.push(now);
      return;
    }
    const wait = 60_000 - (now - recentCalls[0]) + 300;
    emitWait(Math.ceil(wait / 1000), "rpm");
    await sleep(wait);
  }
};

/** Chạy một lần gọi AI; nếu bị 429 theo phút thì chờ đúng thời gian Google yêu cầu rồi gửi lại (tối đa 3 lần). */
const withQuota = async <T>(model: string, fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    await throttle();
    try {
      return await fn();
    } catch (e: any) {
      if (!isQuotaError(e)) throw e;
      const m = errText(e);
      const secs = parseRetrySeconds(m);
      const hopeless = /limit:\s*0\b|PerDay|per day/i.test(m) || (secs !== null && secs > 90);
      if (hopeless || attempt > 3) throw quotaError(e, model);
      const wait = (secs ?? 15 * attempt) + 1;
      emitWait(Math.ceil(wait), "quota");
      await sleep(wait * 1000);
    }
  }
};

// ---------- Gửi yêu cầu ----------
const callAI = (model: string, msgs: Msg[], fmt: JsonFormat): Promise<string> =>
  withQuota(model, () => callAIOnce(model, msgs, fmt));

const callAIOnce = async (model: string, msgs: Msg[], fmt: JsonFormat): Promise<string> => {
  const s = cfg();
  const managed = isServerMode();
  const API_KEY = s.apiKey.trim();
  const BASE_URL = baseUrlOf(s);
  const WIRE = s.wire;
  if (!API_KEY) {
    throw new Error(managed
      ? "Máy chủ chưa có API key. Người quản trị cần mở \"Cài đặt API\" trên máy chủ để nhập."
      : "Chưa có API key. Bấm \"Cài đặt API\" ở thanh bên trái để nhập.");
  }
  const endpoint = WIRE === "responses" ? "/responses" : "/chat/completions";
  const body = WIRE === "responses" ? buildResponsesBody(model, msgs, fmt) : buildChatBody(model, msgs, fmt);
  // Khi chạy npm run dev: gửi qua proxy của Vite (/ai-api) để tránh lỗi CORS; proxy đọc địa chỉ đích từ header.
  // Máy chủ quản lý key: luôn gửi qua máy chủ, không kèm key (máy chủ tự gắn).
  const url = managed || env.DEV ? `/ai-api${endpoint}` : `${BASE_URL}${endpoint}`;
  const devHeaders: Record<string, string> = !managed && env.DEV ? { "x-ai-target": BASE_URL } : {};
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: managed
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}`, ...headersOf(s), ...devHeaders },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Không kết nối được tới ${BASE_URL}. Kiểm tra địa chỉ API trong "Cài đặt API" và mạng Internet.`);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    if (env.DEV && res.status === 404 && !detail.trim()) {
      throw new Error("Proxy /ai-api chưa hoạt động. Hãy thay file vite.config.ts mới rồi tắt (Ctrl+C) và chạy lại npm run dev.");
    }
    if (res.status === 401 || res.status === 403) {
      const err: any = new Error(`API key bị từ chối (${res.status}). Kiểm tra lại key trong "Cài đặt API". Chi tiết: ${detail}`);
      err.status = res.status;
      throw err;
    }
    const retryAfter = res.headers.get("retry-after");
    const err: any = new Error(`AI API lỗi ${res.status}: ${detail}${retryAfter ? ` retry-after: ${retryAfter}` : ""}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (data.usage) console.log(`[AI] ${model} token:`, data.usage);
  return WIRE === "responses" ? readResponses(data) : readChat(data);
};

/** Yêu cầu có kèm ảnh/PDF không. */
const hasMedia = (contents: any) =>
  !!contents && typeof contents === "object" && Array.isArray(contents.parts) && contents.parts.some((p: any) => p?.inlineData);
/** Dịch vụ/model từ chối nội dung ảnh/PDF (chỉ nhận chữ). */
const isMediaRejected = (e: any) =>
  e?.status === 400 &&
  /must be a string|image_url|input_image|file_data|input_file|image input|does not support image|vision|multimodal|unsupported content|content type/i.test(errText(e));

const generateContent = async ({ model, contents, config = {} }: { model?: string; contents: Contents; config?: any }) => {
  const msgs: Msg[] = [];
  if (config.systemInstruction) msgs.push({ role: "system", items: [{ kind: "text", text: config.systemInstruction }] });
  msgs.push({ role: "user", items: toItems(contents) });
  // Ghi chú: googleSearch, thinkingConfig, imageConfig của Gemini không có tương đương ở đây nên được bỏ qua.

  const wantsJson = config.responseMimeType === "application/json";
  // Structured Outputs yêu cầu gốc là object, nên mảng được bọc trong { items: [...] }.
  const rootIsArray = wantsJson && config.responseSchema && String(config.responseSchema.type).toLowerCase() === "array";
  const schema = wantsJson && config.responseSchema
    ? rootIsArray
      ? { type: "object", properties: { items: toJsonSchema(config.responseSchema) }, required: ["items"] }
      : toJsonSchema(config.responseSchema)
    : null;

  const run = () => {
    if (!wantsJson) return callAI(resolveModel(model), msgs, null);
    if (schema && jsonModeOf(cfg()) === "json_schema") return callAI(resolveModel(model), msgs, { mode: "json_schema", schema });
    const hint = schema
      ? `Chỉ trả về JSON hợp lệ theo JSON Schema sau, không kèm giải thích:\n${JSON.stringify(schema)}`
      : "Chỉ trả về JSON hợp lệ, không kèm giải thích.";
    return callAI(resolveModel(model), [...msgs, { role: "system", items: [{ kind: "text", text: hint }] }], { mode: "json_object" });
  };

  let text: string;
  try {
    text = await run();
  } catch (e: any) {
    // Nhiều dịch vụ trung gian chưa hỗ trợ json_schema -> tự chuyển sang json_object rồi thử lại.
    if (wantsJson && jsonModeOf(cfg()) === "json_schema" && e.status === 400 && !isMediaRejected(e)) {
      jsonFallback = true;
      text = await run();
    } else throw e;
  }

  if (wantsJson && text) {
    text = pickJson(text) ?? cleanJson(text);
    if (rootIsArray) {
      try {
        const parsed = JSON.parse(text);
        text = JSON.stringify(Array.isArray(parsed) ? parsed : parsed.items ?? []);
      } catch { /* để nguyên, nơi gọi sẽ báo lỗi */ }
    }
  }
  return { text };
};

export interface ChatSession {
  sendMessage: (args: { message: string }) => Promise<{ text: string }>;
}

const createChat = ({ model, config = {} }: { model?: string; config?: any }): ChatSession => {
  const history: Msg[] = [];
  if (config.systemInstruction) history.push({ role: "system", items: [{ kind: "text", text: config.systemInstruction }] });
  return {
    async sendMessage({ message }) {
      history.push({ role: "user", items: [{ kind: "text", text: message }] });
      const text = await callAI(resolveModel(model), history, null);
      history.push({ role: "assistant", items: [{ kind: "text", text }] });
      return { text };
    },
  };
};

// ---------- Gemini gọi trực tiếp ----------
const DEFAULT_FLASH = "gemini-3-flash-preview";
const DEFAULT_PRO = "gemini-3.1-pro-preview";

/** Đổi tên model khi chạy Gemini: ưu tiên model trong cài đặt, nếu không thì dùng tên trong code. */
const resolveGeminiModel = (model?: string): string => {
  const s = cfg();
  const isPro = !!model && /pro/i.test(model);
  if (isPro && s.geminiModelStrong.trim()) return s.geminiModelStrong.trim();
  if (!isPro && s.geminiModel.trim()) return s.geminiModel.trim();
  if (!model) return DEFAULT_FLASH;
  // gemini-3-pro-preview đã được thay bằng gemini-3.1-pro-preview
  if (model === "gemini-3-pro-preview") return DEFAULT_PRO;
  return model;
};
/** Model dự phòng khi model mạnh không dùng được (thường do key miễn phí không có lượt cho bản Pro). */
const geminiFallbackModel = (): string => cfg().geminiModel.trim() || DEFAULT_FLASH;

const friendlyGeminiError = (e: any): Error => {
  const msg = errText(e);
  if (e?.status === 429 && !/RESOURCE_EXHAUSTED/.test(msg)) return e; // đã được quotaError đổi sang tiếng Việt
  if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) {
    return new Error("Không kết nối được tới Google Gemini. Kiểm tra mạng Internet (hoặc tường lửa/VPN) rồi thử lại.");
  }
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg) || e?.status === 401 || e?.status === 403) {
    const err: any = new Error(`Gemini từ chối API key. Kiểm tra lại key trong "Cài đặt API". Chi tiết: ${msg.slice(0, 300)}`);
    err.status = 401;
    return err;
  }
  return e instanceof Error ? e : new Error(msg);
};

/** Client Gemini dùng chung cho cả tạo ảnh logo. */
export const getGeminiSDK = (): GoogleGenAI => {
  if (isServerMode()) {
    if (!getServerState()?.hasGeminiKey) {
      throw new Error("Máy chủ chưa có Gemini API key. Người quản trị cần mở \"Cài đặt API\" trên máy chủ để nhập.");
    }
    // Gọi qua máy chủ; máy chủ thay "server-managed" bằng key thật
    return new GoogleGenAI({ apiKey: "server-managed", httpOptions: { baseUrl: `${location.origin}/gemini-api` } });
  }
  const key = cfg().geminiKey.trim();
  if (!key) throw new Error("Chưa có Gemini API key. Bấm \"Cài đặt API\" ở thanh bên trái để nhập.");
  return new GoogleGenAI({ apiKey: key });
};

/** Bỏ ```json ... ``` và lấy đúng phần JSON nếu model trả kèm chữ. */
const extractJson = (text: string): string => pickJson(text) ?? cleanJson(text);

/**
 * Gemini 2.x không cho dùng Google Search cùng lúc với JSON có schema.
 * Với các model đó: bỏ schema, yêu cầu trả JSON bằng lời, rồi tự lọc lấy JSON.
 */
const adaptConfigForModel = (model: string, config: any = {}) => {
  const wantsJson = config.responseMimeType === "application/json";
  const hasTools = Array.isArray(config.tools) && config.tools.length > 0;
  if (!(wantsJson && hasTools) || /gemini-3/i.test(model)) return { config, wantsJson };
  const { responseMimeType, responseSchema, ...rest } = config;
  const hint = responseSchema
    ? `\n\nChỉ trả về JSON hợp lệ (không giải thích, không markdown) theo cấu trúc: ${JSON.stringify(toJsonSchema(responseSchema))}`
    : "\n\nChỉ trả về JSON hợp lệ, không giải thích, không markdown.";
  return { config: { ...rest, systemInstruction: `${rest.systemInstruction || ""}${hint}`.trim() }, wantsJson };
};

const createGeminiClient = () => {
  const ai = getGeminiSDK();

  const runOnce = async (model: string, args: { contents: any; config?: any }) => {
    const { config, wantsJson } = adaptConfigForModel(model, args.config);
    const res = await withQuota(model, () => ai.models.generateContent({ ...args, config, model }));
    if (res.usageMetadata) console.log(`[AI] ${model} token:`, res.usageMetadata);
    let text = res.text ?? "";
    if (wantsJson && text) text = extractJson(text);
    return { text, candidates: res.candidates };
  };

  return {
    models: {
      generateContent: async (args: { model?: string; contents: any; config?: any }): Promise<{ text: string; candidates?: any }> => {
        const model = resolveGeminiModel(args.model);
        try {
          return await runOnce(model, args);
        } catch (e: any) {
          // Model mạnh không dùng được với key này -> tự chuyển sang model thường
          const fallback = geminiFallbackModel();
          if (fallback !== model && shouldFallback(e)) {
            console.warn(`[AI] ${model} không dùng được, chuyển sang ${fallback}.`, e);
            try {
              return await runOnce(fallback, args);
            } catch (e2) {
              throw friendlyGeminiError(e2);
            }
          }
          throw friendlyGeminiError(e);
        }
      },
    },
    chats: {
      create: ({ model, config = {} }: { model?: string; config?: any }): ChatSession => {
        let current = resolveGeminiModel(model);
        let chat = ai.chats.create({ model: current, config });
        return {
          async sendMessage({ message }) {
            try {
              const res = await withQuota(current, () => chat.sendMessage({ message }));
              return { text: res.text ?? "" };
            } catch (e: any) {
              const fallback = geminiFallbackModel();
              if (fallback !== current && shouldFallback(e)) {
                console.warn(`[AI] ${current} không dùng được cho chat, chuyển sang ${fallback}.`);
                const history = chat.getHistory();
                current = fallback;
                chat = ai.chats.create({ model: current, config, history });
                try {
                  const res = await withQuota(current, () => chat.sendMessage({ message }));
                  return { text: res.text ?? "" };
                } catch (e2) {
                  throw friendlyGeminiError(e2);
                }
              }
              throw friendlyGeminiError(e);
            }
          },
        };
      },
    },
  };
};

/** Tạo ảnh bằng Gemini có chờ/thử lại khi bị giới hạn; tự đổi sang model ảnh khác nếu model chính không có lượt. */
export const generateGeminiImage = async (models: string[], build: (model: string) => any) => {
  const ai = getGeminiSDK();
  let lastErr: any;
  for (const model of models) {
    try {
      return await withQuota(model, () => ai.models.generateContent({ ...build(model), model }));
    } catch (e: any) {
      lastErr = e;
      if (!shouldFallback(e)) break;
      console.warn(`[AI] Model ảnh ${model} không dùng được, thử model khác.`);
    }
  }
  const err = friendlyGeminiError(lastErr);
  if (isModelUnavailable(lastErr) || /limit:\s*0/.test(String(lastErr?.raw || ""))) {
    err.message = "Tạo ảnh bằng Gemini cần key đã bật thanh toán (gói miễn phí thường không có lượt tạo ảnh). " + err.message;
  }
  throw err;
};

/** Lấy nội dung lỗi dễ đọc để hiện cho người dùng. */
export const aiErrorMessage = (e: any): string => {
  const m = errText(e);
  return m.length > 400 ? m.slice(0, 400) + "…" : m;
};

/**
 * Chế độ chuẩn OpenAI: nếu yêu cầu có ảnh/PDF (đọc CCCD, giấy tờ) mà dịch vụ chỉ nhận chữ,
 * tự chuyển yêu cầu đó sang Gemini khi đã nhập Gemini API key; nếu chưa có thì báo rõ cách khắc phục.
 */
const generateContentOpenAI = async (args: { model?: string; contents: any; config?: any }): Promise<{ text: string; candidates?: any }> => {
  try {
    return await generateContent(args);
  } catch (e: any) {
    if (!(hasMedia(args.contents) && isMediaRejected(e))) throw e;
    if (cfg().geminiKey.trim()) {
      console.warn("[AI] Dịch vụ chuẩn OpenAI không nhận ảnh/PDF, chuyển yêu cầu này sang Gemini.", e);
      return await createGeminiClient().models.generateContent(args);
    }
    const err: any = new Error(
      `Dịch vụ AI đang dùng (model ${resolveModel(args.model)}) không đọc được ảnh/PDF. ` +
        `Vào "Cài đặt API" và chọn Google Gemini, hoặc nhập Gemini API key để app tự dùng Gemini cho phần đọc giấy tờ, ` +
        `hoặc đổi sang model có hỗ trợ ảnh.`
    );
    err.status = 400;
    err.raw = errText(e);
    throw err;
  }
};

export const createAIClient = () =>
  cfg().provider === "gemini"
    ? createGeminiClient()
    : {
        models: { generateContent: generateContentOpenAI },
        chats: { create: createChat },
      };

/** Gửi một câu hỏi rất ngắn để kiểm tra key / model có dùng được không (thử cả model thường và model mạnh). */
export const testAIConnection = async (): Promise<{ ok: boolean; message: string }> => {
  const s = cfg();
  const isGemini = s.provider === "gemini";
  const check = async (codeModel: string) => {
    const started = Date.now();
    const name = isGemini ? resolveGeminiModel(codeModel) : resolveModel(codeModel);
    try {
      const ai = isGemini ? getGeminiSDK() : null;
      if (ai) {
        await withQuota(name, () => ai.models.generateContent({ model: name, contents: "Trả lời đúng một từ: OK" }));
      } else {
        await createAIClient().models.generateContent({ model: codeModel, contents: "Trả lời đúng một từ: OK" });
      }
      return `Đạt: ${name} (${Date.now() - started} ms)`;
    } catch (e: any) {
      const err = isGemini ? friendlyGeminiError(isQuotaError(e) && e?.status !== 429 ? quotaError(e, name) : e) : e;
      return `Lỗi: ${name}: ${aiErrorMessage(err)}`;
    }
  };
  const flash = await check("gemini-3-flash-preview");
  if (flash.startsWith("Lỗi:")) return { ok: false, message: flash };
  const pro = await check("gemini-3.1-pro-preview");
  if (pro.startsWith("Lỗi:")) {
    return {
      ok: true,
      message: `${flash}\n${pro}\n→ Các tính năng dùng model mạnh (tra mã ngành, tư vấn AI) sẽ tự chuyển sang model thường.`,
    };
  }
  return { ok: true, message: `${flash}\n${pro}` };
};
