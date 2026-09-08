const prospects = [
  {name:"ABC VinS", type:"Importer · Belgium", reason:"New French domains", score:94, intent:"97", action:"Contact now"},
  {name:"Vinicole Leloup", type:"Caviste + Importer · Belgium", reason:"Direct-import portfolio", score:89, intent:"72", action:"Contact now"},
  {name:"Cave 1929", type:"Premium Caviste · Brussels", reason:"French premium focus", score:88, intent:"61", action:"Contact now"},
  {name:"The Nectar", type:"Spirits wholesaler · Belgium", reason:"Premium spirits portfolio", score:81, intent:"67", action:"Qualify"},
  {name:"De Wijncentrale", type:"Wine merchant · Belgium", reason:"Recent supplier activity", score:79, intent:"58", action:"Qualify"}
];

const container = document.getElementById("prospects");
container.innerHTML = prospects.map((p,i)=>`
  <div class="prospect">
    <div><div class="company">${p.name}</div><div class="meta">${p.type} · ${p.reason}</div></div>
    <div class="score">${p.score}<small>OPPORTUNITY</small></div>
    <div class="hide-mobile"><span class="badge">${p.intent} intent</span></div>
    <button class="action hide-mobile" onclick="openProspect('${p.name}')">${p.action}</button>
  </div>`).join("");

function openProspect(name){
  alert(name + "\\n\\nNext build: full prospect dossier, evidence, decision maker and AI-generated approach.");
}

const modal = document.getElementById("modal");
document.getElementById("newSearch").onclick = ()=>modal.classList.remove("hidden");
document.getElementById("close").onclick = ()=>modal.classList.add("hidden");
document.getElementById("modalRun").onclick = ()=>{
  modal.classList.add("hidden");
  alert("Search queued. Next build will connect this interface to the research engine.");
};
document.getElementById("runSearch").onclick = ()=>{
  alert("Search queued. Next build will connect this interface to live prospect research.");
};
