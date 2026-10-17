import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, rowsToMembers, MAX_IMPORT, TEMPLATE_CSV } from '../src/shared/member-import.js';

test('엑셀에서 붙여넣은 글(탭)과 CSV(따옴표 · 쉼표 포함)를 읽는다', () => {
  assert.deepEqual(parseDelimited('이름\t전화번호\n홍길동\t010-1234-5678\n'), [['이름', '전화번호'], ['홍길동', '010-1234-5678']]);
  assert.deepEqual(parseDelimited('﻿이름,메모\r\n"김, 넷볼","그는 ""GS"""\r\n\r\n'), [['이름', '메모'], ['김, 넷볼', '그는 "GS"']]);
});

test('머리글로 칸을 찾고, 번호는 하이픈 · 앞자리 0이 빠진 숫자도 정리', () => {
  const rows = parseDelimited('전화번호,성명,구분\n01012345678,홍길동,운영진\n1098765432,김회원,\n');
  assert.deepEqual(rowsToMembers(rows), [
    { line: 2, name: '홍길동', phone: '01012345678', role: 'admin', error: null },
    { line: 3, name: '김회원', phone: '01098765432', role: 'member', error: null },
  ]);
});

test('머리글이 없으면 이름 · 번호 · 역할 순서로', () => {
  const [m] = rowsToMembers(parseDelimited('홍길동\t010 1234 5678'));
  assert.deepEqual(m, { line: 1, name: '홍길동', phone: '01012345678', role: 'member', error: null });
});

test('줄마다 문제: 이름 없음 · 번호 형식 · 역할 · 파일 안 중복 · 이미 등록됨', () => {
  const rows = parseDelimited([
    '이름,전화번호,역할',
    ',010-1111-1111,',
    '번호틀림,02-123-4567,',
    '역할틀림,010-2222-2222,감독',
    '첫째,010-3333-3333,',
    '둘째,010-3333-3333,',
    '기존,010-4444-4444,회원',
  ].join('\n'));
  assert.deepEqual(rowsToMembers(rows, ['01044444444']).map((m) => m.error), ['no_name', 'bad_phone', 'bad_role', null, 'dup_in_file', 'exists']);
});

test(`한 번에 ${MAX_IMPORT}명까지, 양식 파일은 머리글 + 예시 2줄`, () => {
  const many = Array.from({ length: MAX_IMPORT + 5 }, (_, i) => `회원${i}\t010${String(10000000 + i)}`).join('\n');
  assert.equal(rowsToMembers(parseDelimited(many)).length, MAX_IMPORT);
  const t = rowsToMembers(parseDelimited(TEMPLATE_CSV));
  assert.equal(t.length, 2);
  assert.ok(t.every((m) => m.error === null));
});
