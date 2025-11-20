/* ============================================================
   PTSC / THRI Crew Dashboard - JS (Auto-refresh + Highlights)
============================================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxoLIrNGnPkxfwoZhzNqnquDbDLoKnqmkSpU-ET6wlq1lA-pQemm88dqyNbsJnl7Lem/exec";

/* -------------------- Utilities -------------------- */
const qs = id => document.getElementById(id);
function debugLog(...args){ if(window.console) console.log(...args); }
function escapeHtml(unsafe){ if(!unsafe) return ""; return String(unsafe).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

/* -------------------- API -------------------- */
async function apiFetch(params){
  const urlParams = (params instanceof URLSearchParams) ? params : new URLSearchParams(params);
  const url = `${GAS_URL}?${urlParams.toString()}`;
  debugLog("API Fetch:", url);
  const res = await fetch(url);
  if(!res.ok) throw new Error("Network error: " + res.status);
  const j = await res.json();
  if(j.status && j.status !== "success") throw new Error(j.message || "API error");
  return j.data === undefined ? j : j.data;
}

/* -------------------- LOGIN -------------------- */
async function loginUser(){
  const u = qs("login-username")?.value?.trim()||"";
  const p = qs("login-password")?.value?.trim()||"";
  const err = qs("login-error"); if(err) err.innerText = "";
  if(!u||!p){ if(err) err.innerText="Enter username and password"; return; }

  try{
    const users = await apiFetch({sheet:"Users", action:"get"});
    const match = (users||[]).find(x=>String(x.Username||"").toLowerCase()===u.toLowerCase() && String(x.Password||"")===p);
    if(!match){ if(err) err.innerText="Invalid username or password"; return; }

    sessionStorage.setItem("loggedInUser", match.Username);
    sessionStorage.setItem("userRole", match.Role||"");
    qs("login-overlay").style.display="none";
    showTab("dashboard");
    await initReload();
  }catch(e){ if(err) err.innerText="Login failed: "+e.message; debugLog("loginUser error:",e);}
}

document.addEventListener("DOMContentLoaded",()=>{
  if(sessionStorage.getItem("loggedInUser")){
    qs("login-overlay").style.display="none";
    showTab("dashboard");
    initReload();
  } else qs("login-overlay").style.display="flex";
});

/* -------------------- TAB NAV -------------------- */
function showTab(id){
  document.querySelectorAll(".tab-window").forEach(t=>t.classList.remove("active"));
  const el = qs(id); if(el) el.classList.add("active");
}

document.querySelectorAll(".sidebar a[data-tab]").forEach(a=>{
  a.addEventListener("click",e=>{
    e.preventDefault();
    const t = a.getAttribute("data-tab");
    const r = sessionStorage.getItem("userRole");
    if((t==="training"||t==="pni") && r!=="admin"){ alert("Access denied (Admin only)"); return; }
    showTab(t);
  });
});

/* -------------------- DASHBOARD -------------------- */
async function loadDashboard(){
  const map = {
    "Vessel_Join":"dash-join",
    "Arrivals":"dash-arrivals",
    "Updates":"dash-updates",
    "Memo":"dash-memo",
    "Training":"dash-training",
    "Pni":"dash-pni"
  };

  for(const sheet in map){
    const container = qs(map[sheet]);
    if(!container) continue;
    container.innerHTML="Loading...";
    try{
      const data = await apiFetch({sheet, action:"get"}).catch(()=>[]);
      const rows = (data||[]).slice(-5).reverse();
      container.innerHTML="";
      rows.forEach(r=>{
        const d=document.createElement("div");
        d.className="card-body";
        const rawDate = r.Date || r.Timestamp || "";
        const dObj = new Date(rawDate);
        const dateField = isNaN(dObj)?(rawDate?String(rawDate):""):dObj.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
        const title = r.Vessel || r.Title || r.Subject || "";
        d.innerHTML=`<small>${escapeHtml(dateField)} • <b>${escapeHtml(title)}</b></small>`;
        container.appendChild(d);
      });
      if(!rows.length) container.innerHTML="<small>No recent items</small>";
    }catch(err){
      container.innerHTML="<small>Error loading</small>";
      console.error("Dashboard load error", sheet, err);
    }
  }

  const tsEl = qs("dashboard-timestamp");
  if(tsEl){ const now = new Date(); tsEl.textContent="Last updated: "+now.toLocaleTimeString(); }
}

/* -------------------- TABLES -------------------- */
async function loadAllData(){
  const sheets = [
    ["Vessel_Join","crew-join-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Arrivals","crew-arrivals-data", ["Vessel","Principal","Port","No. of Crew","Rank","Date","Flight"]],
    ["Updates","daily-updates-data", ["Title","Details","Date"]],
    ["Memo","memo-data", ["Title","Details","Date"]],
    ["Training","training-data", ["Subject","Details","Date"]],
    ["Pni","pni-data", ["Subject","Details","Date"]]
  ];
  await Promise.all(sheets.map(([sheet, containerId, columns])=>loadTable(sheet, containerId, columns)));
}

async function loadTable(sheetName, containerId, columns){
  const container = qs(containerId);
  container.innerHTML="";
  try{
    const data = await apiFetch({sheet:sheetName, action:"get"});
    if(!data || !Array.isArray(data)) return;

    const table = document.createElement("table");
    table.classList.add("table");

    // Header
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach(col=>{
      const th=document.createElement("th"); th.textContent=col; trHead.appendChild(th);
    });
    ["Edit","Archive"].forEach(txt=>{const th=document.createElement("th"); th.textContent=txt; trHead.appendChild(th);});
    thead.appendChild(trHead); table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    data.forEach(row=>{
      const tr=document.createElement("tr");
      columns.forEach(col=>{
        const td=document.createElement("td");
        const raw=row[col]||"";
        if(String(col).toLowerCase().includes("date") && raw){
          const dObj=new Date(raw); td.textContent=!isNaN(dObj)?dObj.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):raw;
        }else td.textContent=raw;
        tr.appendChild(td);
      });

      // Edit button
      const tdEdit=document.createElement("td");
      const btnEdit=document.createElement("button");
      btnEdit.textContent="Edit"; btnEdit.classList.add("btn","btn-sm","btn-primary");
      btnEdit.onclick=()=>openEditModal(sheetName,row["UID"]);
      tdEdit.appendChild(btnEdit); tr.appendChild(tdEdit);

      // Archive button
      const tdAction=document.createElement("td");
      const btn=document.createElement("button");
      btn.textContent="Archive"; btn.classList.add("btn","btn-sm","btn-warning");
      btn.onclick=()=>deleteRowConfirm(sheetName,row["UID"]);
      tdAction.appendChild(btn); tr.appendChild(tdAction);

      tbody.appendChild(tr);

      // Highlight new/updated row
      tr.classList.add("highlight");
      setTimeout(()=>tr.classList.remove("highlight"),2000);
    });

    table.appendChild(tbody); container.appendChild(table);
  }catch(err){ console.error("loadTable error:",err); container.innerHTML=`<p>Error loading ${sheetName}</p>`; }
}

/* -------------------- CHAT -------------------- */
async function loadChat(){
  const box = qs("chatboard"); if(!box) return; box.innerHTML="Loading...";
  try{
    const data = await apiFetch({sheet:"Chatboard", action:"get"}).catch(()=>[]);
    box.innerHTML="";
    data.slice().reverse().forEach(r=>{
      const d=document.createElement("div"); d.className="message";
      const ts = r.Timestamp || ""; const tObj=new Date(ts);
      const tsDisplay=isNaN(tObj)?ts:tObj.toLocaleString();
      d.innerHTML=`<small>[${escapeHtml(tsDisplay)}] <b>${escapeHtml(r.Name||"")}</b>: ${escapeHtml(r.Message||"")}</small>`;
      box.appendChild(d);
    });
    if(!data.length) box.innerHTML="<small>No chat messages</small>";

    // Auto-scroll
    box.scrollTop = box.scrollHeight;
  }catch(e){ box.innerHTML="<small>Error loading chat</small>"; console.error("loadChat error", e); }
}

async function sendMessage(){
  const input = qs("chat-input"); const msg=input?.value.trim(); if(!msg) return;
  try{
    await apiFetch({sheet:"Chatboard", action:"chat", Name:sessionStorage.getItem("loggedInUser")||"User", Message:msg});
    input.value=""; await loadChat();
  }catch(e){ alert("Failed to send chat: "+e.message); }
}

/* -------------------- INIT / AUTO-REFRESH -------------------- */
async function initReload(){
  await loadDashboard();
  await loadAllData();
  await loadChat();

  setInterval(async()=>{
    await loadDashboard();
    await loadAllData();
    await loadChat();
  },15000);
}
