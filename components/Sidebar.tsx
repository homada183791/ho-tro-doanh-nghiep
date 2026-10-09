import React from 'react';
import { FileText, MessageSquare, Image as ImageIcon, Scale } from 'lucide-react';

interface SidebarProps {
  currentView: 'documents' | 'chat' | 'brand';
  onChangeView: (view: 'documents' | 'chat' | 'brand') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
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
        <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200 mb-1">Phiên bản Pro</p>
          <p>Sử dụng Gemini 2.5 & 3.0 mới nhất.</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;