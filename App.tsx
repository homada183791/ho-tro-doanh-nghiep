import React, { Suspense, lazy, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DocumentGenerator from './components/DocumentGenerator';
import LegalChat from './components/LegalChat';
import BrandStudio from './components/BrandStudio';
// Tải riêng trang Gộp file: thiếu thư viện (chưa npm install) thì chỉ trang này báo lỗi, các trang khác vẫn chạy
const GopFile = lazy(() => import('./components/GopFile'));

class LoiTrang extends React.Component<{ children: React.ReactNode }, { loi: string | null }> {
  state = { loi: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { loi: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (!this.state.loi) return this.props.children;
    return (
      <div className="max-w-2xl mx-auto mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-semibold text-lg mb-2">Chưa mở được trang này</p>
        <p className="text-sm mb-3">Thường do máy chủ chưa cài thư viện mới. Tắt cửa sổ web, chạy lại <b>start-public.bat</b> (hoặc chạy <code>npm install</code> trong thư mục dự án) rồi mở lại.</p>
        <p className="text-xs text-amber-700 break-all">Chi tiết: {this.state.loi}</p>
      </div>
    );
  }
}
import ApiSettings from './components/ApiSettings';
import AiWaitToast from './components/AiWaitToast';
import { isConfigured } from './services/aiSettings';

type View = 'documents' | 'chat' | 'brand' | 'merge';

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
          {currentView === 'merge' && (
            <LoiTrang>
              <Suspense fallback={<p className="text-slate-500">Đang tải...</p>}><GopFile /></Suspense>
            </LoiTrang>
          )}
        </div>
      </main>

      <ApiSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiWaitToast />
    </div>
  );
}

export default App;
