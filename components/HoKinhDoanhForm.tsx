/**
 * Soạn hồ sơ thành lập Hộ kinh doanh: Giấy đề nghị, Hợp đồng dịch vụ, Giấy giới thiệu (trộn Word ngay trên web).
 * Trang riêng, không dùng chung state với form công ty.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Store, User, Users, MapPin, Briefcase, Receipt, Building2, Download, Files, Loader2, Plus, X, ScanLine, Upload, FileText, Sparkles, AlertTriangle, CheckCircle, Calendar, Landmark } from 'lucide-react';
import { extractAddressFromText, lookupIndustryCodes, updateAdministrativeDivisions } from '../services/gemini';
import { aiErrorMessage } from '../services/aiClient';
import { filesThanhAnh } from '../services/pdfAnh';
import { findVsic, normalizeCode, searchVsic } from '../services/vsic';
import { tienBangChu, parseTien, dinhDangTien } from '../services/soThanhChu';
import { tinhMoi } from '../services/tinhThanh';
import { trichXuatHkd, trichXuatCCCD, thuNhoAnh } from '../services/hkdAI';
import { tronBoHoSo, zipFiles, downloadBytes, safeName, DOCX_MIME, type FileHoSo } from '../services/tronHoSo';
import {
  MAU_HKD, MAX_NGANH_HKD, MAX_THANH_VIEN_HKD, CONG_TY_MAC_DINH, emptyHoKinhDoanh, nguoiNopMacDinh, emptyNguoi, buildHkdRecord, kiemTraHkd,
  coQuanHkd, noiKyHkd, tenHkdDayDu, truSoThucTe, soHopDong, diaChiDayDu,
  type HoKinhDoanhData, type NguoiHkd, type DiaChi, type NganhHkd, type CongTyDichVu, type NguoiNop,
} from '../services/hoKinhDoanh';

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
type B64 = { base64: string; mimeType: string };

/* --------------------------------------------------------------- lưu trên trình duyệt */
const LS = { cty: 'legalbiz.hkd.congTy', nv: 'legalbiz.hkd.nguoiNop', stt: 'legalbiz.hkd.soThuTu' };
/** Đọc thông tin đã lưu; ô nào đã lưu nhưng để trống thì dùng giá trị mặc định. */
const docLS = <T extends Record<string, any>,>(k: string, macDinh: T): T => {
  try {
    const v = localStorage.getItem(k);
    if (!v) return macDinh;
    const luu = JSON.parse(v) as Partial<T>;
    const out = { ...macDinh };
    for (const key of Object.keys(luu) as (keyof T)[]) {
      const x = luu[key];
      if (x !== undefined && x !== null && String(x).trim() !== '') out[key] = x as T[keyof T];
    }
    return out;
  } catch { return macDinh; }
};
const ghiLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };
const sttKeTiep = () => {
  try { const v = Number(localStorage.getItem(LS.stt) || '0'); return String((Number.isFinite(v) ? v : 0) + 1); } catch { return ''; }
};

/* --------------------------------------------------------------- ô nhập */
const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; upper?: boolean; className?: string; type?: string; list?: string }> =
  ({ label, value, onChange, placeholder, upper, className, type, list }) => (
    <label className={`block ${className || ''}`}>
      <span className={labelCls}>{label}</span>
      <input type={type || 'text'} list={list} className={`${inputCls} ${upper ? 'uppercase' : ''}`} value={value} placeholder={placeholder}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} />
    </label>
  );

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="inline-flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

const Card: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode; note?: string }> = ({ icon: Icon, title, children, note }) => (
  <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
    <h3 className="text-lg font-semibold mb-1 text-slate-800 flex items-center gap-2">
      <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center"><Icon className="w-4 h-4" /></span>
      {title}
    </h3>
    {note && <p className="text-xs text-slate-500 mb-3 ml-9">{note}</p>}
    <div className="space-y-4 mt-3">{children}</div>
  </section>
);

const TINH_34 = [
  'Thành phố Hà Nội', 'Thành phố Huế', 'Lai Châu', 'Điện Biên', 'Sơn La', 'Lạng Sơn', 'Quảng Ninh', 'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh',
  'Cao Bằng', 'Tuyên Quang', 'Lào Cai', 'Thái Nguyên', 'Phú Thọ', 'Bắc Ninh', 'Hưng Yên', 'Thành phố Hải Phòng', 'Ninh Bình', 'Quảng Trị',
  'Thành phố Đà Nẵng', 'Quảng Ngãi', 'Gia Lai', 'Khánh Hòa', 'Lâm Đồng', 'Đắk Lắk', 'Thành phố Hồ Chí Minh', 'Đồng Nai', 'Tây Ninh',
  'Thành phố Cần Thơ', 'Vĩnh Long', 'Đồng Tháp', 'Cà Mau', 'An Giang',
];

/* --------------------------------------------------------------- rút trích ảnh/PDF */
const DocScan: React.FC<{ title: string; hint?: string; button?: string; run: (files: B64[]) => Promise<string> }> = ({ title, hint, button = 'Trích xuất', run }) => {
  const [files, setFiles] = useState<{ base64: string; mimeType: string; preview?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const add = async (list: File[]) => {
    if (!list.length) return;
    try { const read = await filesThanhAnh(list); setFiles((p) => [...p, ...read]); setMsg(null); }
    catch (e) { setMsg({ ok: false, text: aiErrorMessage(e) }); }
  };
  const go = async () => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await run(files.map(({ base64, mimeType }) => ({ base64, mimeType }))) }); }
    catch (e) { setMsg({ ok: false, text: aiErrorMessage(e) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ScanLine className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-sm font-medium text-slate-700">{title}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {files.map((f, i) => (
          <span key={i} className="relative inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {f.preview ? <img src={f.preview} alt="" className="w-12 h-14 object-cover" />
              : <span className="w-12 h-14 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-400" /></span>}
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] text-center">Trang {i + 1}</span>
            <button type="button" aria-label={`Xóa trang ${i + 1}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 text-red-600"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <label className="w-12 h-14 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-white cursor-pointer flex items-center justify-center text-slate-500" title="Thêm ảnh hoặc PDF">
          <Upload className="w-4 h-4" />
          <input type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ''; add(l); }} />
        </label>
        <button type="button" onClick={go} disabled={!files.length || busy}
          className="ml-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}{busy ? 'Đang đọc...' : button}
        </button>
      </div>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

/* --------------------------------------------------------------- địa chỉ */
const linkKiemTra = (ward: string, city: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${ward}, ${city} sau sáp nhập 2025 thuộc phường xã nào nghị quyết`)}`;

const AddressBlock: React.FC<{ value: DiaChi; onChange: (a: DiaChi) => void; idPrefix: string }> = ({ value, onChange, idPrefix }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [goc, setGoc] = useState<DiaChi | null>(null);
  const up = (k: keyof DiaChi) => (v: string) => onChange({ ...value, [k]: v });
  const capNhat = async () => {
    setBusy(true); setMsg(null); setGoc({ ...value });
    try {
      const r = await updateAdministrativeDivisions(value.detail, value.ward, value.city);
      if (r.updated) {
        onChange({ detail: r.detail || value.detail, ward: r.ward || value.ward, city: r.city || value.city });
        setMsg({ ok: !r.needsCheck, text: `${r.needsCheck ? 'Đã đổi, nên kiểm tra lại' : 'Đã đổi sang địa chỉ mới'}${r.reason ? ': ' + r.reason : '.'}` });
      } else {
        setMsg({ ok: !r.needsCheck, text: r.needsCheck ? `Chưa chắc chắn phường/xã mới${r.reason ? ': ' + r.reason : ''}` : 'Địa chỉ đã đúng đơn vị hành chính mới.' });
      }
    } catch (e) { setMsg({ ok: false, text: aiErrorMessage(e) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field className="md:col-span-2" label="Số nhà, ngách/hẻm, đường/phố, tổ/xóm/ấp/thôn" value={value.detail} onChange={up('detail')} placeholder="Số 26 Đường 6B, Khu phố 19" />
        <Field label="Xã/Phường/Đặc khu" value={value.ward} onChange={up('ward')} placeholder="Phường Bình Tân" />
        <Field label="Tỉnh/Thành phố" value={value.city} onChange={up('city')} placeholder="Thành phố Hồ Chí Minh" list={`${idPrefix}-tinh`} />
        <datalist id={`${idPrefix}-tinh`}>{TINH_34.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={capNhat} disabled={busy || !(value.ward || value.city)}
          title="AI đổi địa chỉ sang đơn vị hành chính mới (34 tỉnh/thành, bỏ cấp quận/huyện)"
          className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} Cập nhật địa chỉ mới (AI)
        </button>
        {msg && <span role="status" className={`text-xs ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</span>}
        {msg && goc && (goc.ward || goc.city) && (
          <a href={linkKiemTra(goc.ward, goc.city)} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Kiểm tra trên Google</a>
        )}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- người (chủ hộ / thành viên) */
const PersonFields: React.FC<{ value: NguoiHkd; onChange: (p: NguoiHkd) => void; idPrefix: string; full?: boolean; them: boolean }> =
  ({ value, onChange, idPrefix, full, them }) => {
    const up = <K extends keyof NguoiHkd>(k: K) => (v: NguoiHkd[K]) => onChange({ ...value, [k]: v });
    return (
      <div className="space-y-3">
        <DocScan title="Rút trích CCCD / Căn cước điện tử" hint="(mặt trước, mặt sau, ảnh chụp VNeID nếu có để lấy nơi ở hiện tại)"
          run={async (files) => {
            const t0 = Date.now();
            const anh = await Promise.all(files.map((f) => thuNhoAnh(f)));
            const x = await trichXuatCCCD(anh);
            if (!x.name && !x.idNumber) throw new Error('Không đọc được họ tên và số định danh. Hãy chụp rõ hơn.');
            const v = (s: string, old: string) => (s && s.trim()) || old;
            const coDc = (a: DiaChi) => !!(a.detail || a.ward || a.city);
            const chuanDc = (a: DiaChi): DiaChi => ({ ...a, city: tinhMoi(a.city) || a.city });
            const tt = coDc(x.thuongTru) ? chuanDc(x.thuongTru) : value.thuongTru;
            const ht = coDc(x.hienTai) ? chuanDc(x.hienTai) : null;
            const giong = !ht || diaChiDayDu(ht).toLowerCase() === diaChiDayDu(tt).toLowerCase();
            onChange({
              ...value,
              name: v(x.name, value.name).toUpperCase(), gender: v(x.gender, value.gender), dob: v(x.dob, value.dob),
              idNumber: v(x.idNumber, value.idNumber), nationality: v(x.nationality, value.nationality), ethnicity: v(x.ethnicity, value.ethnicity),
              thuongTru: tt, hienTaiGiongThuongTru: giong, hienTai: ht && !giong ? ht : value.hienTai,
            });
            const giay = Math.max(1, Math.round((Date.now() - t0) / 1000));
            const cu = /(quận|huyện|thị xã)/i.test(`${tt.ward} ${ht?.ward || ''}`);
            return `Đã điền thông tin của ${x.name} (${giay} giây).${giong ? '' : ' Nơi ở hiện tại khác nơi thường trú.'}${cu ? ' Địa chỉ còn quận/huyện: bấm "Cập nhật địa chỉ mới (AI)".' : ''}`;
          }} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field className="md:col-span-2" label="Họ và tên (IN HOA)" value={value.name} onChange={up('name')} upper placeholder="NGUYỄN VĂN A" />
          <label className="block">
            <span className={labelCls}>Giới tính</span>
            <select className={inputCls} value={value.gender} onChange={(e) => up('gender')(e.target.value)}>
              <option value="">--</option><option>Nam</option><option>Nữ</option>
            </select>
          </label>
          <Field label="Ngày sinh" value={value.dob} onChange={up('dob')} placeholder="dd/mm/yyyy" />
          <Field label="Số định danh cá nhân" value={value.idNumber} onChange={up('idNumber')} placeholder="12 số" />
          {full && <Field label="Điện thoại" value={value.phone} onChange={up('phone')} />}
          {full && <Field className="md:col-span-2" label="Thư điện tử (nếu có)" value={value.email} onChange={up('email')} />}
        </div>
        {(them || full) && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Dân tộc" value={value.ethnicity} onChange={up('ethnicity')} />
              <Field label="Quốc tịch" value={value.nationality} onChange={up('nationality')} />
            </div>
            <p className="text-xs font-semibold text-slate-600">Nơi thường trú</p>
            <AddressBlock value={value.thuongTru} onChange={up('thuongTru')} idPrefix={`${idPrefix}-tt`} />
            <Check checked={value.hienTaiGiongThuongTru} onChange={up('hienTaiGiongThuongTru')}>Nơi ở hiện tại giống nơi thường trú</Check>
            {!value.hienTaiGiongThuongTru && (<>
              <p className="text-xs font-semibold text-slate-600">Nơi ở hiện tại</p>
              <AddressBlock value={value.hienTai} onChange={up('hienTai')} idPrefix={`${idPrefix}-ht`} />
            </>)}
          </div>
        )}
      </div>
    );
  };

/* --------------------------------------------------------------- ngành nghề */
const NganhEditor: React.FC<{ value: NganhHkd[]; onChange: (v: NganhHkd[]) => void }> = ({ value, onChange }) => {
  const [moTa, setMoTa] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [goiY, setGoiY] = useState<{ row: number; q: string } | null>(null);
  const set = (i: number, patch: Partial<NganhHkd>) => onChange(value.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const chonChinh = (i: number) => onChange(value.map((n, j) => ({ ...n, isMain: j === i })));
  const xoa = (i: number) => {
    const next = value.filter((_, j) => j !== i);
    if (next.length && !next.some((n) => n.isMain)) next[0] = { ...next[0], isMain: true };
    onChange(next.length ? next : [{ name: '', detail: '', code: '', isMain: true }]);
  };
  const doiMa = (i: number, code: string) => {
    const v = findVsic(normalizeCode(code));
    set(i, v ? { code: v.code, name: value[i].name.trim() ? value[i].name : v.name } : { code });
  };
  const traAI = async () => {
    setBusy(true); setMsg(null);
    try {
      const codes = await lookupIndustryCodes(moTa, '');
      if (!codes.length) throw new Error('Không tìm thấy mã ngành phù hợp trong VSIC 2025.');
      const co = value.filter((n) => n.name.trim() || n.code.trim());
      const have = new Set(co.map((n) => n.code));
      const them = codes.filter((c) => !have.has(c.code)).map((c) => ({ name: c.name, detail: '', code: c.code, isMain: false }));
      let next = [...co, ...them].slice(0, MAX_NGANH_HKD);
      if (!next.some((n) => n.isMain) && next.length) {
        const main = codes.find((c) => c.isMain);
        next = next.map((n, j) => ({ ...n, isMain: main ? n.code === main.code : j === 0 }));
      }
      onChange(next);
      setMsg({ ok: true, text: `Đã thêm ${them.length} ngành. Ghi thêm "Chi tiết" nếu cần, kiểm tra lại ngành chính.` });
    } catch (e) { setMsg({ ok: false, text: aiErrorMessage(e) }); }
    finally { setBusy(false); }
  };
  const ketQua = useMemo(() => (goiY && goiY.q.trim().length >= 2 ? searchVsic(goiY.q, 8) : []), [goiY]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={inputCls} value={moTa} onChange={(e) => setMoTa(e.target.value)} placeholder="Mô tả việc kinh doanh, ví dụ: quán cà phê, bán bánh mì, dạy toán tư duy" />
        <button type="button" onClick={traAI} disabled={busy || !moTa.trim()}
          className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Tra mã ngành (AI)
        </button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      <div className="space-y-2">
        {value.map((n, i) => (
          <div key={i} className={`rounded-xl border p-3 ${n.isMain ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'}`}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <label className="block md:col-span-2">
                <span className={labelCls}>Mã ngành (cấp 4)</span>
                <input className={inputCls} value={n.code} placeholder="5630" onChange={(e) => set(i, { code: e.target.value })} onBlur={(e) => doiMa(i, e.target.value)} />
              </label>
              <div className="relative md:col-span-6">
                <span className={labelCls}>Tên ngành</span>
                <input className={inputCls} aria-label="Tên ngành" value={n.name} placeholder="Gõ để tìm trong VSIC 2025"
                  onChange={(e) => { set(i, { name: e.target.value }); setGoiY({ row: i, q: e.target.value }); }}
                  onBlur={() => setTimeout(() => setGoiY(null), 150)} />
                {goiY?.row === i && ketQua.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
                    {ketQua.map((v) => (
                      <li key={v.code}>
                        <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50"
                          onMouseDown={(e) => { e.preventDefault(); set(i, { code: v.code, name: v.name }); setGoiY(null); }}>
                          <span className="font-mono text-blue-700 mr-2">{v.code}</span>{v.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3 pb-2">
                <input type="radio" name="nganh-chinh-hkd" className="w-4 h-4 accent-blue-600" checked={n.isMain} onChange={() => chonChinh(i)} /> Ngành chính
              </label>
              <button type="button" aria-label={`Xóa ngành ${i + 1}`} onClick={() => xoa(i)} className="md:col-span-1 justify-self-end p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
            </div>
            <Field className="mt-2" label="Chi tiết (nếu có)" value={n.detail} onChange={(v) => set(i, { detail: v })} placeholder="Dạy toán tư duy" />
          </div>
        ))}
      </div>
      <button type="button" disabled={value.length >= MAX_NGANH_HKD} onClick={() => onChange([...value, { name: '', detail: '', code: '', isMain: !value.length }])}
        className="flex items-center gap-1 text-sm text-blue-700 hover:underline disabled:opacity-50"><Plus className="w-4 h-4" /> Thêm ngành</button>
      <p className="text-xs text-slate-500">Ngành chính cần mã cấp 4. Các ngành khác ghi tự do, không bắt buộc mã.</p>
    </div>
  );
};

/* --------------------------------------------------------------- trang chính */
export const HoKinhDoanhForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [d, setD] = useState<HoKinhDoanhData>(() => ({
    ...emptyHoKinhDoanh(),
    congTy: docLS<CongTyDichVu>(LS.cty, { ...CONG_TY_MAC_DINH }),
    nguoiNop: docLS<NguoiNop>(LS.nv, nguoiNopMacDinh()),
    soThuTu: sttKeTiep(),
  }));
  const [coQuanTuSua, setCoQuanTuSua] = useState(false);
  const [raw, setRaw] = useState('');
  const [rawBusy, setRawBusy] = useState<string | null>(null);
  const [rawMsg, setRawMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [paste, setPaste] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [files, setFiles] = useState<FileHoSo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string[]>([]);

  const up = <K extends keyof HoKinhDoanhData>(k: K) => (v: HoKinhDoanhData[K]) => setD((p) => ({ ...p, [k]: v }));
  const ts = truSoThucTe(d);

  // Kính gửi tự theo phường/xã của trụ sở, trừ khi người dùng đã tự sửa
  useEffect(() => {
    if (!coQuanTuSua) setD((p) => ({ ...p, coQuan: coQuanHkd(truSoThucTe(p).ward) }));
  }, [ts.ward, coQuanTuSua]);

  // Lưu thông tin công ty dịch vụ và người đi nộp cho lần sau
  useEffect(() => { ghiLS(LS.cty, d.congTy); }, [d.congTy]);
  useEffect(() => { ghiLS(LS.nv, d.nguoiNop); }, [d.nguoiNop]);

  const so = soHopDong(d);
  const tienChu = tienBangChu(d.von);

  /** Nhập liệu thông minh: AI tách cả đoạn thông tin -> điền form, rồi tra mã ngành và địa chỉ mới nếu cần. */
  const tuDongDien = async () => {
    setRawBusy('Đang đọc thông tin...'); setRawMsg(null);
    const ghiChu: string[] = [];
    try {
      const x = await trichXuatHkd(raw);
      const v = (a: string, b: string) => (a && a.trim()) || b;
      const von = parseTien(x.von);
      const hoaDau = (w: string) => w.replace(/^(phường|xã|đặc khu)/i, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
      let truSo: DiaChi = { detail: x.truSoDetail, ward: hoaDau(x.truSoWard), city: tinhMoi(x.truSoCity) || x.truSoCity };
      const coTruSo = !!(truSo.detail || truSo.ward || truSo.city);
      const chuDc: DiaChi = { detail: x.chuDiaChiDetail, ward: x.chuDiaChiWard, city: tinhMoi(x.chuDiaChiCity) || x.chuDiaChiCity };

      // Địa chỉ còn quận/huyện hoặc tỉnh cũ -> đổi sang đơn vị hành chính mới
      if (coTruSo && (/(quận|huyện|thị xã)/i.test(truSo.ward) || (x.truSoCity && !tinhMoi(x.truSoCity)))) {
        setRawBusy('Đang cập nhật địa chỉ mới...');
        try {
          const u = await updateAdministrativeDivisions(truSo.detail, truSo.ward, truSo.city);
          if (u.updated) { truSo = { detail: u.detail || truSo.detail, ward: u.ward || truSo.ward, city: u.city || truSo.city }; ghiChu.push(`Địa chỉ trụ sở đã đổi sang đơn vị hành chính mới${u.needsCheck ? ' (nên kiểm tra lại)' : ''}.`); }
        } catch (e) { ghiChu.push(`Chưa cập nhật được địa chỉ mới: ${aiErrorMessage(e)}`); }
      }

      setD((p) => ({
        ...p,
        ten: x.tenHkd ? tenHkdDayDu(x.tenHkd) : p.ten,
        truSo: coTruSo ? truSo : p.truSo,
        truSoGiongChoO: coTruSo ? false : p.truSoGiongChoO,
        phone: v(x.phone, p.phone), email: v(x.email, p.email), website: v(x.website, p.website),
        von: von ? dinhDangTien(von) : p.von,
        soLaoDong: v(x.soLaoDong, p.soLaoDong),
        phuongPhapThue: x.phuongPhapThue === 'keKhai' || x.phuongPhapThue === 'khoan' ? x.phuongPhapThue : p.phuongPhapThue,
        chu: {
          ...p.chu,
          name: v(x.chuTen.toUpperCase(), p.chu.name), gender: v(x.chuGioiTinh, p.chu.gender), dob: v(x.chuNgaySinh, p.chu.dob),
          idNumber: v(x.chuSoDinhDanh, p.chu.idNumber), phone: v(x.chuPhone, v(p.chu.phone, x.phone)), email: v(x.chuEmail, p.chu.email),
          thuongTru: chuDc.detail || chuDc.ward || chuDc.city ? chuDc : p.chu.thuongTru,
        },
      }));

      const da = [x.tenHkd && 'tên', coTruSo && 'trụ sở', von && 'vốn', (x.phone || x.email) && 'liên lạc', x.chuTen && 'chủ hộ'].filter(Boolean);
      if (da.length) ghiChu.unshift(`Đã điền: ${da.join(', ')}.`);

      // Ngành nghề -> mã VSIC 2025
      if (x.nganhMoTa) {
        setRawBusy('Đang tra mã ngành...');
        try {
          const codes = await lookupIndustryCodes(x.nganhMoTa, '');
          if (!codes.length) throw new Error('Không tìm thấy mã ngành phù hợp trong VSIC 2025.');
          const main = codes.find((c) => c.isMain) || codes[0];
          const motMoTa = !/[;\n]/.test(x.nganhMoTa);
          const rows: NganhHkd[] = codes.slice(0, MAX_NGANH_HKD).map((c) => ({
            name: c.name, code: c.code, isMain: c.code === main.code,
            // một ngành: ghi lời mô tả của khách làm "Chi tiết" nếu khác tên ngành trong danh mục
            detail: motMoTa && c.code === main.code && x.nganhMoTa.trim().toLowerCase() !== c.name.trim().toLowerCase() ? x.nganhMoTa.trim() : '',
          }));
          setD((p) => ({ ...p, nganh: rows }));
          ghiChu.push(`Ngành chính: ${main.code} – ${main.name}${codes.length > 1 ? ` (và ${codes.length - 1} ngành khác, xoá bớt nếu không cần)` : ''}.`);
        } catch (e) { ghiChu.push(`Chưa tra được mã ngành: ${aiErrorMessage(e)}`); }
      }

      const thieu = [!x.chuTen && 'thông tin chủ hộ (rút trích CCCD ở mục 1)', !x.tenHkd && 'tên hộ kinh doanh', !coTruSo && 'địa chỉ trụ sở', !von && 'vốn', !x.nganhMoTa && 'ngành nghề'].filter(Boolean);
      if (thieu.length) ghiChu.push(`Còn thiếu: ${thieu.join(', ')}.`);
      setRawMsg({ ok: true, lines: ghiChu });
    } catch (e) {
      setRawMsg({ ok: false, lines: [aiErrorMessage(e)] });
    } finally { setRawBusy(null); }
  };

  const dienTuDoan = async () => {
    setPasteBusy(true); setPasteMsg(null);
    try {
      const a = await extractAddressFromText(paste);
      if (!a.detail && !a.ward && !a.city) throw new Error('Không thấy địa chỉ trong đoạn thông tin.');
      setD((p) => ({
        ...p, truSoGiongChoO: false,
        truSo: { detail: a.detail || p.truSo.detail, ward: a.ward || p.truSo.ward, city: tinhMoi(a.city) || a.city || p.truSo.city },
        phone: a.phone || p.phone, email: a.email || p.email, website: a.website || p.website,
      }));
      setPasteMsg({ ok: true, text: 'Đã điền địa chỉ trụ sở. Nếu địa chỉ còn quận/huyện, bấm "Cập nhật địa chỉ mới".' });
    } catch (e) { setPasteMsg({ ok: false, text: aiErrorMessage(e) }); }
    finally { setPasteBusy(false); }
  };

  const taoHoSo = async () => {
    const l = kiemTraHkd(d);
    setLoi(l); setFiles(null);
    if (l.length) { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
    setBusy(true);
    try {
      const out = await tronBoHoSo(MAU_HKD, buildHkdRecord(d));
      setFiles(out);
      const n = Number(d.soThuTu);
      if (Number.isFinite(n) && n > 0) ghiLS(LS.stt, n);
    } catch (e) {
      setLoi([e instanceof Error ? e.message : String(e)]);
    } finally { setBusy(false); }
  };

  const tenFileBo = safeName(tenHkdDayDu(d.ten) || 'Ho kinh doanh');
  const taiZip = () => files && downloadBytes(zipFiles(files), `Ho so HKD - ${tenFileBo}.zip`, 'application/zip');

  return (
    <div className="max-w-7xl mx-auto pb-12 px-4">
      <header className="mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-4 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4" /> Quay lại chọn loại hình
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-bold text-slate-800">Soạn hồ sơ thành lập</h2>
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">Hộ kinh doanh</span>
        </div>
        <p className="text-slate-500 mt-2">Điền thông tin để tạo Giấy đề nghị đăng ký hộ kinh doanh, Hợp đồng cung cấp dịch vụ và Giấy giới thiệu.</p>
      </header>

      <div className="space-y-6">
        <section className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-100 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2 bg-white rounded-lg shadow-sm text-blue-600"><Sparkles className="w-5 h-5" /></span>
            <h3 className="font-bold text-slate-800">Nhập liệu thông minh</h3>
          </div>
          <p className="text-sm text-slate-600 mb-3">Dán toàn bộ thông tin khách gửi (tên, địa chỉ, vốn, số điện thoại, ngành nghề, chủ hộ...). AI tự tách và điền vào form, tra luôn mã ngành.</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
            <textarea aria-label="Thông tin hộ kinh doanh" value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder={'- Tên HKD: HỘ KINH DOANH ĐƠ CAFE\n- Địa chỉ trụ sở: 904/21 Nguyễn Kiệm, phường Hạnh Thông, TP.HCM\n- Vốn: 100.000.000 vnd\n- SĐT: 0932272230\n- Ngành nghề: Quán cà phê'}
              className="w-full sm:flex-1 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-36 resize-y bg-white text-sm" />
            <button type="button" onClick={tuDongDien} disabled={!!rawBusy || !raw.trim()}
              className="flex sm:flex-col items-center justify-center gap-2 px-6 h-12 sm:h-36 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed sm:min-w-[130px]">
              {rawBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              <span className="text-xs text-center">{rawBusy || 'Tự động điền'}</span>
            </button>
          </div>
          {rawMsg && (
            <div role="status" className={`mt-3 text-sm space-y-0.5 ${rawMsg.ok ? 'text-green-800' : 'text-red-700'}`}>
              {rawMsg.lines.map((l, i) => <p key={i} className={/^(Còn thiếu|Chưa)/.test(l) ? 'text-amber-700' : ''}>{l}</p>)}
            </div>
          )}
        </section>

        <Card icon={Calendar} title="Ngày soạn và nơi nộp">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Ngày soạn hồ sơ" type="date" value={d.docDate} onChange={up('docDate')} />
            <Field label="Nơi ký trên Giấy đề nghị" value={d.noiKy} onChange={up('noiKy')} placeholder={noiKyHkd(ts.city) || 'Thành phố Hồ Chí Minh'} />
          </div>
          <Check checked={d.deTrongNgayGDN} onChange={up('deTrongNgayGDN')}>Để trống ngày, tháng trên Giấy đề nghị (chủ hộ tự ghi khi ký). Hợp đồng và Giấy giới thiệu vẫn ghi ngày soạn.</Check>
          <label className="block">
            <span className={`${labelCls} flex items-center gap-1`}><Landmark className="w-3.5 h-3.5 text-blue-600" /> Kính gửi (cơ quan đăng ký cấp xã)</span>
            <input className={inputCls} value={d.coQuan} placeholder="Tự điền theo phường/xã của trụ sở"
              onChange={(e) => { setCoQuanTuSua(true); up('coQuan')(e.target.value); }} />
          </label>
          {coQuanTuSua && (
            <button type="button" className="text-xs text-blue-700 underline" onClick={() => setCoQuanTuSua(false)}>Điền lại theo phường/xã của trụ sở</button>
          )}
        </Card>

        <Card icon={User} title="1. Chủ hộ kinh doanh">
          <PersonFields value={d.chu} onChange={up('chu')} idPrefix="chu" full them={d.keKhaiThem} />
          <Check checked={d.keKhaiThem} onChange={up('keKhaiThem')}>
            Kê khai thêm dân tộc, quốc tịch, nơi thường trú, nơi ở hiện tại (mẫu yêu cầu khi kết nối với CSDL quốc gia về dân cư bị gián đoạn)
          </Check>
        </Card>

        <Card icon={Store} title="2. Tên và trụ sở hộ kinh doanh">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field className="md:col-span-3" label="Tên hộ kinh doanh (tự thêm “HỘ KINH DOANH” ở đầu)" value={d.ten} onChange={up('ten')} upper placeholder="GIÁO DỤC STEAM HOUSE" />
            <Field className="md:col-span-2" label="Tên bằng tiếng nước ngoài (nếu có)" value={d.tenNN} onChange={up('tenNN')} upper />
            <Field label="Tên viết tắt (nếu có)" value={d.tenVT} onChange={up('tenVT')} upper />
          </div>
          {d.ten.trim() && <p className="text-sm text-slate-600">Tên ghi trên hồ sơ: <b>{tenHkdDayDu(d.ten)}</b></p>}

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-700">Dán đoạn thông tin</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea className={`${inputCls} h-16 resize-none`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Dán tin nhắn/email có địa chỉ, điện thoại của hộ kinh doanh" />
              <button type="button" onClick={dienTuDoan} disabled={pasteBusy || !paste.trim()}
                className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
                {pasteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Tự động điền
              </button>
            </div>
            {pasteMsg && <p role="status" className={`text-sm ${pasteMsg.ok ? 'text-green-700' : 'text-red-700'}`}>{pasteMsg.text}</p>}
          </div>

          <Check checked={d.truSoGiongChoO} onChange={up('truSoGiongChoO')}>Trụ sở là nơi ở hiện tại của chủ hộ</Check>
          {d.truSoGiongChoO
            ? <p className="text-sm text-slate-600">Trụ sở: <b>{[ts.detail, ts.ward, ts.city].filter(Boolean).join(', ') || '(chưa có địa chỉ chủ hộ)'}</b></p>
            : <AddressBlock value={d.truSo} onChange={up('truSo')} idPrefix="truso" />}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Điện thoại" value={d.phone} onChange={up('phone')} placeholder={d.chu.phone} />
            <Field label="Thư điện tử (nếu có)" value={d.email} onChange={up('email')} />
            <Field label="Website (nếu có)" value={d.website} onChange={up('website')} />
          </div>
          {!d.phone && d.chu.phone && (
            <button type="button" className="text-xs text-blue-700 underline" onClick={() => up('phone')(d.chu.phone)}>Dùng số điện thoại của chủ hộ</button>
          )}
          <Check checked={d.khongTaiTruSo} onChange={up('khongTaiTruSo')}>Không kinh doanh tại trụ sở (không có địa điểm kinh doanh cố định)</Check>
        </Card>

        <Card icon={Briefcase} title="3. Ngành, nghề kinh doanh">
          <NganhEditor value={d.nganh} onChange={up('nganh')} />
        </Card>

        <Card icon={Receipt} title="4–5. Vốn và thông tin đăng ký thuế">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Vốn kinh doanh (VNĐ)" value={d.von} placeholder="50.000.000"
              onChange={(v) => { const n = parseTien(v); up('von')(n ? dinhDangTien(n) : v); }} />
            <div className="md:col-span-3 text-sm text-slate-600 self-end pb-2">{tienChu && <>Bằng chữ: <i>{tienChu}</i></>}</div>
            <Field label="Tổng số lao động (dự kiến)" value={d.soLaoDong} onChange={up('soLaoDong')} />
            <Field label="Ngày bắt đầu hoạt động (nếu có)" type="date" value={d.ngayBatDau} onChange={up('ngayBatDau')} />
            <label className="block md:col-span-2">
              <span className={labelCls}>Phương pháp tính thuế GTGT</span>
              <div className="flex gap-4 pt-1.5">
                {([['khoan', 'Phương pháp khoán'], ['keKhai', 'Phương pháp kê khai']] as const).map(([v, t]) => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" name="pp-thue-hkd" className="w-4 h-4 accent-blue-600" checked={d.phuongPhapThue === v} onChange={() => up('phuongPhapThue')(v)} /> {t}
                  </label>
                ))}
              </div>
            </label>
          </div>
          <Check checked={d.thueKhacTruSo} onChange={up('thueKhacTruSo')}>Địa chỉ nhận thông báo thuế khác địa chỉ trụ sở</Check>
          {d.thueKhacTruSo && (<>
            <AddressBlock value={d.thue} onChange={up('thue')} idPrefix="thue" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Điện thoại nhận thông báo thuế" value={d.thuePhone} onChange={up('thuePhone')} />
              <Field label="Thư điện tử nhận thông báo thuế" value={d.thueEmail} onChange={up('thueEmail')} />
            </div>
          </>)}
        </Card>

        <Card icon={Users} title="6–7. Chủ thể thành lập hộ kinh doanh">
          <div className="flex flex-wrap gap-4">
            {([['caNhan', 'Cá nhân'], ['hoGiaDinh', 'Các thành viên hộ gia đình']] as const).map(([v, t]) => (
              <label key={v} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="chu-the-hkd" className="w-4 h-4 accent-blue-600" checked={d.chuThe === v} onChange={() => up('chuThe')(v)} /> {t}
              </label>
            ))}
          </div>
          {d.chuThe === 'hoGiaDinh' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Chủ hộ tự động là dòng 1 của bảng thành viên. Thêm các thành viên còn lại (tối đa {MAX_THANH_VIEN_HKD - 1}).</p>
              {d.thanhVien.map((t, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Thành viên {i + 2}</span>
                    <button type="button" aria-label={`Xóa thành viên ${i + 2}`} className="p-1 text-slate-400 hover:text-red-600"
                      onClick={() => up('thanhVien')(d.thanhVien.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
                  </div>
                  <PersonFields value={t} idPrefix={`tv${i}`} them={d.keKhaiThem}
                    onChange={(p) => up('thanhVien')(d.thanhVien.map((x, j) => (j === i ? p : x)))} />
                </div>
              ))}
              <button type="button" disabled={d.thanhVien.length >= MAX_THANH_VIEN_HKD - 1}
                onClick={() => up('thanhVien')([...d.thanhVien, emptyNguoi()])}
                className="flex items-center gap-1 text-sm text-blue-700 hover:underline disabled:opacity-50"><Plus className="w-4 h-4" /> Thêm thành viên</button>
            </div>
          )}
        </Card>

        <Card icon={Building2} title="Hợp đồng dịch vụ và Giấy giới thiệu" note="Thông tin công ty và người đi nộp được lưu trên trình duyệt này cho lần sau.">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Số thứ tự trong năm" value={d.soThuTu} onChange={up('soThuTu')} placeholder="10" />
            <div className="md:col-span-3 text-sm text-slate-600 self-end pb-2">
              {so.hd ? <>Số Hợp đồng: <b>{so.hd}</b> · Số Giấy giới thiệu: <b>{so.ggt}</b></> : 'Nhập số thứ tự để đánh số Hợp đồng và Giấy giới thiệu.'}
            </div>
          </div>
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Công ty cung cấp dịch vụ (Bên B): {d.congTy.ten}</summary>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
              <Field className="md:col-span-3" label="Tên doanh nghiệp" value={d.congTy.ten} upper onChange={(v) => up('congTy')({ ...d.congTy, ten: v })} />
              <Field label="Ký hiệu số văn bản" value={d.congTy.kyHieu} upper onChange={(v) => up('congTy')({ ...d.congTy, kyHieu: v })} placeholder="TA" />
              <Field label="Mã số doanh nghiệp" value={d.congTy.mst} onChange={(v) => up('congTy')({ ...d.congTy, mst: v })} />
              <Field className="md:col-span-3" label="Địa chỉ trụ sở" value={d.congTy.diaChi} onChange={(v) => up('congTy')({ ...d.congTy, diaChi: v })} />
              <Field className="md:col-span-2" label="Giám đốc (người đại diện)" value={d.congTy.giamDoc} upper onChange={(v) => up('congTy')({ ...d.congTy, giamDoc: v })} />
              <Field label="Số điện thoại" value={d.congTy.sdt} onChange={(v) => up('congTy')({ ...d.congTy, sdt: v })} />
              <div className="self-end pb-1">
                <button type="button" className="text-xs text-blue-700 underline" onClick={() => up('congTy')({ ...CONG_TY_MAC_DINH })}>Khôi phục mặc định</button>
              </div>
            </div>
          </details>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Người trực tiếp đi nộp hồ sơ (ghi trên Giấy giới thiệu)</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field className="md:col-span-2" label="Họ và tên" value={d.nguoiNop.name} upper onChange={(v) => up('nguoiNop')({ ...d.nguoiNop, name: v })} />
              <label className="block">
                <span className={labelCls}>Giới tính</span>
                <select className={inputCls} value={d.nguoiNop.gender} onChange={(e) => up('nguoiNop')({ ...d.nguoiNop, gender: e.target.value })}>
                  <option>Nam</option><option>Nữ</option>
                </select>
              </label>
              <Field label="Ngày sinh" value={d.nguoiNop.dob} onChange={(v) => up('nguoiNop')({ ...d.nguoiNop, dob: v })} placeholder="dd/mm/yyyy" />
              <Field label="Số định danh cá nhân" value={d.nguoiNop.idNumber} onChange={(v) => up('nguoiNop')({ ...d.nguoiNop, idNumber: v })} />
              <Field label="Chức danh" value={d.nguoiNop.chucDanh} onChange={(v) => up('nguoiNop')({ ...d.nguoiNop, chucDanh: v })} />
              <Field label="Số điện thoại" value={d.nguoiNop.phone} onChange={(v) => up('nguoiNop')({ ...d.nguoiNop, phone: v })} />
              <div className="self-end pb-1">
                <button type="button" className="text-xs text-blue-700 underline" onClick={() => up('nguoiNop')(nguoiNopMacDinh())}>Dùng người nộp mặc định</button>
              </div>
            </div>
          </div>
        </Card>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <button type="button" onClick={taoHoSo} disabled={busy}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 disabled:bg-slate-300">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Files className="w-5 h-5" />} {busy ? 'Đang tạo hồ sơ...' : 'Tạo hồ sơ'}
          </button>
          {loi.length > 0 && (
            <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="font-semibold text-amber-800 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Cần bổ sung trước khi tạo hồ sơ</p>
              <ul className="list-disc ml-6 text-sm text-amber-900 space-y-1">{loi.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {files && (
            <div className="space-y-3">
              <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Đã tạo {files.length} file cho {tenHkdDayDu(d.ten)}.</p>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-3 p-3">
                    <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{f.nhan}</p>
                      <p className="text-xs text-slate-500 truncate">{f.name}</p>
                    </div>
                    <button type="button" onClick={() => downloadBytes(f.bytes, f.name, DOCX_MIME)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1"><Download className="w-4 h-4" /> Tải</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={taiZip}
                className="w-full py-2.5 rounded-xl border border-blue-600 text-blue-700 font-medium hover:bg-blue-50 flex items-center justify-center gap-2"><Files className="w-4 h-4" /> Tải trọn bộ (.zip)</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HoKinhDoanhForm;
