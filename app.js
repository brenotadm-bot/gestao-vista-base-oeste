const $ = s => document.querySelector(s);
const screens = [...document.querySelectorAll(".screen")];
let currentScreen = 0;
let data = {};

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function normalizeKey(v){
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function parseCSV(text, tabName=""){
  const rows = [];
  let row = [], cell = "", quoted = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i], next = text[i+1];

    if(ch === '"' && quoted && next === '"'){
      cell += '"';
      i++;
      continue;
    }

    if(ch === '"'){
      quoted = !quoted;
      continue;
    }

    if(ch === ',' && !quoted){
      row.push(cell);
      cell = "";
      continue;
    }

    if((ch === "\n" || ch === "\r") && !quoted){
      if(ch === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if(row.some(v => String(v).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  if(cell !== "" || row.length){
    row.push(cell);
    if(row.some(v => String(v).trim() !== "")) rows.push(row);
  }

  if(!rows.length) return [];

  const expectedHeaders = {
    "Resumo": ["Indicador","Valor"],
    "Ocorrencias": ["Município/Local","Situação"],
    "Viaturas": ["Viatura","Local"],
    "Condutores": ["Condutor","Viatura"],
    "Municipios": ["Município/Área","Pode atuar?"],
    "Avisos": ["Ativo","Título"]
  };

  let headerIndex = 0;
  const expected = expectedHeaders[tabName] || [];

  if(expected.length){
    const found = rows.findIndex(r => {
      const normalized = r.map(v => normalizeKey(v));
      return expected.every(h => normalized.includes(normalizeKey(h)));
    });
    if(found >= 0) headerIndex = found;
  }

  const headers = rows[headerIndex].map(h => String(h).trim());

  return rows
    .slice(headerIndex + 1)
    .filter(r => r.some(v => String(v).trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h,i) => {
        if(h) obj[h] = r[i] ?? "";
      });
      return obj;
    });
}

async function loadSheet(tab){
  const id = PAINEL_CONFIG.googleSheetId;
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`Falha ao carregar ${tab}`);
  return parseCSV(await r.text(), tab);
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

function summary(name){
    const target = normalizeKey(name);

    const row = (data.Resumo || []).find(r =>
        normalizeKey(r.Indicador) === target
    );

    return row ? String(row.Valor ?? "").trim() || "—" : "—";
}
function statusClass(s){
  s = normalizeKey(s);
  if(s.includes("combate") || s.includes("atuacao")) return "combate";
  if(s.includes("monitor")) return "monitoramento";
  if(s.includes("pronto")) return "pronto";
  return "sem";
}

function vehicleClass(s){
  s = normalizeKey(s);
  if(s.includes("baix") || s.includes("manut")) return "down";
  if(s.includes("desloc")) return "move";
  if(s.includes("base")) return "base";
  return "op";
}

function applyBranding(){
  const img = PAINEL_CONFIG.branding?.sidebarImage;
  const sidebar = document.querySelector(".sidebar");
  if(sidebar && img){
    sidebar.style.backgroundImage = `linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.10)),url("${img}")`;
    sidebar.style.backgroundSize = "cover";
    sidebar.style.backgroundPosition = "center";
    sidebar.style.backgroundRepeat = "no-repeat";
  }
}

async function loadWeather(){
  if(!PAINEL_CONFIG.weather?.enabled) return;

  const {latitude,longitude,timezone} = PAINEL_CONFIG.weather;

  try{
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m` +
      `&daily=temperature_2m_max&forecast_days=1&timezone=${encodeURIComponent(timezone)}`;

    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error("Falha meteorologia");

    const w = await r.json();
    const tempNow = w.current?.temperature_2m;
    const humidity = w.current?.relative_humidity_2m;
    const wind = w.current?.wind_speed_10m;
    const maxTemp = w.daily?.temperature_2m_max?.[0];

    if($("#temp")) $("#temp").textContent =
      Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}°C` :
      Number.isFinite(tempNow) ? `${Math.round(tempNow)}°C` : "—";

    if($("#humidity")) $("#humidity").textContent =
      Number.isFinite(humidity) ? `${Math.round(humidity)}%` : "—";

    if($("#wind")) $("#wind").textContent =
      Number.isFinite(wind) ? `${Math.round(wind)}` : "—";

    // Classificação operacional simples; não é índice oficial de perigo.
    let risk = "BAIXO";
    if(Number.isFinite(humidity) && Number.isFinite(tempNow) && Number.isFinite(wind)){
      if(humidity <= 20 && tempNow >= 32 && wind >= 15) risk = "MUITO ALTO";
      else if(humidity <= 30 && tempNow >= 30) risk = "ALTO";
      else if(humidity <= 40 || tempNow >= 30) risk = "MODERADO";
    }
    if($("#risk")) $("#risk").textContent = risk;
  }catch(err){
    console.error("Meteorologia:",err);
  }
}

async function loadData(){
  try{
    const entries = await Promise.all(
      PAINEL_CONFIG.sheets.map(async tab => [tab, await loadSheet(tab)])
    );

    data = Object.fromEntries(entries);

    console.log("Resumo", data.Resumo);
    console.log("Primeiro resumo:", data.Resumo[0]);
    console.log("Chaves:", Object.keys(data.Resumo[0]));

    console.log("Ocorrencias", data.Ocorrencias);
    console.log("Viaturas", data.Viaturas);
    console.log("Condutores", data.Condutores);
    console.log("Municipios", data.Municipios);

    render();
await loadWeather();

    $("#lastUpdate").textContent =
      new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    clearError();

  }catch(err){
    console.error(err);

    try{
      const r = await fetch("dados-fallback.json",{cache:"no-store"});
      data = await r.json();
      render();
      await loadWeather();
      $("#lastUpdate").textContent = "DEMO";
      showError("Google Sheets indisponível. Exibindo dados de contingência.");
    }catch(e){
      $("#lastUpdate").textContent = "ERRO";
      showError("Não foi possível carregar os dados.");
    }
  }
}

function render(){
  const occ = data.Ocorrencias || [];
  const vehicles = data.Viaturas || [];
  const drivers = data.Condutores || [];
  const munis = (data.Municipios || []).filter(
    m => normalizeKey(m["Pode atuar?"]) !== "nao"
  );

  // EFETIVO
  $("#effectiveGrid").innerHTML = [
    ["EFETIVO NO COMBATE", summary("Efetivo no combate"), "MILITARES"],
    ["GCIFS", summary("GCIFs"), "GRUPOS"],
    ["EFETIVO NA BASE", summary("Efetivo na base"), "MILITARES"]
  ].map(x => `<div class="metric"><small>${x[0]}</small><b>${esc(x[1])}</b><em>${x[2]}</em></div>`).join("");

  // ATUAÇÃO
  $("#atuacaoCards").innerHTML = [
    ["🔥","COMBATE",summary("Combate"),"OCORRÊNCIAS"],
    ["◉","MONITORAMENTO",summary("Monitoramento"),"OCORRÊNCIAS"],
    ["◇","PREVENÇÃO",summary("Prevenção"),"AÇÕES"]
  ].map(x => `<div class="act"><small>${x[1]}</small><span>${x[0]}</span><b>${esc(x[2])}</b><em>${x[3]}</em></div>`).join("");

  // FROTA
  $("#fleetKpis").innerHTML = [
    ["VIATURAS NO TERRENO", summary("Viaturas no terreno")],
    ["VIATURAS BAIXADAS", summary("Viaturas baixadas")],
    ["VIATURAS NA BASE", summary("Viaturas na base")]
  ].map(x => `<div class="fleet-kpi"><small>${x[0]}</small><b>${esc(x[1])}</b></div>`).join("");

  // OCORRÊNCIAS
  const counts = {};
  occ.forEach(o => counts[o.Situação] = (counts[o.Situação] || 0) + 1);

  const total = Math.max(1,occ.length);
  const em = counts["Em atuação"] || 0;
  const fi = counts["Finalizada"] || 0;
  const mo = counts["Monitoramento"] || 0;

  const p1 = em/total*100;
  const p2 = fi/total*100;

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

  const arr = Object.entries(byCity).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = Math.max(1,...arr.map(x=>x[1]));

  $("#occBars").innerHTML = arr.map(([name,v]) => `
    <div class="bar-row">
      <span>${esc(name)}</span>
      <div class="bar"><i style="width:${v/max*100}%"></i></div>
      <b>${v}</b>
    </div>`).join("");

  // AVISOS
  $("#avisos").innerHTML = (data.Avisos || [])
    .filter(a => normalizeKey(a.Ativo) === "sim")
    .map(a => `<div class="notice"><b>${esc(a.Título)}:</b> ${esc(a.Mensagem)}</div>`)
    .join("");

  // MUNICÍPIOS
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

  // VIATURAS — quantidade totalmente dinâmica
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

  // CONDUTORES — adaptativo
  const driversBox = $("#driversAdaptive");
  if(driversBox){
    const countEl = $("#driversCount");
    if(countEl) countEl.textContent = `(${drivers.length})`;

    let cols = 1;
    if(drivers.length > 10) cols = 2;
    if(drivers.length > 20) cols = 3;

    driversBox.style.setProperty("--driver-cols",cols);
    driversBox.classList.toggle("compact",drivers.length > 10);
    driversBox.classList.toggle("ultra",drivers.length > 20);

    driversBox.innerHTML = drivers.map(d => `
      <div class="driver-card">
        <div class="driver-name">${esc(d.Condutor)}</div>
        <div class="driver-vehicle">${esc(d.Viatura)}</div>
        <div class="driver-local">${esc(d.Local)}</div>
        <div class="driver-note">${esc(d.Observação || "")}</div>
      </div>`).join("");
  }

  // OCORRÊNCIAS DETALHADAS
  $("#occTable").innerHTML = occ.map(o => `
    <tr>
      <td>${esc(o["Município/Local"])}</td>
      <td class="status ${statusClass(o.Situação)}">${esc(o.Situação)}</td>
      <td>${esc(o.Tipo)}</td>
      <td>${esc(o.Viatura || "—")}</td>
      <td>${esc(o.Condutor || "—")}</td>
    </tr>`).join("");

  const occTable = $("#occTable")?.closest("table");
  if(occTable){
    occTable.classList.toggle("compact-table",occ.length > 10);
    occTable.classList.toggle("ultra-table",occ.length > 16);
  }

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

applyBranding();
updateClock();
setInterval(updateClock,1000);
setInterval(rotateScreen,PAINEL_CONFIG.rotateMs);
setInterval(loadData,PAINEL_CONFIG.refreshMs);
loadData();
