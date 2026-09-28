import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";

const PDF_JS_BUNDLE = require("../../assets/pdfjs/pdf.min.js.pdfjs");
const PDF_WORKER_BUNDLE = require("../../assets/pdfjs/pdf.worker.min.js.pdfjs");
const DIR = FileSystem.cacheDirectory + "pdfjs/";
const LIB = DIR + "pdf.min.js";
const WORKER = DIR + "pdf.worker.min.js";
const VIEWER = DIR + "viewer.html";

const VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes" />
<style>
  html,body{margin:0;padding:0;background:#54565b;}
  #container{padding:12px 0;display:flex;flex-direction:column;align-items:center;gap:12px;}
  .pageWrap{position:relative;box-shadow:0 2px 10px rgba(0,0,0,0.4);background:#fff;}
  canvas{display:block;width:100%;height:auto;}
  #status{color:#fff;text-align:center;font-family:-apple-system,Roboto,sans-serif;padding:24px;font-size:15px;}
</style>
<script src="./pdf.min.js"></script>
</head>
<body>
<div id="status">Loading…</div>
<div id="container"></div>
<script>
  var RN = window.ReactNativeWebView;
  function post(o){ try{ RN.postMessage(JSON.stringify(o)); }catch(e){} }
  var pdfDoc=null, scale=1.0, pageTexts=[];
  var lib = window['pdfjsLib'] || window['pdfjs-dist/build/pdf'];
  if(!lib){ document.getElementById('status').innerText='PDF engine failed to load.'; post({type:'error',message:'lib'}); }
  else {
    lib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
    var url = window.__PDF_URL__;
    var b64 = window.__PDF_BASE64__;
    function base64ToBytes(value){
      var raw = atob(value);
      var bytes = new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
      return bytes;
    }
    var loading = b64 ? lib.getDocument({ data: base64ToBytes(b64) }) : lib.getDocument({ url: url });
    loading.promise.then(function(doc){
      pdfDoc = doc;
      document.getElementById('status').style.display='none';
      post({type:'loaded', pages: doc.numPages});
      renderAll();
      extractAll();
    }).catch(function(err){
      document.getElementById('status').innerText='Could not open PDF: '+err.message;
      post({type:'error', message: String(err && err.message)});
    });
  }
  function renderAll(){
    var container=document.getElementById('container');
    container.innerHTML='';
    var dpr=Math.min(window.devicePixelRatio||1, 2);
    for(var i=1;i<=pdfDoc.numPages;i++){ renderPage(i, dpr); }
  }
  function renderPage(num, dpr){
    pdfDoc.getPage(num).then(function(page){
      var viewport=page.getViewport({scale: scale*dpr});
      var wrap=document.createElement('div'); wrap.className='pageWrap'; wrap.id='page-'+num;
      var canvas=document.createElement('canvas');
      canvas.width=viewport.width; canvas.height=viewport.height;
      canvas.style.width=(viewport.width/dpr)+'px';
      wrap.appendChild(canvas);
      document.getElementById('container').appendChild(wrap);
      page.render({canvasContext:canvas.getContext('2d'), viewport:viewport});
    });
  }
  function extractAll(){
    pageTexts=[];
    var chain=Promise.resolve();
    for(var i=1;i<=pdfDoc.numPages;i++){
      (function(n){
        chain=chain.then(function(){
          return pdfDoc.getPage(n).then(function(p){ return p.getTextContent(); }).then(function(tc){
            pageTexts[n-1]=tc.items.map(function(it){return it.str;}).join(' ');
          });
        });
      })(i);
    }
    chain.then(function(){ post({type:'text', text: pageTexts.join('\\n\\n'), pages: pageTexts}); });
  }
  document.addEventListener('message', handle);
  window.addEventListener('message', handle);
  function handle(e){
    var msg; try{ msg=JSON.parse(e.data);}catch(err){return;}
    if(msg.type==='zoom'){ scale=msg.scale; if(pdfDoc) renderAll(); }
    if(msg.type==='goto'){ var el=document.getElementById('page-'+msg.page); if(el) el.scrollIntoView(); }
  }
</script>
</body>
</html>`;

async function exists(uri: string) {
  const i = await FileSystem.getInfoAsync(uri);
  return i.exists && (i as any).size > 0;
}

async function copyBundledAsset(moduleId: number, destination: string) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const source = asset.localUri || asset.uri;
  if (!source) throw new Error("Bundled PDF engine asset is unavailable");
  await FileSystem.copyAsync({ from: source, to: destination });
}

// The PDF engine is bundled with the app. No network request is made.
export async function ensurePdfJs(): Promise<{ ready: boolean; error?: string }> {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    if (!(await exists(LIB))) await copyBundledAsset(PDF_JS_BUNDLE, LIB);
    if (!(await exists(WORKER))) await copyBundledAsset(PDF_WORKER_BUNDLE, WORKER);
    await FileSystem.writeAsStringAsync(VIEWER, VIEWER_HTML);
    const ok = (await exists(LIB)) && (await exists(WORKER));
    return ok ? { ready: true } : { ready: false, error: "bundled-engine-unavailable" };
  } catch (e: any) {
    return { ready: false, error: e?.message || "bundled-engine-error" };
  }
}

export function viewerUri() {
  return VIEWER;
}
