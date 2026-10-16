import React, { useEffect, useState } from 'react';
import { X, KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, RotateCcw, Save, Zap, Server, Lock } from 'lucide-react';
import {
  AISettings,
  getAISettings,
  saveAISettings,
  resetAISettings,
  hasWebSettings,
  envDefaults,
  getServerState,
  isServerMode,
  saveServerConfig,
  resetServerConfig,
} from '../services/aiSettings';
import { testAIConnection } from '../services/aiClient';

interface Props {
  open: boolean;
  onClose: () => void;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';
const hintCls = 'text-xs text-slate-500 mt-1';

const SecretInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; id: string }> = ({
  value,
  onChange,
  placeholder,
  id,
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        className={`${inputCls} pr-10 font-mono`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
        title={show ? 'Ẩn key' : 'Hiện key'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

/** Ở chế độ máy chủ, ô key để trống (key thật không bao giờ gửi xuống trình duyệt). */
const editable = (x: AISettings): AISettings => (isServerMode() ? { ...x, apiKey: '', geminiKey: '' } : x);
const isSavedCustom = () => (isServerMode() ? getServerState()?.source === 'file' : hasWebSettings());

const ApiSettings: React.FC<Props> = ({ open, onClose }) => {
  const [s, setS] = useState<AISettings>(editable(getAISettings()));
  const [fromWeb, setFromWeb] = useState(isSavedCustom());
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setS(editable(getAISettings()));
      setFromWeb(isSavedCustom());
      setResult(null);
      setSaved(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const srv = getServerState();
  const serverMode = !!srv;
  const admin = !!srv?.isAdmin;
  const readOnly = serverMode && !admin;

  const set = <K extends keyof AISettings>(k: K, v: AISettings[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
    setResult(null);
  };

  const validate = (): string | null => {
    if (s.headers.trim()) {
      try {
        JSON.parse(s.headers);
      } catch {
        return 'Header bổ sung phải là JSON hợp lệ, ví dụ {"x-ten-header":"gia-tri"}';
      }
    }
    if (s.provider === 'openai' && !/^https?:\/\//i.test(s.baseUrl.trim())) {
      return 'Địa chỉ API phải bắt đầu bằng http:// hoặc https://';
    }
    return null;
  };

  const handleSave = async (): Promise<boolean> => {
    if (readOnly) return true;
    const err = validate();
    if (err) { setError(err); return false; }
    try {
      const clean: AISettings = {
        ...s,
        geminiKey: s.geminiKey.trim(),
        apiKey: s.apiKey.trim(),
        baseUrl: s.baseUrl.trim(),
      };
      if (serverMode) {
        // Lưu lên máy chủ; ô key để trống = giữ key đang có trên máy chủ
        await saveServerConfig(clean, { apiKey: clean.apiKey || undefined, geminiKey: clean.geminiKey || undefined });
        setS(editable(getAISettings()));
      } else {
        saveAISettings(clean);
        setS(clean);
      }
      setFromWeb(true);
      setSaved(true);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  };

  const handleTest = async () => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    // Lưu trước rồi thử, để lần thử dùng đúng giá trị đang nhập
    if (!(await handleSave())) return;
    setTesting(true);
    setResult(null);
    const r = await testAIConnection();
    setResult(r);
    setTesting(false);
  };

  const handleReset = async () => {
    if (serverMode) {
      if (!confirm('Xoá cấu hình đã lưu trên máy chủ và quay về dùng file .env.local của máy chủ?')) return;
      try {
        await resetServerConfig();
      } catch (e: any) {
        return setError(e.message);
      }
      setS(editable(getAISettings()));
      setFromWeb(false);
      setSaved(false);
      setResult(null);
      return;
    }
    if (!confirm('Xoá cài đặt đã lưu trên trình duyệt này và quay về dùng file .env.local?')) return;
    resetAISettings();
    setS(envDefaults());
    setFromWeb(false);
    setSaved(false);
    setResult(null);
  };

  const isGemini = s.provider === 'gemini';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Cài đặt API</h2>
              <p className="text-xs text-slate-500">
                {serverMode
                  ? admin
                    ? 'Bạn đang ở máy chủ: cấu hình dùng chung cho mọi máy'
                    : 'Cấu hình do máy chủ quản lý'
                  : fromWeb
                  ? 'Đang dùng cài đặt lưu trên trình duyệt này'
                  : 'Đang dùng giá trị trong file .env.local'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {readOnly && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex gap-3">
                <div className="p-2 h-fit bg-white text-slate-600 rounded-lg border border-slate-200">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="text-sm text-slate-700">
                  <p className="font-medium text-slate-900">API key được giữ trên máy chủ</p>
                  <p>Máy này gọi AI qua máy chủ và không nhận được key. Muốn đổi key hoặc model, hãy mở web ngay trên máy chủ.</p>
                </div>
              </div>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Nhà cung cấp</dt>
                <dd className="text-slate-900">{isGemini ? 'Google Gemini' : 'Chuẩn OpenAI'}</dd>
                <dt className="text-slate-500">Model</dt>
                <dd className="text-slate-900 font-mono text-xs pt-0.5">
                  {isGemini ? s.geminiModel || 'mặc định' : s.model}
                  {(isGemini ? s.geminiModelStrong : s.modelStrong) ? ` / ${isGemini ? s.geminiModelStrong : s.modelStrong}` : ''}
                </dd>
                <dt className="text-slate-500">Trạng thái key</dt>
                <dd className="text-slate-900">
                  {(isGemini ? srv?.hasGeminiKey : srv?.hasApiKey) ? 'Đã có trên máy chủ' : 'Máy chủ chưa nhập key'}
                </dd>
              </dl>
            </div>
          )}

          {!readOnly && (<>
          {serverMode && (
            <div className="flex gap-2 p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
              <Server className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Cấu hình và key lưu trên máy chủ (thư mục tools). Các máy khác dùng chung, không xem được key.</span>
            </div>
          )}
          {/* Provider */}
          <div>
            <span className={labelCls}>Nhà cung cấp</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['gemini', 'Google Gemini', 'Key AI Studio (AIza… hoặc AQ.…)'],
                ['openai', 'Chuẩn OpenAI', 'OpenAI, dịch vụ trung gian, DeepSeek…'],
              ] as const).map(([id, title, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('provider', id)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    s.provider === id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">{title}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Gemini key: luôn hiện vì tạo logo cần Gemini */}
          <div>
            <label htmlFor="gemini-key" className={labelCls}>
              Gemini API key
            </label>
            <SecretInput
              id="gemini-key"
              value={s.geminiKey}
              onChange={(v) => set('geminiKey', v)}
              placeholder={serverMode && srv?.hasGeminiKey ? `Đã lưu (${srv.geminiKeyHint}) – để trống nếu không đổi` : 'Dán key Gemini vào đây'}
            />
            <p className={hintCls}>
              {isGemini ? 'Dùng cho mọi tính năng.' : 'Chỉ dùng cho phần tạo logo ở mục Thương Hiệu.'} Lấy key tại{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                aistudio.google.com/apikey
              </a>
            </p>
          </div>

          {isGemini ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="g-model" className={labelCls}>Model thường</label>
                <input id="g-model" list="gemini-models" className={inputCls} value={s.geminiModel} onChange={(e) => set('geminiModel', e.target.value)} placeholder="gemini-3-flash-preview" />
              </div>
              <div>
                <label htmlFor="g-model-strong" className={labelCls}>Model mạnh</label>
                <input id="g-model-strong" list="gemini-models" className={inputCls} value={s.geminiModelStrong} onChange={(e) => set('geminiModelStrong', e.target.value)} placeholder="gemini-3.1-pro-preview" />
              </div>
              <p className={`${hintCls} col-span-2 -mt-1`}>
                Để trống thì dùng model mặc định trong code. Nếu model mạnh không có lượt với key của bạn, app tự chuyển sang model thường.
              </p>
              <datalist id="gemini-models">
                <option value="gemini-3-flash-preview" />
                <option value="gemini-3.1-pro-preview" />
                <option value="gemini-2.5-flash" />
                <option value="gemini-2.5-flash-lite" />
                <option value="gemini-2.5-pro" />
              </datalist>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="base-url" className={labelCls}>Địa chỉ API (Base URL)</label>
                <input id="base-url" className={`${inputCls} font-mono`} value={s.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label htmlFor="api-key" className={labelCls}>API key</label>
                <SecretInput
                  id="api-key"
                  value={s.apiKey}
                  onChange={(v) => set('apiKey', v)}
                  placeholder={serverMode && srv?.hasApiKey ? `Đã lưu (${srv.apiKeyHint}) – để trống nếu không đổi` : 'sk-…'}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="o-model" className={labelCls}>Model thường</label>
                  <input id="o-model" className={inputCls} value={s.model} onChange={(e) => set('model', e.target.value)} placeholder="gpt-5.4-mini" />
                </div>
                <div>
                  <label htmlFor="o-model-strong" className={labelCls}>Model mạnh</label>
                  <input id="o-model-strong" className={inputCls} value={s.modelStrong} onChange={(e) => set('modelStrong', e.target.value)} placeholder="(giống model thường)" />
                </div>
              </div>
              <details className="rounded-lg border border-slate-200 px-3 py-2">
                <summary className="text-sm font-medium text-slate-700 cursor-pointer select-none">Tuỳ chọn nâng cao</summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="wire" className={labelCls}>Kiểu API</label>
                      <select id="wire" className={inputCls} value={s.wire} onChange={(e) => set('wire', e.target.value as AISettings['wire'])}>
                        <option value="chat">chat</option>
                        <option value="responses">responses</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reasoning" className={labelCls}>Suy luận</label>
                      <select id="reasoning" className={inputCls} value={s.reasoning} onChange={(e) => set('reasoning', e.target.value as AISettings['reasoning'])}>
                        <option value="">mặc định</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="json-mode" className={labelCls}>JSON</label>
                      <select id="json-mode" className={inputCls} value={s.jsonMode} onChange={(e) => set('jsonMode', e.target.value as AISettings['jsonMode'])}>
                        <option value="json_schema">json_schema</option>
                        <option value="json_object">json_object</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="headers" className={labelCls}>Header bổ sung (JSON)</label>
                    <textarea id="headers" rows={3} className={`${inputCls} font-mono text-xs`} value={s.headers} onChange={(e) => set('headers', e.target.value)} placeholder='{"x-ten-header":"gia-tri"}' />
                  </div>
                </div>
              </details>
            </>
          )}

          <div>
            <label htmlFor="rpm" className={labelCls}>Giới hạn yêu cầu/phút</label>
            <div className="flex items-center gap-2">
              <input
                id="rpm"
                type="number"
                min={0}
                max={1000}
                className={`${inputCls} w-28`}
                value={s.rpm || 0}
                onChange={(e) => set('rpm', Math.max(0, Number(e.target.value) || 0))}
              />
              {isGemini && s.rpm !== 5 && (
                <button type="button" onClick={() => set('rpm', 5)} className="text-xs text-blue-600 hover:underline">
                  Đặt 5 (key miễn phí)
                </button>
              )}
            </div>
            <p className={hintCls}>
              0 = không giới hạn. Đặt giới hạn để app tự giãn các yêu cầu, tránh lỗi 429. Dù vậy khi bị 429, app vẫn tự chờ rồi gửi lại.
            </p>
          </div>
          </>)}

          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {result && (
            <div className={`flex gap-2 p-3 rounded-lg text-sm break-words ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span className="min-w-0 whitespace-pre-line">{result.message}</span>
            </div>
          )}
          {saved && !result && !testing && (
            <div className="flex gap-2 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Đã lưu. Áp dụng ngay, không cần tải lại trang.</span>
            </div>
          )}

          {!serverMode && (
            <p className="text-xs text-slate-500">
              Key chỉ lưu trong trình duyệt trên máy này. Đừng lưu key trên máy dùng chung.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            type="button"
            onClick={handleReset}
            disabled={!fromWeb || readOnly}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Xoá cài đặt trên web, dùng lại .env.local"
          >
            <RotateCcw className="w-4 h-4" />
            Về mặc định
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-60"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {readOnly ? 'Kiểm tra kết nối' : 'Lưu & kiểm tra'}
            </button>
            {!readOnly && <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Save className="w-4 h-4" />
              Lưu
            </button>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;
