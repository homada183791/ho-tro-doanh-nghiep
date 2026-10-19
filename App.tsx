import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DocumentGenerator from './components/DocumentGenerator';
import LegalChat from './components/LegalChat';
import BrandStudio from './components/BrandStudio';
import ApiSettings from './components/ApiSettings';
import AiWaitToast from './components/AiWaitToast';
import { isConfigured } from './services/aiSettings';

type View = 'documents' | 'chat' | 'brand';

function App() {
  const [currentView, setCurrentView] = useState<View>('documents');
  // Lần đầu mở mà chưa có key thì tự mở hộp thoại cài đặt
  const [settingsOpen, setSettingsOpen] = useState(() => !isConfigured());
  // Trên điện thoại/máy tính bảng, thanh bên ẩn và mở bằng nút menu
  const [navOpen, setNavOpen] = useState(false);

  const changeView = (v: View) => {
    setCurrentView(v);
    setNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <Sidebar
        currentView={currentView}
        onChangeView={changeView}
        onOpenSettings={() => { setNavOpen(false); setSettingsOpen(true); }}
        mobileOpen={navOpen}
        onCloseMobile={() => setNavOpen(false)}
      />

      <main className="flex-1 min-w-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar">
        {/* Thanh trên cùng chỉ hiện ở màn hình nhỏ */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-white/95 backdrop-blur border-b border-slate-200">
          <button
            onClick={() => setNavOpen(true)}
            className="p-2 -ml-2 rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label="Mở menu"
            aria-expanded={navOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-slate-900">LegalBiz AI</span>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
          {currentView === 'documents' && <DocumentGenerator />}
          {currentView === 'chat' && <LegalChat />}
          {currentView === 'brand' && <BrandStudio />}
        </div>
      </main>

      <ApiSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiWaitToast />
    </div>
  );
}

export default App;
