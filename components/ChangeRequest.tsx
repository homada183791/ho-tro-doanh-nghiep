import React, { useEffect, useRef, useState } from 'react';
import { BusinessInfo } from '../types';
import { extractBusinessLicense, extractIdCardInfo, extractAddressFromDoc, extractAddressFromText, lookupIndustryCodes, translateBusinessName, updateAdministrativeDivisions, type GpkdInfo } from '../services/gemini';
import { aiErrorMessage } from '../services/aiClient';
import { filesThanhAnh } from '../services/pdfAnh';
import { findVsic, normalizeCode } from '../services/vsic';
import { tienBangChu, parseTien, dinhDangTien } from '../services/soThanhChu';
import { CHANGE_CASES, type ChangeData, type ChangeCaseId, type PersonInfo, type CapNhatNguoi } from '../services/changeData';
import { FileText, Loader2, ScanLine, Upload, ListChecks, Search, Plus, X, Star, Languages, MapPin, PenLine, Sparkles, ChevronDown, Check } from 'lucide-react';

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

type Upl = { base64: string; mimeType: string; name: string; preview?: string };
type B64 = { base64: string; mimeType: string };


const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; upper?: boolean; className?: string; type?: string }> =
  ({ label, value, onChange, placeholder, upper, className, type }) => (
    <label className={`block ${className || ''}`}>
      <span className={labelCls}>{label}</span>
      <input type={type || 'text'} className={`${inputCls} ${upper ? 'uppercase' : ''}`} value={value} placeholder={placeholder}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} />
    </label>
  );

/**
 * Ô rút trích: thêm ảnh/PDF (nhiều trang), bấm nút để AI đọc. `run` trả về câu thông báo khi thành công.
 */
const DocScan: React.FC<{ title: string; hint?: string; button?: string; run: (files: B64[]) => Promise<string>; testId?: string; large?: boolean }> =
  ({ title, hint, button = 'Rút trích', run, testId, large }) => {
    const [files, setFiles] = useState<Upl[]>([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const add = async (list: File[]) => {
      if (!list.length) return;
      const read = await filesThanhAnh(list); // PDF -> ảnh từng trang để AI đọc đúng chữ
      setFiles((p) => [...p, ...read]);
      setMsg(null);
    };
    const go = async () => {
      setBusy(true); setMsg(null);
      try {
        setMsg({ ok: true, text: await run(files.map(({ base64, mimeType }) => ({ base64, mimeType }))) });
      } catch (e) {
        setMsg({ ok: false, text: aiErrorMessage(e) });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className={`rounded-xl border border-dashed ${large ? 'border-blue-300 bg-blue-50/40 p-4' : 'border-slate-300 bg-slate-50 p-3'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <ScanLine className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-sm font-medium text-slate-700">{title}</span>
          {hint && <span className="text-xs text-slate-500">{hint}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {files.map((f, i) => (
            <span key={i} className="relative inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white overflow-hidden">
              {f.preview ? <img src={f.preview} alt="" className={large ? 'w-16 h-20 object-cover' : 'w-10 h-12 object-cover'} />
                : <span className={`${large ? 'w-16 h-20' : 'w-10 h-12'} flex items-center justify-center`}><FileText className="w-5 h-5 text-slate-400" /></span>}
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] text-center">Trang {i + 1}</span>
              <button type="button" aria-label={`Xóa trang ${i + 1}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 text-red-600"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <label className={`${large ? 'w-16 h-20' : 'w-10 h-12'} rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-white cursor-pointer flex flex-col items-center justify-center text-slate-500 text-[10px]`}
            title="Thêm ảnh hoặc PDF">
            <Upload className="w-4 h-4" />{large && 'Thêm'}
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" data-testid={testId}
              onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ''; add(l); }} />
          </label>
          <button type="button" onClick={go} disabled={!files.length || busy}
            className="ml-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {busy ? 'Đang đọc...' : button}
          </button>
        </div>
        {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </div>
    );
  };


/**
 * Ô chọn có danh sách cuộn: bấm vào ô hoặc mũi tên để xem đủ mọi lựa chọn, vẫn gõ tay được nội dung khác.
 */
const ComboBox: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; className?: string }> =
  ({ label, value, onChange, options, placeholder, className }) => {
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(-1);
    const wrap = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!open) return;
      const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const pick = (v: string) => { onChange(v); setOpen(false); };
    return (
      <div className={`relative ${className || ''}`} ref={wrap}>
        <span className={labelCls}>{label}</span>
        <div className="relative">
          <input className={`${inputCls} pr-9`} value={value} placeholder={placeholder} aria-label={label}
            role="combobox" aria-expanded={open} aria-autocomplete="none"
            onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(options.length - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter' && open && hi >= 0) { e.preventDefault(); pick(options[hi]); }
              else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
            }} />
          <button type="button" tabIndex={-1} aria-label={`Mở danh sách ${label}`} onClick={() => setOpen((o) => !o)}
            className="absolute inset-y-0 right-0 px-2 flex items-center text-slate-500 hover:text-slate-800">
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open && (
          <ul role="listbox" aria-label={label}
            className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm">
            {options.map((o, i) => (
              <li key={o} role="option" aria-selected={o === value}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${i === hi ? 'bg-blue-50' : ''} ${o === value ? 'font-medium text-blue-800' : 'text-slate-700'}`}>
                <Check className={`w-4 h-4 shrink-0 ${o === value ? 'opacity-100' : 'opacity-0'}`} />
                <span>{o}</span>
              </li>
            ))}
            <li className="px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100">Hoặc gõ nội dung khác vào ô</li>
          </ul>
        )}
      </div>
    );
  };

const CHUC_DANH = ['Giám đốc', 'Tổng giám đốc', 'Chủ tịch công ty', 'Chủ tịch công ty kiêm Giám đốc', 'Chủ tịch công ty kiêm Tổng giám đốc'];
const VAI_TRO_CN = [
  'Là chủ sở hữu đồng thời là người đại diện pháp luật của doanh nghiệp',
  'Là chủ sở hữu của doanh nghiệp',
  'Là người đại diện theo pháp luật của doanh nghiệp',
];

const diaChiDayDuNgan = (x: { detail: string; ward: string; city: string }) => [x.detail, x.ward, x.city].filter((v) => v && v.trim()).join(', ');

/** Link tìm Google để tự kiểm tra phường/xã cũ nay thuộc phường/xã nào. */
const linkKiemTra = (ward: string, city: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${ward}, ${city} sau sáp nhập 2025 thuộc phường xã nào nghị quyết`)}`;

type Addr = { detail: string; ward: string; city: string };

/** Nút AI: đổi địa chỉ sang đơn vị hành chính mới (34 tỉnh/thành, không còn cấp quận/huyện). */
const AddressAI: React.FC<{ value: Addr; onChange: (a: Addr) => void }> = ({ value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [goc, setGoc] = useState<Addr | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null); setGoc({ ...value });
    try {
      const r = await updateAdministrativeDivisions(value.detail, value.ward, value.city);
      if (r.updated) {
        onChange({ detail: r.detail || value.detail, ward: r.ward || value.ward, city: r.city || value.city });
        setMsg({ ok: !r.needsCheck, text: `${r.needsCheck ? 'Đã đổi, nên kiểm tra lại' : 'Đã đổi sang địa chỉ mới'}${r.reason ? ': ' + r.reason : '.'}` });
      } else {
        setMsg({ ok: !r.needsCheck, text: r.needsCheck ? `Chưa chắc chắn phường/xã mới${r.reason ? ': ' + r.reason : ''}` : 'Địa chỉ đã đúng đơn vị hành chính mới.' });
      }
    } catch (e) {
      setMsg({ ok: false, text: aiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={go} disabled={busy || !(value.ward || value.city)}
        title="AI đổi địa chỉ sang đơn vị hành chính mới (34 tỉnh/thành, bỏ cấp quận/huyện)"
        className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} Cập nhật địa chỉ mới (AI)
      </button>
      {msg && <span role="status" className={`text-xs ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</span>}
      {msg && goc && (goc.ward || goc.city) && (
        <a href={linkKiemTra(goc.ward, goc.city)} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Kiểm tra trên Google</a>
      )}
    </div>
  );
};

type AddrText = { detail: string; ward: string; city: string; phone: string; email: string; website: string };

/** Dán một đoạn thông tin (tin nhắn, email...) để AI tách địa chỉ và điền tự động. */
const PasteAddress: React.FC<{ onResult: (a: AddrText) => void }> = ({ onResult }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const a = await extractAddressFromText(text);
      if (!a.detail && !a.ward && !a.city) throw new Error('Không thấy địa chỉ trong đoạn thông tin.');
      onResult(a);
      setMsg({ ok: true, text: 'Đã điền địa chỉ. Nếu còn quận/huyện cũ, bấm "Cập nhật địa chỉ mới (AI)".' });
    } catch (e) {
      setMsg({ ok: false, text: aiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-slate-700">Tự động điền bằng AI</span>
        <span className="text-xs text-slate-500">(dán đoạn thông tin có địa chỉ)</span>
      </div>
      <div className="flex flex-col md:flex-row gap-2">
        <textarea className={`${inputCls} h-16 resize-y`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Đoạn thông tin có địa chỉ"
          placeholder="VD: Trụ sở mới tại 292/19 Điện Biên Phủ, Phường 17, Quận Bình Thạnh, TP.HCM. SĐT 0909..." />
        <button type="button" onClick={go} disabled={!text.trim() || busy}
          className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Tự động điền
        </button>
      </div>
      {msg && <p role="status" className={`mt-2 text-xs ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

/** Lưu toàn bộ kết quả GPKD vào info (dùng để điền sẵn vốn cũ, người đại diện/chủ sở hữu hiện tại, người ký). */
const applyGpkd = (prev: BusinessInfo, g: GpkdInfo): BusinessInfo => {
  const next: any = { ...prev };
  const set = (k: keyof BusinessInfo, v: string) => { if (v) next[k] = v; };
  set('enterpriseCode', g.enterpriseCode); set('firstRegDate', g.firstRegDate);
  set('changeCount', g.changeCount); set('lastChangeDate', g.lastChangeDate);
  set('name', g.name.toUpperCase()); set('nameEn', g.nameEn); set('nameAbbr', g.nameAbbr);
  set('addressDetail', g.addressDetail); set('addressWard', g.addressWard); set('addressCity', g.addressCity);
  set('addressCountry', g.addressCountry);
  set('phone', g.phone); set('email', g.email); set('website', g.website);
  if (g.capital) {
    const n = parseTien(g.capital);
    next.capital = n ? dinhDangTien(n) : g.capital;
    next.capitalInWords = g.capitalInWords || tienBangChu(g.capital);
  }
  if (g.ownerType === 'organization' || g.ownerType === 'individual') next.ownerType = g.ownerType;
  if (next.ownerType === 'organization') {
    set('ownerOrgName', g.ownerOrgName.toUpperCase()); set('ownerOrgCode', g.ownerOrgCode);
    set('ownerOrgIssueDate', g.ownerOrgIssueDate); set('ownerOrgAddressDetail', g.ownerOrgAddressDetail);
    set('ownerOrgAddressWard', g.ownerOrgAddressWard); set('ownerOrgAddressCity', g.ownerOrgAddressCity);
  }
  set('companyOwner', g.ownerName.toUpperCase()); set('ownerGender', g.ownerGender); set('ownerDob', g.ownerDob);
  set('ownerIdDocumentType', g.ownerIdDocumentType); set('ownerIdNumber', g.ownerIdNumber);
  set('ownerIdDate', g.ownerIdDate); set('ownerIdPlace', g.ownerIdPlace);
  set('ownerAddressDetail', g.ownerAddressDetail); set('ownerAddressWard', g.ownerAddressWard);
  set('ownerAddressCity', g.ownerAddressCity); set('ownerAddressCountry', g.ownerAddressCountry);
  set('ownerName', g.repName.toUpperCase()); set('repGender', g.repGender); set('repTitle', g.repTitle);
  set('repDob', g.repDob); set('repIdDocumentType', g.repIdDocumentType); set('repIdNumber', g.repIdNumber);
  set('repIdDate', g.repIdDate); set('repIdPlace', g.repIdPlace);
  set('repAddressDetail', g.repAddressDetail); set('repAddressWard', g.repAddressWard);
  set('repAddressCity', g.repAddressCity); set('repAddressCountry', g.repAddressCountry);
  return next as BusinessInfo;
};

/* ======================= 1. Rút trích GPKD: chỉ lấy tên + mã số doanh nghiệp ======================= */
export const GpkdExtractor: React.FC<{
  info: BusinessInfo;
  setInfo: React.Dispatch<React.SetStateAction<BusinessInfo>>;
  offices: string[];
}> = ({ info, setInfo, offices }) => (
  <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
    <div>
      <h3 className="font-bold text-slate-800">Doanh nghiệp đăng ký thay đổi</h3>
      <p className="text-sm text-slate-500">Rút trích Giấy chứng nhận đăng ký doanh nghiệp hiện tại để lấy tên và mã số doanh nghiệp.</p>
    </div>
    <DocScan large title="Giấy chứng nhận đăng ký doanh nghiệp" hint="(ảnh hoặc PDF, có thể nhiều trang)" button="Rút trích GPKD" testId="gpkd-input"
      run={async (files) => {
        const g = await extractBusinessLicense(files);
        if (!g.name && !g.enterpriseCode) throw new Error('Không đọc được tên và mã số doanh nghiệp. Hãy dùng ảnh rõ nét hơn hoặc nhập tay.');
        setInfo((prev) => applyGpkd(prev, g));
        const thieu = [
          !(g.addressDetail || g.addressWard) && 'địa chỉ trụ sở',
          !(g.ownerName || g.ownerOrgName) && 'chủ sở hữu',
          !g.repName && 'người đại diện',
        ].filter(Boolean);
        return `Đã lấy: ${g.name || '(chưa rõ tên)'} – MSDN ${g.enterpriseCode || '(chưa rõ)'}.` +
          (thieu.length ? ` Chưa đọc được ${thieu.join(', ')} – nếu giấy có nhiều trang, thêm đủ các trang rồi rút trích lại (giấy không có mục đó thì bỏ qua).` : ' Đã đọc đủ địa chỉ trụ sở, chủ sở hữu và người đại diện.');
      }} />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Field className="md:col-span-2" label="Tên doanh nghiệp" upper value={info.name} onChange={(v) => setInfo((p) => ({ ...p, name: v }))} placeholder="CÔNG TY TNHH ..." />
      <Field label="Mã số doanh nghiệp" value={info.enterpriseCode || ''} onChange={(v) => setInfo((p) => ({ ...p, enterpriseCode: v.replace(/\s/g, '') }))} placeholder="0312080917" />
      <label className="block md:col-span-3">
        <span className={labelCls}>Kính gửi (cơ quan đăng ký kinh doanh)</span>
        <select className={inputCls} value={info.registrationOffice} onChange={(e) => setInfo((p) => ({ ...p, registrationOffice: e.target.value }))}>
          <option value="">-- Chọn cơ quan nhận hồ sơ --</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
    {(info.changeCount || info.firstRegDate) && (
      <p className="text-xs text-slate-500">
        {info.firstRegDate && <>Đăng ký lần đầu {info.firstRegDate}. </>}
        {info.changeCount && <>Đã thay đổi {info.changeCount} lần{info.lastChangeDate ? ` (gần nhất ${info.lastChangeDate})` : ''}; lần này là lần thứ {Number(info.changeCount) + 1}.</>}
      </p>
    )}
  </section>
);

/* ======================= Thông tin cá nhân + rút trích CCCD ======================= */
const PersonForm: React.FC<{ value: PersonInfo; onChange: (p: PersonInfo) => void; withTitle?: boolean }> = ({ value, onChange, withTitle }) => {
  const up = (k: keyof PersonInfo) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <DocScan title="Rút trích CCCD/Hộ chiếu" hint="(mặt trước, mặt sau)" button="Trích xuất"
        run={async (files) => {
          const [front, back, ...extras] = files;
          const x = await extractIdCardInfo(front, back, extras, 'person');
          const v = (s?: string, old = '') => (s && s.trim()) || old;
          if (!x.name && !x.idNumber) throw new Error('Không đọc được họ tên và số giấy tờ. Hãy chụp rõ hơn.');
          onChange({
            ...value,
            name: v(x.name, value.name).toUpperCase(), gender: v(x.gender, value.gender), dob: v(x.dob, value.dob),
            idType: v(x.idDocumentType, value.idType), idNumber: v(x.idNumber, value.idNumber), idDate: v(x.idDate, value.idDate),
            idPlace: v(x.idPlace, value.idPlace), addressDetail: v(x.addressDetail, value.addressDetail),
            addressWard: v(x.addressWard, value.addressWard), addressCity: v(x.addressCity, value.addressCity),
            country: v(x.addressCountry, value.country),
          });
          return `Đã điền thông tin của ${(x.name || '').toUpperCase()}.`;
        }} />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field className="md:col-span-2" label="Họ và tên" value={value.name} onChange={up('name')} upper placeholder="NGUYỄN VĂN A" />
        <label className="block">
          <span className={labelCls}>Giới tính</span>
          <select className={inputCls} value={value.gender} onChange={(e) => up('gender')(e.target.value)}>
            <option value="">--</option><option>Nam</option><option>Nữ</option>
          </select>
        </label>
        <Field label="Ngày sinh" value={value.dob} onChange={up('dob')} placeholder="DD/MM/YYYY" />
        {withTitle && <ComboBox label="Chức danh" value={value.title} onChange={up('title')} options={CHUC_DANH} placeholder="Giám đốc" />}
        <Field label="Số CCCD/Hộ chiếu" value={value.idNumber} onChange={up('idNumber')} />
        <Field label="Ngày cấp" value={value.idDate} onChange={up('idDate')} placeholder="DD/MM/YYYY" />
        <Field label="Nơi cấp" value={value.idPlace} onChange={up('idPlace')} className={withTitle ? '' : 'md:col-span-2'} />
        <Field className="md:col-span-2" label="Địa chỉ liên lạc (số nhà, đường)" value={value.addressDetail} onChange={up('addressDetail')} />
        <Field label="Phường/Xã" value={value.addressWard} onChange={up('addressWard')} />
        <Field label="Tỉnh/Thành phố" value={value.addressCity} onChange={up('addressCity')} />
        <Field label="Quốc gia" value={value.country} onChange={up('country')} />
        <Field label="Số điện thoại" value={value.phone} onChange={up('phone')} />
        <Field className="md:col-span-2" label="Thư điện tử (nếu có)" value={value.email} onChange={up('email')} />
      </div>
      <AddressAI value={{ detail: value.addressDetail, ward: value.addressWard, city: value.addressCity }}
        onChange={(a) => onChange({ ...value, addressDetail: a.detail, addressWard: a.ward, addressCity: a.city })} />
    </div>
  );
};

const HINH_THUC_VON = [
  'Chủ sở hữu góp thêm vốn',
  'Hoàn trả một phần vốn góp cho chủ sở hữu',
  'Vốn điều lệ không được chủ sở hữu thanh toán đầy đủ và đúng hạn',
];

/* ======================= 2. Nội dung đăng ký thay đổi (6 trường hợp) ======================= */
export const ChangeCases: React.FC<{
  info: BusinessInfo;
  change: ChangeData;
  setChange: React.Dispatch<React.SetStateAction<ChangeData>>;
}> = ({ info, change, setChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [removeCode, setRemoveCode] = useState('');
  const [removeName, setRemoveName] = useState('');
  const [addCode, setAddCode] = useState('');

  const upd = <K extends keyof ChangeData>(k: K, v: ChangeData[K]) => setChange((c) => ({ ...c, [k]: v }));
  const toggle = (id: ChangeCaseId) => {
    if (id === 'capNhat' && !change.cases.capNhat) setAutoTra((n) => n + 1);
    setChange((c) => {
    const on = !c.cases[id];
    const next = { ...c, cases: { ...c.cases, [id]: on } };
    if (id === 'capNhat' && on) {
      Object.assign(next, napTuGpkd(c));
    }
    if (id === 'von' && on && !c.oldCapital && info.capital) {
      next.oldCapital = info.capital;
      next.oldCapitalInWords = info.capitalInWords || tienBangChu(info.capital);
    }
    return next;
  });
  };

  /** Chủ sở hữu và người đại diện hiện tại (từ GPKD) để cập nhật địa chỉ liên hệ. */
  const nguoiTuGpkd = (): CapNhatNguoi[] => {
    const owner = info.ownerType !== 'organization' ? (info.companyOwner || '').trim().toUpperCase() : '';
    const rep = (info.ownerName || '').trim().toUpperCase();
    const p = (name: string, d: string, w: string, ci: string, co: string, role: string): CapNhatNguoi =>
      ({ name, detail: d || '', ward: w || '', city: ci || '', country: co || 'Việt Nam', role });
    if (owner && rep && owner === rep) {
      return [p(owner, info.ownerAddressDetail, info.ownerAddressWard, info.ownerAddressCity, info.ownerAddressCountry, 'Là chủ sở hữu đồng thời là người đại diện pháp luật của doanh nghiệp')];
    }
    const list: CapNhatNguoi[] = [];
    if (owner) list.push(p(owner, info.ownerAddressDetail, info.ownerAddressWard, info.ownerAddressCity, info.ownerAddressCountry, 'Là chủ sở hữu của doanh nghiệp'));
    if (rep) list.push(p(rep, info.repAddressDetail, info.repAddressWard, info.repAddressCity, info.repAddressCountry, 'Là người đại diện theo pháp luật của doanh nghiệp'));
    return list.length ? list : [p('', '', '', '', 'Việt Nam', 'Là chủ sở hữu đồng thời là người đại diện pháp luật của doanh nghiệp')];
  };
  /** Lấy địa chỉ trụ sở + chủ sở hữu/người đại diện đã rút trích từ GPKD vào Mục B (chỉ điền ô còn trống). */
  const napTuGpkd = (c: ChangeData): Partial<ChangeData> => {
    const out: Partial<ChangeData> = {};
    if (!c.cnTsDetail && !c.cnTsCity && (info.addressDetail || info.addressCity)) {
      Object.assign(out, { cnTsDetail: info.addressDetail || '', cnTsWard: info.addressWard || '', cnTsCity: info.addressCity || '', cnTruSo: true });
    }
    if (!c.cnNguoi.some((x) => x.name.trim())) {
      const list = nguoiTuGpkd().map((x) => ({ ...x, goc: diaChiDayDuNgan(x) }));
      out.cnNguoi = list;
      if (list.some((x) => x.name.trim())) out.cnLienHe = true;
    }
    return out;
  };

  // Bấm "Rút trích GPKD" sau khi đã tick Mục B: nạp lại địa chỉ và tra địa chỉ mới
  const gpkdKey = `${info.enterpriseCode || ''}|${info.addressDetail || ''}|${info.companyOwner || ''}|${info.ownerName || ''}`;
  const lastKey = useRef(gpkdKey);
  useEffect(() => {
    if (gpkdKey === lastKey.current) return;
    lastKey.current = gpkdKey;
    if (!change.cases.capNhat) return;
    setChange((c) => ({ ...c, cnTsDetail: '', cnTsWard: '', cnTsCity: '', cnNguoi: [] }));
    setChange((c) => ({ ...c, ...napTuGpkd(c) }));
    setAutoTra((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpkdKey]);

  /** Tra địa chỉ mới (AI) lần lượt cho trụ sở và từng người trong Mục B. */
  const [autoTra, setAutoTra] = useState(0);
  const [traBusy, setTraBusy] = useState(false);
  const [traLog, setTraLog] = useState<{ ok: boolean; text: string; q?: string }[]>([]);
  const changeRef = useRef(change);
  changeRef.current = change;
  const traTatCa = async () => {
    const c = changeRef.current;
    setTraBusy(true); setTraLog([]);
    const log = (ok: boolean, text: string, q?: string) => setTraLog((l) => [...l, { ok, text, q }]);
    const tra = async (ten: string, a: { detail: string; ward: string; city: string }, apply: (r: { detail: string; ward: string; city: string }) => void) => {
      if (!(a.ward || a.city)) return;
      try {
        const r = await updateAdministrativeDivisions(a.detail, a.ward, a.city);
        if (r.updated) {
          apply({ detail: r.detail || a.detail, ward: r.ward || a.ward, city: r.city || a.city });
          log(!r.needsCheck, `${ten}: ${a.ward} → ${r.ward || a.ward}${r.needsCheck ? ' (nên kiểm tra lại)' : ''}${r.reason ? ' – ' + r.reason : ''}`, linkKiemTra(a.ward, a.city));
        } else {
          log(!r.needsCheck, `${ten}: ${r.needsCheck ? 'chưa chắc chắn phường/xã mới, kiểm tra lại' : 'đã đúng đơn vị hành chính mới'}${r.reason ? ' – ' + r.reason : ''}`, linkKiemTra(a.ward, a.city));
        }
      } catch (e) {
        log(false, `${ten}: ${aiErrorMessage(e)}`);
      }
    };
    if (c.cnTruSo) {
      await tra('Trụ sở', { detail: c.cnTsDetail, ward: c.cnTsWard, city: c.cnTsCity },
        (r) => setChange((x) => ({ ...x, cnTsDetail: r.detail, cnTsWard: r.ward, cnTsCity: r.city })));
    }
    if (c.cnLienHe) {
      for (let i = 0; i < c.cnNguoi.length; i++) {
        const n = c.cnNguoi[i];
        if (!n.name.trim()) continue;
        await tra(n.name, n, (r) => setChange((x) => ({ ...x, cnNguoi: x.cnNguoi.map((y, j) => (j === i ? { ...y, ...r } : y)) })));
      }
    }
    setTraBusy(false);
  };
  useEffect(() => {
    if (autoTra > 0) traTatCa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTra]);

  const updNguoi = (i: number, patch: Partial<CapNhatNguoi>) =>
    setChange((c) => ({ ...c, cnNguoi: c.cnNguoi.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const vonCu = parseTien(change.oldCapital) || 0;
  const vonMoi = parseTien(change.newCapital) || 0;

  const task = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null); setNote(null);
    try { await fn(); } catch (e) { setErr(aiErrorMessage(e)); } finally { setBusy(null); }
  };

  const lookup = () => task('nganh', async () => {
    const codes = await lookupIndustryCodes(change.addIndustryText, '');
    if (!codes.length) throw new Error('Không tìm thấy mã ngành phù hợp trong VSIC 2025.');
    setChange((c) => {
      const have = new Set(c.addIndustries.map((x) => x.code));
      return { ...c, addIndustries: [...c.addIndustries, ...codes.filter((x) => !have.has(x.code)).map((x) => ({ ...x, isMain: false }))] };
    });
  });

  const addByCode = () => {
    const v = findVsic(normalizeCode(addCode));
    if (!v) { setErr(`Mã ${addCode} không có trong VSIC 2025.`); return; }
    setErr(null);
    setChange((c) => c.addIndustries.some((x) => x.code === v.code) ? c : { ...c, addIndustries: [...c.addIndustries, { code: v.code, name: v.name, isMain: false }] });
    setAddCode('');
  };

  const addRemove = () => {
    const raw = removeCode.trim();
    if (!raw) return;
    const code = normalizeCode(raw) || raw;
    const name = removeName.trim() || findVsic(code)?.name || '';
    setChange((c) => c.removeIndustries.some((x) => x.code === code) ? c : { ...c, removeIndustries: [...c.removeIndustries, { code, name }] });
    setRemoveCode(''); setRemoveName('');
  };

  const setMain = (code: string) =>
    setChange((c) => ({ ...c, addIndustries: c.addIndustries.map((x) => ({ ...x, isMain: x.code === code ? !x.isMain : false })) }));

  const box = 'mt-4 p-4 rounded-xl border border-blue-100 bg-blue-50/30 space-y-3';
  const smallBtn = 'shrink-0 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center justify-center gap-1 hover:bg-slate-50 disabled:opacity-50';
  const curOwner = (info.ownerType === 'organization' ? info.ownerOrgName : info.companyOwner) || '';
  const autoSigner = change.cases.daiDien && info.ownerType !== 'organization' && info.companyOwner ? info.companyOwner : info.ownerName;

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1">
        <ListChecks className="w-5 h-5 text-blue-600" /> Nội dung đăng ký thay đổi
      </h3>
      <p className="text-sm text-slate-500 mb-4">Chọn một hoặc nhiều trường hợp. Mỗi trường hợp sẽ mở phần rút trích và các ô thông tin mới.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {CHANGE_CASES.map((cs, i) => (
          <label key={cs.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${change.cases[cs.id] ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={change.cases[cs.id]} onChange={() => toggle(cs.id)} />
            <span className="text-sm font-medium text-slate-700">{i + 1}. {cs.label}</span>
          </label>
        ))}
      </div>

      {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      {note && <p role="status" className="mt-3 text-sm text-amber-700">{note}</p>}

      {change.cases.doiTen && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">1. Tên công ty mới</h4>
          <p className="text-xs text-slate-500">Tên hiện tại: <b>{info.name || '—'}</b></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Tên tiếng Việt mới" value={change.newName} onChange={(v) => upd('newName', v)} upper placeholder="CÔNG TY TNHH ..." />
            <div>
              <Field label="Tên tiếng nước ngoài mới" value={change.newNameEn} onChange={(v) => upd('newNameEn', v)} upper />
              <button type="button" disabled={!change.newName.trim() || busy === 'dich'} className="mt-1 text-xs text-blue-700 flex items-center gap-1 disabled:text-slate-400"
                onClick={() => task('dich', async () => { upd('newNameEn', (await translateBusinessName(change.newName)).toUpperCase()); })}>
                {busy === 'dich' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />} Dịch tự động
              </button>
            </div>
            <Field label="Tên viết tắt mới" value={change.newNameAbbr} onChange={(v) => upd('newNameAbbr', v)} upper />
          </div>
        </div>
      )}

      {change.cases.diaChi && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">2. Địa chỉ trụ sở chính mới</h4>
          <DocScan title="Rút trích từ giấy tờ địa điểm" hint="(hợp đồng thuê/mượn nhà, sổ đỏ...)"
            run={async (files) => {
              const a = await extractAddressFromDoc(files);
              if (!a.detail && !a.ward && !a.city) throw new Error('Không tìm thấy địa chỉ trong giấy tờ.');
              setChange((c) => ({ ...c, newAddressDetail: a.detail || c.newAddressDetail, newAddressWard: a.ward || c.newAddressWard, newAddressCity: a.city || c.newAddressCity }));
              return 'Đã điền địa chỉ theo giấy tờ. Bấm "Cập nhật địa chỉ mới (AI)" nếu giấy còn ghi quận/huyện cũ.';
            }} />
          <PasteAddress onResult={(a) => setChange((c) => ({
            ...c, newAddressDetail: a.detail || c.newAddressDetail, newAddressWard: a.ward || c.newAddressWard, newAddressCity: a.city || c.newAddressCity,
            newPhone: a.phone || c.newPhone, newEmail: a.email || c.newEmail, newWebsite: a.website || c.newWebsite,
          }))} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Số nhà, đường" value={change.newAddressDetail} onChange={(v) => upd('newAddressDetail', v)} />
            <Field label="Xã/Phường/Đặc khu" value={change.newAddressWard} onChange={(v) => upd('newAddressWard', v)} />
            <Field label="Tỉnh/Thành phố" value={change.newAddressCity} onChange={(v) => upd('newAddressCity', v)} />
          </div>
          <AddressAI value={{ detail: change.newAddressDetail, ward: change.newAddressWard, city: change.newAddressCity }}
            onChange={(a) => setChange((c) => ({ ...c, newAddressDetail: a.detail, newAddressWard: a.ward, newAddressCity: a.city }))} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Điện thoại" value={change.newPhone} onChange={(v) => upd('newPhone', v)} />
            <Field label="Email (nếu có)" value={change.newEmail} onChange={(v) => upd('newEmail', v)} />
            <Field label="Website (nếu có)" value={change.newWebsite} onChange={(v) => upd('newWebsite', v)} />
          </div>
        </div>
      )}

      {change.cases.von && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">3. Vốn điều lệ</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Vốn đã đăng ký (đồng)" value={change.oldCapital} placeholder="2.000.000.000"
              onChange={(v) => { const n = parseTien(v); setChange((c) => ({ ...c, oldCapital: n ? dinhDangTien(n) : '', oldCapitalInWords: n ? tienBangChu(v) : '' })); }} />
            <Field className="md:col-span-2" label="Bằng chữ" value={change.oldCapitalInWords} onChange={(v) => upd('oldCapitalInWords', v)} />
            <Field label="Vốn sau khi thay đổi (đồng)" value={change.newCapital} placeholder="5.000.000.000"
              onChange={(v) => { const n = parseTien(v); setChange((c) => ({ ...c, newCapital: n ? dinhDangTien(n) : '', newCapitalInWords: n ? tienBangChu(v) : '' })); }} />
            <Field className="md:col-span-2" label="Bằng chữ (tự điền, sửa được)" value={change.newCapitalInWords} onChange={(v) => upd('newCapitalInWords', v)} />
            <Field label="Thời điểm thay đổi vốn" value={change.capitalChangeDate} onChange={(v) => upd('capitalChangeDate', v)} placeholder="DD/MM/YYYY" />
            <ComboBox className="md:col-span-2" label="Hình thức tăng, giảm vốn" value={change.capitalChangeForm} onChange={(v) => upd('capitalChangeForm', v)}
              options={HINH_THUC_VON} placeholder="Chọn hoặc gõ" />
          </div>
          {vonMoi > 0 && vonCu > 0 && vonMoi !== vonCu && (
            <p className={`text-sm font-medium ${vonMoi > vonCu ? 'text-green-700' : 'text-amber-700'}`}>
              {vonMoi > vonCu ? 'Tăng' : 'Giảm'} vốn {dinhDangTien(Math.abs(vonMoi - vonCu))} đồng
              {vonMoi < vonCu && ' – giấy đề nghị sẽ có thêm cam kết thanh toán nợ sau khi giảm vốn.'}
            </p>
          )}
        </div>
      )}

      {change.cases.nganh && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">4. Ngành, nghề kinh doanh</h4>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-green-800">Bổ sung ngành</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input className={inputCls} aria-label="Mô tả ngành muốn bổ sung" placeholder="Mô tả ngành muốn bổ sung, VD: bán buôn thiết bị điện, quảng cáo..." value={change.addIndustryText} onChange={(e) => upd('addIndustryText', e.target.value)} />
              <button type="button" onClick={lookup} disabled={!change.addIndustryText.trim() || busy === 'nganh'}
                className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm flex items-center justify-center gap-1 disabled:bg-slate-200 disabled:text-slate-400">
                {busy === 'nganh' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Tra mã VSIC
              </button>
            </div>
            <div className="flex gap-2">
              <input className={`${inputCls} md:w-48`} aria-label="Mã ngành bổ sung" placeholder="Hoặc nhập mã, VD: 4659" value={addCode} onChange={(e) => setAddCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addByCode(); }} />
              <button type="button" onClick={addByCode} disabled={!addCode.trim()} className={smallBtn}><Plus className="w-4 h-4" /> Thêm mã</button>
            </div>
            {change.addIndustries.length > 0 && (
              <ul className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                {change.addIndustries.map((x) => (
                  <li key={x.code} className="flex items-start gap-2 p-2 text-sm">
                    <span className="font-mono font-semibold text-blue-700 w-12 shrink-0">{x.code}</span>
                    <span className="flex-1 text-slate-700">{x.name}</span>
                    <button type="button" title="Đặt làm ngành chính" aria-label={`Đặt ${x.code} làm ngành chính`} onClick={() => setMain(x.code)}
                      className={`p-1 rounded ${x.isMain ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}><Star className="w-4 h-4" fill={x.isMain ? 'currentColor' : 'none'} /></button>
                    <button type="button" aria-label={`Bỏ ngành ${x.code}`} onClick={() => upd('addIndustries', change.addIndustries.filter((y) => y.code !== x.code))}
                      className="p-1 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-blue-100">
            <p className="text-xs font-semibold text-red-800">Bỏ ngành</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input className={`${inputCls} md:w-48`} aria-label="Mã ngành cần bỏ" placeholder="Mã ngành, VD: 7110" value={removeCode} onChange={(e) => setRemoveCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addRemove(); }} />
              <input className={inputCls} aria-label="Tên ngành cần bỏ" placeholder="Tên ngành (để trống sẽ lấy theo VSIC 2025)" value={removeName} onChange={(e) => setRemoveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addRemove(); }} />
              <button type="button" onClick={addRemove} disabled={!removeCode.trim()} className={smallBtn}><Plus className="w-4 h-4" /> Thêm</button>
            </div>
            {change.removeIndustries.length > 0 && (
              <ul className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                {change.removeIndustries.map((x) => (
                  <li key={x.code} className="flex items-start gap-2 p-2 text-sm">
                    <span className="font-mono font-semibold text-red-700 w-12 shrink-0">{x.code}</span>
                    <input className="flex-1 text-slate-700 bg-transparent outline-none border-b border-transparent focus:border-slate-300" value={x.name}
                      placeholder="Nhập tên ngành như trên GPKD" aria-label={`Tên ngành ${x.code}`}
                      onChange={(e) => upd('removeIndustries', change.removeIndustries.map((y) => y.code === x.code ? { ...y, name: e.target.value } : y))} />
                    <button type="button" aria-label={`Bỏ ${x.code}`} onClick={() => upd('removeIndustries', change.removeIndustries.filter((y) => y.code !== x.code))}
                      className="p-1 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {change.cases.daiDien && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">5. Người đại diện theo pháp luật mới</h4>
          {info.ownerName && <p className="text-xs text-slate-500">Người đại diện hiện tại: <b>{info.ownerName}</b>{info.repTitle ? ` (${info.repTitle})` : ''}</p>}
          <PersonForm value={change.newRep} onChange={(p) => upd('newRep', p)} withTitle />
        </div>
      )}

      {change.cases.chuSoHuu && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">6. Chủ sở hữu mới (nhận chuyển nhượng vốn)</h4>
          {curOwner && <p className="text-xs text-slate-500">Chủ sở hữu hiện tại: <b>{curOwner}</b></p>}
          <div className="flex gap-2">
            {(['individual', 'organization'] as const).map((t) => (
              <button key={t} type="button" onClick={() => upd('newOwnerType', t)} aria-pressed={change.newOwnerType === t}
                className={`px-3 py-1.5 rounded-lg text-sm border ${change.newOwnerType === t ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600'}`}>
                {t === 'individual' ? 'Cá nhân' : 'Tổ chức'}
              </button>
            ))}
          </div>
          {change.newOwnerType === 'organization' ? (
            <>
              <DocScan title="Rút trích GPKD của tổ chức nhận chuyển nhượng" button="Rút trích"
                run={async (files) => {
                  const g = await extractBusinessLicense(files);
                  if (!g.name) throw new Error('Không đọc được tên tổ chức.');
                  setChange((c) => ({
                    ...c, newOwnerOrgCode: g.enterpriseCode || c.newOwnerOrgCode,
                    newOwner: { ...c.newOwner, name: g.name.toUpperCase(), idDate: g.firstRegDate || c.newOwner.idDate, phone: g.phone || c.newOwner.phone,
                      addressDetail: g.addressDetail || c.newOwner.addressDetail, addressWard: g.addressWard || c.newOwner.addressWard, addressCity: g.addressCity || c.newOwner.addressCity },
                  }));
                  return `Đã điền thông tin ${g.name}.`;
                }} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field className="md:col-span-2" label="Tên tổ chức" value={change.newOwner.name} onChange={(v) => upd('newOwner', { ...change.newOwner, name: v })} upper />
                <Field label="Mã số doanh nghiệp/Số quyết định" value={change.newOwnerOrgCode} onChange={(v) => upd('newOwnerOrgCode', v)} />
                <Field label="Ngày cấp" value={change.newOwner.idDate} onChange={(v) => upd('newOwner', { ...change.newOwner, idDate: v })} placeholder="DD/MM/YYYY" />
                <Field label="Nơi cấp" value={change.newOwner.idPlace} onChange={(v) => upd('newOwner', { ...change.newOwner, idPlace: v })} />
                <Field label="Điện thoại" value={change.newOwner.phone} onChange={(v) => upd('newOwner', { ...change.newOwner, phone: v })} />
                <Field label="Trụ sở (số nhà, đường)" value={change.newOwner.addressDetail} onChange={(v) => upd('newOwner', { ...change.newOwner, addressDetail: v })} />
                <Field label="Phường/Xã" value={change.newOwner.addressWard} onChange={(v) => upd('newOwner', { ...change.newOwner, addressWard: v })} />
                <Field label="Tỉnh/Thành phố" value={change.newOwner.addressCity} onChange={(v) => upd('newOwner', { ...change.newOwner, addressCity: v })} />
              </div>
              <AddressAI value={{ detail: change.newOwner.addressDetail, ward: change.newOwner.addressWard, city: change.newOwner.addressCity }}
                onChange={(a) => upd('newOwner', { ...change.newOwner, addressDetail: a.detail, addressWard: a.ward, addressCity: a.city })} />
            </>
          ) : (
            <PersonForm value={change.newOwner} onChange={(p) => upd('newOwner', p)} />
          )}
        </div>
      )}

      {change.cases.capNhat && (
        <div className={box}>
          <h4 className="text-sm font-semibold text-slate-800">7. Bổ sung, cập nhật thông tin đăng ký doanh nghiệp (Mục B)</h4>
          <p className="text-xs text-slate-500">Dùng khi chỉ cập nhật thông tin (ví dụ địa chỉ đổi tên do sắp xếp đơn vị hành chính), không phải chuyển trụ sở.
            Địa chỉ được lấy sẵn từ GPKD và AI tự tra sang địa chỉ mới.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={traTatCa} disabled={traBusy || (!change.cnTruSo && !change.cnLienHe)}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400">
              {traBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {traBusy ? 'Đang tra địa chỉ mới...' : 'Tra địa chỉ mới cho tất cả (AI)'}
            </button>
            <button type="button" disabled={traBusy}
              onClick={() => { setChange((c) => ({ ...c, cnTsDetail: '', cnTsWard: '', cnTsCity: '', cnNguoi: [] })); setChange((c) => ({ ...c, ...napTuGpkd(c) })); setAutoTra((n) => n + 1); }}
              className={smallBtn}>Lấy lại từ GPKD</button>
            {!(info.addressDetail || info.addressWard || info.ownerName || info.companyOwner) && (
              <span className="text-xs text-amber-700">Chưa có dữ liệu địa chỉ từ GPKD: bấm "Rút trích GPKD" ở mục trên (thêm đủ các trang có địa chỉ chủ sở hữu, người đại diện), rồi bấm "Lấy lại từ GPKD".</span>
            )}
          </div>
          {traLog.length > 0 && (
            <ul role="status" className="text-xs space-y-0.5">
              {traLog.map((l, i) => (
                <li key={i} className={l.ok ? 'text-green-700' : 'text-amber-700'}>
                  • {l.text}{l.q && <> {' '}<a href={l.q} target="_blank" rel="noreferrer" className="text-blue-700 underline">Kiểm tra trên Google</a></>}
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={change.cnTruSo} onChange={(e) => upd('cnTruSo', e.target.checked)} />
            Cập nhật địa chỉ trụ sở chính
          </label>
          {change.cnTruSo && (
            <div className="space-y-3 pl-6">
              {(info.addressDetail || info.addressWard) && (
                <p className="text-xs text-slate-500">Trên GPKD: <b>{[info.addressDetail, info.addressWard, info.addressCity].filter(Boolean).join(', ')}</b></p>
              )}
              <PasteAddress onResult={(a) => setChange((c) => ({ ...c, cnTsDetail: a.detail || c.cnTsDetail, cnTsWard: a.ward || c.cnTsWard, cnTsCity: a.city || c.cnTsCity }))} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Số nhà, đường (trụ sở)" value={change.cnTsDetail} onChange={(v) => upd('cnTsDetail', v)} />
                <Field label="Xã/Phường/Đặc khu (trụ sở)" value={change.cnTsWard} onChange={(v) => upd('cnTsWard', v)} />
                <Field label="Tỉnh/Thành phố (trụ sở)" value={change.cnTsCity} onChange={(v) => upd('cnTsCity', v)} />
              </div>
              <AddressAI value={{ detail: change.cnTsDetail, ward: change.cnTsWard, city: change.cnTsCity }}
                onChange={(a) => setChange((c) => ({ ...c, cnTsDetail: a.detail, cnTsWard: a.ward, cnTsCity: a.city }))} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 pt-2">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={change.cnLienHe}
              onChange={(e) => { const v = e.target.checked; setChange((c) => ({ ...c, cnLienHe: v, cnNguoi: v && !c.cnNguoi.length ? nguoiTuGpkd().map((x) => ({ ...x, goc: diaChiDayDuNgan(x) })) : c.cnNguoi })); }} />
            Cập nhật địa chỉ liên hệ của chủ sở hữu và người đại diện pháp luật
          </label>
          {change.cnLienHe && (
            <div className="space-y-3 pl-6">
              {change.cnNguoi.map((x, i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">Người thứ {i + 1}{x.goc ? <span className="font-normal text-slate-500"> – trên GPKD: <b>{x.goc}</b></span> : null}</span>
                    <button type="button" aria-label={`Xóa người thứ ${i + 1}`} onClick={() => upd('cnNguoi', change.cnNguoi.filter((_, j) => j !== i))}
                      className="p-1 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field className="md:col-span-1" label="Họ và tên" upper value={x.name} onChange={(v) => updNguoi(i, { name: v })} />
                    <ComboBox className="md:col-span-2" label="Vai trò" value={x.role} onChange={(v) => updNguoi(i, { role: v })} options={VAI_TRO_CN} />
                    <Field label="Số nhà, đường (liên hệ)" value={x.detail} onChange={(v) => updNguoi(i, { detail: v })} />
                    <Field label="Xã/Phường/Đặc khu (liên hệ)" value={x.ward} onChange={(v) => updNguoi(i, { ward: v })} />
                    <Field label="Tỉnh/Thành phố (liên hệ)" value={x.city} onChange={(v) => updNguoi(i, { city: v })} />
                  </div>
                  <AddressAI value={{ detail: x.detail, ward: x.ward, city: x.city }} onChange={(a) => updNguoi(i, { detail: a.detail, ward: a.ward, city: a.city })} />
                </div>
              ))}
              {change.cnNguoi.length < 3 && (
                <button type="button" className={smallBtn} onClick={() => upd('cnNguoi', [...change.cnNguoi, { name: '', detail: '', ward: '', city: '', country: 'Việt Nam', role: '' }])}>
                  <Plus className="w-4 h-4" /> Thêm người
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {change.cases.chuHuongLoi && (
        <div className="mt-4 p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">8. Thông báo thay đổi thông tin về chủ sở hữu hưởng lợi của doanh nghiệp</h4>
          <p className="text-xs text-slate-500">Chọn đoạn sẽ in trên Giấy đề nghị. Danh sách chủ sở hữu hưởng lợi (Mẫu số 10) gửi kèm vẫn tạo như bình thường.</p>
          <div className="space-y-2" role="radiogroup" aria-label="Đoạn thông báo chủ sở hữu hưởng lợi">
            {([
              ['a', 'a) Trường hợp doanh nghiệp có sự thay đổi thông tin về chủ sở hữu hưởng lợi của doanh nghiệp (bao gồm người quản lý doanh nghiệp) đã kê khai với Cơ quan đăng ký kinh doanh cấp tỉnh thì doanh nghiệp kê khai theo Mẫu số 10 Phụ lục I ban hành kèm theo Thông tư này: Gửi kèm.'],
              ['b', 'b) Đối với doanh nghiệp được thành lập trước ngày 01/7/2025, doanh nghiệp bổ sung thông tin về chủ sở hữu hưởng lợi của doanh nghiệp theo quy định tại khoản 1 Điều 3 Luật số 76/2025/QH15 ngày 17/6/2025 sửa đổi, bổ sung một số điều của Luật Doanh nghiệp (kê khai theo Mẫu số 10 Phụ lục I ban hành kèm theo Thông tư này): Gửi kèm.'],
            ] as const).map(([v, t]) => (
              <label key={v} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer text-sm ${change.hlTB === v ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white/60'}`}>
                <input type="radio" name="hl-tb" className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" checked={change.hlTB === v} onChange={() => upd('hlTB', v)} />
                <span className="text-slate-700">{t}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {Object.values(change.cases).some(Boolean) && (() => {
        const coChuCaNhan = info.ownerType !== 'organization' && !!(info.companyOwner || '').trim();
        const nguon = change.hlNguon || (change.cases.chuSoHuu ? (change.newOwnerType === 'individual' ? 'chu' : 'khac') : coChuCaNhan ? 'chu' : 'khac');
        const tenChu = change.cases.chuSoHuu ? (change.newOwnerType === 'individual' ? change.newOwner.name : '') : coChuCaNhan ? info.companyOwner : '';
        const tenDaiDien = change.cases.daiDien && change.newRep.name.trim() ? change.newRep.name : info.ownerName;
        const lua = [
          { id: 'chu' as const, label: 'Chủ sở hữu', ten: tenChu, dung: !!(tenChu || '').trim() },
          { id: 'daiDien' as const, label: 'Người đại diện theo pháp luật', ten: tenDaiDien, dung: !!(tenDaiDien || '').trim() },
          { id: 'khac' as const, label: 'Người khác (nhập thông tin)', ten: change.hl.name, dung: true },
        ];
        const thieu = (nguon === 'khac' && !change.hl.name.trim()) || (nguon !== 'khac' && !lua.find((x) => x.id === nguon)?.dung);
        return (
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Chủ sở hữu hưởng lợi <span className="font-normal text-slate-500">(cho Danh sách chủ sở hữu hưởng lợi)</span></h4>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chủ sở hữu hưởng lợi">
              {lua.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={nguon === x.id} disabled={!x.dung}
                  onClick={() => upd('hlNguon', x.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border text-left disabled:opacity-40 ${nguon === x.id ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium' : 'border-slate-300 bg-white text-slate-600'}`}>
                  {x.label}{x.id !== 'khac' && x.ten ? `: ${x.ten.toUpperCase()}` : ''}
                </button>
              ))}
            </div>
            {nguon === 'khac' && <PersonForm value={change.hl} onChange={(p) => upd('hl', p)} />}
            {thieu && <p className="text-xs text-amber-700">Chưa có thông tin chủ sở hữu hưởng lợi: GPKD/thông báo không ghi chủ sở hữu là cá nhân. Chọn "Người đại diện theo pháp luật" nếu đúng, hoặc chọn "Người khác" để nhập (rút trích CCCD).</p>}
          </div>
        );
      })()}

      {Object.values(change.cases).some(Boolean) && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label={`SĐT Chủ tịch công ty / Giám đốc${info.ownerName ? ` (${info.ownerName.toUpperCase()})` : ''}`} value={change.sdtGiamDoc}
            onChange={(v) => upd('sdtGiamDoc', v)} placeholder={info.repPhone || 'Số điện thoại'} />
          <Field label="SĐT công ty" value={change.sdtCongTy} onChange={(v) => upd('sdtCongTy', v)} placeholder={info.phone || 'Số điện thoại'} />
          <p className="text-xs text-slate-500">Ghi vào mục thông tin đăng ký thuế (Giám đốc, địa chỉ nhận thông báo thuế) và điện thoại trụ sở. Đổi người đại diện thì dùng SĐT của người mới.</p>
        </div>
      )}

      {Object.values(change.cases).some(Boolean) && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="block md:col-span-2">
            <span className={`${labelCls} flex items-center gap-1`}><PenLine className="w-3 h-3" /> Người ký giấy đề nghị</span>
            <input className={`${inputCls} uppercase`} value={change.signer} onChange={(e) => upd('signer', e.target.value.toUpperCase())}
              placeholder={autoSigner ? `Tự động: ${autoSigner}` : 'Họ tên người ký'} />
          </label>
          <p className="text-xs text-slate-500">Để trống: đổi người đại diện thì chủ sở hữu ký, các trường hợp khác người đại diện hiện tại ký.</p>
        </div>
      )}
    </section>
  );
};
