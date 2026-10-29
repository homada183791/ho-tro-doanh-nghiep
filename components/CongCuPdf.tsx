/** Trang "Gộp / Cắt PDF": 2 thẻ Gộp file và Cắt file. Mỗi thẻ giữ nguyên dữ liệu khi chuyển qua lại. */
import React, { useState } from 'react';
import { Files, Scissors } from 'lucide-react';
import GopFile from './GopFile';
import CatFile from './CatFile';

const CongCuPdf: React.FC = () => {
  const [the, setThe] = useState<'gop' | 'cat'>('gop');
  const nut = (id: 'gop' | 'cat', nhan: string, Icon: typeof Files) => (
    <button type="button" role="tab" aria-selected={the === id} onClick={() => setThe(id)}
      className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${the === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
      <Icon className="w-4 h-4" /> {nhan}
    </button>
  );
  return (
    <div className="max-w-7xl mx-auto pb-12">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-bold text-slate-800">{the === 'gop' ? 'Gộp file PDF' : 'Cắt file PDF'}</h2>
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-slate-200/70">
          {nut('gop', 'Gộp file', Files)}
          {nut('cat', 'Cắt file', Scissors)}
        </div>
      </header>
      <div hidden={the !== 'gop'}><GopFile /></div>
      <div hidden={the !== 'cat'}>
        <p className="text-slate-500 mb-4">Chọn 1 file PDF hoặc Word, đặt vết cắt giữa các trang (hoặc nhập khoảng trang), rồi cắt thành nhiều file nhỏ. Đổi tên từng file và tải riêng hoặc tải tất cả bằng file .zip.</p>
        <CatFile />
      </div>
    </div>
  );
};

export default CongCuPdf;
