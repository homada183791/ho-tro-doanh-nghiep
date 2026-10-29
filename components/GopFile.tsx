/**
 * Gộp & sắp xếp từng trang Word/PDF thành 1 file PDF (chuyển từ tool merge_word_gui.py).
 * Thêm file -> tự tách từng trang có ảnh xem trước -> kéo thả sắp xếp -> gộp và tải về.
 */
import React, { useRef, useState } from 'react';
import { Files, FolderPlus, Plus, Trash2, X, ZoomIn, Loader2, Download, GripVertical, FileWarning, Scissors } from 'lucide-react';
import { docNguon, tachTrang, anhLon, gopTrang, fileHopLe, tenNhom, tenFileSach, type NguonPdf, type TrangGop } from '../services/gopPdf';
import KetQuaFile, { type FileKetQua } from './KetQuaFile';

/** Màu nhãn theo file gốc (giống Smallpdf: trang cùng file cùng màu). */
const MAU_FILE = ['bg-rose-100 text-rose-800', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-lime-100 text-lime-800', 'bg-orange-100 text-orange-800', 'bg-teal-100 text-teal-800'];
import { downloadBytes } from '../services/tronHoSo';

const GopFile: React.FC = () => {
  const nguon = useRef(new Map<string, NguonPdf>());
  const [trang, setTrang] = useState<TrangGop[]>([]);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [loiFile, setLoiFile] = useState<string[]>([]);
  const [dangXuLy, setDangXuLy] = useState<string | null>(null);
  const [nhatKy, setNhatKy] = useState<string[]>([]);
  const [tenKq, setTenKq] = useState('ket_qua_gop');
  const [dangGop, setDangGop] = useState(false);
  const [keo, setKeo] = useState<string | null>(null);
  const [tha, setTha] = useState(false);
  const [phongTo, setPhongTo] = useState<{ t: TrangGop; anh?: string; loi?: string } | null>(null);
  const daThem = useRef(new Set<string>());
  // Vết cắt: key của trang mà SAU nó sẽ cắt sang file mới (đi theo trang khi kéo thả)
  const [cat, setCat] = useState<Set<string>>(new Set());
  const [ketQua, setKetQua] = useState<FileKetQua[] | null>(null);
  const [tenZip, setTenZip] = useState('ket_qua_gop');
  const thuTuNguon = useRef(new Map<string, number>());

  const ghi = (m: string) => setNhatKy((l) => [...l.slice(-40), m]);

  const themFile = async (list: File[]) => {
    const hopLe = list.filter(fileHopLe).filter((f) => {
      const k = `${f.name}|${f.size}|${f.lastModified}`;
      if (daThem.current.has(k)) return false;
      daThem.current.add(k); return true;
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
    if (!hopLe.length) { if (list.length) ghi('Không có file .docx hoặc .pdf mới để thêm.'); return; }
    for (const f of hopLe) {
      setDangXuLy(`Đang xử lý: ${f.name}`);
      ghi(`Đang xử lý: ${f.name}${/\.docx$/i.test(f.name) ? ' (đổi Word sang PDF)' : ''}...`);
      try {
        const n = await docNguon(f);
        nguon.current.set(n.id, n);
        thuTuNguon.current.set(n.id, thuTuNguon.current.size);
        const ds = await tachTrang(n);
        setTrang((t) => [...t, ...ds]);
        ghi(`✓ ${f.name}: ${ds.length} trang`);
      } catch (e) {
        const lyDo = e instanceof Error ? e.message : String(e);
        setLoiFile((l) => [...l, `${f.name}: ${lyDo}`]);
        ghi(`⚠️ Không xử lý được '${f.name}': ${lyDo}`);
      }
    }
    setDangXuLy(null);
  };

  const xoa = (keys: Set<string>) => {
    setTrang((t) => t.filter((x) => !keys.has(x.key)));
    setChon((c) => { const n = new Set(c); keys.forEach((k) => n.delete(k)); return n; });
    setCat((c) => { const n = new Set(c); keys.forEach((k) => n.delete(k)); return n; });
  };
  const tatCa = trang.length > 0 && trang.every((t) => chon.has(t.key));

  // Kéo thả sắp xếp: di chuyển ngay khi rê qua thẻ khác
  const diChuyen = (tu: string, den: string) => {
    if (tu === den) return;
    setTrang((t) => {
      const a = t.findIndex((x) => x.key === tu), b = t.findIndex((x) => x.key === den);
      if (a < 0 || b < 0) return t;
      const n = [...t]; const [x] = n.splice(a, 1); n.splice(b, 0, x); return n;
    });
  };
  const dichMot = (key: string, buoc: number) => setTrang((t) => {
    const a = t.findIndex((x) => x.key === key), b = a + buoc;
    if (a < 0 || b < 0 || b >= t.length) return t;
    const n = [...t]; [n[a], n[b]] = [n[b], n[a]]; return n;
  });

  const xemLon = async (t: TrangGop) => {
    setPhongTo({ t });
    const n = nguon.current.get(t.nguonId);
    if (!n) return setPhongTo({ t, loi: 'Không còn file nguồn.' });
    try { setPhongTo({ t, anh: await anhLon(n, t.trang) }); } catch (e) { setPhongTo({ t, loi: String(e) }); }
  };

  /** Chia các trang (theo thứ tự đang sắp) thành nhóm tại các vết cắt. */
  const nhomTrang = (): TrangGop[][] => {
    const out: TrangGop[][] = []; let hien: TrangGop[] = [];
    trang.forEach((t, i) => { hien.push(t); if (i === trang.length - 1 || cat.has(t.key)) { out.push(hien); hien = []; } });
    return out;
  };
  const soVetCat = trang.slice(0, -1).filter((t) => cat.has(t.key)).length;
  const doiVetCat = (key: string) => setCat((c) => { const n = new Set(c); n.has(key) ? n.delete(key) : n.add(key); return n; });

  /** Tên gợi ý cho 1 phần: cùng 1 file gốc thì lấy tên file đó (+ số trang nếu chỉ lấy 1 phần), khác file thì "tên kết quả-phần N". */
  const tenPhan = (ds: TrangGop[], i: number) => {
    const cungNguon = ds.every((t) => t.nguonId === ds[0].nguonId);
    if (!cungNguon) return `${tenFileSach(tenKq, 'ket_qua_gop')}-phan-${i + 1}`;
    const goc = tenFileSach(ds[0].ten.replace(/\.(pdf|docx)$/i, ''), `phan-${i + 1}`);
    const du = ds.length === ds[0].tong && ds.every((t, j) => t.trang === j + 1);
    return du ? goc : `${goc}-trang-${tenNhom(ds.map((t) => t.trang))}`;
  };

  const gop = async () => {
    if (!trang.length) { ghi('Chưa có trang nào để gộp.'); return; }
    setDangGop(true); setNhatKy([]);
    try {
      if (soVetCat) {
        const nhom = nhomTrang();
        ghi(`Sẽ tạo ${nhom.length} file theo các vết cắt.`);
        const ds: FileKetQua[] = [];
        for (let i = 0; i < nhom.length; i++) {
          ds.push({ ten: tenPhan(nhom[i], i), bytes: await gopTrang(nhom[i], nguon.current), anh: nhom[i][0].anh, soTrang: nhom[i].length,
            moTa: [...new Set(nhom[i].map((t) => t.ten))].join(', ') });
        }
        setTenZip(tenFileSach(tenKq, 'ket_qua_gop'));
        setKetQua(ds);
        ghi(`✅ Đã tạo ${ds.length} file.`);
        return;
      }
      ghi(`Sẽ gộp ${trang.length} trang theo thứ tự đã sắp xếp.`);
      const pdf = await gopTrang(trang, nguon.current);
      const ten = `${tenFileSach(tenKq, 'ket_qua_gop')}.pdf`;
      downloadBytes(pdf, ten, 'application/pdf');
      ghi(`✅ Đã gộp xong: ${ten} (${trang.length} trang)`);
    } catch (e) { ghi(`❌ Lỗi: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDangGop(false); }
  };

  const btn = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50';

  if (ketQua) {
    return <KetQuaFile files={ketQua} onFiles={setKetQua} tenZip={tenZip} onTenZip={setTenZip}
      onQuayLai={() => setKetQua(null)} nhanQuayLai="Sửa trang" onBatDauLai={() => {
        setKetQua(null); setTrang([]); setChon(new Set()); setCat(new Set()); setLoiFile([]); setNhatKy([]);
        nguon.current.clear(); thuTuNguon.current.clear(); daThem.current.clear();
      }} />;
  }

  return (
    <div>
      <p className="text-slate-500 mb-4">Thêm file Word hoặc PDF: mỗi trang tự tách thành 1 thẻ có ảnh xem trước. Kéo thả để sắp thứ tự trang, rồi gộp thành 1 file PDF. Bấm cây kéo giữa 2 trang để tách thành nhiều file.</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-700 mr-2">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={tatCa} disabled={!trang.length}
            onChange={() => setChon(tatCa ? new Set() : new Set(trang.map((t) => t.key)))} /> Chọn tất cả
        </label>
        <button type="button" className={btn} disabled={!chon.size} onClick={() => xoa(chon)}><Trash2 className="w-4 h-4" /> Xóa trang đã chọn{chon.size ? ` (${chon.size})` : ''}</button>
        <button type="button" className={btn} disabled={trang.length < 2} onClick={() => setCat(new Set(trang.slice(0, -1).map((t) => t.key)))}><Scissors className="w-4 h-4" /> Cắt từng trang</button>
        <button type="button" className={btn} disabled={!soVetCat} onClick={() => setCat(new Set())}>Bỏ hết vết cắt{soVetCat ? ` (${soVetCat})` : ''}</button>
        <span className="flex-1" />
        <label className={`${btn} cursor-pointer`}>
          <FolderPlus className="w-4 h-4" /> Thêm cả thư mục
          <input type="file" className="hidden" multiple aria-label="Thêm cả thư mục"
            {...({ webkitdirectory: '', directory: '' } as any)}
            onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ''; themFile(l); }} />
        </label>
        <label className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer">
          <Plus className="w-4 h-4" /> Thêm file
          <input type="file" className="hidden" multiple accept=".pdf,.docx,application/pdf" aria-label="Thêm file Word hoặc PDF"
            onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ''; themFile(l); }} />
        </label>
      </div>

      <section
        className={`min-h-[320px] rounded-2xl border-2 border-dashed p-4 transition-colors ${tha ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-100/70'}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setTha(true); } }}
        onDragLeave={() => setTha(false)}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setTha(false); themFile(Array.from(e.dataTransfer.files)); } }}
      >
        {!trang.length && !dangXuLy && (
          <div className="h-[280px] flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-2">
            <Files className="w-10 h-10 text-slate-400" />
            <p>Chưa có trang nào. Bấm <b>Thêm file</b> hoặc kéo file Word/PDF vào đây.</p>
            <p>Mỗi trang trong file sẽ tách thành 1 thẻ riêng — kéo thả để sắp xếp lại thứ tự trang.</p>
          </div>
        )}
        <div className="flex flex-wrap items-stretch gap-y-3">
          {trang.map((t, i) => (
            <React.Fragment key={t.key}>
            <div draggable
              onDragStart={(e) => { setKeo(t.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.key); }}
              onDragEnter={() => keo && diChuyen(keo, t.key)}
              onDragOver={(e) => { if (keo) e.preventDefault(); }}
              onDragEnd={() => setKeo(null)}
              className={`group relative w-36 sm:w-40 bg-white rounded-xl border shadow-sm p-2 select-none cursor-grab active:cursor-grabbing ${keo === t.key ? 'opacity-40 border-blue-500' : chon.has(t.key) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
              <div className="flex items-center gap-1 mb-1">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" aria-label={`Chọn trang ${i + 1}`} checked={chon.has(t.key)}
                  onChange={() => setChon((c) => { const n = new Set(c); n.has(t.key) ? n.delete(t.key) : n.add(t.key); return n; })} />
                <span className="text-xs font-semibold text-slate-500">#{i + 1}</span>
                <GripVertical className="w-3.5 h-3.5 text-slate-300 ml-auto" />
                <button type="button" title="Xem phóng to" aria-label={`Xem phóng to trang ${i + 1}`} onClick={() => xemLon(t)} className="p-0.5 text-slate-500 hover:text-blue-600"><ZoomIn className="w-4 h-4" /></button>
                <button type="button" title="Xóa trang" aria-label={`Xóa trang ${i + 1}`} onClick={() => xoa(new Set([t.key]))} className="p-0.5 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
              <img src={t.anh} alt={`${t.ten} trang ${t.trang}`} draggable={false} onDoubleClick={() => xemLon(t)}
                className="w-full aspect-[3/4] object-contain bg-white border border-slate-100 rounded" />
              <p className={`mt-1 text-[11px] leading-tight text-center truncate rounded px-1 py-0.5 ${MAU_FILE[(thuTuNguon.current.get(t.nguonId) ?? 0) % MAU_FILE.length]}`} title={t.ten}>{t.ten}</p>
              <p className="text-[11px] text-slate-400 text-center">trang {t.trang}/{t.tong}</p>
              {/* Nút chuyển trái/phải cho điện thoại (không kéo thả được) */}
              <div className="flex justify-between mt-1 md:hidden">
                <button type="button" className="text-xs px-2 py-0.5 rounded border border-slate-200" disabled={i === 0} onClick={() => dichMot(t.key, -1)}>‹</button>
                <button type="button" className="text-xs px-2 py-0.5 rounded border border-slate-200" disabled={i === trang.length - 1} onClick={() => dichMot(t.key, 1)}>›</button>
              </div>
            </div>
            {i < trang.length - 1 && (
              <div className="relative w-10 flex items-center justify-center">
                <span className={`absolute inset-y-1 left-1/2 border-l-2 border-dashed ${cat.has(t.key) ? 'border-red-500' : 'border-slate-300/70'}`} />
                <button type="button" onClick={() => doiVetCat(t.key)} aria-pressed={cat.has(t.key)}
                  title={cat.has(t.key) ? 'Bỏ vết cắt' : 'Cắt ở đây (tách thành file mới)'} aria-label={`${cat.has(t.key) ? 'Bỏ vết cắt' : 'Cắt'} sau trang #${i + 1}`}
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shadow transition-colors ${cat.has(t.key) ? 'bg-red-500 text-white' : 'bg-blue-500/80 text-white hover:bg-blue-600'}`}>
                  <Scissors className="w-4 h-4" />
                </button>
              </div>
            )}
            </React.Fragment>
          ))}
          {dangXuLy && (
            <div className="bg-white/70 rounded-xl border border-dashed border-slate-300 p-2 flex flex-col items-center justify-center text-xs text-slate-500 aspect-[3/4.4]">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mb-2" /> <span className="text-center px-1">{dangXuLy}</span>
            </div>
          )}
        </div>
      </section>

      {loiFile.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <p className="font-semibold flex items-center gap-1"><FileWarning className="w-4 h-4" /> File không xử lý được (không có trong danh sách gộp):</p>
          <ul className="list-disc ml-6">{loiFile.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <button type="button" className="text-xs underline mt-1" onClick={() => setLoiFile([])}>Ẩn</button>
        </div>
      )}

      <section className="mt-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="block flex-1">
            <span className="block text-xs font-medium text-slate-600 mb-1">{soVetCat ? 'Tên file zip (đổi tên từng file ở bước sau)' : 'Tên file kết quả'}</span>
            <div className="flex items-center">
              <input className="w-full p-2 border border-slate-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={tenKq} onChange={(e) => setTenKq(e.target.value)} />
              <span className="px-3 py-2 border border-l-0 border-slate-300 rounded-r-lg bg-slate-50 text-sm text-slate-500">{soVetCat ? '.zip' : '.pdf'}</span>
            </div>
          </label>
          <button type="button" onClick={gop} disabled={dangGop || !trang.length || !!dangXuLy}
            className="sm:w-72 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 disabled:bg-slate-300">
            {dangGop ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} {dangGop ? 'Đang xử lý...' : soVetCat ? `Gộp & cắt thành ${soVetCat + 1} file` : `Gộp thành PDF${trang.length ? ` (${trang.length} trang)` : ''}`}
          </button>
        </div>
        {nhatKy.length > 0 && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 max-h-40 overflow-auto text-xs text-slate-600 font-mono" role="log" aria-label="Nhật ký">
            {nhatKy.map((x, i) => <div key={i}>{x}</div>)}
          </div>
        )}
      </section>

      {phongTo && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 flex flex-col items-center justify-center p-4" onClick={() => setPhongTo(null)}
          role="dialog" aria-label="Xem phóng to" onKeyDown={(e) => e.key === 'Escape' && setPhongTo(null)} tabIndex={-1}>
          <div className="text-white text-sm mb-2">{phongTo.t.ten} — trang {phongTo.t.trang}/{phongTo.t.tong}</div>
          {phongTo.anh ? <img src={phongTo.anh} alt="" className="max-h-[85vh] max-w-full bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} />
            : phongTo.loi ? <p className="text-red-200">{phongTo.loi}</p>
            : <Loader2 className="w-8 h-8 animate-spin text-white" />}
          <button type="button" className="mt-3 px-4 py-1.5 rounded-lg bg-white text-slate-800 text-sm" onClick={() => setPhongTo(null)}>Đóng</button>
        </div>
      )}
    </div>
  );
};

export default GopFile;
