// Shared site header on the static guide pages (tips.html, about.html,
// privacy.html): the same avatar menu, theme dropdown and sound toggle the
// practice page header has, talking to the same store
// (localStorage 'hikeybr_store_v3': theme, soundEnabled), so a choice made
// here is the choice practice uses. Theme names and values mirror
// index.html's #theme-select options - tests/guide-pages.cjs asserts they
// match. No app JS is loaded on these pages, so this file is self-contained.
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var corner = $('avatar-corner');
    var menu = $('avatar-menu');
    var themeBtn = $('theme-menu-btn');
    var themeMenu = $('theme-menu');

    var closeMenu = function () { if (menu) menu.hidden = true; };
    var closeThemes = function () { if (themeMenu) themeMenu.hidden = true; };

    if (corner && menu) {
        corner.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = menu.hidden;
            closeThemes();
            menu.hidden = !open;
        });
    }
    if (themeBtn && themeMenu) {
        themeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = themeMenu.hidden;
            closeMenu();
            themeMenu.hidden = !open;
        });
    }
    document.addEventListener('click', function (e) {
        if (menu && !menu.hidden && !menu.contains(e.target) && !(corner && corner.contains(e.target))) closeMenu();
        if (themeMenu && !themeMenu.hidden && !themeMenu.contains(e.target) && !(themeBtn && themeBtn.contains(e.target))) closeThemes();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); closeThemes(); } });

    function readStore() {
        try { return JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}'); }
        catch (e) { return {}; }
    }
    function writeStore(d) {
        try { localStorage.setItem('hikeybr_store_v3', JSON.stringify(d)); } catch (e) {}
    }

    // Theme dropdown: same choices, same order as Settings > Theme on the
    // practice page. The list stays open so themes can be sampled back to
    // back; the active theme is marked.
    var THEMES = [
        ['dark', 'Ink (Default)'],
        ['navy', 'Peacock'],
        ['amber', 'Letterpress'],
        ['sunshine', 'Marigold'],
        ['forest', 'Forest'],
        ['epaper', 'E-paper'],
        ['blackwhite', 'Black & White']
    ];
    var row = $('menu-theme-row');
    if (row) {
        var paint = function () {
            var cur = document.documentElement.getAttribute('data-theme') || 'dark';
            row.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('active', b.dataset.theme === cur);
            });
        };
        THEMES.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'menu-item theme-choice';
            b.dataset.theme = t[0];
            b.textContent = t[1];
            b.addEventListener('click', function () {
                document.documentElement.setAttribute('data-theme', t[0]);
                var d = readStore();
                d.theme = t[0];
                writeStore(d);
                paint();
            });
            row.appendChild(b);
        });
        paint();
    }

    // Sound toggle: mirrors the app's soundEnabled flag in the same store.
    var soundBtn = $('sound-toggle-btn');
    var soundIcon = $('sound-icon');
    if (soundBtn && soundIcon) {
        var renderSound = function () {
            var on = readStore().soundEnabled !== false;
            soundIcon.textContent = on ? '\uD83D\uDD0A' : '\uD83D\uDD07';
            soundBtn.classList.toggle('active', on);
        };
        soundBtn.addEventListener('click', function () {
            var d = readStore();
            d.soundEnabled = d.soundEnabled === false;
            writeStore(d);
            renderSound();
        });
        renderSound();
    }
})();
