/* Egern native response script for Spotify track metadata.
 * Set the protobuf has_lyrics field without going through the legacy
 * $done/bodyBytes bridge. Spotify then requests color-lyrics normally.
 */
function headerEntries(headers){
 if(!headers)return [];
 if(typeof headers.entries==='function')return Array.from(headers.entries());
 if(typeof headers.forEach==='function'){const out=[];headers.forEach((value,name)=>out.push([name,value]));return out}
 return Object.entries(headers);
}
function copyHeaders(headers){const out={};for(const [name,value] of headerEntries(headers))out[name]=value;return out}
function bodyBytes(value){
 if(value instanceof Uint8Array)return value;
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 return new Uint8Array(value||[]);
}
function hasLyrics(bytes){
 let p=0;
 const varint=()=>{let value=0,multiplier=1;for(let i=0;i<10;i++){if(p>=bytes.length)throw Error('截断的 Protobuf');const byte=bytes[p++];value+=(byte&127)*multiplier;if(!(byte&128))return value;multiplier*=128}throw Error('非法 varint')};
 while(p<bytes.length){
  const tag=varint(),field=Math.floor(tag/8),wire=tag%8;if(!field)throw Error('非法字段');
  let value;
  if(wire===0)value=varint();
  else if(wire===1){p+=8;if(p>bytes.length)throw Error('截断字段')}
  else if(wire===2){const size=varint();if(!Number.isSafeInteger(size)||size<0||p+size>bytes.length)throw Error('非法字段长度');p+=size}
  else if(wire===5){p+=4;if(p>bytes.length)throw Error('截断字段')}
  else throw Error('不支持的 wire type');
  if(field===18&&wire===0&&Number(value)===1)return true;
 }
 return false;
}
function rewriteHeaders(headers){
 const out=copyHeaders(headers);
 for(const key of Object.keys(out))if(['content-length','content-encoding','content-md5','etag','cache-control','expires','pragma','transfer-encoding','trailer'].includes(key.toLowerCase()))delete out[key];
 return out;
}
function trackToken(url){return String(url||'').match(/\/metadata\/\d+\/track\/([a-f\d]{32}|[A-Za-z\d]{22})(?:[/?]|$)/i)?.[1]||'unknown'}

export default async function(ctx){
 const request=ctx.request||{},response=ctx.response||{};
 if(!/\/metadata\/\d+\/track\//.test(String(request.url||'')))return;
 if(String(request.method||'GET').toUpperCase()!=='GET')return;
 try{
  const original=bodyBytes(await response.arrayBuffer());
  if(!original.length||hasLyrics(original))return;
  const body=new Uint8Array(original.length+3);body.set(original);body.set([0x90,0x01,0x01],original.length);
  console.log('[MultiLyrics] metadata native response track='+trackToken(request.url)+'，已设置 has_lyrics=true');
  return {status:200,headers:rewriteHeaders(response.headers),body};
 }catch(error){
  console.log('[MultiLyrics] metadata native response 改写失败：'+error.message);
 }
}
