import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DocumentGenerator from './components/DocumentGenerator';
import LegalChat from './components/LegalChat';
import BrandStudio from './components/BrandStudio';
import ApiSettings from './components/ApiSettings';
import AiWaitToast from './components/AiWaitToast';
import { isConfigured } from './services/aiSettings';

function App() {
  const [currentView, setCurrentView] = useState<'documents' | 'chat' | 'brand'>('documents');
  // Lần đầu mở mà chưa có key thì tự mở hộp thoại cài đặt
  const [settingsOpen, setSettingsOpen] = useState(() => !isConfigured());

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} onOpenSettings={() => setSettingsOpen(true)} />
      
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen custom-scrollbar">
        {currentView === 'documents' && <DocumentGenerator />}
        {currentView === 'chat' && <LegalChat />}
        {currentView === 'brand' && <BrandStudio />}
      </main>

      <ApiSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiWaitToast />
    </div>
  );
}

export default App;