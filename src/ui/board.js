// 랭킹·댓글 페이지 (#/board)
// - 랭킹: 게임별 TOP 10 (준비 중인 게임은 탭만 보이고 누를 수 없음)
// - 댓글: 전체 하나. 로그인 없이 닉네임으로. 내가 쓴 글은 이 기기에서만 지울 수 있다(삭제 토큰을 브라우저에 저장).
import { GAMES } from '../games/registry.js';
import { fetchTop, fetchComments, postComment, deleteComment, ERROR_TEXT } from '../shared/api.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE = 20;
const TOKENS_KEY = 'netball.commentTokens';

const COMMENT_ERRORS = {
  bad_nickname: '닉네임은 한글·영문·숫자·공백·_-. 로 12자까지 쓸 수 있어요.',
  bad_message: '댓글은 1~300자, 6줄까지 쓸 수 있어요.',
  too_fast: '조금 전에 썼어요. 15초 뒤에 다시 써 주세요.',
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * @param {{ rankingEl: HTMLElement, commentsEl: HTMLElement, store: { get, set }, getHighlight: () => ({nickname, score}|null) }} opts
 */
export function createBoard({ rankingEl, commentsEl, store, getHighlight }) {
  const RANKED = GAMES.filter((g) => g.ranked !== false); // 패스 퍼즐은 별 진행도만 (랭킹 없음)
  let game = RANKED.some((g) => g.id === store.get('netball.boardGame') && g.ready) ? store.get('netball.boardGame') : GAMES[0].id;
  let rankToken = 0;
  let oldestId = null;

  const tokens = () => {
    try {
      return JSON.parse(store.get(TOKENS_KEY) ?? '{}') || {};
    } catch {
      return {};
    }
  };
  const saveToken = (id, token) => {
    const all = tokens();
    all[id] = token;
    store.set(TOKENS_KEY, JSON.stringify(all));
  };
  const dropToken = (id) => {
    const all = tokens();
    delete all[id];
    store.set(TOKENS_KEY, JSON.stringify(all));
  };

  // ---------- 랭킹 ----------
  function renderRankingShell() {
    rankingEl.innerHTML = `
      <h2>🏆 랭킹</h2>
      <div class="rank-tabs" role="tablist" aria-label="게임 선택">
        ${RANKED.map(
          (g) =>
            `<button type="button" role="tab" data-game="${g.id}" aria-selected="${g.id === game}" ${g.ready ? '' : 'disabled'}>${g.icon} ${g.title}${g.ready ? '' : ' <small>준비중</small>'}</button>`,
        ).join('')}
      </div>
      <div id="rank-list" aria-live="polite"></div>`;
    rankingEl.querySelectorAll('.rank-tabs button:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => {
        game = b.dataset.game;
        store.set('netball.boardGame', game);
        rankingEl.querySelectorAll('.rank-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        loadRanking();
      }),
    );
  }

  async function loadRanking() {
    const list = rankingEl.querySelector('#rank-list');
    const token = ++rankToken;
    list.innerHTML = '<p class="muted">불러오는 중…</p>';
    let scores;
    try {
      scores = await fetchTop(game);
    } catch (err) {
      if (token === rankToken) list.innerHTML = `<p class="muted">${ERROR_TEXT[err.code] ?? '랭킹을 불러오지 못했어요.'}</p>`;
      return;
    }
    if (token !== rankToken) return;
    if (scores.length === 0) {
      list.innerHTML = '<p class="muted">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>';
      return;
    }
    const mine = getHighlight();
    const ol = document.createElement('ol');
    ol.className = 'rank';
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="no"></span><span class="nick"></span><span class="pts"></span><span class="date"></span>';
      li.querySelector('.no').textContent = MEDALS[i] ?? String(i + 1);
      li.querySelector('.nick').textContent = s.nickname; // 사용자 입력이므로 textContent 로만 넣는다
      li.querySelector('.pts').textContent = `${s.score}점`;
      li.querySelector('.date').textContent = fmtDate(s.created_at);
      if (mine && mine.nickname === s.nickname && mine.score === s.score) li.classList.add('me');
      ol.append(li);
    });
    list.replaceChildren(ol);
  }

  // ---------- 댓글 ----------
  function renderCommentsShell() {
    commentsEl.innerHTML = `
      <h2>💬 댓글</h2>
      <form class="comment-form" id="comment-form" autocomplete="off">
        <input id="comment-nick" maxlength="12" placeholder="닉네임 (12자 이내)" aria-label="닉네임" />
        <textarea id="comment-msg" maxlength="300" rows="3" placeholder="게임 후기, 응원, 넷볼 이야기 무엇이든 (300자)" aria-label="댓글 내용"></textarea>
        <div class="comment-form-row">
          <span class="muted small"><span id="comment-count">0</span>/300 · 로그인 없이 쓸 수 있어요. 내 글은 이 기기에서만 지울 수 있어요.</span>
          <button class="btn primary small" type="submit" id="comment-send">등록</button>
        </div>
        <p class="small" id="comment-msg-status" aria-live="polite"></p>
      </form>
      <ul class="comment-list" id="comment-list"></ul>
      <div class="center"><button class="btn ghost small" type="button" id="comment-more" hidden>더 보기</button></div>`;

    const nick = commentsEl.querySelector('#comment-nick');
    const msg = commentsEl.querySelector('#comment-msg');
    const status = commentsEl.querySelector('#comment-msg-status');
    const send = commentsEl.querySelector('#comment-send');
    nick.value = store.get('netball.nick') ?? '';
    msg.addEventListener('input', () => {
      commentsEl.querySelector('#comment-count').textContent = String(msg.value.length);
    });
    commentsEl.querySelector('#comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!nick.value.trim()) return void (status.textContent = '닉네임을 입력해 주세요.');
      if (!msg.value.trim()) return void (status.textContent = '내용을 입력해 주세요.');
      send.disabled = true;
      status.textContent = '등록 중…';
      try {
        const out = await postComment({ nickname: nick.value.trim(), message: msg.value });
        saveToken(out.comment.id, out.deleteToken);
        store.set('netball.nick', nick.value.trim());
        msg.value = '';
        commentsEl.querySelector('#comment-count').textContent = '0';
        status.textContent = '';
        commentsEl.querySelector('#comment-list').prepend(commentItem(out.comment));
        commentsEl.querySelector('.comment-empty')?.remove();
      } catch (err) {
        status.textContent = COMMENT_ERRORS[err.code] ?? ERROR_TEXT[err.code] ?? '등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      } finally {
        send.disabled = false;
      }
    });
    commentsEl.querySelector('#comment-more').addEventListener('click', () => loadComments(true));
  }

  function commentItem(c) {
    const li = document.createElement('li');
    li.className = 'comment';
    li.innerHTML = '<div class="comment-head"><b class="nick"></b><span class="date muted small"></span></div><p class="text"></p>';
    li.querySelector('.nick').textContent = c.nickname; // 사용자 입력은 textContent 로만
    li.querySelector('.date').textContent = fmtDate(c.created_at);
    li.querySelector('.text').textContent = c.message;
    const token = tokens()[c.id];
    if (token) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost small comment-del';
      del.textContent = '삭제';
      del.addEventListener('click', async () => {
        if (!window.confirm('이 댓글을 지울까요?')) return;
        del.disabled = true;
        try {
          await deleteComment({ id: c.id, token });
          dropToken(c.id);
          li.remove();
        } catch (err) {
          if (err.code === 'not_found') {
            dropToken(c.id); // 이미 지워졌거나 관리자가 정리함
            li.remove();
          } else {
            del.disabled = false;
            window.alert('지우지 못했어요. 잠시 뒤 다시 시도해 주세요.');
          }
        }
      });
      li.querySelector('.comment-head').append(del);
    }
    return li;
  }

  async function loadComments(more = false) {
    const list = commentsEl.querySelector('#comment-list');
    const moreBtn = commentsEl.querySelector('#comment-more');
    if (!more) {
      oldestId = null;
      list.innerHTML = '<li class="muted">불러오는 중…</li>';
    }
    moreBtn.disabled = true;
    let comments;
    try {
      comments = await fetchComments({ limit: PAGE, before: more ? oldestId : null });
    } catch (err) {
      if (!more) list.innerHTML = `<li class="muted">${ERROR_TEXT[err.code] ?? '댓글을 불러오지 못했어요.'}</li>`;
      moreBtn.disabled = false;
      return;
    }
    if (!more) list.replaceChildren();
    if (!more && comments.length === 0) list.innerHTML = '<li class="muted comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨 주세요!</li>';
    comments.forEach((c) => list.append(commentItem(c)));
    if (comments.length) oldestId = comments[comments.length - 1].id;
    moreBtn.hidden = comments.length < PAGE;
    moreBtn.disabled = false;
  }

  return {
    show() {
      renderRankingShell();
      renderCommentsShell();
      loadRanking();
      loadComments();
    },
  };
}
