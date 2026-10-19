/**
 * Danh mục Hệ thống ngành kinh tế Việt Nam (VSIC 2025, theo QĐ 36/2025/QĐ-TTg).
 * Nguồn: data/vsic2025.json (495 mã cấp 4, kèm phần "bao gồm", "loại trừ" và mã cấp 5).
 *
 * Dùng để:
 *  - gửi kèm danh mục cho AI, buộc AI chỉ chọn mã có thật;
 *  - kiểm tra lại kết quả AI: bỏ mã không có trong danh mục, thay tên ngành bằng tên chính thức.
 */
import raw from '../data/vsic2025.json';
import type { IndustryCode } from '../types';

export interface VsicEntry {
  code: string;
  name: string;
  section: string;
  sectionName: string;
  includes: string;
  alsoIncludes: string;
  excludes: string;
  level5: { code: string; name: string }[];
}

export const VSIC: VsicEntry[] = raw as VsicEntry[];
const byCode = new Map(VSIC.map((e) => [e.code, e]));

/** Chuẩn hoá mã: chỉ giữ số; mã cấp 5 (5 số) quy về mã cấp 4. */
export const normalizeCode = (code: string): string => {
  const digits = String(code || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(0, 4) : digits;
};

export const findVsic = (code: string): VsicEntry | undefined => byCode.get(normalizeCode(code));

/* ---------- Tìm kiếm theo từ khoá (không phân biệt dấu) ---------- */
const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Từ quá chung, không giúp phân biệt ngành
const STOP = new Set(
  ['va', 'cac', 'cua', 'cho', 'khac', 'chua', 'duoc', 'phan', 'vao', 'dau', 'theo', 'nhu', 'mot', 'nhung', 'trong',
   'hoat', 'dong', 'kinh', 'doanh', 'nganh', 'nghe', 'loai', 'tat', 'ca', 'voi', 'tu', 'den', 'tren', 'la', 'co', 'cong', 'ty']
);
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
const bigrams = (ts: string[]) => ts.slice(0, -1).map((t, i) => `${t} ${ts[i + 1]}`);

interface Indexed { e: VsicEntry; name: string; l5: string; body: string }
let index: Indexed[] | null = null;
const getIndex = () =>
  (index ??= VSIC.map((e) => ({
    e,
    name: ` ${fold(e.name)} `,
    l5: ` ${fold(e.level5.map((x) => x.name).join(' | '))} `,
    body: ` ${fold(`${e.includes} ${e.alsoIncludes}`)} `,
  })));

/** Các mã có khả năng khớp với mô tả ngành nghề (xếp theo điểm). */
export const searchVsic = (query: string, limit = 30): VsicEntry[] => {
  const q = tokens(query);
  if (!q.length) return [];
  const bg = bigrams(q);
  const scored = getIndex().map((it) => {
    let s = 0;
    for (const t of q) {
      const w = ` ${t} `;
      if (it.name.includes(w)) s += 3;
      else if (it.l5.includes(w)) s += 2;
      else if (it.body.includes(w)) s += 1;
    }
    for (const b of bg) {
      if (it.name.includes(b)) s += 4;
      else if (it.l5.includes(b)) s += 3;
      else if (it.body.includes(b)) s += 1;
    }
    return { e: it.e, s };
  });
  // Mã người dùng gõ thẳng (ví dụ "4610") luôn được đưa lên đầu
  const typed = new Set((query.match(/\b\d{4,5}\b/g) || []).map(normalizeCode));
  return scored
    .filter((x) => x.s > 0 || typed.has(x.e.code))
    .sort((a, b) => Number(typed.has(b.e.code)) - Number(typed.has(a.e.code)) || b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
};

/* ---------- Nội dung gửi kèm cho AI ---------- */
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

/** Toàn bộ danh mục dạng gọn: mỗi dòng "mã tên ngành". */
let compact: string | null = null;
export const vsicCompactList = () => (compact ??= VSIC.map((e) => `${e.code} ${e.name}`).join('\n'));

/** Mô tả chi tiết (bao gồm / loại trừ) của một số mã, để AI phân biệt các mã gần nhau. */
export const vsicDetails = (entries: VsicEntry[]) =>
  entries
    .map((e) => {
      const lines = [`${e.code} ${e.name}`];
      const inc = [e.includes, e.alsoIncludes].filter(Boolean).join(' ');
      if (inc) lines.push(`  Bao gồm: ${cut(inc, 420)}`);
      if (e.excludes) lines.push(`  Loại trừ: ${cut(e.excludes, 300)}`);
      if (e.level5.length > 1) lines.push(`  Mã cấp 5: ${e.level5.map((x) => `${x.code} ${x.name}`).join('; ')}`);
      return lines.join('\n');
    })
    .join('\n');

/**
 * Kiểm tra kết quả AI theo danh mục: bỏ mã không tồn tại, bỏ trùng, thay tên bằng tên chính thức,
 * đảm bảo có đúng một ngành chính (nếu cần).
 */
export const validateIndustryCodes = (
  list: IndustryCode[],
  opts: { requireMain?: boolean; exclude?: string[] } = {}
): { codes: IndustryCode[]; rejected: string[] } => {
  const exclude = new Set((opts.exclude || []).map(normalizeCode));
  const seen = new Set<string>();
  const codes: IndustryCode[] = [];
  const rejected: string[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const e = findVsic(item?.code);
    if (!e) {
      if (item?.code) rejected.push(`${item.code}${item.name ? ` (${item.name})` : ''}`);
      continue;
    }
    if (seen.has(e.code) || exclude.has(e.code)) continue;
    seen.add(e.code);
    codes.push({ code: e.code, name: e.name, isMain: !!item.isMain });
  }
  if (opts.requireMain && codes.length) {
    const firstMain = codes.findIndex((c) => c.isMain);
    codes.forEach((c, i) => (c.isMain = i === (firstMain >= 0 ? firstMain : 0)));
  }
  if (rejected.length) console.warn('[VSIC] Đã bỏ các mã không có trong danh mục 2025:', rejected);
  return { codes, rejected };
};
