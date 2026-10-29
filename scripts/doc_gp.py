# -*- coding: utf-8 -*-
"""
Đọc Giấy chứng nhận đăng ký doanh nghiệp (PDF tải từ Cổng thông tin) KHÔNG dùng AI, trả JSON cho web LegalBiz.
Lấy nguyên phần đọc PDF của tool dien_mau.py: PDF của Cổng ĐKKD bị lỗi bảng mã chữ, nên đọc mã glyph
rồi tra ngược bảng cmap của font nhúng để ra đúng chữ tiếng Việt.

Cách dùng:  python doc_gp.py "GIAY_PHEP.pdf"
Kết quả (stdout, UTF-8): {"ok": true, "fields": {...}, "chars": <số ký tự đọc được>}
Cần: pip install pdfminer.six fonttools
"""
import io, re, sys, json

def _out(obj, code=0):
    sys.stdout.buffer.write(json.dumps(obj, ensure_ascii=False).encode('utf-8'))
    sys.stdout.flush()
    sys.exit(code)

try:
    from fontTools.ttLib import TTFont
    from pdfminer.pdfparser import PDFParser
    from pdfminer.pdfdocument import PDFDocument
    from pdfminer.pdfpage import PDFPage
    from pdfminer.pdfinterp import PDFResourceManager, PDFPageInterpreter
    from pdfminer.converter import PDFPageAggregator
    from pdfminer.layout import LAParams, LTTextContainer
    from pdfminer.pdftypes import resolve1
except ImportError as e:
    _out({'ok': False, 'error': 'thieu_thu_vien', 'detail': str(e)}, 3)

class _Agg(PDFPageAggregator):
    def __init__(self, rm, laparams, remap):
        super().__init__(rm, laparams=laparams)
        self.remap = remap
        self._cache = {}

    def _gid_map(self, font):
        k = id(font)
        if k not in self._cache:
            m = None
            try:
                ff = font.descriptor.get('FontFile2') if getattr(font, 'descriptor', None) else None
                if ff is not None:
                    t = TTFont(io.BytesIO(resolve1(ff).get_data()), lazy=True)
                    order = {g: i for i, g in enumerate(t.getGlyphOrder())}
                    m = {}
                    for u, g in t['cmap'].getBestCmap().items():
                        if g in order:
                            m.setdefault(order[g], chr(u))
            except Exception:
                m = None
            self._cache[k] = m
        return self._cache[k]

    def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate, *a):
        adv = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate, *a)
        if self.remap:
            m = self._gid_map(font)
            if m and cid in m:
                self.cur_item._objs[-1]._text = m[cid]
        return adv


def _pdf_text(path, remap):
    lines = []
    with open(path, 'rb') as f:
        doc = PDFDocument(PDFParser(f))
        rm = PDFResourceManager()
        dev = _Agg(rm, LAParams(line_margin=0.3, char_margin=3.0, word_margin=0.15), remap)
        it = PDFPageInterpreter(rm, dev)
        for page in PDFPage.create_pages(doc):
            it.process_page(page)
            layout = dev.get_result()
            items = []
            def walk(o):
                if isinstance(o, LTTextContainer) and hasattr(o, '_objs') and o.__class__.__name__.startswith('LTTextLine'):
                    items.append((-round(o.y1), o.x0, o.get_text().strip()))
                elif hasattr(o, '_objs'):
                    for c in o._objs: walk(c)
            walk(layout)
            items.sort()
            lines += [t for _, _, t in items if t]
    return '\n'.join(lines)


def read_pdf_text(path):
    t = _pdf_text(path, remap=True)
    if 'Mã số doanh nghiệp' in t or 'MÃ SỐ DOANH NGHIỆP' in t.upper():
        return t
    t2 = _pdf_text(path, remap=False)
    return t2 if 'doanh nghiệp' in t2.lower() else t


def _g(pat, s, flags=re.S, default=''):
    m = re.search(pat, s, flags)
    return re.sub(r'\s+', ' ', m.group(1)).strip(' :;,.*') if m else default


def parse_gp(path):
    raw = read_pdf_text(path)
    s = re.sub(r'[ \t\xa0]+', ' ', raw)
    one = re.sub(r'\s+', ' ', s)
    d = {}
    d['LOAI_HINH_HOA'] = _g(r'ĐĂNG KÝ DOANH NGHIỆP\s*(.+?)\s*Mã số doanh nghiệp', one)
    lh = d['LOAI_HINH_HOA']
    d['LOAI_HINH'] = (lh[:1].upper() + lh[1:].lower()) if lh else ''
    d['MST'] = re.sub(r'\D', '', _g(r'Mã số doanh nghiệp:\s*([\d ]{8,20})', one))
    m = re.search(r'Đăng ký lần đầu:\s*ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})', one)
    if m:
        d['NGAY_DK'], d['THANG_DK'], d['NAM_DK'] = m.group(1).zfill(2), m.group(2).zfill(2), m.group(3)
    d['TEN_CONG_TY'] = _g(r'tiếng Việt:\s*(.+?)\s*Tên công ty viết bằng tiếng nước ngoài', one).upper()
    d['TEN_TIENG_ANH'] = _g(r'tiếng nước ngoài:\s*(.*?)\s*Tên công ty viết tắt', one)
    d['TEN_VIET_TAT'] = _g(r'Tên công ty viết tắt:\s*(.*?)\s*\d\.\s*Địa chỉ trụ sở', one)
    d['DIA_CHI'] = _g(r'Địa chỉ trụ sở chính:?\s*(.+?)\s*Điện thoại', one)
    d['DIEN_THOAI'] = _g(r'Điện thoại:\s*(.*?)\s*(?:Số Fax|Fax|Thư điện tử|Email)', one)
    d['EMAIL'] = _g(r'Thư điện tử:\s*(\S+@\S+)', one)
    d['VON_DIEU_LE'] = _g(r'Vốn điều lệ\s*:?\s*([\d\.,]+)\s*đồng', one)
    d['VON_BANG_CHU'] = _g(r'Bằng chữ:\s*(.+?)\s*(?:\d\.\s|$)', one)

    # --- chủ sở hữu (công ty TNHH 1TV) ---
    own = _g(r'Thông tin về chủ sở hữu(.*?)(?:\d\.\s*Người đại diện|$)', one)
    d['CHU_SO_HUU'] = _g(r'Họ, chữ đệm và tên:\s*(.+?)\s*(?:Giới tính|Ngày, tháng|$)', own) \
        or _g(r'Tên (?:tổ chức|chủ sở hữu)[^:]*:\s*(.+?)\s*(?:Mã số|Địa chỉ|$)', own)

    # --- người đại diện theo pháp luật (lấy người đầu tiên) ---
    rep = _g(r'Người đại diện theo pháp luật[^:]*?(Họ, chữ đệm và tên:.*)$', one)
    nxt = re.search(r'Họ, chữ đệm và tên:', rep[5:])
    if nxt: rep = rep[:nxt.start() + 5]
    stop = r'(?=\s*(?:Giới tính|Ngày, tháng|Quốc tịch|Số định danh|Số giấy tờ|Loại giấy tờ|Chức danh|Địa chỉ|KT\.|TRƯỞNG PHÒNG|PHÓ TRƯỞNG|\*|$))'
    d['NGUOI_DAI_DIEN'] = _g(r'Họ, chữ đệm và tên:\s*(.+?)' + stop, rep).upper()
    d['GIOI_TINH'] = _g(r'Giới tính:\s*(Nam|Nữ)', rep)
    d['NGAY_SINH_GD'] = _g(r'năm sinh:\s*(\d{1,2}/\d{1,2}/\d{4})', rep)
    d['QUOC_TICH'] = _g(r'Quốc tịch:\s*(.+?)' + stop, rep)
    d['CCCD_GD'] = re.sub(r'\D', '', _g(r'(?:Số định danh cá nhân|Số giấy tờ pháp lý[^:]*):\s*([\d ]+)', rep))
    cd = _g(r'Chức danh:\s*(.+?)' + stop, rep)
    d['CHUC_DANH'] = cd[:1].upper() + cd[1:].lower() if cd else ''
    d['DIA_CHI_LIEN_LAC'] = _g(r'Địa chỉ liên lạc:\s*(.+?)' + stop, rep)
    d['DIA_CHI_THUONG_TRU'] = _g(r'Địa chỉ thường trú:\s*(.+?)' + stop, rep) or d['DIA_CHI_LIEN_LAC']
    if not d['CHU_SO_HUU']:
        d['CHU_SO_HUU'] = d['NGUOI_DAI_DIEN']
    d = {k: v for k, v in d.items() if v}
    return d, raw


if __name__ == '__main__':
    if len(sys.argv) < 2:
        _out({'ok': False, 'error': 'thieu_file'}, 2)
    try:
        fields, raw = parse_gp(sys.argv[1])
    except Exception as e:
        _out({'ok': False, 'error': 'doc_loi', 'detail': str(e)}, 1)
    _out({'ok': True, 'fields': fields, 'chars': len(raw)})
