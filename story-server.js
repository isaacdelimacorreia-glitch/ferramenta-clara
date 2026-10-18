/* StoryVista API proxy: Instagram public stories only.
 * Requires SAVEAPI_KEY from https://saveapi.org/en/docs/.
 * No Instagram credentials, cookies, user accounts, or private content.
 * All outgoing upstream URLs are hardcoded (no open proxy / SSRF).
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 10000);
const PROVIDER = "https://api.saveapi.org/v1/instagram";
const ALLOWED = new Set(["https://storyvista-r8ex.onrender.com", "http://localhost:8080"]);
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".xml":"application/xml; charset=utf-8", ".txt":"text/plain; charset=utf-8" };
const calls = new Map();
let windowStart = Date.now(), totalCalls = 0;
const MONTHLY_LIMIT = Math.min(Math.max(Number(process.env.MONTHLY_API_LIMIT || 80), 5), 200);
const MAX_REQUESTS_PER_IP_HOUR = 8;
const CACHE_TTL = 2 * 60 * 1000;
const cache = new Map();
const ROOT = path.join(__dirname,"story-site");
const send = (res,code,body,headers={})=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers});res.end(JSON.stringify(body))};
function cleanup(){const now=Date.now();for(const [k,v] of cache){if(now-v.at>CACHE_TTL)cache.delete(k)}for(const [k,v] of calls){if(now-v.from>3600000)calls.delete(k)}}
function cors(req,res){
 const origin=req.headers.origin;
 if(origin && ALLOWED.has(origin)){res.setHeader("access-control-allow-origin",origin);res.setHeader("vary","Origin");res.setHeader("access-control-allow-methods","GET, POST, OPTIONS");res.setHeader("access-control-allow-headers","Content-Type")}
 return !origin || ALLOWED.has(origin);
}
const safeURL=s=>{if(typeof s!=="string")return null;try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null}catch{return null}};
function validateUser(text){
 if(typeof text!=="string")return null;
 text=text.trim().replace(/^@/,"");
 if(text.startsWith("https://")||text.startsWith("http://")){
  let u;try{u=new URL(text)}catch{return null}
  if(!["instagram.com","www.instagram.com","m.instagram.com"].includes(u.hostname.toLowerCase()))return null;
  const segments=u.pathname.split("/").filter(Boolean);
  if(segments.length!==1)return null;text=segments[0];
 }
 return /^[a-zA-Z0-9._]{1,30}$/.test(text)?text.toLowerCase():null;
}
function mediaCandidate(obj){
 const medium = [obj.videoUrl,obj.video_url,obj.mediaUrl,obj.media_url,obj.imageUrl,obj.image_url,obj.display_url,obj.displayUrl,obj.url,obj.src,obj.thumbnailUrl,obj.thumbnail_url,obj.image?.url,obj.video?.url,obj.media?.url,obj.media?.src,obj.video_versions?.[0]?.url,obj.image_versions2?.candidates?.[0]?.url].find(v=>safeURL(v));
 const url=safeURL(medium);if(!url)return null;
 const video = obj.ext==="mp4" || obj.type==="video" || obj.mediaType===2 || obj.media_type===2 || /video|mp4/i.test(String(obj.mediaType||obj.media_type||obj.type||"")) || Boolean(obj.videoUrl||obj.video_url||obj.video_versions);
 return {url,type:video?"video":"image",poster:safeURL(obj.thumbnailUrl||obj.thumbnail_url||obj.preview_url||obj.image?.url)||null,caption:typeof obj.caption==="string"?obj.caption.slice(0,280):"",timestamp:typeof obj.takenAt==="string"?obj.takenAt:typeof obj.taken_at==="string"?obj.taken_at:null};
}
function normalize(obj,username,kind){
 const items = Array.isArray(obj)?obj:Array.isArray(obj.medias)?obj.medias:Array.isArray(obj.data)?obj.data:Array.isArray(obj.items)?obj.items:Array.isArray(obj.stories)?obj.stories:Array.isArray(obj.result)?obj.result:Array.isArray(obj.result?.stories)?obj.result.stories:Array.isArray(obj.data?.stories)?obj.data.stories:Array.isArray(obj.data?.items)?obj.data.items:[];
 const out = [];
 for (const it of items.slice(0,36)){if(!it||typeof it!=="object")continue;const m=mediaCandidate(it);if(m)out.push(m)}
 return {ok:true,username,kind,count:out.length,items:out,notice:out.length?"Conteúdo público encontrado pelo provedor externo. A disponibilidade pode mudar.":"Não foram retornadas mídias públicas para este perfil. O perfil pode estar sem stories ou com acesso limitado."};
}
async function proxy(req,res,body){
 const name=validateUser(body?.username),kind="stories";
 if(!name)return send(res,400,{ok:false,error:"Informe um @usuário público válido ou link de perfil do Instagram."});
 const token=(process.env.SAVEAPI_KEY||"").trim();
 if(!token)return send(res,503,{ok:false,code:"PROVIDER_UNCONFIGURED",error:"A consulta por @usuário ainda precisa da chave da API no servidor. O layout está pronto, mas o serviço de busca não foi ativado."});
 cleanup();
 const now=Date.now(),bucket=calls.get(req.socket.remoteAddress)||{from:now,count:0};
 if(now-bucket.from>=3600000){bucket.from=now;bucket.count=0}
 if(bucket.count>=MAX_REQUESTS_PER_IP_HOUR)return send(res,429,{ok:false,error:"Muitas pesquisas em pouco tempo. Tente novamente mais tarde."});
 if(now-windowStart>30*24*3600000){totalCalls=0;windowStart=now}
 if(totalCalls>=MONTHLY_LIMIT)return send(res,429,{ok:false,error:"Limite de consultas da integração atingido. Tente novamente no próximo ciclo."});
 const key=kind+":"+name;
 const cached=cache.get(key);
 if(cached&&now-cached.at<CACHE_TTL)return send(res,200,cached.data);
 calls.set(req.socket.remoteAddress,{from:bucket.from,count:bucket.count+1});totalCalls++;
 const controller=new AbortController(),id=setTimeout(()=>controller.abort(),18000);
 try{
  const storyUrl="https://www.instagram.com/stories/"+encodeURIComponent(name)+"/";
  const upstream=await fetch(PROVIDER+"?url="+encodeURIComponent(storyUrl),{method:"GET",headers:{"Authorization":"Bearer "+token,"accept":"application/json"},redirect:"error",signal:controller.signal});
  if(upstream.status===401||upstream.status===403)return send(res,502,{ok:false,error:"A chave da API não foi autorizada. Verifique sua conta no provedor."});
  if(upstream.status===402)return send(res,402,{ok:false,error:"A conta da SaveAPI ficou sem créditos ou atingiu o limite configurado."});
  if(upstream.status===429)return send(res,429,{ok:false,error:"O serviço externo atingiu o limite de consultas. Tente novamente mais tarde."});
  if(upstream.status===404)return send(res,200,{ok:true,username:name,kind,count:0,items:[],notice:"O perfil não possui stories públicos disponíveis ou o conteúdo está indisponível."});
  if(!upstream.ok){
   let errorCode="";try{const data=await upstream.json();errorCode=data?.error?.code||""}catch{}
   if(errorCode==="MEDIA_NOT_FOUND")return send(res,200,{ok:true,username:name,kind,count:0,items:[],notice:"Não foram encontrados stories públicos ativos para este perfil."});
   if(errorCode==="PRIVATE_CONTENT")return send(res,403,{ok:false,error:"Este perfil é privado ou o conteúdo não é público."});
   if(errorCode==="QUOTA_EXCEEDED")return send(res,429,{ok:false,error:"Os créditos gratuitos da API acabaram."});
   if(errorCode==="INVALID_API_KEY"||errorCode==="MISSING_API_KEY")return send(res,502,{ok:false,error:"A chave da SaveAPI foi rejeitada."});
   if(errorCode==="RATE_LIMITED")return send(res,429,{ok:false,error:"Limite de consultas do provedor. Tente depois."});
   return send(res,502,{ok:false,error:"O serviço de stories não respondeu corretamente ("+upstream.status+")."});
  }
  const contentType=upstream.headers.get("content-type")||"";
  if(!contentType.includes("json"))return send(res,502,{ok:false,error:"A API retornou um formato inesperado."});
  const length=Number(upstream.headers.get("content-length")||0);
  if(length>1000000)return send(res,502,{ok:false,error:"Resultado maior que o limite suportado."});
  const raw=await upstream.text();
  if(raw.length>1000000)return send(res,502,{ok:false,error:"Resposta muito grande."});
  const data=JSON.parse(raw);
  if(data.success===false||data.error){
   const errorCode=data.error?.code||"";
   if(errorCode==="MEDIA_NOT_FOUND")return send(res,200,{ok:true,username:name,kind,count:0,items:[],notice:"Não foram encontrados stories públicos ativos."});
   if(errorCode==="PRIVATE_CONTENT")return send(res,403,{ok:false,error:"Este perfil é privado ou o conteúdo não é público."});
   return send(res,502,{ok:false,error:"A SaveAPI não conseguiu consultar o perfil público."});
  }
  const clean=normalize(data,name,kind);
  cache.set(key,{at:now,data:clean});return send(res,200,clean);
 }catch(e){return send(res,504,{ok:false,error:e.name==="AbortError"?"Tempo de consulta excedido. Tente novamente.":"Erro de comunicação com o serviço externo."})}
 finally{clearTimeout(id)}
}
http.createServer((req,res)=>{
 if(!cors(req,res))return send(res,403,{ok:false,error:"Origem não autorizada."});
 if(req.method==="OPTIONS"){res.writeHead(204);return res.end()}
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/health")return send(res,200,{ok:true,providerConfigured:!!process.env.SAVEAPI_KEY,provider:"saveapi",site:"StoryVista"});
 if(url.pathname==="/api/stories"){
  if(req.method!=="POST")return send(res,405,{ok:false,error:"Use POST."});
  let buff="";req.on("data",chunk=>{buff+=chunk;if(buff.length>3072)req.destroy()});
  req.on("end",()=>{let body;try{body=JSON.parse(buff)}catch{return send(res,400,{ok:false,error:"JSON inválido."})}proxy(req,res,body)});
  return;
 }
 if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,{ok:false,error:"Método não permitido."});
 let decoded;try{decoded=decodeURIComponent(url.pathname)}catch{return send(res,400,{ok:false,error:"URL inválida."})}
 if(decoded.includes("\0")||decoded.includes("\\"))return send(res,400,{ok:false,error:"Caminho inválido."});
 let file=path.resolve(ROOT,"."+decoded);
 if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return send(res,403,{ok:false,error:"Caminho não permitido."});
 if(decoded.endsWith("/"))file=path.join(file,"index.html");
 try{
  const stat=fs.statSync(file);
  if(stat.isDirectory())file=path.join(file,"index.html");
  const ext=path.extname(file);res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","x-content-type-options":"nosniff","referrer-policy":"no-referrer","cache-control":"public, max-age=300"});
  if(req.method==="HEAD")return res.end();
  fs.createReadStream(file).pipe(res);
 }catch{send(res,404,{ok:false,error:"Página não encontrada."})}
}).listen(PORT,"0.0.0.0",()=>console.log("StoryVista API listening on "+PORT));
