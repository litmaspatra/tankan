// Runs before app initialization so a default save cannot turn a new visitor
// into a returning one. Kept external to respect the site's script policy.
try {
    window.__tankanHadLocalProgress = !!localStorage.getItem('hikeybr_store_v3');
} catch (_) {
    // When persistence is unavailable, prefer no automatic interruption.
    window.__tankanHadLocalProgress = true;
}
