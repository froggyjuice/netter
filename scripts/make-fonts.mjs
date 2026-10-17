// src/fonts.css 를 만든다: 한 글꼴 이름 'Netter' 로 보통 글씨는 고운돋움, 굵은 글씨(700~)는 주아.
// 둘 다 @fontsource 패키지(OFL)의 파일을 사이트에 함께 묶어서 외부 서버 없이 쓴다.
// 패키지를 업데이트하면 다시 실행: node scripts/make-fonts.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FACES = [
  { pkg: 'gowun-dodum', weight: '100 600' }, // 본문: 둥글고 읽기 편함
  { pkg: 'jua', weight: '700 900' }, // 제목 · 버튼 · 강조: 동글동글 귀여움
];

let out = '/* 자동 생성 — scripts/make-fonts.mjs 를 고치세요 */\n';
for (const { pkg, weight } of FACES) {
  const css = readFileSync(new URL(`../node_modules/@fontsource/${pkg}/index.css`, import.meta.url), 'utf8');
  out += css
    .replace(/font-family:[^;]+;/g, "font-family: 'Netter';")
    .replace(/font-weight:[^;]+;/g, `font-weight: ${weight};`)
    .replace(/url\(\.\/files\//g, `url(../node_modules/@fontsource/${pkg}/files/`)
    // woff2 만 남긴다 (모든 현역 브라우저 지원)
    .replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, '');
}
writeFileSync(new URL('../src/fonts.css', import.meta.url), out);
console.log('src/fonts.css', out.length, 'bytes');
