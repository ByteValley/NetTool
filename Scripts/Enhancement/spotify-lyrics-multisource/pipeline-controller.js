function copyResponse(r) {
 const c={...r,headers:{...(r.headers||{})}};
 if(r.body instanceof Uint8Array)c.body=r.body.slice();
 else if(r.body instanceof ArrayBuffer)c.body=r.body.slice(0);
 return c;
}
function stageRequest(req,type) {
 let url=req.url.replace(/([?&])subtype=[^&#]*/g,'$1').replace(/\?&/g,'?').replace(/&&/g,'&').replace(/[?&]$/,'');
 return {...req,headers:{...(req.headers||{})},url:url+(url.includes('?')?'&':'?')+'subtype='+type};
}
function invoke(fn,request,response) {
 return new Promise((resolve,reject)=>{let finished=false;try {
   fn(request,copyResponse(response),value=>{if(!finished){finished=true;resolve(value||response);}});
 }catch(e){if(!finished){finished=true;reject(e);}}});
}
async function runPipeline(request,response,external=externalStage,translate=translationStage,log=console.log) {
 const code=Number(response.status??response.statusCode??200);
 if(![200,404].includes(code)){log('[MultiPipeline] 保留 HTTP '+code);return response;}
 log('[MultiPipeline] v2 开始：多源替换 → DualSubs 翻译');
 let chosen=response;
 try {chosen=await invoke(external,stageRequest(request,'External'),response);}
 catch(e){log('[MultiPipeline] 多源异常，保留原词：'+e.message);}
 if(Number(chosen.status??chosen.statusCode??code)!==200){log('[MultiPipeline] 没有可翻译歌词，保留响应');return chosen;}
 const format=chosen.headers?.['Content-Type']||chosen.headers?.['content-type']||'';
 if(format.includes('json') || /[?&]format=json(?:&|$)/.test(request.url)) {
  try {const body=JSON.parse(chosen.body);
   if(!body.lyrics?.lines?.some(x=>typeof x.words==='string'&&x.words.trim())){log('[MultiPipeline] 歌词为空，跳过翻译');return chosen;}
  }catch(e){log('[MultiPipeline] 响应非有效歌词 JSON，跳过翻译');return chosen;}
 }
 log('[MultiPipeline] 多源阶段完成，开始 DualSubs 翻译');
 try {return await invoke(translate,stageRequest(request,'Translate'),chosen);}
 catch(e){log('[MultiPipeline] 翻译异常，保留已选歌词：'+e.message);return chosen;}
}
