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

const env = import.meta.env;
/**
 * Chọn nhà cung cấp AI:
 *   VITE_AI_PROVIDER=gemini  -> gọi thẳng Google Gemini bằng VITE_GEMINI_API_KEY (giữ được Google Search, đọc PDF/ảnh)
 *   VITE_AI_PROVIDER=openai  -> dùng API chuẩn OpenAI theo VITE_AI_BASE_URL / VITE_AI_API_KEY (mặc định)
 */
const PROVIDER: "gemini" | "openai" = env.VITE_AI_PROVIDER === "gemini" ? "gemini" : "openai";
const GEMINI_KEY = String(env.VITE_GEMINI_API_KEY || "");
const GEMINI_MODEL = env.VITE_GEMINI_MODEL ? String(env.VITE_GEMINI_MODEL) : "";
const GEMINI_MODEL_STRONG = env.VITE_GEMINI_MODEL_STRONG ? String(env.VITE_GEMINI_MODEL_STRONG) : "";
const BASE_URL = String(env.VITE_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const API_KEY = String(env.VITE_AI_API_KEY || "");
const WIRE: "chat" | "responses" = env.VITE_AI_WIRE_API === "responses" ? "responses" : "chat";
const MODEL = String(env.VITE_AI_MODEL || "gpt-5.4-mini");
const MODEL_STRONG = String(env.VITE_AI_MODEL_STRONG || MODEL);
const REASONING = env.VITE_AI_REASONING ? String(env.VITE_AI_REASONING) : "";
let jsonMode: "json_schema" | "json_object" =
  env.VITE_AI_JSON_MODE === "json_object" ? "json_object" : "json_schema";

const EXTRA_HEADERS: Record<string, string> = (() => {
  if (!env.VITE_AI_HEADERS) return {};
  try {
    return JSON.parse(String(env.VITE_AI_HEADERS));
  } catch {
    console.warn("[AI] VITE_AI_HEADERS không phải JSON hợp lệ, bỏ qua.");
    return {};
  }
})();

/** Các tên model Gemini cũ trong code được đổi sang model đã cấu hình. */
const resolveModel = (geminiModel?: string): string => {
  if (geminiModel && /pro/i.test(geminiModel)) return MODEL_STRONG;
  return MODEL;
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
  if (REASONING) body.reasoning = { effort: REASONING };
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

// ---------- Gửi yêu cầu ----------
const callAI = async (model: string, msgs: Msg[], fmt: JsonFormat): Promise<string> => {
  if (!API_KEY) throw new Error("Chưa cấu hình VITE_AI_API_KEY trong file .env.local");
  const endpoint = WIRE === "responses" ? "/responses" : "/chat/completions";
  const body = WIRE === "responses" ? buildResponsesBody(model, msgs, fmt) : buildChatBody(model, msgs, fmt);
  // Khi chạy npm run dev: gửi qua proxy của Vite (/ai-api) để tránh lỗi CORS
  const url = env.DEV ? `/ai-api${endpoint}` : `${BASE_URL}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}`, ...EXTRA_HEADERS },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Không kết nối được tới ${BASE_URL}. Kiểm tra VITE_AI_BASE_URL và mạng Internet.`);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    if (env.DEV && res.status === 404 && !detail.trim()) {
      throw new Error("Proxy /ai-api chưa hoạt động. Hãy thay file vite.config.ts mới rồi tắt (Ctrl+C) và chạy lại npm run dev.");
    }
    const err: any = new Error(`AI API lỗi ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (data.usage) console.log(`[AI] ${model} token:`, data.usage);
  return WIRE === "responses" ? readResponses(data) : readChat(data);
};

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
    if (schema && jsonMode === "json_schema") return callAI(resolveModel(model), msgs, { mode: "json_schema", schema });
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
    if (wantsJson && jsonMode === "json_schema" && e.status === 400) {
      jsonMode = "json_object";
      text = await run();
    } else throw e;
  }

  if (wantsJson && text) {
    text = cleanJson(text);
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
/** Đổi tên model khi chạy Gemini: ưu tiên model cấu hình trong .env.local, nếu không thì dùng tên trong code. */
const resolveGeminiModel = (model?: string): string => {
  const isPro = !!model && /pro/i.test(model);
  if (isPro && GEMINI_MODEL_STRONG) return GEMINI_MODEL_STRONG;
  if (!isPro && GEMINI_MODEL) return GEMINI_MODEL;
  if (!model) return "gemini-3-flash-preview";
  // gemini-3-pro-preview đã được thay bằng gemini-3.1-pro-preview
  if (model === "gemini-3-pro-preview") return "gemini-3.1-pro-preview";
  return model;
};

const createGeminiClient = () => {
  if (!GEMINI_KEY) throw new Error("Chưa cấu hình VITE_GEMINI_API_KEY trong file .env.local");
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  return {
    models: {
      generateContent: async (args: { model?: string; contents: any; config?: any }): Promise<{ text: string; candidates?: any }> => {
        const res = await ai.models.generateContent({ ...args, model: resolveGeminiModel(args.model) });
        if (res.usageMetadata) console.log(`[AI] Gemini token:`, res.usageMetadata);
        return { text: res.text ?? "", candidates: res.candidates };
      },
    },
    chats: {
      create: ({ model, config = {} }: { model?: string; config?: any }): ChatSession => {
        const chat = ai.chats.create({ model: resolveGeminiModel(model), config });
        return {
          async sendMessage({ message }) {
            const res = await chat.sendMessage({ message });
            return { text: res.text ?? "" };
          },
        };
      },
    },
  };
};

export const createAIClient = () =>
  PROVIDER === "gemini"
    ? createGeminiClient()
    : {
        models: { generateContent },
        chats: { create: createChat },
      };
