'use strict';

        // On-demand loading for the large novel files (catalog stubs are in
        // data/books/catalog.js). A stub entry has metadata but no lines; its
        // full text arrives by injecting the book's own script when the user
        // actually opens it. Bump the version here when a book file changes.
        const LAZY_BOOK_SRC={
            godan:'data/books/godan.js?v=20261114a',
            nirmala:'data/books/nirmala.js?v=20261116-input4'
        };
        const bookLoadPromises={};
        function bookIsReady(book){return !!book&&Array.isArray(book.lines);}
        function ensureBookLoaded(id){
            const book=(window.HIKEYBR_BOOKS||[]).find(b=>b.id===id);
            if(bookIsReady(book))return Promise.resolve(true);
            const src=LAZY_BOOK_SRC[id];
            if(!src)return Promise.resolve(false);
            if(bookLoadPromises[id])return bookLoadPromises[id];
            bookLoadPromises[id]=new Promise(resolve=>{
                const s=document.createElement('script');
                s.src=src;s.async=true;
                s.onload=()=>{
                    // The loaded file pushed a full entry beside the stub:
                    // fold it into the stub's slot so lookups stay single.
                    const arr=window.HIKEYBR_BOOKS||[];
                    const full=arr.findIndex(x=>x.id===id&&Array.isArray(x.lines));
                    const stub=arr.findIndex(x=>x.id===id&&!Array.isArray(x.lines));
                    if(full>=0&&stub>=0&&full!==stub){arr[stub]=arr[full];arr.splice(full,1);}
                    resolve(full>=0);
                };
                s.onerror=()=>{delete bookLoadPromises[id];resolve(false);};
                document.head.appendChild(s);
            });
            return bookLoadPromises[id];
        }
