// 엑셀(.xlsx) 첫 번째 시트를 줄(칸 배열) 목록으로 읽는다 — 외부 라이브러리 없이.
// .xlsx 는 zip 안의 XML 파일들이다: 브라우저의 DecompressionStream('deflate-raw') 로 풀고 DOMParser 로 읽는다.

/** zip 안의 파일 이름 → 내용(문자열)을 꺼내는 함수 */
async function unzip(buf) {
  const view = new DataView(buf);
  // 끝에서 '중앙 디렉터리 끝' 표시(0x06054b50)를 찾는다
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not_xlsx');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('not_xlsx');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
    const bytes = new Uint8Array(buf, start, e.size);
    if (e.method === 0) return dec.decode(bytes);
    if (e.method !== 8) throw new Error('unsupported_zip');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
}

const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
/** 'C12' → 2 (0부터) */
const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref ?? '')?.[0] ?? 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
const textOf = (el) => [...el.getElementsByTagName('t')].map((t) => t.textContent).join('');

/** File(.xlsx) → [['이름','전화번호',...], ...] (첫 번째 시트) */
export async function readXlsx(file) {
  const read = await unzip(await file.arrayBuffer());
  // 첫 번째 시트 파일 찾기: workbook.xml 의 첫 sheet → rels 의 대상
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id');
    const rel = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('no_sheet');
  const sharedText = await read('xl/sharedStrings.xml');
  const shared = sharedText ? [...xml(sharedText).getElementsByTagName('si')].map(textOf) : [];

  const rows = [];
  for (const row of xml(sheet).getElementsByTagName('row')) {
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(c);
      else value = v; // 숫자 · 수식 결과 문자열
      out[colIndex(c.getAttribute('r'))] = value;
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}
