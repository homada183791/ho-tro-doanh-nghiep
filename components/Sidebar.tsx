import React, { useEffect, useState } from 'react';
import { FileText, MessageSquare, Image as ImageIcon, Scale, KeyRound } from 'lucide-react';
import { getAISettings, isConfigured, maskKey, AI_SETTINGS_EVENT } from '../services/aiSettings';

interface SidebarProps {
  currentView: 'documents' | 'chat' | 'brand';
  onChangeView: (view: 'documents' | 'chat' | 'brand') => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onOpenSettings }) => {
  const [settings, setSettings] = useState(getAISettings());
  useEffect(() => {
    const update = () => setSettings(getAISettings());
    window.addEventListener(AI_SETTINGS_EVENT, update);
    return () => window.removeEventListener(AI_SETTINGS_EVENT, update);
  }, []);
  const ready = isConfigured(settings);
  const isGemini = settings.provider === 'gemini';
  const navItems = [
    { id: 'documents', label: 'Soạn Hồ Sơ', icon: FileText },
    { id: 'chat', label: 'Tư Vấn AI', icon: MessageSquare },
    { id: 'brand', label: 'Thương Hiệu', icon: ImageIcon },
  ] as const;

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-10">
      <div className="p-6 flex items-center gap-3 border-b border-slate-700">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Scale className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">LegalBiz AI</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <button
          onClick={onOpenSettings}
          className="w-full text-left bg-slate-800 hover:bg-slate-700 rounded-lg p-3 text-xs text-slate-400 transition-colors"
          title="Đổi API key, nhà cung cấp, model"
        >
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-slate-200" />
            <span className="font-semibold text-slate-200 text-sm">Cài đặt API</span>
            <span className={`ml-auto w-2 h-2 rounded-full ${ready ? 'bg-green-400' : 'bg-amber-400'}`} />
          </div>
          <p>{isGemini ? 'Google Gemini' : 'Chuẩn OpenAI'} · {ready ? maskKey(isGemini ? settings.geminiKey : settings.apiKey) : 'chưa có key'}</p>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;