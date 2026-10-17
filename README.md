# 넷볼 놀이터 (비공식 학습용)

넷볼 포지션별 이동 구역을 게임으로 익히는 웹 미니게임 허브입니다.
현재 구현: **존 스네이크 + 리더보드**(0~1단계). 리듬 슈팅·패스 퍼즐은 탭만 "준비중"으로 들어 있습니다.

- 프론트: Vite + Phaser 3 (게임은 "시작"을 누를 때만 불러와서 첫 화면이 가볍습니다)
- 백엔드: Vercel 서버리스 함수 `api/score.js` → Supabase(Postgres)
- 로컬에서는 Supabase 없이 `.data/scores.json` 파일에 점수가 저장됩니다

## 1. 로컬 실행

```bash
npm install
npm run dev        # http://localhost:5173  (같은 와이파이의 폰에서는 터미널에 뜨는 Network 주소)
npm test           # 규칙·로직·API 단위 테스트 (24개)
npm run build      # 배포용 빌드 확인
```

`npm run dev` 는 `/api/score` 도 같은 서버가 처리하므로 별도 설정이 필요 없습니다.
점수는 `.data/scores.json` 에 쌓이고, 지우면 초기화됩니다. (git에는 올라가지 않습니다)

## 2. Supabase 준비 (배포 전 1회)

1. supabase.com 에서 새 프로젝트 생성
2. **SQL Editor** 에 `supabase/schema.sql` 내용을 붙여넣고 Run
3. **Project Settings → API** 에서 두 값을 복사
   - `Project URL` → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_KEY` (**비밀 키**: 코드·GitHub·채팅에 노출 금지)
4. (선택) 로컬에서 Supabase까지 연결해 보려면 `.env.example` 을 `.env` 로 복사해 값을 채우고 `npm run dev`

테이블은 RLS가 켜져 있고 정책이 없어서 공개 키로는 읽기/쓰기가 모두 막힙니다. 서버 함수만 접근합니다.

## 3. GitHub → Vercel 배포

```bash
git init
git add .
git commit -m "넷볼 놀이터 0~1단계"
git branch -M main
git remote add origin https://github.com/<내계정>/netball-games.git
git push -u origin main
```

1. GitHub에 **개인 계정** 레포를 만들어 푸시합니다. (Vercel Hobby는 조직 소유 레포를 연결할 수 없습니다)
2. vercel.com → **Add New → Project** → 레포 Import (Framework: Vite 로 자동 인식)
3. **Environment Variables** 에 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 등록 → **Deploy**
4. 배포 주소에서 한 판 하고 닉네임을 등록해 보세요. Supabase **Table Editor → scores** 에 행이 보이면 성공입니다.

환경변수를 빼먹으면 리더보드가 "서버의 점수 저장소가 아직 설정되지 않았어요"라고 안내합니다.
이후에는 `git push` 만 하면 자동 재배포됩니다.

## 4. 폴더 구조

```
index.html            허브 화면 틀
src/main.js           탭·소개 카드·결과 화면·리더보드
src/games/snake.js    Phaser 화면/입력
src/games/snake-logic.js   게임 규칙(화면과 분리, 테스트 대상)
src/shared/zones.js   ★ 포지션별 이동 구역 데이터 (모든 게임이 공유하는 단일 규칙 출처)
src/games/registry.js 허브에 보이는 게임 목록 (새 게임은 여기에 추가)
api/score.js          Vercel 함수 (얇은 어댑터)
lib/score-handler.js  점수 검증 로직   lib/stores.js  Supabase/파일/메모리 저장소
supabase/schema.sql   DB 테이블
test/                 단위 테스트
```

## 5. 규칙 구현과 한계

- 구역표는 World Netball *Rules of Netball* 2024, Rule 3 (p.20)을 따릅니다. 서클 반경 4.9m, 코트 30.5×15.25m 비율을 1m 격자(30×15)로 근사했기 때문에 서클 경계가 계단 모양입니다. 화면에 보이는 선이 게임이 실제로 막는 경계와 같습니다.
- 규정집의 도표·문장을 복제하지 않고 직접 풀어 구현했습니다. 동아리 경기가 변형 규칙을 쓴다면 `zones.js` 만 고치면 됩니다.
- **점수 조작 방지는 가벼운 수준**입니다. 점수는 브라우저가 보내기 때문에 개발자도구로 조작할 수 있습니다. 서버에서 점수 범위·10점 단위·플레이 시간 대비 상한·IP별 3초 간격을 검사하지만, 친구끼리 쓰는 정도를 가정한 것입니다. IP 간격 제한은 서버리스 인스턴스 단위라 완전하지 않습니다.
- 폰은 가로 모드에서 코트가 가장 크게 보입니다.

## 6. 다음 단계

2단계 로그인·중간저장(Supabase Auth, `saves` 테이블) → 3단계 리듬 슈팅 → 4단계 패스 퍼즐.
