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

-- ===== 동아리 허브 1단계: 회원 명단 · 놀이터 기록 계정 저장 =====
-- 운영진이 미리 등록한 이름 + 전화번호로 로그인한다(메일 인증 없음). 연락처는 운영진 화면에서만 보인다.
-- 다른 테이블처럼 RLS만 켜고 정책은 없다 → 서버 함수(service_role)만 접근.
create table if not exists public.members (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 20),
  phone       text        not null unique check (phone ~ '^01[0-9]{8,9}$'),
  role        text        not null default 'member' check (role in ('member', 'admin')),
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table public.members enable row level security;

-- 놀이터 기록(배지 · 최고 기록 · 패스 퍼즐 별)을 계정에 저장할 때
create table if not exists public.play_saves (
  member_id   bigint      primary key references public.members (id) on delete cascade,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

alter table public.play_saves enable row level security;

-- '회장에게 자랑하기': 배지 · 별을 모두 모은 회원이 누르면 운영진 화면에 보인다 (회원 · 종류마다 한 번)
create table if not exists public.brags (
  id          bigint generated always as identity primary key,
  member_id   bigint      not null references public.members (id) on delete cascade,
  kind        text        not null check (kind in ('snake-badges', 'rhythm-badges', 'pass-stars')),
  seen        boolean     not null default false,
  created_at  timestamptz not null default now(),
  unique (member_id, kind)
);

alter table public.brags enable row level security;

-- 운영진의 '축하 보내기' (자랑한 회원이 홈에서 본다)
alter table public.brags add column if not exists cheer       text check (char_length(cheer) <= 100);
alter table public.brags add column if not exists cheered_at  timestamptz;
alter table public.brags add column if not exists cheer_seen  boolean not null default false;

-- 가입 승인 요청: 등록되지 않은 이름 + 전화번호로 로그인하려던 사람이 보낸다. 운영진이 승인하면 바로 회원이 된다.
create table if not exists public.join_requests (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 20),
  phone       text        not null check (phone ~ '^01[0-9]{8,9}
-- insert into public.members (name, phone, role) values ('홍길동', '01012345678', 'admin');
),
  message     text        check (char_length(message) <= 100),
  status      text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

alter table public.join_requests enable row level security;

-- 받은 메시지(reports) 처리 상태: 운영진 화면에서 '처리 완료'로 바꾸고 메모를 남긴다
alter table public.reports add column if not exists status  text not null default 'new' check (status in ('new', 'done'));
alter table public.reports add column if not exists note    text check (char_length(note) <= 200);
alter table public.reports add column if not exists done_at timestamptz;

-- 첫 운영진(본인) 등록: 이름과 전화번호를 바꿔서 한 번 실행하세요.
-- insert into public.members (name, phone, role) values ('홍길동', '01012345678', 'admin');
