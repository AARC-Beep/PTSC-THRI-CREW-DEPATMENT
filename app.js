// ------------------------- Constants -------------------------
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxCT2lVKm184HanG81VCqiScaK_-zgHd7zNhd1iIsNLX_L76VI4G5mWSsyxBU9OiztF/exec"; // replace with your Apps Script URL

// ------------------------- Helpers -------------------------
function qs(selector) {
  return document.querySelector(selector);
}

// Generic fetch for GET (load table, dashboard)
async function apiFetch(url) {
  console.log("DEBUG → apiFetch URL:", url);
  const res = await fetch(url);
  const json = await res.json();
  if(json.status !== "success") throw new Error(json.message || "API fetch failed");
  return json.data;
}

// Generic POST helper for adding/updating/deleting
async function addRowData(sheet, data) {
  const res = await fetch(`${SCRIPT_URL}?sheet=${sheet}&action=add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const json = await res.json();
  if(json.status !== "success") throw new Error(json.message || "Add failed");
  return json.data;
}

// ------------------------- Handle Add -------------------------
async function handleAddVesselJoin(){
  const fields = {
    Vessel: qs("vj-vessel")?.value || "",
    Principal: qs("vj-principal")?.value || "",
    Port: qs("vj-port")?.value || "",
    "No. of Crew": qs("vj-crew")?.value || "",
    Rank: qs("vj-rank")?.value || "",
    Date: qs("vj-date")?.value || "",
    Flight: qs("vj-flight")?.value || ""
  };
  try{
    await addRowData("Vessel_Join", fields);
    alert("Added Vessel Joining");
    toggleForm('join');
    await loadTable("Vessel_Join","crew-join-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

async function handleAddArrivals(){
  const fields = {
    Vessel: qs("av-vessel")?.value || "",
    Principal: qs("av-principal")?.value || "",
    Port: qs("av-port")?.value || "",
    "No. of Crew": qs("av-crew")?.value || "",
    Rank: qs("av-rank")?.value || "",
    Date: qs("av-date")?.value || "",
    Flight: qs("av-flight")?.value || ""
  };
  try{
    await addRowData("Arrivals", fields);
    alert("Added Arrival");
    toggleForm('arrivals');
    await loadTable("Arrivals","crew-arrivals-data", ["Timestamp","Vessel","Principal","Port","No. of Crew","Rank","Date","Flight","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

async function handleAddUpdate(){
  const fields = {
    Title: qs("up-title")?.value || "",
    Details: qs("up-details")?.value || "",
    Date: qs("up-date")?.value || ""
  };
  try{
    await addRowData("Updates", fields);
    alert("Added Update");
    toggleForm('updates');
    await loadTable("Updates","daily-updates-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

async function handleAddMemo(){
  const fields = {
    Title: qs("memo-title")?.value || "",
    Details: qs("memo-details")?.value || "",
    Date: qs("memo-date")?.value || ""
  };
  try{
    await addRowData("Memo", fields);
    alert("Added Memo");
    toggleForm('memo');
    await loadTable("Memo","memo-data", ["Timestamp","Title","Details","Date","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

async function handleAddTraining(){
  const fields = {
    Subject: qs("tr-subject")?.value || "",
    Details: qs("tr-details")?.value || "",
    Date: qs("tr-date")?.value || ""
  };
  try{
    await addRowData("Training", fields);
    alert("Training added");
    toggleForm('training');
    await loadTable("Training","training-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

async function handleAddPni(){
  const fields = {
    Subject: qs("pn-subject")?.value || "",
    Details: qs("pn-details")?.value || "",
    Date: qs("pn-date")?.value || ""
  };
  try{
    await addRowData("Pni", fields);
    alert("P&I Event added");
    toggleForm('pni');
    await loadTable("Pni","pni-data", ["Timestamp","Subject","Details","Date","UID"]);
    await loadDashboard();
  } catch(e){
    alert("Add failed: "+e.message);
    console.error(e);
  }
}

// ------------------------- Load Table Example -------------------------
async function loadTable(sheet, containerId, columns){
  const data = await apiFetch(`${SCRIPT_URL}?sheet=${sheet}&action=get`);
  const container = qs(`#${containerId}`);
  if(!container) return;

  let html = "<table class='table table-sm table-bordered'><thead><tr>";
  columns.forEach(c=> html += `<th>${c}</th>`);
  html += "</tr></thead><tbody>";

  data.forEach(row=>{
    html += "<tr>";
    columns.forEach(c=>{
      let val = row[c] ?? "";
      if(val instanceof Object && val.hasOwnProperty("toISOString")) val = new Date(val).toLocaleString();
      html += `<td>${val}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ------------------------- Dashboard Loader -------------------------
async function loadDashboard(){
  // Example: You can load counts for each section
  // Similar to loadTable but with summary info
  console.log("Dashboard loaded");
}

// ------------------------- Toggle Forms -------------------------
function toggleForm(formId){
  const form = qs(`${formId}-form`);
  if(form) form.style.display = form.style.display === "none" ? "block" : "none";
}
