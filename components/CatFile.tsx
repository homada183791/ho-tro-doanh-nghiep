/**
 * Cắt 1 file PDF (hoặc Word) thành nhiều file nhỏ, giống Smallpdf "Chia tách PDF":
 *  - bấm hình kéo giữa 2 trang để đặt/bỏ vết cắt, hoặc "Cắt từng trang", hoặc nhập khoảng trang (1-3, 5, 7-9)
 *  - kết quả: danh sách file nhỏ có ảnh xem trước, đổi tên từng file, tải riêng từng file
 *    hoặc tải tất cả trong 1 file .zip (đổi được tên file zip).
 */
import React, { useMemo, useState } from 'react';
import { Scissors, Upload, Loader2, RotateCcw, ZoomIn } from 'lucide-react';
import { docNguon, tachTrang, anhLon, fileHopLe, catPdf, docKhoangTrang, nhomTuVetCat, tenNhom, tenFileSach, type NguonPdf, type TrangGop } from '../services/gopPdf';
import KetQuaFile, { type FileKetQua } from './KetQuaFile';

const MAU = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-cyan-700'];

const CatFile: React.FC = () => {
  const [nguon, setNguon] = useState<NguonPdf | null>(null);
  const [trang, setTrang] = useState<TrangGop[]>([]);
  const [dangDoc, setDangDoc] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [cat, setCat] = useState<Set<number>>(new Set());
  const [khoang, setKhoang] = useState('');
  const [nhomTuyChon, setNhomTuyChon] = useState<number[][] | null>(null);
  const [dangCat, setDangCat] = useState(false);
  const [ketQua, setKetQua] = useState<FileKetQua[] | null>(null);
  const [tenZip, setTenZip] = useState('');
  const [tha, setTha] = useState(false);
  const [phongTo, setPhongTo] = useState<{ so: number; anh?: string } | null>(null);

  const goc = nguon ? tenFileSach(nguon.ten.replace(/\.(pdf|docx)$/i, ''), 'file') : 'file';
  const tong = trang.length;
  const nhom = useMemo(() => nhomTuyChon ?? (tong ? nhomTuVetCat(tong, cat) : []), [nhomTuyChon, tong, cat]);
  const phanCuaTrang = useMemo(() => {
    const m = new Map<number, number>();
    nhom.forEach((ds, i) => ds.forEach((x) => { if (!m.has(x)) m.set(x, i); }));
    return m;
  }, [nhom]);

  const moFile = async (f?: File) => {
    if (!f) return;
    if (!fileHopLe(f)) { setLoi('Chỉ cắt được file .pdf hoặc .docx'); return; }
    setLoi(null); setKetQua(null); setCat(new Set()); setNhomTuyChon(null); setKhoang(''); setTrang([]); setNguon(null);
    setDangDoc(`Đang đọc ${f.name}${/\.docx$/i.test(f.name) ? ' (đổi Word sang PDF)' : ''}...`);
    try {
      const n = await docNguon(f);
      const ds = await tachTrang(n);
      setNguon(n); setTrang(ds);
      setTenZip(`${tenFileSach(n.ten.replace(/\.(pdf|docx)$/i, ''), 'file')}-cat`);
    } catch (e) {
      setLoi(`Không đọc được '${f.name}': ${e instanceof Error ? e.message : String(e)}`);
    } finally { setDangDoc(null); }
  };

  const doiVetCat = (sau: number) => setCat((c) => { const n = new Set(c); n.has(sau) ? n.delete(sau) : n.add(sau); return n; });
  const apDungKhoang = () => {
    try { setNhomTuyChon(docKhoangTrang(khoang, tong)); setLoi(null); }
    catch (e) { setLoi(e instanceof Error ? e.message : String(e)); }
  };

  const chayCat = async () => {
    if (!nguon || !nhom.length) return;
    setDangCat(true); setLoi(null);
    try {
      const files = await catPdf(nguon.bytes, nhom);
      const dung = new Set<string>();
      setKetQua(files.map((bytes, i) => {
        let ten = `${goc}-trang-${tenNhom(nhom[i])}`;
        for (let k = 2; dung.has(ten); k++) ten = `${goc}-trang-${tenNhom(nhom[i])}-${k}`;
        dung.add(ten);
        return { ten, bytes, soTrang: nhom[i].length, moTa: `trang ${tenNhom(nhom[i]).replace(/_/g, ', ')}`, anh: trang[nhom[i][0] - 1]?.anh || '' };
      }));
    } catch (e) { setLoi(`Lỗi khi cắt: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDangCat(false); }
  };

  const batDauLai = () => { setNguon(null); setTrang([]); setKetQua(null); setCat(new Set()); setNhomTuyChon(null); setKhoang(''); setLoi(null); };

  const xemLon = async (so: number) => {
    if (!nguon) return;
    setPhongTo({ so });
    try { setPhongTo({ so, anh: await anhLon(nguon, so) }); } catch { setPhongTo(null); }
  };

  const btn = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50';

  /* ---------------- Bước 3: kết quả ---------------- */
  if (ketQua) {
    return <KetQuaFile files={ketQua} onFiles={setKetQua} tenZip={tenZip} onTenZip={setTenZip}
      onQuayLai={() => setKetQua(null)} nhanQuayLai="Sửa vết cắt" onBatDauLai={batDauLai} />;
  }

  /* ---------------- Bước 1: chọn file ---------------- */
  if (!nguon) {
    return (
      <section
        className={`rounded-2xl border-2 border-dashed p-10 min-h-[320px] flex flex-col items-center justify-center text-center gap-3 transition-colors ${tha ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-100/70'}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setTha(true); } }}
        onDragLeave={() => setTha(false)}
        onDrop={(e) => { e.preventDefault(); setTha(false); moFile(e.dataTransfer.files[0]); }}>
        {dangDoc ? (<><Loader2 className="w-10 h-10 animate-spin text-blue-600" /><p className="text-slate-600">{dangDoc}</p></>) : (<>
          <Scissors className="w-10 h-10 text-slate-400" />
          <p className="text-slate-600">Kéo 1 file PDF hoặc Word vào đây để cắt thành nhiều file nhỏ</p>
          <label className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4" /> Chọn file
            <input type="file" className="hidden" accept=".pdf,.docx,application/pdf" aria-label="Chọn file để cắt"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; moFile(f); }} />
          </label>
        </>)}
        {loi && <p className="text-sm text-red-600">{loi}</p>}
      </section>
    );
  }

  /* ---------------- Bước 2: đặt vết cắt ---------------- */
  return (
    <div className="space-y-3">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <p className="text-sm text-slate-700"><b>{nguon.ten}</b> · {tong} trang</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={!!nhomTuyChon} onClick={() => setCat(new Set(Array.from({ length: tong - 1 }, (_, i) => i + 1)))}><Scissors className="w-4 h-4" /> Cắt từng trang</button>
          <button type="button" className={btn} disabled={!!nhomTuyChon || !cat.size} onClick={() => setCat(new Set())}>Bỏ hết vết cắt</button>
          <span className="mx-1 text-slate-300">|</span>
          <input className="p-2 border border-slate-300 rounded-lg text-sm w-56 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Khoảng trang: 1-3, 5, 7-9"
            value={khoang} onChange={(e) => setKhoang(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apDungKhoang()} aria-label="Khoảng trang" />
          <button type="button" className={btn} disabled={!khoang.trim()} onClick={apDungKhoang}>Áp dụng</button>
          {nhomTuyChon && <button type="button" className="text-sm text-blue-700 underline" onClick={() => setNhomTuyChon(null)}>Bỏ khoảng trang, dùng vết cắt</button>}
          <span className="flex-1" />
          <button type="button" className={btn} onClick={batDauLai}><RotateCcw className="w-4 h-4" /> Chọn file khác</button>
        </div>
        <p className="text-xs text-slate-500">
          {nhomTuyChon
            ? `Đang cắt theo khoảng trang: ${nhomTuyChon.map((d) => tenNhom(d).replace(/_/g, ', ')).join(' | ')}`
            : 'Bấm vào hình cây kéo giữa 2 trang để đặt hoặc bỏ vết cắt. Mỗi phần (cùng màu) sẽ thành 1 file.'}
        </p>
        {loi && <p className="text-sm text-red-600">{loi}</p>}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4">
        <div className="flex flex-wrap items-stretch gap-y-4">
          {trang.map((t, i) => {
            const so = i + 1, phan = phanCuaTrang.get(so);
            const coCat = !nhomTuyChon && cat.has(so);
            return (
              <React.Fragment key={t.key}>
                <div className={`relative bg-white rounded-xl border shadow-sm p-2 w-36 ${phan === undefined ? 'opacity-40 border-slate-200' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500">Trang {so}</span>
                    <button type="button" title="Xem phóng to" aria-label={`Xem phóng to trang ${so}`} onClick={() => xemLon(so)} className="text-slate-400 hover:text-blue-600"><ZoomIn className="w-4 h-4" /></button>
                  </div>
                  <img src={t.anh} alt={`Trang ${so}`} className="w-full aspect-[3/4] object-contain border border-slate-100 rounded" onDoubleClick={() => xemLon(so)} />
                  <p className={`mt-1 text-[11px] text-center text-white rounded ${phan === undefined ? 'bg-slate-400' : MAU[phan % MAU.length]}`}>
                    {phan === undefined ? 'Không lấy' : `File ${phan + 1}`}
                  </p>
                </div>
                {so < tong && (
                  <button type="button" disabled={!!nhomTuyChon} onClick={() => doiVetCat(so)}
                    title={coCat ? 'Bỏ vết cắt' : 'Cắt ở đây'} aria-label={`${coCat ? 'Bỏ vết cắt' : 'Cắt'} sau trang ${so}`} aria-pressed={coCat}
                    className={`w-9 mx-0.5 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${coCat ? 'bg-red-50 text-red-600' : 'text-slate-300 hover:text-slate-600 hover:bg-white'}`}>
                    <span className={`flex flex-col items-center h-full justify-center ${coCat ? 'border-l-2 border-dashed border-red-500 pl-0' : ''}`}>
                      <Scissors className="w-5 h-5 rotate-90" />
                    </span>
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <button type="button" onClick={chayCat} disabled={dangCat || !nhom.length}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 disabled:bg-slate-300">
        {dangCat ? <Loader2 className="w-5 h-5 animate-spin" /> : <Scissors className="w-5 h-5" />}
        {dangCat ? 'Đang cắt...' : `Cắt PDF thành ${nhom.length} file`}
      </button>

      {phongTo && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 flex flex-col items-center justify-center p-4" onClick={() => setPhongTo(null)} role="dialog" aria-label="Xem phóng to">
          <div className="text-white text-sm mb-2">Trang {phongTo.so}/{tong}</div>
          {phongTo.anh ? <img src={phongTo.anh} alt="" className="max-h-[85vh] max-w-full bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} />
            : <Loader2 className="w-8 h-8 animate-spin text-white" />}
          <button type="button" className="mt-3 px-4 py-1.5 rounded-lg bg-white text-slate-800 text-sm" onClick={() => setPhongTo(null)}>Đóng</button>
        </div>
      )}
    </div>
  );
};

export default CatFile;
