// Hide the unfinished Arena (HiKeymash) page and its film-dialogue data from
// the live site while the code stays in the repo. Approved by Kartik on
// 2026-11-14 ahead of the AdSense application: copyrighted cinema dialogues
// must not be publicly served while the site is under review. Restore serving
// by deleting this middleware when Arena launches properly.
const HIDDEN_PATHS = new Set([
  '/hikeymash.html',
  '/hikeymash',
  '/hikeymash/',
  '/data/cinema.js',
  '/data/cinema.json',
]);

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (HIDDEN_PATHS.has(pathname)) {
    return new Response('Not found', { status: 404 });
  }
  return context.next();
}
