// Header menus: the profile-picture corner opens Profile, Settings and the
// public Guides and About pages; a separate Theme button next to the sound
// toggle opens a dropdown that mirrors the Settings select exactly. Both
// corners always render (signed out included), so public information and
// themes are reachable without an account.
(function () {
    const $ = id => document.getElementById(id);
    const corner = $('avatar-corner');
    const menu = $('avatar-menu');
    const themeBtn = $('theme-menu-btn');
    const themeMenu = $('theme-menu');

    let paintThemes = () => {};
    const closeMenu = () => { if (menu) menu.hidden = true; };
    const closeThemes = () => { if (themeMenu) themeMenu.hidden = true; };

    if (corner && menu) {
        corner.addEventListener('click', e => {
            e.stopPropagation();
            const open = menu.hidden;
            closeThemes();
            menu.hidden = !open;
        });
        // Panel entries close the menu after switching; the panel logic itself
        // lives in ui.js against the same .nav-tab[data-target] contract.
        menu.querySelectorAll('.nav-tab[data-target]').forEach(b => b.addEventListener('click', closeMenu));
    }

    if (themeBtn && themeMenu) {
        themeBtn.addEventListener('click', e => {
            e.stopPropagation();
            const open = themeMenu.hidden;
            paintThemes();
            closeMenu();
            themeMenu.hidden = !open;
        });
    }

    document.addEventListener('click', e => {
        if (menu && !menu.hidden && !menu.contains(e.target) && !(corner && corner.contains(e.target))) closeMenu();
        if (themeMenu && !themeMenu.hidden && !themeMenu.contains(e.target) && !(themeBtn && themeBtn.contains(e.target))) closeThemes();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeThemes(); } });

    // Theme dropdown: every pick goes through the Settings select's own
    // change event, so persistence, the data-theme attribute and the
    // select's value can never drift apart. Names and values mirror the
    // select's options. The list stays open so themes can be sampled
    // back to back; the active theme is marked.
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
            b.className = 'menu-item theme-choice';
            b.dataset.theme = opt.value;
            b.textContent = opt.textContent;
            b.addEventListener('click', () => {
                select.value = opt.value;
                select.dispatchEvent(new Event('change'));
                paint();
            });
            row.appendChild(b);
        });
        paintThemes = paint;
        select.addEventListener('change', paint);
        // Storage/account restore runs after this menu is built.
        new MutationObserver(paint).observe(document.documentElement, {attributes:true,attributeFilter:['data-theme']});
        paint();
    }
})();
