import React, { useEffect, useState } from 'react';
import { FileText, MessageSquare, Image as ImageIcon, Scale, KeyRound, Files } from 'lucide-react';
import { getAISettings, isConfigured, maskKey, AI_SETTINGS_EVENT, isServerMode } from '../services/aiSettings';

interface SidebarProps {
  currentView: 'documents' | 'chat' | 'brand' | 'merge';
  onChangeView: (view: 'documents' | 'chat' | 'brand' | 'merge') => void;
  onOpenSettings: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/** Logo dạng con dấu tròn: điểm nhận diện duy nhất dùng màu đỏ. */
const SealMark: React.FC = () => (
  <div className="relative w-11 h-11 shrink-0 rounded-full border-2 border-seal-600 flex items-center justify-center">
    <div className="absolute inset-[3px] rounded-full border border-seal-600/50" />
    <Scale className="w-5 h-5 text-seal-600" strokeWidth={2.25} />
  </div>
);

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onOpenSettings, mobileOpen = false, onCloseMobile }) => {
  const [settings, setSettings] = useState(getAISettings());
  // Đóng menu trên điện thoại bằng phím Esc
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseMobile?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);
  useEffect(() => {
    const update = () => setSettings(getAISettings());
    window.addEventListener(AI_SETTINGS_EVENT, update);
    return () => window.removeEventListener(AI_SETTINGS_EVENT, update);
  }, []);
  const ready = isConfigured(settings);
  const isGemini = settings.provider === 'gemini';
  const navItems = [
    { id: 'documents', label: 'Soạn hồ sơ', icon: FileText },
    { id: 'merge', label: 'Gộp file PDF', icon: Files },
    { id: 'chat', label: 'Tư vấn pháp lý', icon: MessageSquare },
    { id: 'brand', label: 'Thương hiệu', icon: ImageIcon },
  ] as const;

  return (
    <>
    {mobileOpen && (
      <div className="lg:hidden fixed inset-0 z-30 bg-slate-900/40" onClick={onCloseMobile} aria-hidden="true" />
    )}
    <aside
      className={`w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-200 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
      }`}
    >
      <div className="px-5 pt-6 pb-5 flex items-center gap-3">
        <SealMark />
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-slate-900 leading-tight">LegalBiz AI</p>
          <p className="text-xs text-slate-500 leading-snug">Trợ lý hồ sơ doanh nghiệp</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1" aria-label="Chức năng chính">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-[15px] transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-800 font-semibold'
                  : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-seal-600" aria-hidden="true" />}
              <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <button
          onClick={onOpenSettings}
          className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-slate-100 transition-colors"
          title="Đổi API key, nhà cung cấp, model"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-800 text-sm">Cài đặt API</span>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium ${ready ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {ready ? 'Sẵn sàng' : 'Chưa có key'}
            </span>
          </div>
          <p className="mt-0.5 pl-6 text-xs text-slate-500 truncate">
            {isGemini ? 'Google Gemini' : 'Chuẩn OpenAI'}
            {ready ? (isServerMode() ? ', qua máy chủ' : `, ${maskKey(isGemini ? settings.geminiKey : settings.apiKey)}`) : ''}
          </p>
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
