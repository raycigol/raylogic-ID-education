// Local-only print preview. No database calls, auth tokens or student identities.
function openJoinCodePrint(snapshot){
 if(!snapshot?.cards?.length||snapshot.cards.some(card=>!card.qrSource))throw new Error('請先完整載入本課堂的加入碼與 QR Code。');
 const preview=window.open('','_blank');
 if(!preview)throw new Error('瀏覽器阻擋了列印視窗，請允許此網站開啟新視窗後再試。');
 preview.opener=null;
 const doc=preview.document;
 doc.documentElement.lang='zh-Hant';
 doc.title=snapshot.title+' - 組別 QR 裁剪卡';
 const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';doc.head.append(meta);
 const style=doc.createElement('style');style.textContent=`
 @page{size:A4 portrait;margin:10mm}
 *{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#111;font-family:system-ui,"Noto Sans TC","Microsoft JhengHei",sans-serif}
 button{font:inherit;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;background:#155d8c;color:white}button:disabled{opacity:.5;cursor:wait}
 .tools{position:sticky;top:0;z-index:1;padding:16px;background:white;border-bottom:1px solid #ccd3da;text-align:center}.tools h1{font-size:19px;margin:0 0 8px}.tools p{font-size:14px;margin:6px 0;line-height:1.6}.tools button{margin:6px}
 .sheet{width:190mm;margin:8mm auto;background:white;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}
 .sheet-heading{height:11mm;display:flex;justify-content:space-between;align-items:center;gap:4mm;font-size:9pt}.sheet-heading strong{overflow-wrap:anywhere}
 .cut-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm}
 .cut-card{height:82mm;break-inside:avoid;page-break-inside:avoid;border:.25mm dashed #777;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:white}
 .course{font-size:9pt;line-height:1.2;margin:0 0 1mm;overflow-wrap:anywhere}.team{font-size:20pt;line-height:1.15;margin:0 0 1mm;overflow-wrap:anywhere;font-weight:800}
 .short-code{font-family:ui-monospace,Consolas,monospace;font-size:19pt;line-height:1.2;letter-spacing:.12em;margin:0 0 1mm;font-weight:700}
 .qr{display:block;width:38mm;height:38mm;flex-shrink:0}.instruction{font-size:8pt;line-height:1.3;margin:1mm 0 0}.sheet-footer{font-size:8pt;line-height:1.3;padding-top:2mm;min-height:6mm}
 @media print{body{background:white}.tools{display:none}.sheet{margin:0 auto;box-shadow:none}}
 @media screen and (max-width:740px){.sheet{margin:5mm 0}.tools{text-align:left}}
 `;doc.head.append(style);
 const element=(tag,text,className)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node};
 const pages=Math.ceil(snapshot.cards.length/6),tools=element('section',undefined,'tools');
 tools.append(element('h1',snapshot.title+'｜組別 QR 裁剪卡'));
 tools.append(element('p','共 '+snapshot.cards.length+' 組，'+pages+' 頁；A4 直式，每頁最多 6 張，沿虛線裁剪。'));
 tools.append(element('p','按下列印後，目的地選「另存為 PDF」或印表機。建議 A4、縮放 100%、關閉頁首及頁尾。'));
 tools.append(element('p','只將對應組別卡片交給該組；更新短碼後，請重新載入並列印。'));
 const print=element('button','列印／另存為 PDF');print.type='button';print.disabled=true;
 print.onclick=()=>{preview.focus();preview.print()};
 const close=element('button','關閉預覽');close.type='button';close.onclick=()=>preview.close();
 const notice=element('p','正在準備 QR Code…');notice.setAttribute('role','status');tools.append(print,close,notice);doc.body.append(tools);
 const images=[];
 for(let page=0;page<pages;page++){
  const sheet=element('section',undefined,'sheet'),heading=element('div',undefined,'sheet-heading');
  heading.append(element('strong',snapshot.title),element('span','第 '+(page+1)+'／'+pages+' 頁'));
  const grid=element('div',undefined,'cut-grid');
  for(const card of snapshot.cards.slice(page*6,page*6+6)){
   const tile=element('article',undefined,'cut-card'),course=element('p',snapshot.title,'course'),team=element('h2',card.teamName,'team');
   if(snapshot.title.length>60)course.style.fontSize='7pt';if(card.teamName.length>24)team.style.fontSize='13pt';
   const qr=element('img',undefined,'qr');qr.alt=snapshot.title+' '+card.teamName+' 加入 QR Code';qr.src=card.qrSource;images.push(qr);
   tile.append(course,team,element('p',card.shortCode,'short-code'),qr,element('p','僅限本組代表掃描，加入後請確認組別。','instruction'));grid.append(tile);
  }
  sheet.append(heading,grid,element('div','沿虛線裁剪；每張卡片均標示課堂、組別與加入碼。','sheet-footer'));doc.body.append(sheet);
 }
 Promise.all(images.map(img=>img.decode?img.decode():new Promise((resolve,reject)=>{if(img.complete&&img.naturalWidth)return resolve();img.onload=resolve;img.onerror=reject}))).then(()=>{
  if(preview.closed)return;print.disabled=false;notice.textContent='QR Code 已準備完成，可以列印或另存為 PDF。';
 }).catch(()=>{if(!preview.closed)notice.textContent='部分 QR Code 無法載入，請關閉預覽並重新載入加入碼。'});
 return preview;
}
