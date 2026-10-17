// 홈 화면 설치 · 전체 화면
// - 안드로이드 Chrome 등: 브라우저가 설치 가능하다고 알려주면(beforeinstallprompt) "홈 화면에 설치" 버튼을 보여준다.
//   (설치 조건상 HTTPS 주소에서만 나온다 → 배포 주소에서 동작, 로컬 와이파이 주소(http)에서는 안 나옴)
// - 아이폰 Safari: 설치 API가 없으므로 버튼을 누르면 "공유 → 홈 화면에 추가" 안내를 보여준다.
// - 전체 화면 버튼: 전체 화면을 지원하는 기기(안드로이드 등)에서만 보인다. 아이폰 Safari는 지원하지 않음.

const isStandalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupInstall({ installBtn, helpDialog, fullscreenBtn }) {
  let deferred = null;

  if (!isStandalone()) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // 브라우저 기본 배너 대신 우리 버튼으로
      deferred = e;
      installBtn.hidden = false;
    });
    if (isIos()) installBtn.hidden = false; // 아이폰은 안내 창으로
  }
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    deferred = null;
  });

  installBtn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      installBtn.hidden = true;
    } else if (typeof helpDialog.showModal === 'function') {
      helpDialog.showModal();
    }
  });

  // 전체 화면: 설치한 앱으로 열었으면 이미 전체 화면이므로 숨긴다
  const canFullscreen = document.fullscreenEnabled && !isStandalone();
  fullscreenBtn.hidden = !canFullscreen;
  if (!canFullscreen) return;
  const sync = () => {
    const on = Boolean(document.fullscreenElement);
    fullscreenBtn.textContent = on ? '🗗' : '⛶';
    fullscreenBtn.setAttribute('aria-label', on ? '전체 화면 끄기' : '전체 화면');
    fullscreenBtn.title = on ? '전체 화면 끄기' : '전체 화면';
  };
  document.addEventListener('fullscreenchange', sync);
  fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* 지원하지 않거나 거절됨: 그대로 둔다 */
    }
  });
  sync();
}
