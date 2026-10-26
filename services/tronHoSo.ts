/**
 * Trộn hồ sơ Word (mail merge) ngay trên trình duyệt, chuyển từ công cụ TronHoSo.py.
 *
 * - Điền các trường MERGEFIELD và tính các trường IF (kể cả IF lồng nhau: STT, dấu X ngành chính).
 * - Xoá các dòng trống trong bảng "Ngành, nghề kinh doanh" (không có cả Tên ngành lẫn Mã ngành) và đánh lại STT.
 * - Gỡ liên kết Mail Merge để mở file không bị Word hỏi nguồn dữ liệu.
 *
 * File .docx là một tệp zip; dùng bộ đọc/ghi zip có sẵn trong thư viện xlsx (XLSX.CFB), không cần cài thêm.
 */
import * as XLSX from 'xlsx';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

export type MergeRecord = Record<string, string>;
export interface MergeResult {
  bytes: Uint8Array;
  removedRows: number;
  warnings: string[];
  missingFields: string[];
}

/* ---------------------------------------------------------------- Tính trường */
class Unknown extends Error {}

const tokens = (s: string): string[] =>
  [...s.matchAll(/"((?:[^"]|"")*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));

const toNum = (s: string): number | null => {
  const t = String(s).trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
};

const compare = (a: string, op: string, b: string): boolean => {
  const na = toNum(a), nb = toNum(b);
  let x: string | number = a, y: string | number = b;
  if (na !== null && nb !== null) {
    x = na; y = nb;
  } else if (op === '=' || op === '<>') {
    // Word: so sánh chuỗi, '*' và '?' là ký tự đại diện ở vế phải
    if (b.includes('*') || b.includes('?')) {
      const pat = '^' + b.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]') + '$';
      const eq = new RegExp(pat, 'i').test(a);
      return op === '=' ? eq : !eq;
    }
    x = a.toLowerCase(); y = b.toLowerCase();
  }
  switch (op) {
    case '=': return x === y;
    case '<>': return x !== y;
    case '<': return x < y;
    case '>': return x > y;
    case '<=': return x <= y;
    case '>=': return x >= y;
    default: return false;
  }
};

const applyFormat = (val: string, switches: string): string => {
  const m = switches.match(/\\\*\s*(\w+)/);
  if (m && val) {
    const f = m[1].toLowerCase();
    if (f === 'upper') val = val.toUpperCase();
    else if (f === 'lower') val = val.toLowerCase();
    else if (f === 'caps') val = val.split(' ').map((w) => w.slice(0, 1).toUpperCase() + w.slice(1)).join(' ');
    else if (f === 'firstcap') val = val.slice(0, 1).toUpperCase() + val.slice(1);
  }
  if (val) {
    const mb = switches.match(/\\b\s+"([^"]*)"/);
    const mf = switches.match(/\\f\s+"([^"]*)"/);
    if (mb) val = mb[1] + val;
    if (mf) val = val + mf[1];
  }
  return val;
};

const evalField = (instr: string, rec: MergeRecord, missing: Set<string>): string => {
  const s = instr.trim();
  const m = s.match(/^(\w+)\s*([\s\S]*)$/);
  if (!m) throw new Unknown();
  const kind = m[1].toUpperCase();
  const rest = m[2];
  if (kind === 'MERGEFIELD') {
    const mm = rest.match(/^"([^"]+)"|^(\S+)/);
    if (!mm) return '';
    const name = (mm[1] || mm[2]).toUpperCase();
    if (!(name in rec)) missing.add(name);
    return applyFormat(rec[name] ?? '', rest.slice(mm[0].length));
  }
  if (kind === 'IF') {
    let t = tokens(rest);
    // bỏ các switch \* MERGEFORMAT ở cuối
    while (t.length >= 2 && t[t.length - 2].startsWith('\\')) t = t.slice(0, -2);
    if (t.length && t[t.length - 1].startsWith('\\')) t = t.slice(0, -1);
    if (t.length < 3) return '';
    const [a, op, b] = t;
    const yes = t.length > 3 ? t[3] : '';
    const no = t.length > 4 ? t[4] : '';
    return compare(a, op, b) ? yes : no;
  }
  throw new Unknown();
};

/* ---------------------------------------------------------------- DOM helpers */
const isW = (el: Element, local: string) => el.namespaceURI === W_NS && el.localName === local;
const childW = (el: Element, local: string) => Array.from(el.children).find((c) => isW(c, local)) || null;
const childrenW = (el: Element, local: string) => Array.from(el.children).filter((c) => isW(c, local));
const descW = (el: Element | Document, local: string) => Array.from(el.getElementsByTagNameNS(W_NS, local));

const runText = (r: Element): string =>
  Array.from(r.children)
    .map((el) => (isW(el, 't') ? el.textContent || '' : isW(el, 'tab') ? '\t' : isW(el, 'br') || isW(el, 'cr') ? '\n' : ''))
    .join('');

const makeRun = (doc: Document, rpr: Element | null, text: string): Element => {
  const r = doc.createElementNS(W_NS, 'w:r');
  if (rpr) r.appendChild(rpr.cloneNode(true));
  text.split('\n').forEach((line, i) => {
    if (i) r.appendChild(doc.createElementNS(W_NS, 'w:br'));
    const t = doc.createElementNS(W_NS, 'w:t');
    t.textContent = line;
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    r.appendChild(t);
  });
  return r;
};

/** Các run thuộc trực tiếp đoạn p (không lấy run trong textbox lồng bên trong). */
const ownRuns = (p: Element): Element[] =>
  descW(p, 'r').filter((r) => {
    let anc = r.parentElement;
    while (anc && !isW(anc, 'p')) anc = anc.parentElement;
    return anc === p;
  });

interface Frame { begin: Element; instr: string[]; state: 'instr' | 'result'; runs: Element[]; resultRpr: Element | null; resultTxt: string[] }

const mergeParagraph = (doc: Document, p: Element, rec: MergeRecord, missing: Set<string>) => {
  const stack: Frame[] = [];
  for (const r of ownRuns(p)) {
    for (const fr of stack) fr.runs.push(r);
    const fc = childW(r, 'fldChar');
    if (fc) {
      const typ = fc.getAttributeNS(W_NS, 'fldCharType');
      if (typ === 'begin') {
        stack.push({ begin: r, instr: [], state: 'instr', runs: [r], resultRpr: null, resultTxt: [] });
      } else if (typ === 'separate' && stack.length) {
        stack[stack.length - 1].state = 'result';
      } else if (typ === 'end' && stack.length) {
        const fr = stack.pop()!;
        const instr = fr.instr.join('');
        let val: string, known: boolean;
        try {
          val = evalField(instr, rec, missing);
          known = true;
        } catch (e) {
          if (!(e instanceof Unknown)) throw e;
          val = fr.resultTxt.join('');
          known = false;
        }
        if (stack.length) {
          const parent = stack[stack.length - 1];
          (parent.state === 'instr' ? parent.instr : parent.resultTxt).push(val);
        } else if (known) {
          const rpr = fr.resultRpr ?? childW(fr.begin, 'rPr');
          if (val) fr.begin.parentNode?.insertBefore(makeRun(doc, rpr, val), fr.begin);
          for (const x of fr.runs) x.parentNode?.removeChild(x);
        }
      }
      continue;
    }
    if (!stack.length) continue;
    const top = stack[stack.length - 1];
    const it = childW(r, 'instrText');
    if (it && top.state === 'instr') {
      top.instr.push(it.textContent || '');
    } else if (top.state === 'result') {
      const txt = runText(r);
      if (txt && top.resultRpr === null) top.resultRpr = childW(r, 'rPr');
      top.resultTxt.push(txt);
    }
  }
};

const mergeFldSimple = (doc: Document, rec: MergeRecord, missing: Set<string>) => {
  for (const fs of descW(doc, 'fldSimple')) {
    let val: string;
    try {
      val = evalField(fs.getAttributeNS(W_NS, 'instr') || '', rec, missing);
    } catch (e) {
      if (e instanceof Unknown) continue;
      throw e;
    }
    const first = childW(fs, 'r');
    const rpr = first ? childW(first, 'rPr') : null;
    if (val) fs.parentNode?.insertBefore(makeRun(doc, rpr, val), fs);
    fs.parentNode?.removeChild(fs);
  }
};

/* ---------------------------------------------------------------- Bảng ngành nghề */
const cellText = (tc: Element) => descW(tc, 't').map((t) => t.textContent || '').join('').trim();
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

const setCellText = (doc: Document, tc: Element, text: string) => {
  const ps = childrenW(tc, 'p');
  const p = ps[0];
  if (!p) return;
  const runs = ownRuns(p);
  let rpr: Element | null = runs.map((r) => childW(r, 'rPr')).find(Boolean) || null;
  if (!rpr) {
    const ppr = childW(p, 'pPr');
    const prpr = ppr ? childW(ppr, 'rPr') : null;
    if (prpr) rpr = prpr.cloneNode(true) as Element;
  }
  for (const r of runs) r.parentNode?.removeChild(r);
  for (const extra of ps.slice(1)) tc.removeChild(extra);
  p.appendChild(makeRun(doc, rpr, text));
};

/** Xoá dòng không có cả Tên ngành lẫn Mã ngành; đánh lại STT. */
const xuLyBangNganh = (doc: Document): { removed: number; warnings: string[] } => {
  let removed = 0;
  const warnings: string[] = [];
  for (const tbl of descW(doc, 'tbl')) {
    const rows = childrenW(tbl, 'tr');
    if (!rows.length) continue;
    let hdrIdx = -1;
    let cols: string[] = [];
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const heads = childrenW(rows[i], 'tc').map((tc) => norm(cellText(tc)));
      if (heads.some((h) => h.startsWith('mã ngành'))) { hdrIdx = i; cols = heads; break; }
    }
    if (hdrIdx < 0) continue;
    const cMa = cols.findIndex((h) => h.startsWith('mã ngành'));
    const cTen = cols.findIndex((h) => h.startsWith('tên ngành'));
    const cStt = cols.findIndex((h) => ['stt', 'tt', 'số tt'].includes(h));
    let stt = 0;
    for (const tr of rows.slice(hdrIdx + 1)) {
      const tcs = childrenW(tr, 'tc');
      if (tcs.length <= cMa) continue;
      const ma = cellText(tcs[cMa]);
      const ten = cTen >= 0 && cTen < tcs.length ? cellText(tcs[cTen]) : '';
      if (!ma && !ten) { tbl.removeChild(tr); removed++; continue; }
      stt++;
      if (ten && !ma) warnings.push(`Ngành số ${stt} "${ten.slice(0, 60)}" chưa có mã ngành`);
      if (cStt >= 0 && cStt < tcs.length) setCellText(doc, tcs[cStt], String(stt));
    }
  }
  return { removed, warnings };
};

/**
 * Khối điều kiện: đoạn chỉ chứa "[[#TEN_TRUONG]]" mở khối, "[[/TEN_TRUONG]]" đóng khối.
 * Trường rỗng -> xoá cả khối (kể cả bảng bên trong); có giá trị -> chỉ xoá 2 dòng đánh dấu. Khối được lồng nhau.
 */
const xuLyKhoi = (doc: Document, rec: MergeRecord): number => {
  const re = /^\[\[([#/])([A-Za-z0-9_]+)\]\]$/;
  const mark = (el: Element) => (isW(el, 'p') ? (descW(el, 't').map((t) => t.textContent || '').join('').trim().match(re)) : null);
  let removedBlocks = 0;
  // Dòng bảng có điều kiện: đoạn "[[?TEN_TRUONG]]" trong một ô -> xoá cả dòng khi trường rỗng
  const reRow = /^\[\[\?([A-Za-z0-9_]+)\]\]$/;
  for (const p of descW(doc, 'p')) {
    const m = descW(p, 't').map((t) => t.textContent || '').join('').trim().match(reRow);
    if (!m || !p.parentNode) continue;
    let tr: Node | null = p.parentNode;
    while (tr && !(tr.nodeType === 1 && isW(tr as Element, 'tr'))) tr = tr.parentNode;
    if (!(rec[m[1].toUpperCase()] ?? '').trim() && tr && tr.parentNode) { tr.parentNode.removeChild(tr); removedBlocks++; }
    else p.parentNode.removeChild(p);
  }
  for (;;) {
    const all = descW(doc, 'p');
    const open = all.find((p) => mark(p)?.[1] === '#');
    if (!open) break;
    const name = mark(open)![2];
    const parent = open.parentNode!;
    let close: Element | null = null;
    for (let n = open.nextElementSibling; n; n = n.nextElementSibling) {
      const m = mark(n);
      if (m && m[1] === '/' && m[2].toUpperCase() === name.toUpperCase()) { close = n; break; }
    }
    const val = (rec[name.toUpperCase()] ?? '').trim();
    if (!close) { parent.removeChild(open); continue; }
    if (!val) {
      let n: Element | null = open;
      while (n) { const next: Element | null = n === close ? null : n.nextElementSibling; parent.removeChild(n); n = next; }
      removedBlocks++;
    } else {
      parent.removeChild(open);
      parent.removeChild(close);
    }
  }
  // dòng đóng lẻ còn sót
  for (const p of descW(doc, 'p')) if (mark(p)) p.parentNode!.removeChild(p);
  return removedBlocks;
};

/* ---------------------------------------------------------------- DOCX */
const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const parseXml = (bytes: Uint8Array) => new DOMParser().parseFromString(dec.decode(bytes), 'application/xml');
const serializeXml = (doc: Document) => enc.encode(DECL + new XMLSerializer().serializeToString(doc.documentElement));

const goMailMerge = (settings: Document, rels: Document | null) => {
  for (const mm of childrenW(settings.documentElement, 'mailMerge')) settings.documentElement.removeChild(mm);
  if (rels) {
    for (const rel of Array.from(rels.documentElement.children)) {
      const type = rel.getAttribute('Type') || '';
      if (type.includes('mailMergeSource') || type.includes('recipientData')) rels.documentElement.removeChild(rel);
    }
  }
};

type Cfb = ReturnType<typeof XLSX.CFB.read>;
const entryName = (fullPath: string) => fullPath.replace(/^Root Entry\//, '');

/** Trộn một file mẫu .docx với một bản ghi dữ liệu. */
export const tronFile = (template: ArrayBuffer | Uint8Array, rec: MergeRecord, xoaDongTrong = true): MergeResult => {
  const cfb: Cfb = XLSX.CFB.read(new Uint8Array(template as ArrayBuffer), { type: 'array' });
  const missing = new Set<string>();
  let removedRows = 0;
  let warnings: string[] = [];
  const get = (name: string) => XLSX.CFB.find(cfb, '/' + name);

  cfb.FileIndex.forEach((entry: any, i: number) => {
    const name = entryName(cfb.FullPaths[i]);
    if (!PARTS.test(name) || !entry.content) return;
    const doc = parseXml(entry.content as Uint8Array);
    if (doc.getElementsByTagName('parsererror').length) throw new Error(`Không đọc được ${name} trong file mẫu`);
    mergeFldSimple(doc, rec, missing);
    for (const p of descW(doc, 'p')) mergeParagraph(doc, p, rec, missing);
    if (name === 'word/document.xml') xuLyKhoi(doc, rec);
    if (name === 'word/document.xml' && xoaDongTrong) {
      const r = xuLyBangNganh(doc);
      removedRows = r.removed;
      warnings = r.warnings;
    }
    entry.content = serializeXml(doc) as any;
    entry.size = (entry.content as Uint8Array).length;
  });

  // Bỏ chú thích (footnote/endnote) không còn được tham chiếu sau khi xoá khối: tránh LibreOffice hiển thị lệch chú thích
  const docEntry = get('word/document.xml');
  if (docEntry?.content) {
    const docXml = dec.decode(docEntry.content as Uint8Array);
    for (const [part, tag] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
      const e = get(part);
      if (!e?.content) continue;
      const used = new Set([...docXml.matchAll(new RegExp(`<w:${tag}Reference[^>]*w:id="(-?\\d+)"`, 'g'))].map((m) => m[1]));
      const d = parseXml(e.content as Uint8Array);
      for (const fn of childrenW(d.documentElement, tag)) {
        const id = fn.getAttributeNS(W_NS, 'id') || '';
        if (Number(id) > 0 && !used.has(id)) d.documentElement.removeChild(fn);
      }
      e.content = serializeXml(d) as any;
      e.size = (e.content as Uint8Array).length;
    }
  }

  const settings = get('word/settings.xml');
  if (settings?.content) {
    const relsEntry = get('word/_rels/settings.xml.rels');
    const sDoc = parseXml(settings.content as Uint8Array);
    const rDoc = relsEntry?.content ? parseXml(relsEntry.content as Uint8Array) : null;
    goMailMerge(sDoc, rDoc);
    settings.content = serializeXml(sDoc) as any;
    settings.size = (settings.content as Uint8Array).length;
    if (relsEntry && rDoc) {
      relsEntry.content = serializeXml(rDoc) as any;
      relsEntry.size = (relsEntry.content as Uint8Array).length;
    }
  }

  const out = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as unknown as ArrayBuffer | number[];
  return {
    bytes: out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out as number[]),
    removedRows,
    warnings,
    missingFields: [...missing].sort(),
  };
};

/* ---------------------------------------------------------------- Bộ hồ sơ */
export interface MauHoSo { file: string; ten: string; nhan: string }

/** Mẫu Word cho Công ty TNHH 1 thành viên (đặt trong thư mục public/mau). */
export const MAU_TNHH_1TV: MauHoSo[] = [
  { file: '/mau/Mau_GDN_MailMerge.docx', ten: 'GDN', nhan: 'Giấy đề nghị đăng ký doanh nghiệp' },
  { file: '/mau/Mau_DieuLe_MailMerge.docx', ten: 'DieuLe', nhan: 'Điều lệ công ty' },
  { file: '/mau/Mau_UyQuyen_MailMerge.docx', ten: 'UyQuyen', nhan: 'Giấy ủy quyền nộp hồ sơ' },
  { file: '/mau/Mau_CSH_HuongLoi_MailMerge.docx', ten: 'CSH_HuongLoi', nhan: 'Danh sách chủ sở hữu hưởng lợi' },
];

/** Mẫu Word cho hồ sơ đăng ký thay đổi Công ty TNHH 1 thành viên. */
export const MAU_THAY_DOI_TNHH_1TV: MauHoSo[] = [
  { file: '/mau/Mau_ThayDoi_MailMerge.docx', ten: 'GiayDeNghi_ThayDoi', nhan: 'Giấy đề nghị đăng ký thay đổi (Mẫu số 12)' },
];

/** Giấy ủy quyền nộp hồ sơ và Danh sách chủ sở hữu hưởng lợi – dùng chung cho hồ sơ thay đổi. */
export const MAU_KEM_THAY_DOI: MauHoSo[] = [
  { file: '/mau/Mau_UyQuyen_MailMerge.docx', ten: 'UyQuyen', nhan: 'Giấy ủy quyền nộp hồ sơ' },
  { file: '/mau/Mau_CSH_HuongLoi_MailMerge.docx', ten: 'CSH_HuongLoi', nhan: 'Danh sách chủ sở hữu hưởng lợi' },
];

/** Mẫu số 13: Giấy đề nghị đăng ký thay đổi người đại diện theo pháp luật. */
export const MAU_DOI_DAI_DIEN: MauHoSo = {
  file: '/mau/Mau13_DoiDaiDien_MailMerge.docx', ten: 'GiayDeNghi_DoiDaiDien', nhan: 'Giấy đề nghị thay đổi người đại diện theo pháp luật (Mẫu số 13)',
};

export const safeName = (s: string) =>
  (s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'KhongTen';

export interface FileHoSo { name: string; nhan: string; bytes: Uint8Array; removedRows: number; warnings: string[]; missingFields: string[] }

/** Tải các mẫu và trộn với bản ghi; trả về danh sách file .docx đã điền. */
export const tronBoHoSo = async (mau: MauHoSo[], rec: MergeRecord): Promise<FileHoSo[]> => {
  const tenCty = safeName(rec.TEN_TV || rec.TEN_VT || 'HoSo');
  const files: FileHoSo[] = [];
  for (const m of mau) {
    const res = await fetch(m.file, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Không tải được file mẫu ${m.file} (lỗi ${res.status}). Kiểm tra thư mục public/mau.`);
    const r = tronFile(await res.arrayBuffer(), rec);
    files.push({ name: `${m.ten} - ${tenCty}.docx`, nhan: m.nhan, ...r });
  }
  return files;
};

/** Bỏ dấu tiếng Việt (bộ ghi zip chỉ hỗ trợ tên file không dấu). */
export const khongDau = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7E]/g, '');

/** Gói nhiều file vào một tệp .zip (tên file trong zip được bỏ dấu để mở đúng trên Windows). */
export const zipFiles = (files: { name: string; bytes: Uint8Array }[]): Uint8Array => {
  const cfb = XLSX.CFB.utils.cfb_new();
  for (const f of files) XLSX.CFB.utils.cfb_add(cfb, '/' + khongDau(f.name), f.bytes as any);
  const out = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as unknown as ArrayBuffer | number[];
  return out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out as number[]);
};

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Tải một file về máy người dùng. */
export const downloadBytes = (bytes: Uint8Array, name: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
