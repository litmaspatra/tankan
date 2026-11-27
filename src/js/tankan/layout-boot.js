// Applies the saved typing layout before first paint. In Inscript mode the
// page stays veiled (see tankan.css) until the Inscript engine has rendered
// its first lesson, so a reload or a layout switch never flashes the
// Remington lesson first. A safety timeout lifts the veil even if the app
// script fails to load, so the page can never stay blank.
(function () {
    var layout = 'kruti';
    try { layout = localStorage.getItem('tankan_layout') === 'inscript' ? 'inscript' : 'kruti'; } catch (e) {}
    var de = document.documentElement;
    de.setAttribute('data-layout', layout);
    if (layout === 'inscript') {
        setTimeout(function () { de.setAttribute('data-ins-ready', '1'); }, 8000);
    }
})();
