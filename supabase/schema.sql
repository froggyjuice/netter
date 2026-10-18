-- Supabase 대시보드 > SQL Editor 에 붙여넣어 한 번 실행하세요.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  game        text        not null check (game in ('snake', 'rhythm', 'pass')),
  nickname    text        not null check (char_length(nickname) between 1 and 12),
  score       int         not null check (score between 0 and 100000),
  meta        jsonb,
  user_id     uuid references auth.users (id) on delete set null, -- 2단계(로그인)에서 사용, 지금은 null
  created_at  timestamptz not null default now()
);

create index if not exists scores_game_score_idx on public.scores (game, score desc, created_at);

-- RLS를 켜고 정책을 만들지 않으면 anon 키로는 읽기/쓰기가 모두 막힙니다.
-- 이 앱은 서버 함수(api/score.js)가 service_role 키로만 접근하므로 이 상태가 의도입니다.
alter table public.scores enable row level security;

-- 오류·아이디어 신고 (api/report.js). 이름·연락처·IP는 저장하지 않는다.
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  kind        text        not null check (kind in ('bug', 'idea')),
  message     text        not null check (char_length(message) between 2 and 500),
  meta        jsonb,      -- 화면 상황(페이지·포지션·화면 크기·기기 종류)
  created_at  timestamptz not null default now()
);

create index if not exists reports_created_idx on public.reports (created_at desc);

-- scores 와 같이 RLS만 켜고 정책은 만들지 않는다 → 서버 함수(service_role)만 접근
alter table public.reports enable row level security;

-- 댓글 (api/comments.js). 로그인 없이 닉네임으로 쓴다.
-- delete_hash: 쓴 기기에 저장된 삭제 토큰의 SHA-256 (토큰 원문은 저장하지 않음)
-- hidden: 관리자가 Table Editor 에서 체크하면 목록에서 숨겨진다
create table if not exists public.comments (
  id           bigint generated always as identity primary key,
  nickname     text        not null check (char_length(nickname) between 1 and 12),
  message      text        not null check (char_length(message) between 1 and 300),
  delete_hash  text        not null,
  hidden       boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists comments_visible_idx on public.comments (hidden, id desc);

alter table public.comments enable row level security;

-- 개발 중인 게임 좋아요 (api/likes.js) — 개발 우선순위를 정하는 데 쓴다.
-- voter_hash: 기기(브라우저)에 저장된 무작위 토큰의 SHA-256 (토큰 원문 · IP는 저장하지 않음). 기기마다 게임당 한 번.
create table if not exists public.likes (
  game        text        not null check (game in ('whistle', 'throwin', 'steps')),
  voter_hash  text        not null,
  created_at  timestamptz not null default now(),
  primary key (game, voter_hash)
);

alter table public.likes enable row level security;

-- 오류 자동 기록 (api/log.js) — 브라우저에서 생긴 오류. 닉네임·이름·IP는 저장하지 않는다.
-- 30일 지난 기록은 서버가 새 기록을 받을 때 함께 지운다.
create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  kind        text        not null check (kind in ('error', 'rejection', 'load')),
  message     text        not null check (char_length(message) between 1 and 300),
  source      text,
  line        int,
  col         int,
  stack       text        check (stack is null or char_length(stack) <= 1000),
  meta        jsonb,      -- 화면 상황(페이지·플레이 중·화면 크기·가로/세로·기기 종류·버전)
  created_at  timestamptz not null default now()
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- ===== '회장에게 자랑하기' · 받은 메시지 처리 =====
-- 회원 · 로그인 · 훈련 일정은 동아리 앱(netter-app-one)이 맡는다. 놀이터에는 로그인이 없다.
-- 자랑은 적은 이름으로 남고(같은 이름 · 같은 종류는 한 번), 운영진 화면(운영진 코드)에서 보고 축하를 보낸다.
create table if not exists public.brags (
  id          bigint generated always as identity primary key,
  name        text        check (char_length(name) between 1 and 20),
  kind        text        not null check (kind in ('snake-badges', 'rhythm-badges', 'pass-stars')),
  seen        boolean     not null default false,
  created_at  timestamptz not null default now()
);
alter table public.brags enable row level security;
alter table public.brags add column if not exists name        text check (char_length(name) between 1 and 20);
alter table public.brags add column if not exists cheer       text check (char_length(cheer) <= 100);
alter table public.brags add column if not exists cheered_at  timestamptz;
-- 예전(회원 로그인 시절) brags 테이블을 이미 만들었다면 member_id 를 비워도 되게
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'brags' and column_name = 'member_id') then
    alter table public.brags alter column member_id drop not null;
  end if;
end $$;

-- 받은 메시지(reports) 처리 상태: 운영진 화면에서 '처리 완료'로 바꾸고 메모를 남긴다
alter table public.reports add column if not exists status  text not null default 'new' check (status in ('new', 'done'));
alter table public.reports add column if not exists note    text check (char_length(note) <= 200);
alter table public.reports add column if not exists done_at timestamptz;

-- (참고) 예전 허브용으로 만든 members · play_saves · join_requests · events · event_votes · polls · poll_votes · semesters
-- 테이블은 이제 쓰지 않는다. 데이터를 확인한 뒤 필요 없으면 Supabase 에서 직접 지워도 된다.
