/** Đọc số tiền thành chữ tiếng Việt, ví dụ 1.500.000.000 -> "Một tỷ năm trăm triệu đồng". */
const SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** Đọc một nhóm 3 chữ số. `full` = nhóm không đứng đầu (phải đọc "không trăm", "linh"). */
const docNhom = (n: number, full: boolean): string => {
  const tram = Math.floor(n / 100), chuc = Math.floor((n % 100) / 10), dv = n % 10;
  const out: string[] = [];
  if (tram > 0 || full) out.push(`${SO[tram]} trăm`);
  if (chuc === 0) {
    if (dv > 0 && (tram > 0 || full)) out.push('linh');
  } else if (chuc === 1) {
    out.push('mười');
  } else {
    out.push(`${SO[chuc]} mươi`);
  }
  if (dv > 0) {
    if (dv === 1 && chuc > 1) out.push('mốt');
    else if (dv === 5 && chuc > 0) out.push('lăm');
    else if (dv === 4 && chuc > 1) out.push('tư');
    else out.push(SO[dv]);
  }
  return out.join(' ');
};

const DON_VI = ['', 'nghìn', 'triệu', 'tỷ'];

/** Đọc số nguyên không âm thành chữ (không kèm đơn vị tiền). */
export const docSo = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return '';
  let n = Math.floor(value);
  if (n === 0) return 'không';
  // Tách nhóm 3 chữ số từ phải sang trái
  const nhom: number[] = [];
  while (n > 0) { nhom.push(n % 1000); n = Math.floor(n / 1000); }
  const parts: string[] = [];
  for (let i = nhom.length - 1; i >= 0; i--) {
    const g = nhom[i];
    if (g === 0) {
      // Hàng tỷ lặp lại (nghìn tỷ, triệu tỷ...) vẫn cần chữ "tỷ"
      if (i % 3 === 0 && i > 0 && parts.length && !parts[parts.length - 1].endsWith('tỷ')) parts.push('tỷ');
      continue;
    }
    const isFirst = parts.length === 0;
    const unit = i === 0 ? '' : DON_VI[i % 3 === 0 ? 3 : i % 3];
    parts.push([docNhom(g, !isFirst), unit].filter(Boolean).join(' '));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

/** Lấy số từ chuỗi tiền "3.000.000.000 đồng" -> 3000000000 (bỏ mọi ký tự không phải số). */
export const parseTien = (s: string): number | null => {
  const digits = String(s || '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

/** "3000000000" -> "3.000.000.000" */
export const dinhDangTien = (n: number) => n.toLocaleString('de-DE');

/** Chuỗi tiền -> chữ có viết hoa chữ đầu và "đồng" ở cuối. */
export const tienBangChu = (s: string): string => {
  const n = parseTien(s);
  if (n === null) return '';
  const chu = docSo(n);
  return chu ? chu.charAt(0).toUpperCase() + chu.slice(1) + ' đồng' : '';
};
