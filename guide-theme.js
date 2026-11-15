// Applies the theme saved by the main app (localStorage 'hikeybr_store_v3')
// to the static pages, so About/Tips/Privacy/Transfer follow the site's
// selected theme. Loaded synchronously in <head> to avoid a flash of the
// wrong palette. Default matches the app: Paper (light).
(function () {
    var theme = 'light';
    try {
        var data = JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}');
        if (typeof data.theme === 'string' && data.theme) theme = data.theme;
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme);
})();
