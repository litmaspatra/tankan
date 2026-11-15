// Shared English/Hindi toggle for the static guide pages (tips.html, about.html).
// Per-page strings come from data-* attributes on the toggle button, so this
// file stays generic and no inline script is needed (CSP: script-src 'self').
(function () {
  var btn = document.getElementById('lang-toggle');
  var en = document.getElementById('content-en');
  var hi = document.getElementById('content-hi');
  if (!btn || !en || !hi) return;
  var d = btn.dataset;
  function apply(lang) {
    var isHi = lang === 'hi';
    en.hidden = isHi;
    hi.hidden = !isHi;
    btn.textContent = isHi ? 'EN' : 'हिंदी';
    btn.setAttribute('aria-label', isHi ? 'Read in English' : 'हिंदी में पढ़ें');
    document.documentElement.lang = isHi ? 'hi' : 'en';
    document.title = isHi ? d.titleHi : d.titleEn;
    var m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', isHi ? d.descHi : d.descEn);
    try { localStorage.setItem('tankan-guide-lang', lang); } catch (e) {}
  }
  btn.addEventListener('click', function () {
    apply(hi.hidden ? 'hi' : 'en');
  });
  var start = 'en';
  try { start = localStorage.getItem('tankan-guide-lang') === 'hi' ? 'hi' : 'en'; } catch (e) {}
  if (/hi/.test(location.hash)) start = 'hi';
  apply(start);
})();
