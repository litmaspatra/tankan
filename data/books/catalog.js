// Lightweight catalog entries for the two full novels. Their text lives in
// data/books/godan.js and data/books/nirmala.js (~2.6 MB together) and loads
// on demand - see ensureBookLoaded in src/js/hikeybr/bookloader.js - so the
// first page load doesn't download books the default mode never shows.
// Keep these fields in sync with the headers of the full book files.
window.HIKEYBR_BOOKS=window.HIKEYBR_BOOKS||[];
window.HIKEYBR_BOOKS.push(
    {"id":"nirmala","title":"निर्मला (सम्पूर्ण उपन्यास)","author":"प्रेमचंद","kind":"novel","died":1936,"source":"https://hi.wikisource.org/wiki/निर्मला"},
    {"id":"godan","title":"गोदान (सम्पूर्ण उपन्यास)","author":"प्रेमचंद","kind":"novel","died":1936,"source":"https://hi.wikisource.org/wiki/गो-दान"}
);
