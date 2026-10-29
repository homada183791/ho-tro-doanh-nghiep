/**
 * Tạo hồ sơ Hộ kinh doanh (3 file Word) từ dòng lệnh — dùng đúng mẫu và logic trộn của LegalBiz.
 * Bot Telegram gọi:  npx tsx scripts/hkd-cli.ts <input.json> <thư mục xuất>
 *
 * input.json: một phần của HoKinhDoanhData (services/hoKinhDoanh.ts); ô nào thiếu lấy mặc định như form trên web.
 * Ghi ra:      các file .docx + ket_qua.json { files, loi, canhBao, nguoiNop, congTy, soThuTu }
 * Thoát mã 2 khi dữ liệu chưa đủ (kiemTraHkd), mã 1 khi lỗi khác.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

// tronHoSo.ts dùng DOMParser/XMLSerializer của trình duyệt → lấy từ jsdom
const win = new JSDOM('').window;
(globalThis as any).DOMParser = win.DOMParser;
(globalThis as any).XMLSerializer = win.XMLSerializer;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Đọc LEGALBIZ_PUBLIC_NGUOI_NOP_* từ .env.development.local / .env.local (giống bản web). */
const docEnv = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of ['.env.local', '.env.development.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
};

/** Số thứ tự Hợp đồng/Giấy giới thiệu: bộ đếm riêng cho bot, lưu ở scripts/hkd-so-thu-tu.txt. */
const STT_FILE = path.join(ROOT, 'scripts', 'hkd-so-thu-tu.txt');
const sttKeTiep = () => {
  const n = Number((fs.existsSync(STT_FILE) ? fs.readFileSync(STT_FILE, 'utf8') : '0').trim()) || 0;
  return String(n + 1);
};

async function main() {
  const [inp, outDir] = process.argv.slice(2);
  if (!inp || !outDir) throw new Error('Cách dùng: npx tsx scripts/hkd-cli.ts <input.json> <thư mục xuất>');

  const env = docEnv();
  const hkd = await import('../services/hoKinhDoanh');
  const { tronFile, safeName } = await import('../services/tronHoSo');

  const vao = JSON.parse(fs.readFileSync(inp, 'utf8'));
  const base = hkd.emptyHoKinhDoanh();
  // Người đi nộp mặc định (giống nguoiNopMacDinh trên web, đọc từ file .env của LegalBiz)
  const g = (k: string, d0: string) => (env[`LEGALBIZ_PUBLIC_NGUOI_NOP_${k}`] || '').trim() || d0;
  base.nguoiNop = {
    name: g('TEN', base.nguoiNop.name), gender: g('GIOI_TINH', base.nguoiNop.gender), dob: g('NGAY_SINH', base.nguoiNop.dob),
    idNumber: g('SO_DD', base.nguoiNop.idNumber), chucDanh: g('CHUC_DANH', base.nguoiNop.chucDanh), phone: g('SDT', base.nguoiNop.phone),
  };
  const d: any = {
    ...base, ...vao,
    chu: { ...base.chu, ...(vao.chu || {}) },
    congTy: { ...base.congTy, ...(vao.congTy || {}) },
    nguoiNop: { ...base.nguoiNop, ...(vao.nguoiNop || {}) },
  };
  if (!d.soThuTu) d.soThuTu = sttKeTiep();
  const ts = hkd.truSoThucTe(d);
  if (!d.coQuan) d.coQuan = hkd.coQuanHkd(ts.ward);
  if (!d.noiKy) d.noiKy = hkd.noiKyHkd(ts.city);

  fs.mkdirSync(outDir, { recursive: true });
  const ketQua: any = { files: [], loi: hkd.kiemTraHkd(d), canhBao: [], nguoiNop: d.nguoiNop, congTy: d.congTy, soThuTu: d.soThuTu };
  if (ketQua.loi.length) {
    fs.writeFileSync(path.join(outDir, 'ket_qua.json'), JSON.stringify(ketQua, null, 2));
    console.error('Chưa đủ dữ liệu:\n- ' + ketQua.loi.join('\n- '));
    process.exit(2);
  }

  const rec = hkd.buildHkdRecord(d);
  const ten = safeName(rec.TEN_TV || 'HoSo');
  for (const m of hkd.MAU_HKD) {
    const tpl = fs.readFileSync(path.join(ROOT, 'public', m.file.replace(/^\//, '')));
    const r = tronFile(tpl, rec);
    const file = path.join(outDir, `${m.ten} - ${ten}.docx`);
    fs.writeFileSync(file, r.bytes);
    ketQua.files.push(file);
    if (r.missingFields.length) ketQua.canhBao.push(`${m.nhan}: mẫu có trường chưa có dữ liệu ${r.missingFields.join(', ')}`);
    ketQua.canhBao.push(...r.warnings.map((w) => `${m.nhan}: ${w}`));
  }
  const n = Number(d.soThuTu);
  if (Number.isFinite(n) && n > 0) fs.writeFileSync(STT_FILE, String(n));
  fs.writeFileSync(path.join(outDir, 'ket_qua.json'), JSON.stringify(ketQua, null, 2));
  console.log(ketQua.files.map((f: string) => path.basename(f)).join('\n'));
}

main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
