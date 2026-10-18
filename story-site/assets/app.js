(()=>{"use strict";
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const dialog=q("#player"),stage=q("#player-content"),bars=q("#story-bars"),pos=q("#player-position"),label=q("#player-label"),fileInput=q("#file-input"),message=q("#message"),list=q("#media-list");
const MAX_ITEMS=24,MAX_SIZE=150*1024*1024;
let items=[],index=0,raf=0,started=0,lastElapsed=0,paused=false,ready=false;
const imageTypes=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const videoTypes=new Set(["video/mp4","video/webm","video/quicktime"]);
const say=(text,error=false)=>{message.textContent=text;message.classList.remove("hidden");message.classList.toggle("error",error)};
const clearMessage=()=>{message.textContent="";message.classList.add("hidden")};
const short=(s,n=45)=>s.length>n?s.slice(0,n-1)+"…":s;
function update(){
 q("#item-count").textContent=items.length?items.length+" de "+MAX_ITEMS+" mídias adicionadas":"Nenhuma mídia adicionada";
 q("#open-viewer").disabled=!items.length;
 q("#clear-items").disabled=!items.length;
 list.replaceChildren();
 items.forEach((item,i)=>{
  const chip=document.createElement("div");chip.className="media-chip";
  const glyph=document.createElement("b");glyph.textContent=item.type==="video"?"▶":"▣";
  const title=document.createElement("span");title.title=item.name;title.textContent=short(item.name,55);
  const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Remover "+item.name);
  remove.addEventListener("click",()=>{if(dialog.open)closePlayer();dispose(item);items.splice(i,1);update()});
  chip.append(glyph,title,remove);list.append(chip);
 })
}
function dispose(item){if(item.local)URL.revokeObjectURL(item.src)}
function addFiles(files){
 clearMessage();let added=0,invalid=0,oversized=0;
 for(const file of files){
  if(items.length>=MAX_ITEMS){say("Limite de "+MAX_ITEMS+" mídias atingido.",true);break}
  let type=imageTypes.has(file.type)?"image":videoTypes.has(file.type)?"video":null;
  if(!type){invalid++;continue}
  if(file.size>MAX_SIZE){oversized++;continue}
  items.push({type,name:file.name,src:URL.createObjectURL(file),local:true});added++;
 }
 update();
 if(invalid||oversized)say((invalid?invalid+" arquivo(s) em formato não aceito. ":"")+(oversized?oversized+" arquivo(s) excederam 150 MB.":""),true);
 else if(added)say(added+" mídia(s) adicionada(s) sem envio para um servidor.");
}
const drop=q("#dropzone");
drop.addEventListener("click",e=>{if(e.target!==fileInput)fileInput.click()});
drop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click()}});
fileInput.addEventListener("change",()=>{addFiles(fileInput.files);fileInput.value=""});
for(const evt of ["dragenter","dragover"]){drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add("dragging")})}
for(const evt of ["dragleave","drop"]){drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove("dragging")})}
drop.addEventListener("drop",e=>{if(e.dataTransfer?.files)addFiles(e.dataTransfer.files)});
qa(".mode-tab").forEach(button=>button.addEventListener("click",()=>{
 qa(".mode-tab").forEach(b=>{const selected=b===button;b.classList.toggle("active",selected);b.setAttribute("aria-selected",String(selected))});
 qa(".panel").forEach(p=>p.classList.toggle("hidden",p.id!=="panel-"+button.dataset.tab));
 clearMessage();
}));
q("#add-url").addEventListener("click",()=>{
 clearMessage();if(items.length>=MAX_ITEMS){say("Limite de 24 mídias atingido.",true);return}
 let url;
 try{url=new URL(q("#media-url").value.trim())}catch{say("Informe um link HTTPS direto para imagem ou vídeo.",true);return}
 if(url.protocol!=="https:"||!url.hostname||url.username||url.password||url.href.length>3000){say("Utilize uma URL HTTPS válida, sem usuário ou senha.",true);return}
 const host=url.hostname.toLowerCase();
 if(host==="instagram.com"||host.endsWith(".instagram.com")||host==="facebook.com"||host.endsWith(".facebook.com")||host==="fb.watch"||host==="m.facebook.com"){say("Este é um link de página ou story da rede social, não o arquivo de mídia. Para assistir aqui é necessário um link HTTPS direto para uma imagem ou vídeo.",true);return}
 let type=q("#media-kind").value;
 if(type==="auto"){
   const path=url.pathname.toLowerCase();
   if(/\.(mp4|webm|mov|m4v)$/.test(path))type="video";
   else if(/\.(png|jpg|jpeg|gif|webp|avif)$/.test(path))type="image";
   else {say("Não foi possível identificar o tipo de arquivo. Escolha Imagem ou Vídeo no seletor.",true);return}
 }
 items.push({type,src:url.href,name:url.pathname.split("/").filter(Boolean).pop()||url.hostname,local:false});
 q("#media-url").value="";update();say("Link adicionado. A mídia só será acessada ao reproduzir; o servidor externo poderá registrar seu IP.");
});
q("#media-url").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();q("#add-url").click()}});
q("#clear-items").addEventListener("click",()=>{closePlayer();items.forEach(dispose);items=[];update();clearMessage()});
const stop=()=>{cancelAnimationFrame(raf);raf=0;if(stage.querySelector("video")){stage.querySelector("video").pause()}};
function closePlayer(){stop();if(dialog.open)dialog.close();stage.replaceChildren();bars.replaceChildren();}
q("#close-player").addEventListener("click",closePlayer);dialog.addEventListener("cancel",e=>{e.preventDefault();closePlayer()});
q("#open-viewer").addEventListener("click",()=>{
 if(!items.length)return;
 index=0;dialog.showModal();render()
});
function paint(ratio){const bar=bars.children[index]?.firstElementChild;if(bar)bar.style.width=Math.max(0,Math.min(1,ratio))*100+"%"}
function tick(t){
 if(!dialog.open)return;
 if(!started)started=t;
 const elapsed=lastElapsed+(t-started);
 paint(elapsed/6000);
 if(elapsed>=6000){next();return}
 raf=requestAnimationFrame(tick)
}
function finish(){next()}
function render(){
 stop();stage.replaceChildren();bars.replaceChildren();started=0;lastElapsed=0;ready=false;
 items.forEach((_,j)=>{const track=document.createElement("span"),fill=document.createElement("i");fill.style.width=j<index?"100%":"0%";track.append(fill);bars.append(track)});
 const item=items[index];if(!item){closePlayer();return}
 pos.textContent=(index+1)+" de "+items.length;label.textContent=short(item.name,37);
 let media;
 if(item.type==="image"){
  media=new Image();media.referrerPolicy="no-referrer";media.alt="Mídia "+(index+1)+": "+item.name;
  media.addEventListener("load",()=>{ready=true;raf=requestAnimationFrame(tick)},{once:true});
  media.addEventListener("error",()=>failed("Não foi possível abrir esta imagem. O servidor externo pode bloquear o acesso."),{once:true});
  stage.append(media);media.src=item.src;
 }else{
  media=document.createElement("video");media.controls=true;media.referrerPolicy="no-referrer";media.autoplay=true;media.playsInline=true;media.preload="metadata";
  media.setAttribute("aria-label","Vídeo: "+item.name);
  media.addEventListener("ended",finish);
  media.addEventListener("error",()=>failed("Não foi possível carregar este vídeo. Verifique o formato e as permissões do servidor."));
  media.addEventListener("loadedmetadata",()=>{ready=true});
  media.addEventListener("timeupdate",()=>{const seconds=Number.isFinite(media.duration)?media.duration:0;if(seconds>0)paint(media.currentTime/seconds)});
  stage.append(media);media.src=item.src;media.play().catch(()=>{say("Se o vídeo não iniciar automaticamente, toque no botão de reprodução.")});
 }
}
function failed(text){
 stop();stage.replaceChildren();
 const error=document.createElement("div");error.className="player-error";error.textContent=text+" Use a seta para tentar a próxima mídia.";stage.append(error)
}
function next(){if(!items.length)return;if(index+1>=items.length){closePlayer();say("Você chegou ao fim dos stories.");return}index++;render()}
function previous(){if(!items.length)return;if(index===0){render();return}index--;render()}
q("#player-next").addEventListener("click",next);q("#player-back").addEventListener("click",previous);
q("#next").addEventListener("click",next);q("#previous").addEventListener("click",previous);
document.addEventListener("keydown",e=>{
 if(!dialog.open)return;
 if(e.key==="ArrowRight"){e.preventDefault();next()}
 if(e.key==="ArrowLeft"){e.preventDefault();previous()}
});
document.addEventListener("visibilitychange",()=>{
 if(!dialog.open||items[index]?.type!=="image"||!ready)return;
 if(document.hidden){if(started)lastElapsed+=performance.now()-started;cancelAnimationFrame(raf);raf=0;started=0}
 else{started=0;raf=requestAnimationFrame(tick)}
});
window.addEventListener("pagehide",()=>items.forEach(dispose));

const instagramAPI="https://storyvista-api.onrender.com";
const searchForm=q("#ig-form"), searchInput=q("#ig-username"),searchButton=q("#ig-search"),searchStatus=q("#ig-status"),searchResults=q("#ig-results");
const profileName=value=>{
 let v=value.trim().replace(/^@/,"");
 if(/^https?:\/\//i.test(v)){
  try{const url=new URL(v);if(!["instagram.com","www.instagram.com","m.instagram.com"].includes(url.hostname.toLowerCase()))return null;const chunks=url.pathname.split("/").filter(Boolean);if(chunks.length!==1)return null;v=chunks[0]}catch{return null}
 }
 return /^[A-Za-z0-9._]{1,30}$/.test(v)?v.toLowerCase():null;
};
const searchNotice=(text,failed=false)=>{
 searchStatus.textContent=text;
 searchStatus.classList.toggle("warning",failed);
 searchStatus.classList.toggle("light",!failed);
};
async function checkProvider(){
 try{
  const response=await fetch(instagramAPI+"/health",{cache:"no-store",signal:AbortSignal.timeout(13000)});
  if(!response.ok)throw new Error("offline");
  const data=await response.json();
  if(data.providerConfigured) searchNotice("Busca conectada ao provedor. Consulte apenas perfis públicos do Instagram. Cada pesquisa pode consumir créditos da API.");
  else searchNotice("Busca por @usuário pronta para conectar. A API ainda não tem uma chave configurada; por enquanto, utilize Arquivos salvos ou URL de mídia.",true);
 }catch{searchNotice("O servidor de busca ainda não está disponível. Use Arquivos salvos ou URL de mídia e tente novamente depois.",true)}
}
searchForm?.addEventListener("submit",async e=>{
 e.preventDefault();const username=profileName(searchInput.value);
 searchResults.replaceChildren();
 if(!username){searchNotice("Informe um @usuário ou link de perfil válido do Instagram.",true);return}
 searchButton.disabled=true;searchButton.textContent="Consultando...";
 searchNotice("Buscando stories públicos disponíveis. Aguarde...");
 try{
  const r=await fetch(instagramAPI+"/api/stories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,kind:"stories"}),signal:AbortSignal.timeout(24000)});
  const result=await r.json().catch(()=>({error:"O serviço retornou uma resposta inesperada."}));
  if(!r.ok||!result.ok){searchNotice(result.error||"Não foi possível consultar o perfil. Tente novamente mais tarde.",true);return}
  const found=(Array.isArray(result.items)?result.items:[]).filter(it=>it&&typeof it.url==="string"&&it.url.startsWith("https://"));
  if(!found.length){searchNotice("Nenhum story público disponível foi retornado para @"+username+". Isso não significa necessariamente que a conta não tenha stories.");return}
  searchNotice(found.length+" mídia(s) pública(s) encontrada(s) para @"+username+". Toque para adicionar ao visualizador.");
  found.forEach((it,j)=>{
   const card=document.createElement("div");card.className="media-chip";
   const icon=document.createElement("b");icon.textContent=it.type==="video"?"▶":"▣";
   const lbl=document.createElement("span");lbl.textContent="Story "+(j+1);
   const add=document.createElement("button");add.type="button";add.textContent="+";add.setAttribute("aria-label","Adicionar story "+(j+1)+" ao visualizador");
   add.addEventListener("click",()=>{
    if(items.length>=MAX_ITEMS){say("Limite de 24 mídias atingido.",true);return}
    items.push({type:it.type==="video"?"video":"image",name:"@"+username+" · story "+(j+1),src:it.url,local:false});
    update();say("Story adicionado. Clique em Assistir stories para abrir.");
    add.disabled=true;add.textContent="✓";
   });
   card.append(icon,lbl,add);searchResults.append(card)
  });
  if(items.length+found.length<=MAX_ITEMS){
    const all=document.createElement("button");all.type="button";all.className="btn btn-primary";all.textContent="Adicionar todos os stories";
    all.addEventListener("click",()=>{let count=0;for(const [j,it] of found.entries()){if(items.length>=MAX_ITEMS)break;const name="@"+username+" · story "+(j+1);if(items.some(x=>x.name===name&&x.src===it.url))continue;items.push({type:it.type==="video"?"video":"image",name,src:it.url,local:false});count++}update();say(count+" stories adicionados.");all.disabled=true});
    searchResults.append(all)
  }
 }catch(err){searchNotice(err.name==="TimeoutError"?"Tempo de consulta excedido. Tente novamente.":"Falha na consulta. Verifique a conexão e tente novamente.",true)}
 finally{searchButton.disabled=false;searchButton.textContent="Buscar stories →"}
});
checkProvider();

update();
})();