
import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
             <span className="text-white font-bold text-lg">R</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">StarterKit</span>
        </div>
        <nav className="hidden md:flex space-x-8">
          <a href="#" className="text-gray-500 hover:text-blue-600 font-medium transition-colors">Documentation</a>
          <a href="#" className="text-gray-500 hover:text-blue-600 font-medium transition-colors">Templates</a>
          <a href="#" className="text-gray-500 hover:text-blue-600 font-medium transition-colors">Support</a>
        </nav>
        <div className="flex items-center space-x-4">
           <button className="text-gray-500 hover:text-gray-700 md:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
           </button>
        </div>
      </div>
    </header>
  );
};
