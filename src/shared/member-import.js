// 회원 일괄 등록: 엑셀에서 붙여넣은 글(탭) · CSV · .xlsx 에서 읽은 줄 → 등록할 회원 목록 + 줄마다 문제
// (순수 함수 → 테스트 가능. .xlsx 파일 읽기는 ui/xlsx-read.js)
export const MAX_IMPORT = 200;
const ROLE_WORDS = { 운영진: 'admin', 운영: 'admin', admin: 'admin', 관리자: 'admin', 회원: 'member', member: 'member', '': 'member' };

/** 붙여넣은 글 · CSV → 줄(칸 배열) 목록. 탭이 있으면 탭, 아니면 쉼표(따옴표 처리) */
export function parseDelimited(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sep = src.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const norm = (s) => String(s ?? '').normalize('NFC').trim();
const phoneOf = (raw) => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (/^1\d{9}$/.test(d)) d = `0${d}`; // 엑셀이 숫자로 바꿔 앞의 0을 지운 경우 (1012345678)
  return /^01\d{8,9}$/.test(d) ? d : null;
};

/** 첫 줄이 머리글(이름 · 전화번호 · 역할)이면 칸 위치를 찾는다 */
function headerOf(row) {
  const cells = row.map((c) => norm(c).replace(/\s/g, ''));
  const find = (words) => cells.findIndex((c) => words.some((w) => c.includes(w)));
  const name = find(['이름', '성명', 'name']);
  const phone = find(['전화', '휴대폰', '핸드폰', '연락처', '번호', 'phone']);
  if (name < 0 || phone < 0) return null;
  return { name, phone, role: find(['역할', '구분', 'role']) };
}

/**
 * 줄 목록 → [{ line, name, phone, role, error }]
 * existingPhones: 이미 등록된 번호들 (있으면 'exists')
 * error: 'no_name' · 'bad_phone' · 'bad_role' · 'dup_in_file' · 'exists' · null
 */
export function rowsToMembers(rows, existingPhones = []) {
  if (!rows.length) return [];
  const header = headerOf(rows[0]);
  const cols = header ?? { name: 0, phone: 1, role: 2 };
  const body = header ? rows.slice(1) : rows;
  const startLine = header ? 2 : 1;
  const existing = new Set(existingPhones);
  const seen = new Set();
  return body.slice(0, MAX_IMPORT).map((r, i) => {
    const name = norm(r[cols.name]).replace(/\s+/g, ' ');
    const rawPhone = norm(r[cols.phone]);
    const phone = phoneOf(rawPhone);
    const roleWord = cols.role >= 0 ? norm(r[cols.role]).toLowerCase() : '';
    const role = ROLE_WORDS[roleWord];
    let error = null;
    if (!name || [...name].length > 20) error = 'no_name';
    else if (!phone) error = 'bad_phone';
    else if (!role) error = 'bad_role';
    else if (seen.has(phone)) error = 'dup_in_file';
    else if (existing.has(phone)) error = 'exists';
    if (phone) seen.add(phone);
    return { line: startLine + i, name, phone: phone ?? rawPhone, role: role ?? roleWord, error };
  });
}

export const IMPORT_ERROR_TEXT = Object.freeze({
  no_name: '이름이 없어요(20자까지)',
  bad_phone: '휴대폰 번호 형식이 아니에요',
  bad_role: "역할은 '회원' 또는 '운영진'",
  dup_in_file: '파일 안에서 번호가 겹쳐요',
  exists: '이미 등록된 번호예요',
});

/** 양식 파일(CSV) 내용 — 엑셀에서 바로 열린다 (한글이 깨지지 않게 BOM) */
export const TEMPLATE_CSV = '﻿이름,전화번호,역할\n홍길동,010-1234-5678,회원\n김운영,010-9876-5432,운영진\n';
