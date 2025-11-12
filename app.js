/* app.js
   Front-end integration for PTSC/THRI dashboard
   Works with your provided Google Apps Script (doGet)
*/

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCT2lVKm184HanG81VCqiScaK_-zgHd7zNhd1iIsNLX_L76VI4G5mWSsyxBU9OiztF/exec'; // <-- replace this with your Apps Script web app URL

// mapping UI tab keys -> sheet names + display fields
const sheets = {
  'join':    { sheetName: 'Vessel_Join', fields: ['Vessel','Principal','Port','No. of Crew','Rank','Date','Flight'],
               containerId: 'crew-join-data', formId: 'join-form' },
  'arrivals':{ sheetName: 'Arrivals',    fields: ['Vessel','Principal','Port','No. of Crew','Rank','Date','Flight'],
               containerId: 'crew-arrivals-data', formId: 'arrival-form' },
  'updates': { sheetName: 'Updates',     fields: ['Title','Details','Date'],
               containerId: 'daily-updates-data', formId: 'update-form' },
  'memo':    { sheetName: 'Memo',        fields: ['Title','Details','Date'],
               containerId: 'memo-data', formId: 'memo-form' },
  'training':{ sheetName: 'Training',    fields: ['Title','Details','Date'],
               containerId: 'training-data', formId: 'training-form' },
  'pni':     { sheetName: 'Pni',         fields: ['Title','Details','Date'],
               containerId: 'pni-data', formId: 'pni-form' }
};

// --- helper: build query string from params object
function toQuery(params) {
  return Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
}

// toggle inline form (populate inputs dynamically)
function toggleForm(tabKey) {
  const cfg = sheets[tabKey];
  if (!cfg) return;
  const formDiv = document.getElementById(cfg.formId);
  if (!formDiv) return;
  formDiv.style.display = formDiv.style.display === 'none' ? 'block' : 'none';

  if (formDiv.innerHTML.trim() === '') {
    // hidden UID input for edit
    let html = `<input type="hidden" id="${tabKey}-uid" value="">`;
    cfg.fields.forEach((f,i) => {
      const isDate = f.toLowerCase() === 'date';
      const isDetails = f.toLowerCase().includes('details');
      if (isDetails) {
        html += `<textarea id="${tabKey}-field${i}" class="form-control mb-2" placeholder="${f}"></textarea>`;
      } else {
        html += `<input type="${isDate ? 'date' : 'text'}" id="${tabKey}-field${i}" class="form-control mb-2" placeholder="${f}">`;
      }
    });
    html += `<div class="mt-2">
               <button class="btn btn-success" onclick="saveEntry('${tabKey}')">Save</button>
               <button class="btn btn-secondary ms-2" onclick="clearForm('${tabKey}')">Clear</button>
             </div>`;
    formDiv.innerHTML = html;
  }
}

// clear form
function clearForm(tabKey) {
  const cfg = sheets[tabKey];
  if (!cfg) return;
  const uidEl = document.getElementById(`${tabKey}-uid`);
  if (uidEl) uidEl.value = '';
  cfg.fields.forEach((_,i) => {
    const el = document.getElementById(`${tabKey}-field${i}`);
    if (el) el.value = '';
  });
}

// fetch sheet rows via your doGet?action=get&sheet=...
async function fetchSheet(sheetName) {
  try {
    const url = `${SCRIPT_URL}?action=get&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j && j.status === 'success') return j.data || [];
    console.error('fetchSheet failed', j);
    return [];
  } catch (err) {
    console.error('fetchSheet error', err);
    return [];
  }
}

// fetch all configured sheets and populate UIs + dashboard cards
async function fetchAllAndPopulate() {
  for (const tabKey of Object.keys(sheets)) {
    const cfg = sheets[tabKey];
    const rows = await fetchSheet(cfg.sheetName);
    populateTabFromRows(tabKey, rows);
    populateDashboardCard(tabKey, rows);
  }
  // also load chatboard if exists
  loadChatboard();
}

// render rows into the tab's container
function populateTabFromRows(tabKey, rows) {
  const cfg = sheets[tabKey];
  if (!cfg) return;
  const container = document.getElementById(cfg.containerId);
  if (!container) return;
  container.innerHTML = '';

  rows.forEach(row => {
    const uid = row['UID'] || row['uid'] || '';
    const left = document.createElement('div');
    left.className = 'left';
    // join fields with " - " and avoid showing Timestamp/UID
    const rowText = cfg.fields.map(f => (row[f] === undefined ? '' : row[f])).join(' - ');
    left.innerHTML = `<span>${escapeHtml(rowText)}</span>`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const entry = document.createElement('div');
    entry.className = 'entry-row mb-2 p-2 border rounded d-flex justify-content-between align-items-center';
    entry.dataset.uid = uid;

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-primary';
    editBtn.innerText = 'Edit';
    editBtn.onclick = () => loadRowToForm(tabKey, row);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger ms-2';
    delBtn.innerText = 'Delete';
    delBtn.onclick = () => deleteEntry(uid, cfg.sheetName, entry);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    entry.appendChild(left);
    entry.appendChild(actions);

    container.appendChild(entry);
  });
}

// small helper to escape HTML
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// show top 3 items on dashboard card
function populateDashboardCard(tabKey, rows) {
  const idMap = {
    'join': 'dash-join',
    'arrivals': 'dash-arrivals',
    'updates': 'dash-updates',
    'memo': 'dash-memo',
    'training': 'dash-training',
    'pni': 'dash-pni'
  };
  const el = document.getElementById(idMap[tabKey]);
  if (!el) return;
  const rowsToShow = (rows || []).slice(0,3);
  el.innerHTML = rowsToShow.map(r => {
    const firstField = sheets[tabKey].fields[0];
    return `<div>${escapeHtml(r[firstField] || '')}</div>`;
  }).join('');
}

// load a row into inline form for editing
function loadRowToForm(tabKey, row) {
  toggleForm(tabKey); // ensure form exists and visible
  const cfg = sheets[tabKey];
  if (!cfg) return;
  const uidEl = document.getElementById(`${tabKey}-uid`);
  if (uidEl) uidEl.value = row['UID'] || row['uid'] || '';

  cfg.fields.forEach((f,i) => {
    const el = document.getElementById(`${tabKey}-field${i}`);
    if (el) el.value = row[f] || '';
  });

  // scroll to form
  const formDiv = document.getElementById(cfg.formId);
  if (formDiv) formDiv.scrollIntoView({behavior:'smooth'});
}

// Save entry: create or update (true update by UID)
async function saveEntry(tabKey) {
  const cfg = sheets[tabKey];
  if (!cfg) return;
  const data = {};
  for (let i=0;i<cfg.fields.length;i++){
    const val = (document.getElementById(`${tabKey}-field${i}`).value || '').trim();
    if (!val) { alert('Please fill all fields'); return; }
    data[cfg.fields[i]] = val;
  }

  const uidEl = document.getElementById(`${tabKey}-uid`);
  const uid = uidEl ? uidEl.value.trim() : '';

  if (uid) {
    // update: use doGet?action=update&sheet=...&UID=...&Field=...
    const params = { action: 'update', sheet: cfg.sheetName, UID: uid };
    // attach fields as query parameters
    Object.keys(data).forEach(k=>params[k]=data[k]);
    const url = SCRIPT_URL + '?' + toQuery(params);
    try {
      const res = await fetch(url);
      const j = await res.json();
      if (j && j.status === 'success') {
        await fetchSheetAndPopulate(cfg.sheetName);
        clearForm(tabKey);
        alert('Updated');
      } else {
        console.error('update failed', j);
        alert('Update failed — see console');
      }
    } catch (err) {
      console.error('update error', err);
      alert('Update error: ' + err.message);
    }
  } else {
    // create: doGet?action=add&sheet=...&Field=...
    const params = { action: 'add', sheet: cfg.sheetName };
    Object.keys(data).forEach(k=>params[k]=data[k]);
    const url = SCRIPT_URL + '?' + toQuery(params);
    try {
      const res = await fetch(url);
      const j = await res.json();
      if (j && j.status === 'success') {
        await fetchSheetAndPopulate(cfg.sheetName);
        clearForm(tabKey);
        alert('Added');
      } else {
        console.error('add failed', j);
        alert('Add failed — see console');
      }
    } catch (err) {
      console.error('add error', err);
      alert('Add error: ' + err.message);
    }
  }
}

// Refresh a single sheet UI after changes
async function fetchSheetAndPopulate(sheetName) {
  try {
    const rows = await fetchSheet(sheetName);
    const tabKey = Object.keys(sheets).find(k => sheets[k].sheetName === sheetName);
    if (tabKey) populateTabFromRows(tabKey, rows);
    // update dashboard card as well
    if (tabKey) populateDashboardCard(tabKey, rows);
  } catch (err) {
    console.error('fetchSheetAndPopulate error', err);
  }
}

// Delete entry (server will move to Archive because your script does that)
async function deleteEntry(uid, sheetName, domToRemove = null) {
  if (!confirm('Delete this entry? (it will be archived)')) return;
  const params = { action: 'delete', sheet: sheetName, UID: uid };
  try {
    const url = SCRIPT_URL + '?' + toQuery(params);
    const res = await fetch(url);
    const j = await res.json();
    if (j && j.status === 'success') {
      if (domToRemove && domToRemove.remove) domToRemove.remove();
      // refresh sheet UI
      await fetchSheetAndPopulate(sheetName);
    } else {
      console.error('delete failed', j);
      alert('Delete failed — see console');
    }
  } catch (err) {
    console.error('delete error', err);
    alert('Delete error: ' + err.message);
  }
}

/* ---------------------------
   PDF generation (jsPDF + autoTable)
   Per-tab and Monthly combined
----------------------------*/

// per-tab export
async function generatePDF(sheetName) {
  try {
    const rows = await fetchSheet(sheetName);
    if (!rows || !rows.length) { alert('No data'); return; }

    // find tabKey for fields mapping
    const tabKey = Object.keys(sheets).find(k => sheets[k].sheetName === sheetName);
    const displayFields = (tabKey ? sheets[tabKey].fields : Object.keys(rows[0]).filter(h=>h!=='UID' && h!=='Timestamp'));
    const head = [displayFields];

    const body = rows.map(r => displayFields.map(f => r[f] || ''));

    const doc = new jspdf.jsPDF('p','pt','a4');
    doc.setFontSize(12);
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    doc.text(`${sheetName} Report`, 40, 40);
    doc.autoTable({ startY:60, head: head, body: body, styles:{ fontSize:10 } });

    // filename example: Vessel_Join_Report_November_2025.pdf
    const filename = `${sheetName}_Report_${monthName}_${now.getFullYear()}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('generatePDF error', err);
    alert('Error generating PDF: ' + err.message);
  }
}

// prompt for month/year (simple UI)
function promptMonthYear() {
  let month = prompt('Enter month number (1-12)');
  if (!month) return null;
  month = parseInt(month, 10);
  if (isNaN(month) || month < 1 || month > 12) { alert('Invalid month'); return null; }
  let year = prompt('Enter year (e.g., 2025)');
  if (!year) return null;
  year = parseInt(year, 10);
  if (isNaN(year) || year < 2000) { alert('Invalid year'); return null; }
  return { month, year };
}

// Generate ONE combined PDF for all tabs for chosen month/year
async function generateMonthlyPDFCombined() {
  const pick = promptMonthYear();
  if (!pick) return;
  const { month, year } = pick;

  try {
    // collect data for each configured sheet + Archive
    const sections = [];
    for (const tabKey of Object.keys(sheets)) {
      const cfg = sheets[tabKey];
      const rows = await fetchSheet(cfg.sheetName);
      const filtered = filterRowsByMonth(rows, 'Date', month, year);
      if (filtered.length) sections.push({ title: cfg.sheetName, fields: cfg.fields, rows: filtered });
    }
    // include archived rows as well (Archive sheet)
    const archiveRows = await fetchSheet('Archive');
    const archivedFiltered = archiveRows.filter(r => {
      // try Date first then Timestamp
      const sDate = r['Date'] || r['Timestamp'] || '';
      if (!sDate) return false;
      const d = new Date(sDate);
      return d.getFullYear() === year && (d.getMonth()+1) === month;
    });
    if (archivedFiltered.length) sections.push({ title: 'Archive', fields: Object.keys(archivedFiltered[0]).filter(h=>h!=='UID' && h!=='Timestamp'), rows: archivedFiltered });

    if (!sections.length) { alert('No records for that month/year'); return; }

    // build PDF
    const doc = new jspdf.jsPDF('p','pt','a4');
    doc.setFontSize(12);
    const monthName = new Date(year, month-1).toLocaleString('default', { month: 'long' });
    doc.text(`Monthly Report — ${monthName} ${year}`, 40, 40);
    let y = 60;

    for (const sec of sections) {
      doc.setFontSize(11);
      doc.text(sec.title, 40, y);
      y += 16;
      // convert rows to body array
      const body = sec.rows.map(r => sec.fields.map(f => r[f] || ''));
      doc.autoTable({ startY: y, head: [sec.fields], body: body, styles:{fontSize:9} });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : y + 200;
      if (y > 720) { doc.addPage(); y = 40; } // start new page if necessary
    }

    const filename = `Monthly_Report_${monthName}_${year}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('generateMonthlyPDFCombined error', err);
    alert('Error generating monthly PDF: ' + err.message);
  }
}

// filter rows by Date field (parses date values)
function filterRowsByMonth(rows, dateFieldName, month, year) {
  return (rows || []).filter(r => {
    const dval = r[dateFieldName] || r['Timestamp'] || '';
    if (!dval) return false;
    const d = new Date(dval);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });
}

/* ---------------------------
   Chatboard helpers
----------------------------*/
async function sendChatMessage() {
  const txt = (document.getElementById('chat-input').value || '').trim();
  if (!txt) return;
  // your doGet expects add via query params
  const params = { action: 'add', sheet: 'Chatboard', Name: 'WebUser', Message: txt };
  const url = SCRIPT_URL + '?' + toQuery(params);
  try {
    const res = await fetch(url);
    const j = await res.json();
    if (j && j.status === 'success') {
      document.getElementById('chat-input').value = '';
      loadChatboard();
    } else {
      console.error('chat add failed', j);
    }
  } catch (err) {
    console.error('sendChatMessage err', err);
  }
}

async function loadChatboard() {
  try {
    const rows = await fetchSheet('Chatboard');
    const cb = document.getElementById('chatboard');
    if (!cb) return;
    cb.innerHTML = '';
    (rows || []).slice(-50).forEach(r => {
      const div = document.createElement('div');
      div.innerHTML = `<small>${escapeHtml(r['Name'] || '')}:</small> ${escapeHtml(r['Message'] || '')}`;
      cb.appendChild(div);
    });
  } catch (err) {
    console.error('loadChatboard err', err);
  }
}

/* ---------------------------
   Init
----------------------------*/
window.addEventListener('DOMContentLoaded', async () => {
  // wire sidebar tab clicks (if your page uses them)
  document.querySelectorAll('.sidebar a[data-tab]').forEach(a => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const t = a.getAttribute('data-tab');
      document.querySelectorAll('.tab-window').forEach(win => win.classList.remove('active'));
      const target = document.getElementById(t);
      if (target) target.classList.add('active');
    });
  });

  // initial load
  await fetchAllAndPopulate();

  // attach some global functions to window so your HTML onclick can call them
  window.toggleForm = toggleForm;
  window.saveEntry = saveEntry;
  window.clearForm = clearForm;
  window.generatePDF = generatePDF;
  window.generateMonthlyPDFCombined = generateMonthlyPDFCombined;
  window.sendChatMessage = sendChatMessage;
  window.generateMonthlyPDFPick = function(sheetName){ // helper used by your HTML buttons to pick month then generate single-tab monthly pdf
    const pick = promptMonthYear();
    if (!pick) return;
    generateMonthlyPDFForSheet(sheetName, pick.month, pick.year);
  };

  // attach per-sheet single-month pdf generator
  window.generateMonthlyPDF = generateMonthlyPDFCombined; // alias for compatibility
});

/* Helper: generate single-sheet monthly PDF (if you want)
   Accepts sheetName (e.g., 'Vessel_Join'), month (1-12), year
*/
async function generateMonthlyPDFForSheet(sheetName, month, year) {
  try {
    const rows = await fetchSheet(sheetName);
    const tabKey = Object.keys(sheets).find(k => sheets[k].sheetName === sheetName);
    const fields = tabKey ? sheets[tabKey].fields : Object.keys(rows[0] || {}).filter(h=>h!=='UID' && h!=='Timestamp');
    const filtered = rows.filter(r => {
      const d = new Date(r['Date'] || r['Timestamp'] || '');
      return !isNaN(d.getTime()) && d.getFullYear() === year && (d.getMonth()+1) === month;
    });
    if (!filtered.length) { alert('No records for that month'); return; }
    const doc = new jspdf.jsPDF('p','pt','a4');
    const monthName = new Date(year, month-1).toLocaleString('default', { month: 'long' });
    doc.text(`${sheetName} - ${monthName} ${year}`, 40, 40);
    doc.autoTable({ startY: 60, head: [fields], body: filtered.map(r => fields.map(f => r[f] || '')), styles: { fontSize: 10 }});
    doc.save(`${sheetName}_Report_${monthName}_${year}.pdf`);
  } catch (err) {
    console.error('generateMonthlyPDFForSheet err', err);
    alert('Error: ' + err.message);
  }
}
