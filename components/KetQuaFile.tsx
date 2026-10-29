/**
 * Màn hình kết quả dùng chung cho Cắt file và Gộp file có vết cắt (giống Smallpdf):
 * danh sách file nhỏ có ảnh trang đầu, đổi tên từng file, tải riêng; đổi tên và tải tất cả bằng file .zip.
 */
import React from 'react';
import { Download, Files, RotateCcw, ArrowLeft, CheckCircle2, Pencil } from 'lucide-react';
import { tenFileSach } from '../services/gopPdf';
import { downloadBytes, zipFiles } from '../services/tronHoSo';

export interface FileKetQua { ten: string; bytes: Uint8Array; anh: string; soTrang: number; moTa?: string }

/** Tên cuối cùng (thêm .pdf, không trùng nhau trong file zip). */
export const tenCuoi = (ds: FileKetQua[]) => {
  const dung = new Map<string, number>();
  return ds.map((k, i) => {
    const g = tenFileSach(k.ten, `file-${i + 1}`);
    const n = dung.get(g.toLowerCase()) || 0;
    dung.set(g.toLowerCase(), n + 1);
    return `${n ? `${g} (${n + 1})` : g}.pdf`;
  });
};

interface Props {
  files: FileKetQua[];
  onFiles: (f: FileKetQua[]) => void;
  tenZip: string;
  onTenZip: (s: string) => void;
  onQuayLai: () => void;
  nhanQuayLai: string;
  onBatDauLai: () => void;
}

const btn = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50';
const oTen = 'bg-transparent border-0 border-b border-dashed border-slate-400 focus:border-solid focus:border-blue-600 outline-none px-0.5 py-0.5 min-w-0';

const KetQuaFile: React.FC<Props> = ({ files, onFiles, tenZip, onTenZip, onQuayLai, nhanQuayLai, onBatDauLai }) => {
  const ten = tenCuoi(files);
  const taiMot = (i: number) => downloadBytes(files[i].bytes, ten[i], 'application/pdf');
  const taiZip = () => downloadBytes(zipFiles(files.map((k, i) => ({ name: ten[i], bytes: k.bytes }))), `${tenFileSach(tenZip, 'ket_qua')}.zip`, 'application/zip');

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {files.map((k, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <img src={k.anh} alt="" className="w-16 h-20 object-contain border border-slate-200 rounded bg-white shadow-sm shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-slate-800">
                <input className={`${oTen} flex-1 text-base`} value={k.ten} aria-label={`Tên file ${i + 1}`}
                  onChange={(e) => onFiles(files.map((x, j) => (j === i ? { ...x, ten: e.target.value } : x)))} />
                <span className="text-slate-500">.pdf</span>
                <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
              <p className="text-sm mt-1"><span className="text-green-600 font-semibold">Đã xong</span>
                <span className="text-slate-500"> · {k.soTrang} trang{k.moTa ? ` (${k.moTa})` : ''}</span></p>
              {ten[i] !== `${tenFileSach(k.ten, '')}.pdf` && <p className="text-xs text-amber-700">Sẽ lưu là: {ten[i]}</p>}
            </div>
            <button type="button" className={btn} onClick={() => taiMot(i)} aria-label={`Tải file ${ten[i]}`}><Download className="w-4 h-4" /> Tải</button>
          </div>
        ))}
      </section>

      <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-fit lg:sticky lg:top-4 space-y-4">
        <p className="flex items-center gap-2 text-xl font-bold text-slate-800"><CheckCircle2 className="w-7 h-7 text-green-600" /> Đã xong</p>
        <div>
          <div className="flex items-center gap-1 text-slate-800">
            <input className={`${oTen} flex-1`} value={tenZip} aria-label="Tên file zip" onChange={(e) => onTenZip(e.target.value)} />
            <span className="text-slate-500">.zip</span>
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{files.length} file</p>
        </div>
        <button type="button" onClick={taiZip} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2">
          <Download className="w-5 h-5" /> Tải tất cả (.zip)
        </button>
        <button type="button" onClick={() => files.forEach((_, i) => setTimeout(() => taiMot(i), i * 400))} className={`${btn} w-full justify-center py-2.5`}>
          <Files className="w-4 h-4" /> Tải từng file riêng lẻ
        </button>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onQuayLai} className={`${btn} justify-center`}><ArrowLeft className="w-4 h-4" /> {nhanQuayLai}</button>
          <button type="button" onClick={onBatDauLai} className={`${btn} justify-center`}><RotateCcw className="w-4 h-4" /> Bắt đầu lại</button>
        </div>
      </aside>
    </div>
  );
};

export default KetQuaFile;
