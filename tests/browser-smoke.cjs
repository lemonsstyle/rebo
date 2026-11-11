const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.REBO_PLAYWRIGHT_MODULE || 'playwright');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(`${root}/content.js`,'utf8').replace('  void start();',`window.audit={
 plainText,createStatusCard,openDetail,closeDetail,createDetailCommentContext,renderDetailComments,
 preloadCommentReplies,createCommentItem,attachCommentZones,handleDetailWheel,observePage,
 getMasonryColumnCount,createControls,listenForBridgeResponses,setCardQuickActions,
 setBridge(fn){bridgeRequest=fn;},setQuickActions(value){settings.cardQuickActions=value;},
 getSession(){return activeDetailSessionId;}
};`);
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 let blocked=0;
 await context.route('**/*',route=>{
  if(route.request().isNavigationRequest()&&route.request().url().startsWith('https://weibo.com/'))
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><button id="outside">页面按钮</button><section id="weibo-grid-reader-surface"><div id="cards" data-reader-grid style="width:500px"></div></section></body></html>'});
  blocked++;return route.abort();
 });
 const page=await context.newPage();
 await page.goto('https://weibo.com/mygroups?gid=A');
 await page.addStyleTag({content:fs.readFileSync(`${root}/styles.css`,'utf8')});
 await page.evaluate(()=>{window.chrome={runtime:{id:'audit-mock'},storage:{local:{set(){}}}};});
 await page.addScriptTag({content:source});
 await page.evaluate(()=>audit.observePage());
 const results=[];
 await page.evaluate(()=>{
  audit.setBridge(async()=>({ok:true,payload:{comments:[],maxId:0}}));
  audit.setQuickActions(true);
  window.statusData={idstr:'123',mblogid:'ABC',text_raw:'这是用于本地审查的模拟微博。',user:{idstr:'author',screen_name:'测试作者'},comments_count:1,reposts_count:0,attitudes_count:0};
  const card=audit.createStatusCard(statusData);document.querySelector('#cards').append(card);
  audit.openDetail(statusData,card);
 });
 await page.waitForTimeout(60);
 assert.equal(await page.locator('.weibo-grid-reader__detail-close').count(),0);
 results.push({case:'detail-has-no-corner-close-button',passed:true});
 await page.locator('.weibo-grid-reader__detail-dialog').focus();
 await page.keyboard.press('Shift+Tab');
 const focus=await page.evaluate(()=>({inside:!!document.activeElement.closest('#weibo-grid-reader-detail'),active:document.activeElement.outerHTML.slice(0,350)}));
 assert.equal(focus.inside,true);results.push({case:'initial-shift-tab-stays-in-modal',observed:focus});
 await page.locator('.weibo-grid-reader__detail-like').click();
 const liked=await page.evaluate(()=>({status:statusData.attitudes_status,cardPressed:document.querySelector('.weibo-grid-reader__card-action--like').getAttribute('aria-pressed'),cardText:document.querySelector('.weibo-grid-reader__card-action--like').textContent,detailPressed:document.querySelector('.weibo-grid-reader__detail-like').getAttribute('aria-pressed')}));
 assert.equal(liked.status,1);assert.equal(liked.cardPressed,'true');
 results.push({case:'card-like-ui-matches-detail-like',observed:liked});
 await page.keyboard.press('Escape');
 await page.waitForTimeout(60);
 assert.equal(await page.locator('#weibo-grid-reader-detail').count(),0);
 await page.locator('.weibo-grid-reader__card-action--comment').click();
 await page.locator('.weibo-grid-reader__card-composer-input').fill('快捷操作草稿');
 await page.evaluate(()=>{
  window.originalCard=document.querySelector('.weibo-grid-reader__card');
  audit.setCardQuickActions(false,{});
  audit.setCardQuickActions(true,{});
 });
 assert.equal(await page.locator('.weibo-grid-reader__card-composer-input').inputValue(),'快捷操作草稿');
 assert.equal(await page.evaluate(()=>originalCard===document.querySelector('.weibo-grid-reader__card')),true);
 results.push({case:'quick-actions-toggle-preserves-card-and-draft',passed:true});

 // The visual lift must keep masonry coordinates and the original pointer boundary stable.
 await page.mouse.move(1400,850);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const card=page.locator('.weibo-grid-reader__card');
 const base=await card.boundingBox();
 const position=await card.evaluate(e=>getComputedStyle(e).transform);
 await page.mouse.move(base.x+base.width/2,base.y+base.height/2);
 await page.waitForTimeout(250);
 const raised=await card.boundingBox();
 assert(Math.abs(raised.y-(base.y-2))<0.1);
 assert.equal(await card.evaluate(e=>getComputedStyle(e).transform),position);
 await page.mouse.move(base.x+base.width/2,base.y+base.height-0.5);
 await page.waitForTimeout(300);
 assert.equal(await card.evaluate(e=>e.classList.contains('weibo-grid-reader__card--hovered')),true);
 assert(Math.abs((await card.boundingBox()).y-raised.y)<0.1);
 await page.mouse.move(1400,850);
 await page.waitForTimeout(250);
 assert(Math.abs((await card.boundingBox()).y-base.y)<0.1);
 await page.emulateMedia({reducedMotion:'reduce'});
 await card.hover();
 assert.equal(await card.evaluate(e=>getComputedStyle(e).translate),'0px');
 results.push({case:'card-lift-stable-at-bottom-edge-and-respects-reduced-motion',passed:true});

 await page.evaluate(()=>{
  window.replyParent={idstr:'parent',user:{idstr:'other',screen_name:'评论作者'},text_raw:'有三条回复的评论',total_number:3,comments:[{idstr:'r1',text_raw:'回复一',user:{}},{idstr:'r2',text_raw:'回复二',user:{}}]};
  audit.setBridge((type)=>type==='fetch-comment-replies'?new Promise(resolve=>window.finishReplies=resolve):Promise.resolve({ok:true,payload:{comments:[replyParent],maxId:0}}));
  audit.openDetail(statusData,document.querySelector('.weibo-grid-reader__card'));
 });
 await page.waitForFunction(()=>typeof finishReplies==='function');
 await page.evaluate(()=>{
  document.querySelector('.weibo-grid-reader__comment-zone--comment').click();
  document.querySelector('.weibo-grid-reader__comment-inline-reply-input').value='尚未发送的重要草稿';
 });
 const before=await page.locator('.weibo-grid-reader__comment-inline-reply-input').count();
 await page.evaluate(()=>finishReplies({ok:true,payload:{comments:[...replyParent.comments,{idstr:'r3',text_raw:'回复三',user:{}}],maxId:0}}));
 await page.waitForTimeout(60);
 const after=await page.locator('.weibo-grid-reader__comment-inline-reply-input').count();
 assert.equal(before,1);assert.equal(after,1); assert.equal(await page.locator('.weibo-grid-reader__comment-inline-reply-input').inputValue(),'尚未发送的重要草稿');
 results.push({case:'reply-preload-preserves-draft',before,after});
 await page.locator('.weibo-grid-reader__comment-more-replies').click();
 assert.equal(await page.locator('.weibo-grid-reader__comment-inline-reply-input').inputValue(),'尚未发送的重要草稿');
 assert.equal(await page.locator('.weibo-grid-reader__comment--reply').count(),3);
 results.push({case:'comment-button-labels',observed:await page.evaluate(()=>Array.from(document.querySelector('.weibo-grid-reader__comment-zone-bar').children).map(e=>({class:e.className,aria:e.getAttribute('aria-label'),title:e.title,text:e.textContent})))});


 await page.evaluate(()=>{audit.plainText('<img src="https://invalid.test/audit.png" onerror="window.auditHtmlExecuted=true">正文');});
 await page.waitForTimeout(60);
 const html=await page.evaluate(()=>({executed:window.auditHtmlExecuted===true}));
 results.push({case:'plainText-detached-dom-local-no-CSP',observed:html});
 assert.equal(html.executed,false);
 await page.evaluate(()=>audit.closeDetail(false));

 await page.evaluate(()=>{
  const videoStatus={idstr:'video',text_raw:'视频测试',user:{},page_info:{page_url:'https://weibo.com/tv/show/test',media_info:{stream_url:'https://invalid.test/video.mp4'}}};
  document.querySelector('#cards').replaceChildren(audit.createStatusCard(videoStatus));
 });
 await page.waitForSelector('.weibo-grid-reader__video-fallback');
 assert.equal(await page.locator('.weibo-grid-reader__video-fallback').getAttribute('href'),'https://weibo.com/tv/show/test');
 const video=await page.locator('#weibo-grid-reader-detail').count();
 assert.equal(video,0);results.push({case:'video-fallback-links-to-original',detailCount:video});

 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  audit.setBridge(async()=>({ok:true,payload:{comments:[{idstr:'c1',user:{screen_name:'测试'},text_raw:'触屏操作测试'}],maxId:0}}));
  audit.openDetail(statusData,document.querySelector('.weibo-grid-reader__card'));
 });
 await page.waitForTimeout(60);
 results.push({case:'narrow-layout',observed:await page.evaluate(()=>({columns:audit.getMasonryColumnCount(),dialogRect:document.querySelector('.weibo-grid-reader__detail-dialog').getBoundingClientRect().toJSON(),viewportWidth:innerWidth,viewportHeight:innerHeight}))});

 // A touch-only page does not generate a mouse hover before the first pointer hit-test.
 const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 await touchContext.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width"><body></body></html>'}):route.abort());
 const touch=await touchContext.newPage();await touch.goto('https://weibo.com/');
 await touch.addStyleTag({content:fs.readFileSync(`${root}/styles.css`,'utf8')});
 await touch.evaluate(()=>{const row=document.createElement('div');row.style.cssText='padding:40px';row.innerHTML='<div class="weibo-grid-reader__comment-zone-bar"><button class="weibo-grid-reader__comment-zone" id="touchAction">回复</button></div>';document.body.append(row);});
 const touchStyle=await touch.locator('#touchAction').evaluate(e=>({opacity:getComputedStyle(e).opacity,pointerEvents:getComputedStyle(e).pointerEvents,hover:matchMedia('(hover: hover)').matches}));
 assert.equal(touchStyle.opacity,'1'); assert.equal(touchStyle.pointerEvents,'auto'); results.push({case:'touch-comment-actions-visible',observed:touchStyle});
 await touchContext.close();
 results.push({case:'network',blockedRequests:blocked,realAccountUsed:false});

 console.log(JSON.stringify(results,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
