// Applies the theme saved by the main app (localStorage 'hikeybr_store_v3')
// to the static pages, so About/Guides/Privacy/Transfer follow the site's
// selected theme. Loaded synchronously in <head> to avoid a flash of the
// wrong palette. Default matches the app: Ink (dark).
(function () {
    var theme = 'dark';
    try {
        var data = JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}');
        if (data.theme === 'light') {
            data.theme = 'dark';
            try { localStorage.setItem('hikeybr_store_v3', JSON.stringify(data)); } catch (_) {}
        }
        if (typeof data.theme === 'string' && data.theme) theme = data.theme;
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme);
})();
