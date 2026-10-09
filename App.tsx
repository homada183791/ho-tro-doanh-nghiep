import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DocumentGenerator from './components/DocumentGenerator';
import LegalChat from './components/LegalChat';
import BrandStudio from './components/BrandStudio';

function App() {
  const [currentView, setCurrentView] = useState<'documents' | 'chat' | 'brand'>('documents');

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen custom-scrollbar">
        {currentView === 'documents' && <DocumentGenerator />}
        {currentView === 'chat' && <LegalChat />}
        {currentView === 'brand' && <BrandStudio />}
      </main>
    </div>
  );
}

export default App;