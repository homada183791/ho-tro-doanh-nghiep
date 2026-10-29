/**
 * Hồ sơ sau thành lập: đọc Giấy chứng nhận đăng ký doanh nghiệp, bổ sung thông tin rồi điền mọi mẫu Word có trường {{...}}.
 * Chuyển từ tool dien_mau.py; trang riêng, không dùng chung state với các form khác.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Files, Download, Loader2, ScanLine, Upload, X, AlertTriangle, CheckCircle, FolderOpen, RefreshCw, Plus, Sparkles } from 'lucide-react';
import { extractBusinessLicense } from '../services/gemini';
import { aiErrorMessage } from '../services/aiClient';
import { filesThanhAnh } from '../services/pdfAnh';
import { zipFiles, downloadBytes, DOCX_MIME } from '../services/tronHoSo';
import {
  TRUONG, NHOM, giaTriBanDau, ghiNho, docNho, truongTuGpkd, truongTrongMau, dienFile, taiMauMayChu, tenThuMucKetQua, traCoQuan, docGpPdf, type MauSTL, type CoQuanTra,
} from '../services/dienMau';

const inputCls = 'w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
const DA_BIET = new Set(TRUONG.map(([k]) => k));

type KetQua = { ten: string; bytes: Uint8Array; thieu: string[] };

export const SauThanhLapForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [vals, setVals] = useState<Record<string, string>>(() => giaTriBanDau());
  const [mau, setMau] = useState<MauSTL[]>([]);
  const [chon, setChon] = useState<Record<string, boolean>>({});
  const [thuMuc, setThuMuc] = useState('');
  const [mauLoi, setMauLoi] = useState<string | null>(null);
  const [mauBusy, setMauBusy] = useState(false);
  const [anh, setAnh] = useState<{ base64: string; mimeType: string; preview?: string }[]>([]);
  const [pdfGoc, setPdfGoc] = useState<Uint8Array[]>([]); // file PDF gốc để máy chủ đọc thẳng lớp chữ
  const [docBusy, setDocBusy] = useState(false);
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ketQua, setKetQua] = useState<KetQua[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const napMau = async () => {
    setMauBusy(true); setMauLoi(null);
    try {
      const r = await taiMauMayChu();
      setThuMuc(r.thuMuc);
      setMau((cu) => [...r.mau, ...cu.filter((m) => m.nguon === 'tam')]);
      setChon((c) => { const n = { ...c }; r.mau.forEach((m) => { if (n[m.ten] === undefined) n[m.ten] = true; }); return n; });
    } catch (e) { setMauLoi(aiErrorMessage(e)); }
    finally { setMauBusy(false); }
  };
  useEffect(() => { napMau(); }, []);
  // Thông tin nhớ dùng chung (người ủy quyền, kế toán, email...): chỉ điền vào ô còn trống
  const [nho, setNho] = useState<Record<string, string>>({});
  useEffect(() => {
    docNho().then((n) => {
      setNho(n);
      const macDinh = giaTriBanDau(n);
      setVals((v) => Object.fromEntries(Object.keys({ ...macDinh, ...v }).map((k) => [k, (v[k] || '').trim() ? v[k] : macDinh[k] || ''])));
    });
  }, []);

  // AI tra Kính gửi cơ quan thuế / BHXH theo địa chỉ trụ sở
  const [tra, setTra] = useState<Record<string, { busy: boolean; kq?: CoQuanTra; loi?: string }>>({});
  const traAI = async (k: 'CO_QUAN_THUE' | 'CO_QUAN_BHXH', diaChi = vals.DIA_CHI || '', ten = vals.TEN_CONG_TY || '') => {
    setTra((t) => ({ ...t, [k]: { busy: true } }));
    try {
      const kq = await traCoQuan(k === 'CO_QUAN_THUE' ? 'thue' : 'bhxh', diaChi, ten);
      setVals((v) => ({ ...v, [k]: kq.ten }));
      setTra((t) => ({ ...t, [k]: { busy: false, kq } }));
    } catch (e) { setTra((t) => ({ ...t, [k]: { busy: false, loi: aiErrorMessage(e) } })); }
  };

  const themMauTam = async (list: File[]) => {
    const moi: MauSTL[] = [];
    for (const f of list) if (/\.docx$/i.test(f.name)) moi.push({ ten: f.name, bytes: new Uint8Array(await f.arrayBuffer()), nguon: 'tam' });
    setMau((cu) => [...cu.filter((m) => !moi.some((x) => x.ten === m.ten)), ...moi]);
    setChon((c) => ({ ...c, ...Object.fromEntries(moi.map((m) => [m.ten, true])) }));
  };

  const mauChon = mau.filter((m) => chon[m.ten]);
  // Các trường xuất hiện trong mẫu đã chọn (để tô đỏ ô còn trống) và trường lạ chưa có trong danh sách
  const canDung = useMemo(() => {
    const s = new Set<string>();
    for (const m of mauChon) { try { truongTrongMau(m.bytes).forEach((k) => s.add(k)); } catch { /* mẫu hỏng: báo khi tạo */ } }
    return s;
  }, [mau, chon]);
  const truongKhac = [...canDung].filter((k) => !DA_BIET.has(k)).sort();

  const docGiayPhep = async () => {
    setDocBusy(true); setDocMsg(null);
    try {
      // 1) PDF gốc: máy chủ đọc thẳng lớp chữ (chính xác, không tốn lượt AI); 2) không được thì AI đọc ảnh
      let gp: Record<string, string> | null = null;
      let nguon = '';
      if (pdfGoc.length) {
        const kq = await docGpPdf(pdfGoc[0]);
        gp = kq.fields;
        nguon = gp ? 'đọc trực tiếp từ PDF (không dùng AI)' : `AI (vì ${kq.lyDo})`;
      }
      if (!gp) {
        const g = await extractBusinessLicense(anh.map(({ base64, mimeType }) => ({ base64, mimeType })));
        gp = truongTuGpkd(g);
        if (!nguon) nguon = 'AI đọc ảnh — nên soát lại tên và số';
      }
      if (!gp.TEN_CONG_TY && !gp.MST) throw new Error('Không đọc được tên và mã số doanh nghiệp. Hãy dùng file PDF/ảnh rõ hơn.');
      setVals((v) => ({ ...v, ...gp, EMAIL: gp.EMAIL || nho.EMAIL || v.EMAIL || '' }));
      setDocMsg({ ok: true, text: `Đã đọc ${Object.keys(gp).length} trường từ giấy phép của ${gp.TEN_CONG_TY || gp.MST} — ${nguon}. Đang tra cơ quan thuế và BHXH theo địa chỉ trụ sở...` });
      // Tự tra Kính gửi cơ quan thuế và BHXH ngay sau khi đọc được địa chỉ
      if (gp.DIA_CHI) { traAI('CO_QUAN_THUE', gp.DIA_CHI, gp.TEN_CONG_TY); traAI('CO_QUAN_BHXH', gp.DIA_CHI, gp.TEN_CONG_TY); }
    } catch (e) { setDocMsg({ ok: false, text: aiErrorMessage(e) }); }
    finally { setDocBusy(false); }
  };

  const taoHoSo = () => {
    setLoi(null); setKetQua(null);
    if (!vals.TEN_CONG_TY?.trim()) { setLoi('Chưa có tên công ty — hãy đọc giấy phép trước hoặc nhập tay.'); return; }
    if (!mauChon.length) { setLoi(mau.length ? 'Chưa chọn mẫu nào.' : 'Chưa có mẫu: chép file .docx vào thư mục mẫu trên máy chủ hoặc bấm "Thêm mẫu".'); return; }
    ghiNho(vals);
    const v = Object.fromEntries(Object.entries(vals).map(([k, x]) => [k, (x || '').trim()]));
    try {
      setKetQua(mauChon.map((m) => ({ ten: m.ten, ...dienFile(m.bytes, v) })));
    } catch (e) { setLoi(e instanceof Error ? e.message : String(e)); }
  };

  const thuMucKq = tenThuMucKetQua(vals);
  const taiZip = () => ketQua && downloadBytes(zipFiles(ketQua.map((k) => ({ name: k.ten, bytes: k.bytes }))), `${thuMucKq}.zip`, 'application/zip');

  const o = (k: string, label: string) => {
    const trong = !(vals[k] || '').trim();
    const can = canDung.has(k);
    const coAI = k === 'CO_QUAN_THUE' || k === 'CO_QUAN_BHXH';
    const t = tra[k];
    const o = (
      <input className={`${inputCls} ${trong && can ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`} value={vals[k] || ''}
        aria-label={label} onChange={(e) => setVals((x) => ({ ...x, [k]: e.target.value }))} />
    );
    if (!coAI) return (
      <label key={k} className="block">
        <span className={labelCls}>{label} <span className="font-mono text-[10px] text-slate-400">{`{{${k}}}`}</span></span>
        {o}
      </label>
    );
    const loai = k === 'CO_QUAN_THUE' ? 'thuế' : 'BHXH';
    return (
      <div key={k} className="block md:col-span-3">
        <span className={labelCls}>{label} <span className="font-mono text-[10px] text-slate-400">{`{{${k}}}`}</span></span>
        <div className="flex gap-2">
          {o}
          <button type="button" onClick={() => traAI(k as 'CO_QUAN_THUE' | 'CO_QUAN_BHXH')} disabled={!!t?.busy || !(vals.DIA_CHI || '').trim()}
            title={`AI tra cơ quan ${loai} theo địa chỉ trụ sở`}
            className="shrink-0 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs flex items-center gap-1 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">
            {t?.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Tra {loai} (AI)
          </button>
        </div>
        {t?.loi && <p role="status" className="text-xs text-red-700 mt-1">{t.loi}</p>}
        {t?.kq && (
          <p role="status" className={`text-xs mt-1 ${t.kq.canKiemTra ? 'text-amber-700' : 'text-green-700'}`}>
            {t.kq.canKiemTra ? 'Nên kiểm tra lại: ' : 'Đã tra: '}{t.kq.lyDo || t.kq.ten}{t.kq.diaChi ? ` · Địa chỉ: ${t.kq.diaChi}` : ''}{t.kq.nguon.length ? ` (Nguồn: ${t.kq.nguon.join('; ')})` : ''}
            {' '}<a className="underline text-blue-700" target="_blank" rel="noreferrer"
              href={`https://www.google.com/search?q=${encodeURIComponent(`${k === 'CO_QUAN_THUE' ? 'thuế cơ sở quản lý' : 'bảo hiểm xã hội cơ sở'} ${vals.DIA_CHI || ''}`)}`}>Kiểm tra trên Google</a>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-12 px-4">
      <header className="mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-4 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4" /> Quay lại chọn thủ tục
        </button>
        <h2 className="text-3xl font-bold text-slate-800">Hồ sơ sau thành lập</h2>
        <p className="text-slate-500 mt-2">Đọc Giấy chứng nhận đăng ký doanh nghiệp, bổ sung thông tin rồi điền vào mọi mẫu Word có trường dạng <span className="font-mono">{'{{TEN_TRUONG}}'}</span>.</p>
      </header>

      <div className="space-y-6">
        {/* 1. Giấy phép */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <h3 className="text-lg font-semibold text-slate-800">1. Giấy chứng nhận đăng ký doanh nghiệp</h3>
          <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {anh.map((f, i) => (
                <span key={i} className="relative inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {f.preview ? <img src={f.preview} alt="" className="w-12 h-16 object-cover" /> : <span className="w-12 h-16 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-400" /></span>}
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] text-center">Trang {i + 1}</span>
                  <button type="button" aria-label={`Xóa trang ${i + 1}`} onClick={() => { setAnh((p) => p.filter((_, j) => j !== i)); if (anh.length <= 1) setPdfGoc([]); }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 text-red-600"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <label className="w-12 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-white cursor-pointer flex items-center justify-center text-slate-500" title="Thêm file PDF hoặc ảnh giấy phép">
                <Upload className="w-4 h-4" />
                <input type="file" accept="application/pdf,image/*" multiple className="hidden" aria-label="Chọn file giấy phép"
                  onChange={async (e) => {
                    const l = Array.from(e.target.files || []); e.target.value = '';
                    if (!l.length) return;
                    const pdfs = await Promise.all(l.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)).map(async (f) => new Uint8Array(await f.arrayBuffer())));
                    setPdfGoc((p) => [...p, ...pdfs]);
                    const r = await filesThanhAnh(l); setAnh((p) => [...p, ...r]); setDocMsg(null);
                  }} />
              </label>
              <span className="text-xs text-slate-500">PDF giấy phép từ Cổng thông tin hoặc ảnh chụp (nhiều trang được)</span>
              <button type="button" onClick={docGiayPhep} disabled={!anh.length || docBusy}
                className="ml-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
                {docBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} {docBusy ? 'Đang đọc...' : 'Đọc giấy phép'}
              </button>
            </div>
            {docMsg && <p role="status" className={`mt-2 text-sm ${docMsg.ok ? 'text-green-700' : 'text-red-700'}`}>{docMsg.text}</p>}
          </div>
        </section>

        {/* 2. Mẫu */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-800 mr-auto">2. Mẫu cần điền ({mauChon.length}/{mau.length})</h3>
            <button type="button" onClick={napMau} disabled={mauBusy} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm flex items-center gap-1 hover:bg-slate-50">
              {mauBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
            </button>
            <label className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm flex items-center gap-1 hover:bg-slate-50 cursor-pointer">
              <Plus className="w-4 h-4" /> Thêm mẫu
              <input type="file" accept=".docx" multiple className="hidden" aria-label="Thêm mẫu Word"
                onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ''; themMauTam(l); }} />
            </label>
          </div>
          <p className="text-xs text-slate-500"><FolderOpen className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Mẫu dùng chung: chép file .docx vào thư mục <span className="font-mono break-all">{thuMuc || 'mau-sau-thanh-lap'}</span> trên máy chủ rồi bấm "Tải lại". "Thêm mẫu" chỉ dùng tạm trên trình duyệt này.</p>
          {mauLoi && <p className="text-sm text-red-700">{mauLoi}</p>}
          {mau.length === 0 && !mauBusy && <p className="text-sm text-amber-700">Chưa có mẫu nào.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {mau.map((m) => (
              <label key={m.ten} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm cursor-pointer ${chon[m.ten] ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200'}`}>
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={!!chon[m.ten]} onChange={() => setChon((c) => ({ ...c, [m.ten]: !c[m.ten] }))} />
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">{m.ten}</span>
                {m.nguon === 'tam' && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">tạm</span>}
              </label>
            ))}
          </div>
        </section>

        {/* 3. Thông tin */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
          <h3 className="text-lg font-semibold text-slate-800">3. Thông tin điền vào mẫu</h3>
          <p className="text-xs text-slate-500 -mt-3">Ô viền đỏ: mẫu đã chọn có dùng nhưng còn trống. Các ô về cơ quan thuế, BHXH, người ủy quyền, kế toán được nhớ cho lần sau.</p>
          {NHOM.map(([g, tieuDe]) => (
            <div key={g}>
              <p className="text-sm font-semibold text-blue-700 mb-2">{tieuDe}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {TRUONG.filter(([, , n]) => n === g).map(([k, label]) => o(k, label))}
              </div>
            </div>
          ))}
          {truongKhac.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-blue-700 mb-2">Trường khác có trong mẫu</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{truongKhac.map((k) => o(k, k))}</div>
            </div>
          )}
        </section>

        {/* 4. Tạo */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <button type="button" onClick={taoHoSo}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2">
            <Files className="w-5 h-5" /> Tạo hồ sơ
          </button>
          {loi && <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {loi}</div>}
          {ketQua && (
            <div className="space-y-3">
              <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Đã tạo {ketQua.length} file cho {vals.TEN_CONG_TY}.</p>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {ketQua.map((k) => (
                  <li key={k.ten} className="flex items-center gap-3 p-3">
                    <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{k.ten}</p>
                      {k.thieu.length > 0 && <p className="text-xs text-amber-700">Còn trống (giữ nguyên {'{{...}}'}): {k.thieu.join(', ')}</p>}
                    </div>
                    <button type="button" onClick={() => downloadBytes(k.bytes, k.ten, DOCX_MIME)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1"><Download className="w-4 h-4" /> Tải</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={taiZip}
                className="w-full py-2.5 rounded-xl border border-blue-600 text-blue-700 font-medium hover:bg-blue-50 flex items-center justify-center gap-2"><Files className="w-4 h-4" /> Tải trọn bộ (.zip): {thuMucKq}</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SauThanhLapForm;
