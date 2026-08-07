const $ = s => document.querySelector(s);
const screens = [...document.querySelectorAll(".screen")];
let currentScreen = 0;
let data = {};

function applyBranding(){
  const cfg = window.PAINEL_CONFIG || {};
  const root = document.documentElement;

  if(cfg.colors){
    if(cfg.colors.red) root.style.setProperty("--red", cfg.colors.red);
    if(cfg.colors.redDark) root.style.setProperty("--red2", cfg.colors.redDark);
    if(cfg.colors.gold) root.style.setProperty("--gold", cfg.colors.gold);
    if(cfg.colors.green) root.style.setProperty("--green", cfg.colors.green);
    if(cfg.colors.yellow) root.style.setProperty("--yellow", cfg.colors.yellow);
    if(cfg.colors.blue) root.style.setProperty("--blue", cfg.colors.blue);
  }

  const sidebar = document.querySelector(".sidebar");
  if(sidebar && cfg.sidebarImage){
    sidebar.style.backgroundImage = `linear-gradient(rgba(0,0,0,.10), rgba(0,0,0,.10)), url("${cfg.sidebarImage}")`;
    sidebar.style.backgroundSize = "cover";
    sidebar.style.backgroundPosition = "center";
    sidebar.style.backgroundRepeat = "no-repeat";
  }
}


function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function parseCSV(text){
  const rows = [];
  let row = [], cell = "", quoted = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i], next = text[i+1];
    if(ch === '"' && quoted && next === '"'){ cell += '"'; i++; continue; }
    if(ch === '"'){ quoted = !quoted; continue; }
    if(ch === ',' && !quoted){ row.push(cell); cell = ""; continue; }
    if((ch === "\n" || ch === "\r") && !quoted){
      if(ch === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if(row.some(v => v !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if(cell !== "" || row.length){ row.push(cell); rows.push(row); }
  if(!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(v => v !== "")).map(r => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = r[i] ?? "");
    return obj;
  });
}

async function loadSheet(tab){
  const id = PAINEL_CONFIG.googleSheetId;
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`Falha ao carregar ${tab}`);
  return parseCSV(await r.text());
}

function showError(msg){
  let el = document.querySelector(".error-banner");
  if(!el){
    el = document.createElement("div");
    el.className = "error-banner";
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

function clearError(){
  const el = document.querySelector(".error-banner");
  if(el) el.remove();
}

async function loadData(){
  try{
    const entries = await Promise.all(
      PAINEL_CONFIG.sheets.map(async tab => [tab, await loadSheet(tab)])
    );
    data = Object.fromEntries(entries);
    render();
    $("#lastUpdate").textContent = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    clearError();
  }catch(err){
    console.error(err);
    try{
      const r = await fetch("dados-fallback.json",{cache:"no-store"});
      data = await r.json();
      render();
      $("#lastUpdate").textContent = "DEMO";
      showError("Google Sheets ainda não acessível. Exibindo dados de contingência até o compartilhamento ser liberado.");
    }catch(e){
      $("#lastUpdate").textContent = "ERRO";
      showError("Não foi possível ler o Google Sheets.");
    }
  }
}

function summary(name){
  const row = (data.Resumo || []).find(r => String(r.Indicador || "").trim().toLowerCase() === name.toLowerCase());
  return row ? row.Valor : "—";
}

function statusClass(s){
  s = String(s || "").toLowerCase();
  if(s.includes("combate") || s.includes("atuação")) return "combate";
  if(s.includes("monitor")) return "monitoramento";
  if(s.includes("pronto")) return "pronto";
  return "sem";
}

function vehicleClass(s){
  s = String(s || "").toLowerCase();
  if(s.includes("baix") || s.includes("manut")) return "down";
  if(s.includes("desloc")) return "move";
  if(s.includes("base")) return "base";
  return "op";
}

function render(){
  const occ = data.Ocorrencias || [];
  const vehicles = data.Viaturas || [];
  const drivers = data.Condutores || [];
  const munis = (data.Municipios || []).filter(m => String(m["Pode atuar?"] || "").toLowerCase() !== "não");

  $("#effectiveGrid").innerHTML = [
    ["EFETIVO NO COMBATE", summary("Efetivo no combate"), "MILITARES"],
    ["GCIFS", summary("GCIFs"), "GRUPOS"],
    ["EFETIVO NA BASE", summary("Efetivo na base"), "MILITARES"]
  ].map(x => `<div class="metric"><small>${x[0]}</small><b>${esc(x[1])}</b><em>${x[2]}</em></div>`).join("");

  $("#atuacaoCards").innerHTML = [
    ["🔥","COMBATE",summary("Combate"),"OCORRÊNCIAS"],
    ["◉","MONITORAMENTO",summary("Monitoramento"),"OCORRÊNCIAS"],
    ["◇","PREVENÇÃO",summary("Prevenção"),"AÇÕES"]
  ].map(x => `<div class="act"><small>${x[1]}</small><span>${x[0]}</span><b>${esc(x[2])}</b><em>${x[3]}</em></div>`).join("");

  $("#fleetKpis").innerHTML = [
    ["VIATURAS NO TERRENO",summary("Viaturas no terreno")],
    ["VIATURAS BAIXADAS",summary("Viaturas baixadas")],
    ["VIATURAS NA BASE",summary("Viaturas na base")]
  ].map(x => `<div class="fleet-kpi"><small>${x[0]}</small><b>${esc(x[1])}</b></div>`).join("");

  const counts = {};
  occ.forEach(o => counts[o.Situação] = (counts[o.Situação] || 0) + 1);
  const total = Math.max(1, occ.length);
  const em = counts["Em atuação"] || 0;
  const fi = counts["Finalizada"] || 0;
  const mo = counts["Monitoramento"] || 0;
  const p1 = em / total * 100;
  const p2 = fi / total * 100;

  $("#occSummary").innerHTML = `
    <div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(#d12b30 0 ${p1}%,#f5b51b ${p1}% ${p1+p2}%,#55c86a ${p1+p2}% 100%)">
        <div class="donut-center"><b>${occ.length}</b><small>TOTAL</small></div>
      </div>
      <div class="legend">
        <div class="legend-row"><span class="legend-dot red"></span><div>EM ATUAÇÃO<b>${em}</b></div></div>
        <div class="legend-row"><span class="legend-dot yellow"></span><div>FINALIZADA<b>${fi}</b></div></div>
        <div class="legend-row"><span class="legend-dot green"></span><div>MONITORAMENTO<b>${mo}</b></div></div>
      </div>
    </div>`;

  const byCity = {};
  occ.forEach(o => {
    const city = o["Município/Local"] || "Outros";
    byCity[city] = (byCity[city] || 0) + 1;
  });
  const arr = Object.entries(byCity).sort((a,b) => b[1]-a[1]).slice(0,6);
  const max = Math.max(1,...arr.map(x=>x[1]));
  $("#occBars").innerHTML = arr.map(([name,v]) => `
    <div class="bar-row">
      <span>${esc(name)}</span>
      <div class="bar"><i style="width:${v/max*100}%"></i></div>
      <b>${v}</b>
    </div>`).join("");

  $("#avisos").innerHTML = (data.Avisos || [])
    .filter(a => String(a.Ativo || "").toLowerCase() === "sim")
    .map(a => `<div class="notice"><b>${esc(a.Título)}:</b> ${esc(a.Mensagem)}</div>`).join("");

  $("#municipiosMap").innerHTML = munis.map(m => `
    <div class="city ${statusClass(m["Situação atual"])}">
      <b>${esc(m["Município/Área"])}</b>
      <small>${esc(m["Situação atual"])}${m.Viatura ? " • "+esc(m.Viatura) : ""}</small>
    </div>`).join("");

  $("#municipiosTable").innerHTML = munis.map(m => `
    <tr>
      <td>${esc(m["Município/Área"])}</td>
      <td class="status ${statusClass(m["Situação atual"])}">${esc(m["Situação atual"])}</td>
      <td>${esc(m.Viatura || "—")}</td>
    </tr>`).join("");

  const areaCounts = {combate:0,monitoramento:0,pronto:0,sem:0};
  munis.forEach(m => areaCounts[statusClass(m["Situação atual"])]++);
  $("#areaKpis").innerHTML = [
    ["COMBATE",areaCounts.combate],
    ["MONITORAMENTO",areaCounts.monitoramento],
    ["PRONTO EMPREGO",areaCounts.pronto],
    ["TOTAL DE ÁREAS",munis.length]
  ].map(x => `<div class="area-kpi"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");

  const groups = {};
  vehicles.forEach(v => (groups[v.Local || "Sem local"] ??= []).push(v));
  $("#fleetColumns").innerHTML = Object.entries(groups).map(([loc,vs]) => `
    <div class="fleet-col">
      <h3>${esc(loc).toUpperCase()} (${vs.length})</h3>
      ${vs.map(v => `
        <div class="vehicle-card ${vehicleClass(v.Status)}">
          <b>${esc(v.Viatura)}</b>
          <small>${esc(v.Status)}${v.Condutor ? " • "+esc(v.Condutor) : ""}</small>
          ${v.Observação ? `<small>${esc(v.Observação)}</small>` : ""}
        </div>`).join("")}
    </div>`).join("");

  $("#driversTable").innerHTML = drivers.map(d => `
    <tr>
      <td><b>${esc(d.Condutor)}</b></td>
      <td>${esc(d.Viatura)}</td>
      <td>${esc(d.Local)}</td>
      <td>${esc(d.Observação || "")}</td>
    </tr>`).join("");

  $("#occTable").innerHTML = occ.map(o => `
    <tr>
      <td>${esc(o["Município/Local"])}</td>
      <td class="status ${statusClass(o.Situação)}">${esc(o.Situação)}</td>
      <td>${esc(o.Tipo)}</td>
      <td>${esc(o.Viatura || "—")}</td>
      <td>${esc(o.Condutor || "—")}</td>
    </tr>`).join("");

  $("#occKpis").innerHTML = [
    ["TOTAL",occ.length],
    ["EM ATUAÇÃO",em],
    ["FINALIZADAS",fi],
    ["MONITORAMENTO",mo]
  ].map(x => `<div class="big-kpi"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");
}

function rotateScreen(){
  screens[currentScreen].classList.remove("active");
  currentScreen = (currentScreen + 1) % screens.length;
  screens[currentScreen].classList.add("active");
  $("#pager").textContent = `TELA ${currentScreen + 1} / ${screens.length}`;
}

function updateClock(){
  $("#clock").textContent = new Date().toLocaleTimeString("pt-BR");
}

setInterval(updateClock,1000);
setInterval(rotateScreen,PAINEL_CONFIG.rotateMs);
setInterval(loadData,PAINEL_CONFIG.refreshMs);
applyBranding();
updateClock();
loadData();
