// Header menu under the profile picture: Profile and Settings panels, the
// public Tips and About pages, and a theme picker that mirrors the Settings
// select exactly. The corner always renders (signed out included), so public
// information and themes are reachable without an account.
(function () {
    const $ = id => document.getElementById(id);
    const corner = $('avatar-corner');
    const menu = $('avatar-menu');
    if (!corner || !menu) return; // not on this page

    const close = () => { menu.hidden = true; };
    corner.addEventListener('click', e => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', e => {
        if (!menu.hidden && !menu.contains(e.target) && !corner.contains(e.target)) close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // Panel entries close the menu after switching; the panel logic itself
    // lives in ui.js against the same .nav-tab[data-target] contract.
    menu.querySelectorAll('.nav-tab[data-target]').forEach(b => b.addEventListener('click', close));

    // Theme swatches: every pick goes through the Settings select's own
    // change event, so persistence, the data-theme attribute and the
    // select's value can never drift apart. Names and values mirror the
    // select's options.
    const row = $('menu-theme-row');
    const select = $('theme-select');
    if (row && select) {
        const paint = () => {
            const cur = document.documentElement.getAttribute('data-theme') || select.value;
            row.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.theme === cur));
        };
        Array.from(select.options).forEach(opt => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'theme-swatch';
            b.dataset.theme = opt.value;
            b.title = opt.textContent;
            b.textContent = opt.textContent;
            b.addEventListener('click', () => {
                select.value = opt.value;
                select.dispatchEvent(new Event('change'));
                paint();
            });
            row.appendChild(b);
        });
        select.addEventListener('change', paint);
        paint();
    }
})();
