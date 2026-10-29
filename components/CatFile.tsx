/**
 * Cắt 1 file PDF (hoặc Word) thành nhiều file nhỏ, giống Smallpdf "Chia tách PDF":
 *  - bấm hình kéo giữa 2 trang để đặt/bỏ vết cắt, hoặc "Cắt từng trang", hoặc nhập khoảng trang (1-3, 5, 7-9)
 *  - kết quả: danh sách file nhỏ có ảnh xem trước, đổi tên từng file, tải riêng từng file
 *    hoặc tải tất cả trong 1 file .zip (đổi được tên file zip).
 */
import React, { useMemo, useState } from 'react';
import { Scissors, Upload, Loader2, Download, Files, RotateCcw, ArrowLeft, CheckCircle2, ZoomIn, Pencil } from 'lucide-react';
import { docNguon, tachTrang, anhLon, fileHopLe, catPdf, docKhoangTrang, nhomTuVetCat, tenNhom, tenFileSach, type NguonPdf, type TrangGop } from '../services/gopPdf';
import { downloadBytes, zipFiles } from '../services/tronHoSo';

interface KetQua { ten: string; bytes: Uint8Array; trang: number[]; anh: string }

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
  const [ketQua, setKetQua] = useState<KetQua[] | null>(null);
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
        return { ten, bytes, trang: nhom[i], anh: trang[nhom[i][0] - 1]?.anh || '' };
      }));
    } catch (e) { setLoi(`Lỗi khi cắt: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDangCat(false); }
  };

  /** Tên cuối cùng của từng file (không trùng nhau trong file zip). */
  const tenCuoi = (ds: KetQua[]) => {
    const dung = new Map<string, number>();
    return ds.map((k, i) => {
      const goc2 = tenFileSach(k.ten, `${goc}-${i + 1}`);
      const n = dung.get(goc2.toLowerCase()) || 0;
      dung.set(goc2.toLowerCase(), n + 1);
      return `${n ? `${goc2} (${n + 1})` : goc2}.pdf`;
    });
  };
  const taiMot = (i: number) => ketQua && downloadBytes(ketQua[i].bytes, tenCuoi(ketQua)[i], 'application/pdf');
  const taiZip = () => {
    if (!ketQua) return;
    const ten = tenCuoi(ketQua);
    downloadBytes(zipFiles(ketQua.map((k, i) => ({ name: ten[i], bytes: k.bytes }))), `${tenFileSach(tenZip, `${goc}-cat`)}.zip`, 'application/zip');
  };
  const batDauLai = () => { setNguon(null); setTrang([]); setKetQua(null); setCat(new Set()); setNhomTuyChon(null); setKhoang(''); setLoi(null); };

  const xemLon = async (so: number) => {
    if (!nguon) return;
    setPhongTo({ so });
    try { setPhongTo({ so, anh: await anhLon(nguon, so) }); } catch { setPhongTo(null); }
  };

  const btn = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50';
  const oTen = 'bg-transparent border-0 border-b border-dashed border-slate-400 focus:border-solid focus:border-blue-600 outline-none px-0.5 py-0.5 min-w-0';

  /* ---------------- Bước 3: kết quả ---------------- */
  if (ketQua) {
    const ten = tenCuoi(ketQua);
    return (
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {ketQua.map((k, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <img src={k.anh} alt="" className="w-16 h-20 object-contain border border-slate-200 rounded bg-white shadow-sm shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-slate-800">
                  <input className={`${oTen} flex-1 text-base`} value={k.ten} aria-label={`Tên file ${i + 1}`}
                    onChange={(e) => setKetQua((l) => l && l.map((x, j) => (j === i ? { ...x, ten: e.target.value } : x)))} />
                  <span className="text-slate-500">.pdf</span>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
                <p className="text-sm mt-1"><span className="text-green-600 font-semibold">Đã xong</span>
                  <span className="text-slate-500"> · {k.trang.length} trang (trang {tenNhom(k.trang).replace(/_/g, ', ')})</span></p>
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
              <input className={`${oTen} flex-1`} value={tenZip} aria-label="Tên file zip" onChange={(e) => setTenZip(e.target.value)} />
              <span className="text-slate-500">.zip</span>
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 mt-1">{ketQua.length} file</p>
          </div>
          <button type="button" onClick={taiZip} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2">
            <Download className="w-5 h-5" /> Tải tất cả (.zip)
          </button>
          <button type="button" onClick={() => ketQua.forEach((_, i) => setTimeout(() => taiMot(i), i * 400))} className={`${btn} w-full justify-center py-2.5`}>
            <Files className="w-4 h-4" /> Tải từng file riêng lẻ
          </button>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setKetQua(null)} className={`${btn} justify-center`}><ArrowLeft className="w-4 h-4" /> Sửa vết cắt</button>
            <button type="button" onClick={batDauLai} className={`${btn} justify-center`}><RotateCcw className="w-4 h-4" /> Bắt đầu lại</button>
          </div>
        </aside>
      </div>
    );
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
