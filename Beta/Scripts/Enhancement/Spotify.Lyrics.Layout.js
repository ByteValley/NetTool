/* Spotify lyrics layout compatibility for iPad/iPhone and Mac.
 * This is intentionally separate from the multi-source lyrics injector:
 * it only removes Spotify's full-screen lyrics action and leaves lyric text untouched.
 */
function header(headers,name){return Object.entries(headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||''}
function platformOf(request){return String(header(request?.headers,'app-platform')||'').trim()}
function isSupportedPlatform(platform){return /^(?:ios|iphone|ipad|osx|osx_arm64|mac|macos)$/i.test(platform)}
function bytesOf(body){
 if(body instanceof Uint8Array)return body;
 if(body instanceof ArrayBuffer)return new Uint8Array(body);
 if(ArrayBuffer.isView(body))return new Uint8Array(body.buffer,body.byteOffset,body.byteLength);
 if(Array.isArray(body))return Uint8Array.from(body);
 throw Error('缺少二进制响应体');
}
function textOf(body){if(typeof body==='string')return body;if(body instanceof Uint8Array)return new TextDecoder().decode(body);if(body instanceof ArrayBuffer)return new TextDecoder().decode(new Uint8Array(body));return String(body||'')}
function responseFormat(request,response){
 const query=String(request?.url||'').match(/[?&]format=([^&#]+)/i)?.[1]?.toLowerCase();
 if(query==='json')return 'json';
 if(query==='protobuf')return 'protobuf';
 const type=String(header(response?.headers,'content-type')||header(request?.headers,'accept')).toLowerCase();
 return type.includes('json')?'json':'protobuf';
}
function cleanHeaders(headers,format){
 const out={...(headers||{})};
 for(const key of Object.keys(out))if(['content-length','content-encoding','content-md5','etag','cache-control','expires','pragma','transfer-encoding','trailer'].includes(key.toLowerCase()))delete out[key];
 if(format==='json')out['Content-Type']='application/json; charset=utf-8';
 else out['Content-Type']=header(headers,'content-type')&&!/json/i.test(header(headers,'content-type'))?header(headers,'content-type'):'application/protobuf';
 return out;
}
function readVarint(bytes,state){
 let value=0,multiplier=1;
 for(let i=0;i<10;i++){
  if(state.pos>=bytes.length)throw Error('截断的 Protobuf');
  const byte=bytes[state.pos++];value+=(byte&127)*multiplier;
  if(!(byte&128))return value;
  multiplier*=128;
 }
 throw Error('非法 varint');
}
function parseFields(bytes){
 const state={pos:0},fields=[];
 while(state.pos<bytes.length){
  const start=state.pos,tag=readVarint(bytes,state),field=Math.floor(tag/8),wire=tag%8;
  if(!field)throw Error('非法字段');
  let value;
  if(wire===0)value=readVarint(bytes,state);
  else if(wire===1){if(state.pos+8>bytes.length)throw Error('截断字段');state.pos+=8}
  else if(wire===2){const size=readVarint(bytes,state);if(!Number.isSafeInteger(size)||state.pos+size>bytes.length)throw Error('非法字段长度');value=bytes.slice(state.pos,state.pos+size);state.pos+=size}
  else if(wire===5){if(state.pos+4>bytes.length)throw Error('截断字段');state.pos+=4}
  else throw Error('不支持的 wire type');
  fields.push({field,wire,value,raw:bytes.slice(start,state.pos)});
 }
 return fields;
}
function varint(value){const out=[];let n=Math.max(0,Number(value));do{const byte=n%128;n=Math.floor(n/128);out.push(byte+(n?128:0))}while(n);return out}
function fieldBytes(field,wire,value){
 if(wire===0)return [...varint(field*8),...varint(value)];
 if(wire===2)return [...varint(field*8+2),...varint(value.length),...value];
 throw Error('布局模块只改写 varint/bytes 字段');
}
function rewriteLyricsMessage(bytes){
 const fields=parseFields(bytes),out=[];let found=false;
 for(const item of fields){
  if(item.field===12&&item.wire===0){out.push(...fieldBytes(12,0,0));found=true}
  else out.push(...item.raw);
 }
 if(!found)out.push(...fieldBytes(12,0,0));
 return new Uint8Array(out);
}
function rewriteProtobuf(body){
 const bytes=bytesOf(body),fields=parseFields(bytes),out=[];let changed=false;
 for(const item of fields){
  if(item.field===1&&item.wire===2){
   const lyrics=rewriteLyricsMessage(item.value);
   if(lyrics.length!==item.value.length||lyrics.some((byte,index)=>byte!==item.value[index]))changed=true;
   out.push(...fieldBytes(1,2,lyrics));
  }else out.push(...item.raw);
 }
 return changed?new Uint8Array(out):null;
}
function rewriteResponse(request,response,log){
 const platform=platformOf(request),format=responseFormat(request,response);
 if(!isSupportedPlatform(platform)){log('非 iPad/Mac 平台，原样放行');return response}
 try{
  if(format==='json'){
   const original=JSON.parse(textOf(response.body));
   if(!original?.lyrics||typeof original.lyrics!=='object'){log('JSON 没有 lyrics，原样放行');return response}
   const lyrics={...original.lyrics,fullscreenAction:0};
   const body=JSON.stringify({...original,lyrics});
   log(platform+' JSON 已清除全屏歌词动作');
   return {...response,status:200,headers:cleanHeaders(response.headers,'json'),body};
  }
  const body=rewriteProtobuf(response.body);
  if(!body){log(platform+' Protobuf 已是普通布局');return response}
  log(platform+' Protobuf 已清除全屏歌词动作');
  return {...response,status:200,headers:cleanHeaders(response.headers,'protobuf'),body};
 }catch(error){log(platform+' 布局响应无法解析：'+error.message);return response}
}
if(typeof $request!=='undefined'&&typeof $response!=='undefined'){
 const log=message=>console.log('[SpotifyLyricsLayout] '+message);
 const result=rewriteResponse($request,$response,log);$done(result);
}
