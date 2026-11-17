// Existing feature suites exercise returning typists. The separate tour suite
// uses fresh contexts and covers automatic first-visit behaviour explicitly.
const {chromium}=require('playwright');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args);
 const mark=()=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(key){return key==='tankan_tour_v1'?'1':get.call(this,key);};};
 const newPage=browser.newPage.bind(browser);
 browser.newPage=async(...args)=>{const page=await newPage(...args);await page.addInitScript(mark);return page;};
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{const ctx=await newContext(...args);await ctx.addInitScript(mark);return ctx;};
 return browser;
};
