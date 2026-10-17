# 넷볼 놀이터 (비공식 학습용)

네터(netter)를 위한 넷볼 규칙 학습용 웹 미니게임 허브입니다.
규칙은 World Netball「Rules of Netball」2024를 직접 풀어 구현했습니다. (규정집 원문·PDF는 저장소에 넣지 않습니다)

## 무엇이 들어 있나

| 게임 | 배우는 규칙 | 기록 |
|---|---|---|
| 🐍 **존 스네이크** | 포지션별 구역 · 오프사이드 · 3초 · 센터 패스 · 장애/접촉 · 페널티 패스 · 4쿼터와 진영 교대 | 랭킹 + 배지 |
| 🎯 **리듬 슈팅** | 공격(GS·GA): 골 서클 안에서만 슛 · 3초 · 리바운드 · 슛 방해 / 수비(GK·GD): 0.9m · 정당한 블록 | 랭킹 + 최고 기록(모드×난이도) + 배지 |
| 🧩 **패스 퍼즐** | 숏 패스 · 서드 건너뛰기 · 오프사이드 · 풋워크(피벗) · 3초 — 7챕터 18스테이지 | 별 진행도 |
| 📖 **넷볼 규칙 사전** | Rule 1~21 요약(5개씩 5쪽), 찾기, 규칙마다 연습 게임 연결 | — |
| 🛠️ 개발 중 | 휘슬을 불어라 · 라인 저지 & 스로인 · 스텝 마스터 (계획 · 미리보기 · ❤️ 좋아요로 개발 순서 정하기) | — |

그 밖에: 홈에서 맛보기(존 스네이크) · 타이밍 연습(리듬 슈팅), 경기 후 규칙 복습(규칙 사전 링크), 랭킹·댓글, 오류·아이디어 신고, 홈 화면에 설치(PWA).
배지·최고 기록·별은 **이 기기의 브라우저**(localStorage)에 저장됩니다.

## 기술

- 프론트: Vite 7 + Phaser 3 (게임은 "시작"을 누를 때만 불러와 첫 화면이 가볍습니다). 홈의 미니 화면은 캔버스 2D.
- 백엔드: Vercel 서버리스 함수 `api/*.js` → `lib/*-handler.js` → Supabase(Postgres, service_role 키로 서버에서만 접근)
- 로컬: Supabase 없이 `.data/*.json` 파일에 저장 (`npm run dev` 가 `/api/*` 도 같은 로직으로 처리)
- 규칙 로직은 화면과 분리한 순수 함수(`*-logic.js`)이고 `node:test` 로 검사합니다.

## 1. 로컬 실행

```bash
npm install
npm run dev        # http://localhost:5173  (같은 와이파이의 폰에서는 터미널에 뜨는 Network 주소)
npm test           # 규칙·로직·API 단위 테스트 (209개)
npm run build      # 배포용 빌드 확인
```

로컬 데이터는 `.data/` 의 `scores.json` · `comments.json` · `reports.json` · `likes.json` 에 쌓이고, 지우면 초기화됩니다. (git에는 올라가지 않습니다)

## 2. Supabase 준비 (배포 전 1회)

1. supabase.com 에서 새 프로젝트 생성
2. **SQL Editor** 에 `supabase/schema.sql` 내용을 붙여넣고 Run → `scores` · `reports` · `comments` · `likes` · `client_errors` · `members` · `play_saves` 테이블이 생깁니다
3. **Project Settings → API** 에서 두 값을 복사
   - `Project URL` → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_KEY` (**비밀 키**: 코드·GitHub·채팅에 노출 금지, `VITE_` 접두사도 금지)
4. (선택) 로컬에서 Supabase까지 연결해 보려면 `.env.example` 을 `.env` 로 복사해 값을 채우고 `npm run dev`

모든 테이블은 RLS가 켜져 있고 정책이 없어서 공개 키로는 읽기/쓰기가 막힙니다. 서버 함수만 접근합니다.
나중에 스키마를 바꾸면 `schema.sql` 의 해당 부분만 다시 실행하세요(`create table if not exists`).

## 3. GitHub → Vercel 배포

1. GitHub에 **개인 계정** 저장소를 만들고(README 등 추가 옵션은 체크하지 않음) 푸시합니다. (Vercel Hobby는 조직 소유 저장소를 연결할 수 없습니다)
   ```bash
   git remote add origin https://github.com/<내계정>/<저장소>.git
   git push -u origin main
   ```
2. vercel.com → **Add New → Project** → 저장소 Import (Framework: Vite 자동 인식)
3. **Environment Variables** 에 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, 그리고 동아리 허브용 `SESSION_SECRET`(긴 무작위 문자열) · `ADMIN_CODE`(운영진 화면 코드) 등록 → **Deploy**
4. 배포 주소에서 점검: 한 판 하고 닉네임 등록(→ Table Editor `scores`), 댓글 · 신고 · 개발 중 게임 ❤️ 좋아요

환경변수를 빼먹으면 랭킹이 "서버의 점수 저장소가 아직 설정되지 않았어요"라고 안내합니다.
이후에는 `git push` 만 하면 자동 재배포됩니다.

### 운영 메모

- **첫 운영진 등록**(한 번): SQL Editor 에서 `insert into public.members (name, phone, role) values ('이름', '01012345678', 'admin');` → 그 이름 + 전화번호로 로그인 → 👤 → ⚙️ 운영진 화면(운영진 코드 입력)에서 나머지 회원 등록
- **동아리 허브 로그인**: 운영진이 등록한 이름 + 전화번호로 바로 로그인(메일 인증 없음). 연락처는 운영진 화면에서만 보입니다.

- **댓글 숨기기**: Supabase Table Editor → `comments` 에서 `hidden` 을 체크하면 목록에서 사라집니다.
- **신고 보기**: Table Editor → `reports` (이름·연락처·IP는 저장하지 않습니다)
- **좋아요**: `likes` 의 `voter_hash` 는 기기 토큰의 해시라 누가 눌렀는지 알 수 없습니다.

## 4. 폴더 구조

```
index.html                 허브 화면 틀 (게임 화면 · 일시정지 · 쿼터 · 종료 · 설명 창)
src/main.js                탭 · 소개 카드 · 게임 시작/결과 · 규칙 사전 · 랭킹·댓글 · 좋아요 · 신고
src/games/registry.js      허브의 게임 목록 (새 게임은 여기에, 개발 중 게임의 계획·추천 대상도)
src/games/*-logic.js       게임 규칙 (화면과 분리, 테스트 대상)
  snake-logic · match-logic(쿼터·시계) · rhythm-logic · rhythm-defence-logic · rhythm-records · pass-logic · snake-taste-logic
src/games/snake.js · rhythm.js · pass.js    Phaser 화면/입력
src/games/pass-stages.js   패스 퍼즐 챕터·스테이지 데이터
src/shared/zones.js        ★ 포지션별 이동 구역 (모든 게임이 공유하는 단일 규칙 출처)
src/shared/rulebook.js     넷볼 규칙 사전 (Rule 1~21 요약)    rule-notes.js  경기 후 '규칙 복습'
src/shared/theme.js        파스텔 색상 팔레트 (CSS 변수는 src/style.css :root)
src/hub/                   동아리 허브: 로그인 세션 · 서버 호출(hub-client) · 홈/캘린더/내 정보/운영진 화면(hub-pages)
src/ui/                    화면 조각 (리듬·패스 UI, 맛보기·연습, 규칙 링크, 개발 중 미리보기, 랭킹·댓글 …)
api/*.js                   Vercel 함수 (score · report · comments · likes · log · auth · me · admin, 얇은 어댑터)
lib/*-handler.js           요청 검증·처리   lib/*-store.js  Supabase / 파일 / 메모리 저장소
supabase/schema.sql        DB 테이블
test/                      단위 테스트
```

## 5. 규칙 구현과 한계

- 구역표는 Rule 3 (p.20)을 따릅니다. 서클 반경 4.9m, 코트 30.5×15.25m를 1m 격자(30×15)로 근사해서 서클 경계가 계단 모양입니다. 화면의 선이 게임이 실제로 막는 경계와 같습니다.
- 규정집의 도표·문장을 복제하지 않고 직접 풀어 썼습니다. 동아리가 변형 규칙을 쓴다면 `zones.js` · `rulebook.js` 만 고치면 됩니다.
- 2024 규칙에는 **토스업이 없습니다**(동시 반칙 → 바로 전에 공을 가졌던 팀의 포제션, Rule 20).
- **점수 조작 방지는 가벼운 수준**입니다. 서버에서 점수 범위·10점 단위·플레이 시간 대비 상한·IP별 간격을 검사하지만, 동아리 안에서 쓰는 정도를 가정했습니다.
- 폰에서 존 스네이크·패스 퍼즐은 가로로 들면 코트가 가장 크게 보입니다(세로면 코트가 세로로 돌아갑니다). 리듬 슈팅은 세로·가로 모두 같은 모양입니다.

## 6. 다음 단계

1. ✅ 배포 · 오류 자동 기록 · 허브 1단계(명단 · 이름+전화번호 로그인 · 놀이터 기록 계정 저장)
2. **동아리 허브** 다음 단계: 훈련 캘린더(캘린더 추가 버튼) → 일정별 참석 투표와 포지션 랜덤 배정 → 날짜 정하기 투표 → 공유 링크 · 출석 순위
3. 개발 중 게임: ❤️ 좋아요가 많은 순서대로
