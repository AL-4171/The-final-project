/**
 * reports.js - HydroGen Reports System
 * Full featured: modal drill-down + smart back navigation + charts everywhere + PDFs with charts
 */

// ===================== FIREBASE INIT =====================
const db = window.hydroGenDB;
let historyData = [];
let currentCharts = {};

// ===================== NAVIGATION STACK =====================
let _navStack = [];
let _navSuppressNext = false;

function _navRegister(fn) {
    if (!_navSuppressNext) _navStack.push(fn);
    _navSuppressNext = false;
}

function modalBack() {
    _navStack.pop();
    if (_navStack.length > 0) {
        _navSuppressNext = true;
        _navStack[_navStack.length - 1]();
    } else {
        closeReportModal();
    }
}

// ===================== HELPER FUNCTIONS =====================
function waterValueToPercent(v) {
    if (v === undefined || v === null) return 0;
    return Math.round(((12 - Math.min(12, Math.max(0, v))) / 12) * 100);
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function formatShortDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
function formatYYYYMMDD(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}
function formatHourLabel(hour) {
    const h = hour % 12 || 12;
    return `${h}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}
function formatTimeLabel(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function formatDateTime(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}
function localDateKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getWeekNumber(ts) {
    const d = new Date(ts);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay()+6)%7);
    const w = new Date(d.getFullYear(),0,4);
    return 1 + Math.round(((d-w)/86400000 - 3 + (w.getDay()+6)%7)/7);
}

// ===================== LOAD FIREBASE DATA =====================
async function loadHistoryData() {
    if (!db) return [];
    try {
        const snap = await db.ref('history').once('value');
        const raw  = snap.val();
        if (!raw) return [];
        const out = [];
        Object.entries(raw).forEach(([key, item]) => {
            if (item && item.time) {
                out.push({
                    id: key,
                    temp:  Number(item.temp)  || 0,
                    hum:   Number(item.hum)   || 0,
                    soil:  Number(item.soil)  || 0,
                    water: Number(item.water) || 12,
                    waterPercent: waterValueToPercent(Number(item.water)||12),
                    time:  Number(item.time),
                    dateTime: formatDateTime(Number(item.time))
                });
            }
        });
        out.sort((a,b) => a.time - b.time);
        return out;
    } catch(e) { console.error('loadHistory:', e); return []; }
}

async function saveCurrentReading(temp, hum, soil, water) {
    if (!db) return;
    try {
        await db.ref('history').push({ temp:temp||0, hum:hum||0, soil:soil||0, water:water||12, time:Date.now() });
        historyData = await loadHistoryData();
        renderReportsTable();
    } catch(e) { console.error('saveReading:', e); }
}

// ===================== GROUPING (local-time date key) =====================
function groupByDay(data) {
    const map = new Map();
    data.forEach(item => {
        const key = localDateKey(item.time);
        if (!map.has(key)) {
            map.set(key, { date:key, label:formatDate(item.time), shortLabel:formatShortDate(item.time),
                yyyymmdd:formatYYYYMMDD(item.time), readings:[], tempSum:0, humSum:0, soilSum:0, waterSum:0, count:0 });
        }
        const d = map.get(key);
        d.readings.push(item);
        d.tempSum+=item.temp; d.humSum+=item.hum; d.soilSum+=item.soil; d.waterSum+=item.waterPercent; d.count++;
    });
    return Array.from(map.values()).map(d => ({
        ...d,
        avgTemp:  d.count>0 ? (d.tempSum /d.count).toFixed(1):'0',
        avgHum:   d.count>0 ? (d.humSum  /d.count).toFixed(1):'0',
        avgSoil:  d.count>0 ? (d.soilSum /d.count).toFixed(1):'0',
        avgWater: d.count>0 ? (d.waterSum/d.count).toFixed(1):'0'
    })).sort((a,b) => a.date.localeCompare(b.date));
}

function groupByWeek(data) {
    const map = new Map();
    data.forEach(item => {
        const date = new Date(item.time);
        const wn   = getWeekNumber(item.time);
        const key  = `${date.getFullYear()}-W${wn}`;
        const sow  = new Date(item.time);
        sow.setDate(date.getDate() - date.getDay() + (date.getDay()===0?-6:1));
        sow.setHours(0,0,0,0);
        const eow = new Date(sow); eow.setDate(sow.getDate()+6); eow.setHours(23,59,59,999);
        if (!map.has(key)) {
            map.set(key, { key, label:`Week ${wn}, ${date.getFullYear()}`,
                range:`${formatShortDate(sow.getTime())} – ${formatShortDate(eow.getTime())}`,
                startTime:sow.getTime(), endTime:eow.getTime(), readings:[],
                tempSum:0, humSum:0, soilSum:0, waterSum:0, count:0 });
        }
        const w = map.get(key);
        w.readings.push(item);
        w.tempSum+=item.temp; w.humSum+=item.hum; w.soilSum+=item.soil; w.waterSum+=item.waterPercent; w.count++;
    });
    return Array.from(map.values()).map(w => ({
        ...w,
        avgTemp:  w.count>0?(w.tempSum /w.count).toFixed(1):'0',
        avgHum:   w.count>0?(w.humSum  /w.count).toFixed(1):'0',
        avgSoil:  w.count>0?(w.soilSum /w.count).toFixed(1):'0',
        avgWater: w.count>0?(w.waterSum/w.count).toFixed(1):'0'
    })).sort((a,b) => a.key.localeCompare(b.key));
}

function groupByMonth(data) {
    const map = new Map();
    data.forEach(item => {
        const d = new Date(item.time);
        const key = `${d.getFullYear()}-${d.getMonth()+1}`;
        if (!map.has(key)) {
            map.set(key, { key,
                label:     d.toLocaleDateString('en-US',{month:'long',  year:'numeric'}),
                shortLabel:d.toLocaleDateString('en-US',{month:'short', year:'numeric'}),
                readings:[], tempSum:0, humSum:0, soilSum:0, waterSum:0, count:0 });
        }
        const m = map.get(key);
        m.readings.push(item);
        m.tempSum+=item.temp; m.humSum+=item.hum; m.soilSum+=item.soil; m.waterSum+=item.waterPercent; m.count++;
    });
    return Array.from(map.values()).map(m => ({
        ...m,
        avgTemp:  m.count>0?(m.tempSum /m.count).toFixed(1):'0',
        avgHum:   m.count>0?(m.humSum  /m.count).toFixed(1):'0',
        avgSoil:  m.count>0?(m.soilSum /m.count).toFixed(1):'0',
        avgWater: m.count>0?(m.waterSum/m.count).toFixed(1):'0'
    })).sort((a,b) => a.key.localeCompare(b.key));
}

function getHourlyData(readings) {
    const map = new Map();
    readings.forEach(r => {
        const h = new Date(r.time).getHours();
        if (!map.has(h)) map.set(h, { hour:h, label:formatHourLabel(h), tempSum:0, humSum:0, soilSum:0, waterSum:0, count:0, readings:[] });
        const hh = map.get(h);
        hh.tempSum+=r.temp; hh.humSum+=r.hum; hh.soilSum+=r.soil; hh.waterSum+=r.waterPercent; hh.count++; hh.readings.push(r);
    });
    return Array.from(map.values()).map(h => ({
        ...h,
        avgTemp:  h.count>0?(h.tempSum /h.count).toFixed(1):'0',
        avgHum:   h.count>0?(h.humSum  /h.count).toFixed(1):'0',
        avgSoil:  h.count>0?(h.soilSum /h.count).toFixed(1):'0',
        avgWater: h.count>0?(h.waterSum/h.count).toFixed(1):'0'
    })).sort((a,b) => a.hour-b.hour);
}


// ===================== RENDER MAIN TABLE =====================
async function renderReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;
    historyData = await loadHistoryData();

    const daily   = groupByDay(historyData);
    const weekly  = groupByWeek(historyData);
    const monthly = groupByMonth(historyData);

    const el = id => document.getElementById(id);
    if (el('dailySummary'))   el('dailySummary').innerHTML   = daily.length   ? daily[daily.length-1].shortLabel          : 'No data';
    if (el('weeklySummary'))  el('weeklySummary').innerHTML  = weekly.length  ? weekly[weekly.length-1].label              : 'No data';
    if (el('monthlySummary')) el('monthlySummary').innerHTML = monthly.length ? monthly[monthly.length-1].shortLabel       : 'No data';

    const today = `${new Date().getFullYear()}/${new Date().getMonth()+1}/${new Date().getDate()}`;
    tbody.innerHTML = `
        <tr>
            <td class="report-type">
                <div class="report-icon icon-daily"><i class="fas fa-calendar-day"></i></div>
                <div class="report-meta"><div class="report-name">Daily Report</div><div class="report-desc">24-hour irrigation &amp; water usage summary</div></div>
            </td>
            <td class="col-status"><span class="status-badge ready"><span class="status-dot"></span> Ready</span></td>
            <td class="col-updated"><span class="updated-text">${today}</span></td>
            <td class="actions-cell">
                <button class="btn-view" onclick="showDailyReport()"><i class="fas fa-eye"></i><span> View</span></button>
                <button class="btn-download" onclick="downloadDailySummaryPDF()"><i class="fas fa-download"></i><span> PDF</span></button>
            </td>
        </tr>
        <tr>
            <td class="report-type">
                <div class="report-icon icon-weekly"><i class="fas fa-calendar-week"></i></div>
                <div class="report-meta"><div class="report-name">Weekly Report</div><div class="report-desc">7-day performance &amp; efficiency overview</div></div>
            </td>
            <td class="col-status"><span class="status-badge ready"><span class="status-dot"></span> Ready</span></td>
            <td class="col-updated"><span class="updated-text">${today}</span></td>
            <td class="actions-cell">
                <button class="btn-view" onclick="showWeeklyReport()"><i class="fas fa-eye"></i><span> View</span></button>
                <button class="btn-download" onclick="downloadWeeklySummaryPDF()"><i class="fas fa-download"></i><span> PDF</span></button>
            </td>
        </tr>
        <tr>
            <td class="report-type">
                <div class="report-icon icon-monthly"><i class="fas fa-calendar-alt"></i></div>
                <div class="report-meta"><div class="report-name">Monthly Report</div><div class="report-desc">Full-month analytics, savings &amp; crop data</div></div>
            </td>
            <td class="col-status"><span class="status-badge ready"><span class="status-dot"></span> Ready</span></td>
            <td class="col-updated"><span class="updated-text">${today}</span></td>
            <td class="actions-cell">
                <button class="btn-view" onclick="showMonthlyReport()"><i class="fas fa-eye"></i><span> View</span></button>
                <button class="btn-download" onclick="downloadMonthlySummaryPDF()"><i class="fas fa-download"></i><span> PDF</span></button>
            </td>
        </tr>`;
}

// ===================== CHART HELPERS =====================
function createChart(canvasId, labels, data, color, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (currentCharts[canvasId]) currentCharts[canvasId].destroy();
    currentCharts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets:[{ label, data, borderColor:color, backgroundColor:color+'22',
            tension:0.3, fill:true, pointRadius:4, pointBackgroundColor:color,
            pointBorderColor:'#fff', pointBorderWidth:2, pointHoverRadius:7 }] },
        options: {
            responsive:true, maintainAspectRatio:true,
            plugins:{ legend:{position:'top',labels:{font:{size:11}}}, tooltip:{mode:'index',intersect:false} },
            scales:{
                y:{ beginAtZero:true, grid:{color:'#e2e8f030'}, title:{display:true,text:label,font:{size:10}} },
                x:{ grid:{display:false}, ticks:{rotation:35,maxRotation:45,autoSkip:true,font:{size:10}} }
            }
        }
    });
    canvas.title = 'Double-click to download chart as PNG';
    canvas.style.cursor = 'crosshair';
    canvas.ondblclick = () => {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `HydroGen_${label.replace(/[^a-z0-9]/gi,'_')}.png`;
        a.click();
    };
}

function renderChartBlock(charts, ids, labels) {
    charts.forEach(c => { createChart(c.id, labels, c.data, c.color, c.label); });
}

async function chartToBase64(labels, values, color, label) {
    return new Promise(resolve => {
        const c = document.createElement('canvas');
        c.width=900; c.height=280; c.style.position='absolute'; c.style.left='-9999px';
        document.body.appendChild(c);
        const ch = new Chart(c.getContext('2d'), {
            type:'line',
            data:{ labels, datasets:[{ label, data:values, borderColor:color, backgroundColor:color+'30', tension:0.3, fill:true, pointRadius:3 }] },
            options:{ responsive:false, animation:{duration:0}, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true},x:{grid:{display:false}}} }
        });
        setTimeout(() => { const b64=c.toDataURL('image/png'); ch.destroy(); document.body.removeChild(c); resolve(b64); }, 150);
    });
}

// ===================== PDF WITH CHARTS =====================
async function generateStyledPDF(title, headers, rows, summary, chartData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l','mm','a4');
    const W=297, M=15;

    doc.setFillColor(6,66,13); doc.rect(0,0,W,42,'F');
    doc.setTextColor(255,228,77); doc.setFontSize(22); doc.setFont('helvetica','bold');
    doc.text('HydroGen', M, 18);
    doc.setFontSize(13); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255);
    doc.text(title, M, 30);
    const now=new Date();
    const ds=`${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    doc.setFontSize(8); doc.text(`Generated: ${ds}`, W-M, 12, {align:'right'});

    let y = 52;

    if (summary) {
        doc.setFontSize(9); doc.setFont('helvetica','bold');
        let x = M;
        Object.entries(summary).forEach(([k,v]) => {
            doc.setFillColor(240,253,244); doc.rect(x,y-5,55,14,'F');
            doc.setTextColor(6,66,13); doc.text(String(v), x+4, y+1);
            doc.setTextColor(100,116,139); doc.setFontSize(7); doc.setFont('helvetica','normal');
            doc.text(k, x+4, y+6); doc.setFontSize(9); doc.setFont('helvetica','bold');
            x += 58;
        });
        y += 20;
    }

    if (chartData && chartData.labels && chartData.labels.length > 0) {
        doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
        doc.text('Sensor Trends', M, y); y+=6;
        const charts = [
            { label:'Temperature (°C)', values:chartData.temps,  color:'#ef4444' },
            { label:'Humidity (%)',      values:chartData.hums,   color:'#3b82f6' },
            { label:'Soil Moisture (%)', values:chartData.soils,  color:'#22c55e' },
            { label:'Tank Level (%)',    values:chartData.waters, color:'#06b6d4' }
        ];
        const cW=120, cH=48;
        for (let i=0; i<charts.length; i++) {
            const xPos = M + (i%2)*(cW+14);
            if (i%2===0 && i>0) y += cH+10;
            if (y>185) { doc.addPage(); y=20; }
            const b64 = await chartToBase64(chartData.labels, charts[i].values, charts[i].color, charts[i].label);
            doc.setFillColor(248,250,252); doc.rect(xPos, y, cW, cH, 'F');
            doc.setTextColor(71,85,105); doc.setFontSize(7); doc.setFont('helvetica','bold');
            doc.text(charts[i].label, xPos+3, y+5);
            try { doc.addImage(b64,'PNG', xPos, y+7, cW, cH-9); } catch(e){}
        }
        y += cH+14;
    }

    if (y > 155) { doc.addPage(); y=15; }

    const colW = (W-M*2)/headers.length;
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
    doc.text('Data Table', M, y); y+=6;
    doc.setFillColor(6,66,13); doc.rect(M,y,W-M*2,9,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
    headers.forEach((h,i) => doc.text(h, M+i*colW+2, y+6));
    y += 9;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(30,41,59);
    rows.forEach((row,ri) => {
        if (y>192) { doc.addPage(); y=15; }
        if (ri%2===0) { doc.setFillColor(240,253,244); doc.rect(M,y,W-M*2,8,'F'); }
        Object.values(row).forEach((v,i) => doc.text(String(v), M+i*colW+2, y+5.5));
        y+=8;
    });
    doc.setFillColor(6,66,13); doc.rect(0,200,W,10,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7.5);
    doc.text('HydroGen Smart Irrigation System © 2026', W/2, 206.5, {align:'center'});
    doc.save(`HydroGen_${title.replace(/\s+/g,'_')}.pdf`);
    showToast(`${title} downloaded!`);
}

// ===================== SUMMARY PDF (with charts) =====================
async function downloadDailySummaryPDF() {
    const daily = groupByDay(historyData);
    if (!daily.length) { showToast('No data available'); return; }
    showToast('Generating PDF…');
    const labels = daily.map(d => d.shortLabel);
    const sum = { 'Total Days':String(daily.length),
        'Avg Temp':(daily.reduce((s,d)=>s+parseFloat(d.avgTemp),0)/daily.length).toFixed(1)+'°C',
        'Avg Humidity':(daily.reduce((s,d)=>s+parseFloat(d.avgHum),0)/daily.length).toFixed(1)+'%',
        'Avg Soil':(daily.reduce((s,d)=>s+parseFloat(d.avgSoil),0)/daily.length).toFixed(1)+'%',
        'Avg Tank':(daily.reduce((s,d)=>s+parseFloat(d.avgWater),0)/daily.length).toFixed(1)+'%',
        'Total Readings':String(daily.reduce((s,d)=>s+d.count,0)) };
    const cd = { labels, temps:daily.map(d=>parseFloat(d.avgTemp)), hums:daily.map(d=>parseFloat(d.avgHum)), soils:daily.map(d=>parseFloat(d.avgSoil)), waters:daily.map(d=>parseFloat(d.avgWater)) };
    const headers = ['Date','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = daily.map(d => ({ Date:d.yyyymmdd, Temp:d.avgTemp, Humidity:d.avgHum, Soil:d.avgSoil, Tank:d.avgWater, Readings:d.count }));
    await generateStyledPDF('Daily Report Summary', headers, rows, sum, cd);
}

async function downloadWeeklySummaryPDF() {
    const weekly = groupByWeek(historyData);
    if (!weekly.length) { showToast('No data available'); return; }
    showToast('Generating PDF…');
    const labels = weekly.map(w => w.label);
    const sum = { 'Total Weeks':String(weekly.length),
        'Avg Temp':(weekly.reduce((s,w)=>s+parseFloat(w.avgTemp),0)/weekly.length).toFixed(1)+'°C',
        'Avg Humidity':(weekly.reduce((s,w)=>s+parseFloat(w.avgHum),0)/weekly.length).toFixed(1)+'%',
        'Avg Soil':(weekly.reduce((s,w)=>s+parseFloat(w.avgSoil),0)/weekly.length).toFixed(1)+'%',
        'Avg Tank':(weekly.reduce((s,w)=>s+parseFloat(w.avgWater),0)/weekly.length).toFixed(1)+'%',
        'Total Readings':String(weekly.reduce((s,w)=>s+w.count,0)) };
    const cd = { labels, temps:weekly.map(w=>parseFloat(w.avgTemp)), hums:weekly.map(w=>parseFloat(w.avgHum)), soils:weekly.map(w=>parseFloat(w.avgSoil)), waters:weekly.map(w=>parseFloat(w.avgWater)) };
    const headers = ['Week','Period','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = weekly.map(w => ({ Week:w.label, Period:w.range, Temp:w.avgTemp, Humidity:w.avgHum, Soil:w.avgSoil, Tank:w.avgWater, Readings:w.count }));
    await generateStyledPDF('Weekly Report Summary', headers, rows, sum, cd);
}

async function downloadMonthlySummaryPDF() {
    const monthly = groupByMonth(historyData);
    if (!monthly.length) { showToast('No data available'); return; }
    showToast('Generating PDF…');
    const labels = monthly.map(m => m.shortLabel);
    const sum = { 'Total Months':String(monthly.length),
        'Avg Temp':(monthly.reduce((s,m)=>s+parseFloat(m.avgTemp),0)/monthly.length).toFixed(1)+'°C',
        'Avg Humidity':(monthly.reduce((s,m)=>s+parseFloat(m.avgHum),0)/monthly.length).toFixed(1)+'%',
        'Avg Soil':(monthly.reduce((s,m)=>s+parseFloat(m.avgSoil),0)/monthly.length).toFixed(1)+'%',
        'Avg Tank':(monthly.reduce((s,m)=>s+parseFloat(m.avgWater),0)/monthly.length).toFixed(1)+'%',
        'Total Readings':String(monthly.reduce((s,m)=>s+m.count,0)) };
    const cd = { labels, temps:monthly.map(m=>parseFloat(m.avgTemp)), hums:monthly.map(m=>parseFloat(m.avgHum)), soils:monthly.map(m=>parseFloat(m.avgSoil)), waters:monthly.map(m=>parseFloat(m.avgWater)) };
    const headers = ['Month','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = monthly.map(m => ({ Month:m.label, Temp:m.avgTemp, Humidity:m.avgHum, Soil:m.avgSoil, Tank:m.avgWater, Readings:m.count }));
    await generateStyledPDF('Monthly Report Summary', headers, rows, sum, cd);
}

// ===================== PER-ITEM PDFs (all with charts) =====================
async function downloadDayPDF(date) {
    const day = groupByDay(historyData).find(d => d.date === date);
    if (!day) return;
    showToast('Generating Daily PDF…');
    const hourly = getHourlyData(day.readings);
    const labels = hourly.map(h => h.label);
    const sum = { 'Date':day.yyyymmdd, 'Avg Temp':day.avgTemp+'°C', 'Avg Humidity':day.avgHum+'%',
        'Avg Soil':day.avgSoil+'%', 'Avg Tank':day.avgWater+'%', 'Readings':String(day.count) };
    const cd = hourly.length ? { labels, temps:hourly.map(h=>parseFloat(h.avgTemp)), hums:hourly.map(h=>parseFloat(h.avgHum)), soils:hourly.map(h=>parseFloat(h.avgSoil)), waters:hourly.map(h=>parseFloat(h.avgWater)) } : null;
    const headers = ['Hour','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = hourly.map(h => ({ Hour:h.label, Temp:h.avgTemp, Humidity:h.avgHum, Soil:h.avgSoil, Tank:h.avgWater, Readings:h.count }));
    await generateStyledPDF(`Daily Report – ${day.label}`, headers, rows, sum, cd);
}

async function downloadHourPDF(date, hour) {
    const day = groupByDay(historyData).find(d => d.date === date);
    if (!day) return;
    const readings = day.readings.filter(r => new Date(r.time).getHours() === hour);
    const label = formatHourLabel(hour);
    showToast('Generating Hourly PDF…');
    const labels = readings.map(r => formatTimeLabel(r.time));
    const avg = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1):'0';
    const sum = { 'Date':day.yyyymmdd, 'Hour':label,
        'Avg Temp':avg(readings.map(r=>r.temp))+'°C', 'Avg Humidity':avg(readings.map(r=>r.hum))+'%',
        'Avg Soil':avg(readings.map(r=>r.soil))+'%', 'Avg Tank':avg(readings.map(r=>r.waterPercent))+'%',
        'Readings':String(readings.length) };
    const cd = readings.length ? { labels, temps:readings.map(r=>r.temp), hums:readings.map(r=>r.hum), soils:readings.map(r=>r.soil), waters:readings.map(r=>r.waterPercent) } : null;
    const headers = ['Time','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)'];
    const rows = readings.map(r => ({ Time:formatTimeLabel(r.time), Temp:r.temp, Humidity:r.hum, Soil:r.soil, Tank:r.waterPercent }));
    await generateStyledPDF(`Hourly Report – ${day.shortLabel} ${label}`, headers, rows, sum, cd);
}

async function downloadWeekPDF(weekKey) {
    const week = groupByWeek(historyData).find(w => w.key === weekKey);
    if (!week) return;
    showToast('Generating Weekly PDF…');
    const daily = groupByDay(historyData.filter(item => item.time >= week.startTime && item.time <= week.endTime));
    const labels = daily.map(d => d.shortLabel);
    const sum = { 'Week':week.label, 'Period':week.range, 'Avg Temp':week.avgTemp+'°C',
        'Avg Humidity':week.avgHum+'%', 'Avg Soil':week.avgSoil+'%', 'Avg Tank':week.avgWater+'%',
        'Readings':String(week.count) };
    const cd = daily.length ? { labels, temps:daily.map(d=>parseFloat(d.avgTemp)), hums:daily.map(d=>parseFloat(d.avgHum)), soils:daily.map(d=>parseFloat(d.avgSoil)), waters:daily.map(d=>parseFloat(d.avgWater)) } : null;
    const headers = ['Date','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = daily.map(d => ({ Date:d.yyyymmdd, Temp:d.avgTemp, Humidity:d.avgHum, Soil:d.avgSoil, Tank:d.avgWater, Readings:d.count }));
    await generateStyledPDF(`Weekly Report – ${week.label}`, headers, rows, sum, cd);
}

async function downloadMonthPDF(monthKey) {
    const month = groupByMonth(historyData).find(m => m.key === monthKey);
    if (!month) return;
    showToast('Generating Monthly PDF…');
    const weekly = groupByWeek(month.readings);
    const labels = weekly.map(w => w.label);
    const sum = { 'Month':month.label, 'Avg Temp':month.avgTemp+'°C', 'Avg Humidity':month.avgHum+'%',
        'Avg Soil':month.avgSoil+'%', 'Avg Tank':month.avgWater+'%', 'Readings':String(month.count) };
    const cd = weekly.length ? { labels, temps:weekly.map(w=>parseFloat(w.avgTemp)), hums:weekly.map(w=>parseFloat(w.avgHum)), soils:weekly.map(w=>parseFloat(w.avgSoil)), waters:weekly.map(w=>parseFloat(w.avgWater)) } : null;
    const headers = ['Week','Period','Temp (°C)','Humidity (%)','Soil (%)','Tank (%)','Readings'];
    const rows = weekly.map(w => ({ Week:w.label, Period:w.range, Temp:w.avgTemp, Humidity:w.avgHum, Soil:w.avgSoil, Tank:w.avgWater, Readings:w.count }));
    await generateStyledPDF(`Monthly Report – ${month.label}`, headers, rows, sum, cd);
}

// ===================== MODAL CONTROLS =====================
function closeReportModal() {
    _navStack = [];
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
    Object.values(currentCharts).forEach(c => { if(c&&c.destroy) c.destroy(); });
    currentCharts = {};
}

// ===================== DAILY REPORT =====================
function showDailyReport() {
    if (!_navSuppressNext) _navStack = [];
    _navRegister(() => showDailyReport());
    const daily = groupByDay(historyData);
    const body  = document.getElementById('modalBody');

    if (!daily.length) {
        body.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-day"></i><p>No daily data available yet</p></div>';
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-day"></i> Daily Reports';
        document.getElementById('reportModal').style.display = 'flex';
        return;
    }

    const labels = daily.map(d => d.shortLabel);
    const temps  = daily.map(d => parseFloat(d.avgTemp));
    const hums   = daily.map(d => parseFloat(d.avgHum));
    const soils  = daily.map(d => parseFloat(d.avgSoil));
    const waters = daily.map(d => parseFloat(d.avgWater));
    const totR   = daily.reduce((s,d)=>s+d.count,0);
    const avgOf  = (arr) => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1) : '0';

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="closeReportModal()"><i class="fas fa-times"></i> Close</button>
            <button class="btn-nav-back" onclick="downloadDailySummaryPDF()" style="margin-left:auto;"><i class="fas fa-download"></i> Download PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-info"><div class="stat-value">${daily.length}</div><div class="stat-label">Total Days</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${avgOf(temps)}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${avgOf(hums)}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${avgOf(soils)}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${avgOf(waters)}%</div><div class="stat-label">Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${totR}</div><div class="stat-label">Total Readings</div></div></div>
        </div>
        <p class="chart-hint">💡 Double-click any chart to download it as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Temperature Trend</h4><canvas id="dlyTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Humidity Trend</h4><canvas id="dlyHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Soil Moisture Trend</h4><canvas id="dlySoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Tank Level Trend</h4><canvas id="dlyWater"></canvas></div>
        </div>
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Date</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Readings</th><th>Actions</th></tr></thead>
                <tbody>
                    ${daily.map(d => {
                        const sc = parseFloat(d.avgSoil)<30?'low':(parseFloat(d.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(d.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${d.shortLabel}</strong><br><small>${d.yyyymmdd}</small></td>
                            <td>${d.avgTemp}°C</td><td>${d.avgHum}%</td>
                            <td class="soil-value ${sc}">${d.avgSoil}%</td>
                            <td class="water-value ${wc}">${d.avgWater}%</td>
                            <td>${d.count}</td>
                            <td>
                                <button class="btn-small" onclick="showHourlyDetail('${d.date}')"><i class="fas fa-clock"></i> Hourly</button>
                                <button class="btn-small" onclick="downloadDayPDF('${d.date}')"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    setTimeout(() => {
        createChart('dlyTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
        createChart('dlyHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
        createChart('dlySoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
        createChart('dlyWater', labels, waters, '#06b6d4', 'Tank Level (%)');
    }, 100);

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-day"></i> Daily Reports';
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== HOURLY DETAIL =====================
function showHourlyDetail(date) {
    _navRegister(() => showHourlyDetail(date));
    const daily = groupByDay(historyData);
    const day   = daily.find(d => d.date === date);
    if (!day) return;

    const hourly = getHourlyData(day.readings);
    const body   = document.getElementById('modalBody');

    if (!hourly.length) {
        body.innerHTML = `
            <div class="report-nav">
                <button class="btn-nav-back" onclick="modalBack()"><i class="fas fa-arrow-left"></i> Back</button>
                <button class="btn-nav-back" onclick="downloadDayPDF('${date}')" style="margin-left:auto;"><i class="fas fa-download"></i> PDF</button>
            </div>
            <div class="empty-state"><i class="fas fa-clock"></i><p>No hourly data for this day</p></div>`;
        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-clock"></i> Hourly – ${day.shortLabel}`;
        document.getElementById('reportModal').style.display = 'flex';
        return;
    }

    const labels = hourly.map(h => h.label);
    const temps  = hourly.map(h => parseFloat(h.avgTemp));
    const hums   = hourly.map(h => parseFloat(h.avgHum));
    const soils  = hourly.map(h => parseFloat(h.avgSoil));
    const waters = hourly.map(h => parseFloat(h.avgWater));

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="modalBack()"><i class="fas fa-arrow-left"></i> Back</button>
            <button class="btn-nav-back" onclick="downloadDayPDF('${date}')" style="margin-left:auto;"><i class="fas fa-download"></i> PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">⏰</div><div class="stat-info"><div class="stat-value">${hourly.length}</div><div class="stat-label">Hours</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${day.avgTemp}°C</div><div class="stat-label">Day Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${day.avgHum}%</div><div class="stat-label">Day Avg Hum</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${day.avgSoil}%</div><div class="stat-label">Day Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${day.avgWater}%</div><div class="stat-label">Day Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${day.count}</div><div class="stat-label">Readings</div></div></div>
        </div>
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Temperature by Hour</h4><canvas id="hrlyTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Humidity by Hour</h4><canvas id="hrlyHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Soil Moisture by Hour</h4><canvas id="hrlySoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Tank Level by Hour</h4><canvas id="hrlyWater"></canvas></div>
        </div>
        <div class="table-wrapper">
            <table class="hourly-table">
                <thead><tr><th>Hour</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Samples</th><th>Actions</th></tr></thead>
                <tbody>
                    ${hourly.map(h => {
                        const sc = parseFloat(h.avgSoil)<30?'low':(parseFloat(h.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(h.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${h.label}</strong></td>
                            <td>${h.avgTemp}°C</td><td>${h.avgHum}%</td>
                            <td class="soil-value ${sc}">${h.avgSoil}%</td>
                            <td class="water-value ${wc}">${h.avgWater}%</td>
                            <td>${h.count}</td>
                            <td>
                                <button class="btn-small" onclick="showMinuteDetail('${date}',${h.hour})"><i class="fas fa-list"></i> Details</button>
                                <button class="btn-small" onclick="downloadHourPDF('${date}',${h.hour})"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    setTimeout(() => {
        createChart('hrlyTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
        createChart('hrlyHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
        createChart('hrlySoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
        createChart('hrlyWater', labels, waters, '#06b6d4', 'Tank Level (%)');
    }, 100);

    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-clock"></i> Hourly – ${day.shortLabel}`;
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== MINUTE DETAIL =====================
function showMinuteDetail(date, hour) {
    _navRegister(() => showMinuteDetail(date, hour));
    const daily = groupByDay(historyData);
    const day   = daily.find(d => d.date === date);
    if (!day) return;

    const readings = day.readings.filter(r => new Date(r.time).getHours() === hour);
    const hl       = formatHourLabel(hour);
    const avg      = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1):'0';
    const body     = document.getElementById('modalBody');

    const labels = readings.map(r => formatTimeLabel(r.time));
    const temps  = readings.map(r => r.temp);
    const hums   = readings.map(r => r.hum);
    const soils  = readings.map(r => r.soil);
    const waters = readings.map(r => r.waterPercent);

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="modalBack()"><i class="fas fa-arrow-left"></i> Back</button>
            <button class="btn-nav-back" onclick="downloadHourPDF('${date}',${hour})" style="margin-left:auto;"><i class="fas fa-download"></i> PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-info"><div class="stat-value">${readings.length}</div><div class="stat-label">Readings</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${avg(temps)}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${avg(hums)}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${avg(soils)}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${avg(waters)}%</div><div class="stat-label">Avg Tank</div></div></div>
        </div>
        ${readings.length > 1 ? `
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Temperature Readings</h4><canvas id="minTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Humidity Readings</h4><canvas id="minHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Soil Moisture Readings</h4><canvas id="minSoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Tank Level Readings</h4><canvas id="minWater"></canvas></div>
        </div>` : ''}
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Time</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th></tr></thead>
                <tbody>
                    ${readings.map(r => {
                        const sc = r.soil<30?'low':(r.soil>70?'high':'normal');
                        const wc = r.waterPercent<20?'low':'normal';
                        return `<tr>
                            <td><strong>${formatTimeLabel(r.time)}</strong><br><small>${r.dateTime}</small></td>
                            <td>${r.temp}°C</td><td>${r.hum}%</td>
                            <td class="soil-value ${sc}">${r.soil}%</td>
                            <td class="water-value ${wc}">${r.waterPercent}%</td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    if (readings.length > 1) {
        setTimeout(() => {
            createChart('minTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
            createChart('minHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
            createChart('minSoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
            createChart('minWater', labels, waters, '#06b6d4', 'Tank Level (%)');
        }, 100);
    }

    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-list"></i> Readings – ${day.shortLabel} ${hl}`;
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== WEEKLY REPORT =====================
function showWeeklyReport() {
    if (!_navSuppressNext) _navStack = [];
    _navRegister(() => showWeeklyReport());
    const weekly = groupByWeek(historyData);
    const body   = document.getElementById('modalBody');

    if (!weekly.length) {
        body.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-week"></i><p>No weekly data available yet</p></div>';
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-week"></i> Weekly Reports';
        document.getElementById('reportModal').style.display = 'flex';
        return;
    }

    const labels = weekly.map(w => w.label);
    const temps  = weekly.map(w => parseFloat(w.avgTemp));
    const hums   = weekly.map(w => parseFloat(w.avgHum));
    const soils  = weekly.map(w => parseFloat(w.avgSoil));
    const waters = weekly.map(w => parseFloat(w.avgWater));
    const totR   = weekly.reduce((s,w)=>s+w.count,0);
    const avgOf  = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1):'0';

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="closeReportModal()"><i class="fas fa-times"></i> Close</button>
            <button class="btn-nav-back" onclick="downloadWeeklySummaryPDF()" style="margin-left:auto;"><i class="fas fa-download"></i> Download PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-info"><div class="stat-value">${weekly.length}</div><div class="stat-label">Total Weeks</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${avgOf(temps)}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${avgOf(hums)}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${avgOf(soils)}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${avgOf(waters)}%</div><div class="stat-label">Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${totR}</div><div class="stat-label">Total Readings</div></div></div>
        </div>
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Temperature Trend</h4><canvas id="wklyTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Humidity Trend</h4><canvas id="wklyHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Soil Moisture Trend</h4><canvas id="wklySoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Tank Level Trend</h4><canvas id="wklyWater"></canvas></div>
        </div>
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Week &amp; Period</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Readings</th><th>Actions</th></tr></thead>
                <tbody>
                    ${weekly.map(w => {
                        const sc = parseFloat(w.avgSoil)<30?'low':(parseFloat(w.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(w.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${w.label}</strong><br><small>${w.range}</small></td>
                            <td>${w.avgTemp}°C</td><td>${w.avgHum}%</td>
                            <td class="soil-value ${sc}">${w.avgSoil}%</td>
                            <td class="water-value ${wc}">${w.avgWater}%</td>
                            <td>${w.count}</td>
                            <td>
                                <button class="btn-small" onclick="showWeeklyDetail('${w.key}')"><i class="fas fa-chart-line"></i> Detail</button>
                                <button class="btn-small" onclick="downloadWeekPDF('${w.key}')"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    setTimeout(() => {
        createChart('wklyTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
        createChart('wklyHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
        createChart('wklySoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
        createChart('wklyWater', labels, waters, '#06b6d4', 'Tank Level (%)');
    }, 100);

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-week"></i> Weekly Reports';
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== WEEKLY DETAIL =====================
function showWeeklyDetail(weekKey) {
    _navRegister(() => showWeeklyDetail(weekKey));
    const week  = groupByWeek(historyData).find(w => w.key === weekKey);
    if (!week) return;

    const daily  = groupByDay(historyData.filter(item => item.time >= week.startTime && item.time <= week.endTime));
    const body   = document.getElementById('modalBody');

    const labels = daily.map(d => d.shortLabel);
    const temps  = daily.map(d => parseFloat(d.avgTemp));
    const hums   = daily.map(d => parseFloat(d.avgHum));
    const soils  = daily.map(d => parseFloat(d.avgSoil));
    const waters = daily.map(d => parseFloat(d.avgWater));

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="modalBack()"><i class="fas fa-arrow-left"></i> Back</button>
            <button class="btn-nav-back" onclick="downloadWeekPDF('${week.key}')" style="margin-left:auto;"><i class="fas fa-download"></i> PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-info"><div class="stat-value">${daily.length}</div><div class="stat-label">Days</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${week.avgTemp}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${week.avgHum}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${week.avgSoil}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${week.avgWater}%</div><div class="stat-label">Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${week.count}</div><div class="stat-label">Readings</div></div></div>
        </div>
        ${daily.length > 1 ? `
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Daily Temperature</h4><canvas id="wkdTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Daily Humidity</h4><canvas id="wkdHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Daily Soil Moisture</h4><canvas id="wkdSoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Daily Tank Level</h4><canvas id="wkdWater"></canvas></div>
        </div>` : ''}
        ${daily.length > 0 ? `
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Date</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Readings</th><th>Actions</th></tr></thead>
                <tbody>
                    ${daily.map(d => {
                        const sc = parseFloat(d.avgSoil)<30?'low':(parseFloat(d.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(d.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${d.shortLabel}</strong><br><small>${d.yyyymmdd}</small></td>
                            <td>${d.avgTemp}°C</td><td>${d.avgHum}%</td>
                            <td class="soil-value ${sc}">${d.avgSoil}%</td>
                            <td class="water-value ${wc}">${d.avgWater}%</td>
                            <td>${d.count}</td>
                            <td>
                                <button class="btn-small" onclick="showHourlyDetail('${d.date}')"><i class="fas fa-clock"></i> Hourly</button>
                                <button class="btn-small" onclick="downloadDayPDF('${d.date}')"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>` : '<div class="empty-state"><i class="fas fa-calendar"></i><p>No data for this week</p></div>'}`;

    if (daily.length > 1) {
        setTimeout(() => {
            createChart('wkdTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
            createChart('wkdHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
            createChart('wkdSoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
            createChart('wkdWater', labels, waters, '#06b6d4', 'Tank Level (%)');
        }, 100);
    }

    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-calendar-week"></i> Week Detail – ${week.label}`;
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== MONTHLY REPORT =====================
function showMonthlyReport() {
    if (!_navSuppressNext) _navStack = [];
    _navRegister(() => showMonthlyReport());
    const monthly = groupByMonth(historyData);
    const body    = document.getElementById('modalBody');

    if (!monthly.length) {
        body.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No monthly data available yet</p></div>';
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-alt"></i> Monthly Reports';
        document.getElementById('reportModal').style.display = 'flex';
        return;
    }

    const labels = monthly.map(m => m.shortLabel);
    const temps  = monthly.map(m => parseFloat(m.avgTemp));
    const hums   = monthly.map(m => parseFloat(m.avgHum));
    const soils  = monthly.map(m => parseFloat(m.avgSoil));
    const waters = monthly.map(m => parseFloat(m.avgWater));
    const totR   = monthly.reduce((s,m)=>s+m.count,0);
    const avgOf  = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1):'0';

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="closeReportModal()"><i class="fas fa-times"></i> Close</button>
            <button class="btn-nav-back" onclick="downloadMonthlySummaryPDF()" style="margin-left:auto;"><i class="fas fa-download"></i> Download PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-info"><div class="stat-value">${monthly.length}</div><div class="stat-label">Total Months</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${avgOf(temps)}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${avgOf(hums)}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${avgOf(soils)}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${avgOf(waters)}%</div><div class="stat-label">Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${totR}</div><div class="stat-label">Total Readings</div></div></div>
        </div>
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Temperature Trend</h4><canvas id="mnthTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Humidity Trend</h4><canvas id="mnthHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Soil Moisture Trend</h4><canvas id="mnthSoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Tank Level Trend</h4><canvas id="mnthWater"></canvas></div>
        </div>
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Month</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Readings</th><th>Actions</th></tr></thead>
                <tbody>
                    ${monthly.map(m => {
                        const sc = parseFloat(m.avgSoil)<30?'low':(parseFloat(m.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(m.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${m.label}</strong></td>
                            <td>${m.avgTemp}°C</td><td>${m.avgHum}%</td>
                            <td class="soil-value ${sc}">${m.avgSoil}%</td>
                            <td class="water-value ${wc}">${m.avgWater}%</td>
                            <td>${m.count}</td>
                            <td>
                                <button class="btn-small" onclick="showMonthlyDetail('${m.key}')"><i class="fas fa-chart-line"></i> Detail</button>
                                <button class="btn-small" onclick="downloadMonthPDF('${m.key}')"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    setTimeout(() => {
        createChart('mnthTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
        createChart('mnthHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
        createChart('mnthSoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
        createChart('mnthWater', labels, waters, '#06b6d4', 'Tank Level (%)');
    }, 100);

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-calendar-alt"></i> Monthly Reports';
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== MONTHLY DETAIL =====================
function showMonthlyDetail(monthKey) {
    _navRegister(() => showMonthlyDetail(monthKey));
    const month  = groupByMonth(historyData).find(m => m.key === monthKey);
    if (!month) return;

    const weekly = groupByWeek(month.readings);
    const body   = document.getElementById('modalBody');

    const labels = weekly.map(w => w.label);
    const temps  = weekly.map(w => parseFloat(w.avgTemp));
    const hums   = weekly.map(w => parseFloat(w.avgHum));
    const soils  = weekly.map(w => parseFloat(w.avgSoil));
    const waters = weekly.map(w => parseFloat(w.avgWater));

    body.innerHTML = `
        <div class="report-nav">
            <button class="btn-nav-back" onclick="modalBack()"><i class="fas fa-arrow-left"></i> Back</button>
            <button class="btn-nav-back" onclick="downloadMonthPDF('${month.key}')" style="margin-left:auto;"><i class="fas fa-download"></i> PDF</button>
        </div>
        <div class="report-summary-stats">
            <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-info"><div class="stat-value">${weekly.length}</div><div class="stat-label">Weeks</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌡️</div><div class="stat-info"><div class="stat-value">${month.avgTemp}°C</div><div class="stat-label">Avg Temp</div></div></div>
            <div class="stat-card"><div class="stat-icon">💧</div><div class="stat-info"><div class="stat-value">${month.avgHum}%</div><div class="stat-label">Avg Humidity</div></div></div>
            <div class="stat-card"><div class="stat-icon">🌱</div><div class="stat-info"><div class="stat-value">${month.avgSoil}%</div><div class="stat-label">Avg Soil</div></div></div>
            <div class="stat-card"><div class="stat-icon">💦</div><div class="stat-info"><div class="stat-value">${month.avgWater}%</div><div class="stat-label">Avg Tank</div></div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info"><div class="stat-value">${month.count}</div><div class="stat-label">Readings</div></div></div>
        </div>
        ${weekly.length > 1 ? `
        <p class="chart-hint">💡 Double-click any chart to download as PNG</p>
        <div class="charts-container">
            <div class="chart-card"><h4><i class="fas fa-thermometer-half"></i> Weekly Temperature</h4><canvas id="mndTemp"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-tint"></i> Weekly Humidity</h4><canvas id="mndHum"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-seedling"></i> Weekly Soil Moisture</h4><canvas id="mndSoil"></canvas></div>
            <div class="chart-card"><h4><i class="fas fa-water"></i> Weekly Tank Level</h4><canvas id="mndWater"></canvas></div>
        </div>` : ''}
        ${weekly.length > 0 ? `
        <div class="table-wrapper">
            <table class="detail-table">
                <thead><tr><th>Week &amp; Period</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Soil (%)</th><th>Tank (%)</th><th>Readings</th><th>Actions</th></tr></thead>
                <tbody>
                    ${weekly.map(w => {
                        const sc = parseFloat(w.avgSoil)<30?'low':(parseFloat(w.avgSoil)>70?'high':'normal');
                        const wc = parseFloat(w.avgWater)<20?'low':'normal';
                        return `<tr>
                            <td><strong>${w.label}</strong><br><small>${w.range}</small></td>
                            <td>${w.avgTemp}°C</td><td>${w.avgHum}%</td>
                            <td class="soil-value ${sc}">${w.avgSoil}%</td>
                            <td class="water-value ${wc}">${w.avgWater}%</td>
                            <td>${w.count}</td>
                            <td>
                                <button class="btn-small" onclick="showWeeklyDetail('${w.key}')"><i class="fas fa-chart-line"></i> Detail</button>
                                <button class="btn-small" onclick="downloadWeekPDF('${w.key}')"><i class="fas fa-download"></i> PDF</button>
                            </td></tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>` : '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No data for this month</p></div>'}`;

    if (weekly.length > 1) {
        setTimeout(() => {
            createChart('mndTemp',  labels, temps,  '#ef4444', 'Temperature (°C)');
            createChart('mndHum',   labels, hums,   '#3b82f6', 'Humidity (%)');
            createChart('mndSoil',  labels, soils,  '#22c55e', 'Soil Moisture (%)');
            createChart('mndWater', labels, waters, '#06b6d4', 'Tank Level (%)');
        }, 100);
    }

    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-calendar-alt"></i> Month Detail – ${month.label}`;
    document.getElementById('reportModal').style.display = 'flex';
}

// ===================== TOAST =====================
function showToast(msg) {
    const ex = document.getElementById('rpt-toast');
    if (ex) ex.remove();
    const t = document.createElement('div');
    t.id = 'rpt-toast';
    Object.assign(t.style, { position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%) translateY(20px)',
        background:'#06420d', color:'white', padding:'12px 24px', borderRadius:'12px',
        fontSize:'14px', fontWeight:'600', boxShadow:'0 8px 24px rgba(0,0,0,.2)',
        opacity:'0', transition:'opacity .3s,transform .3s', zIndex:'9999' });
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; setTimeout(()=>t.remove(),400); }, 3000);
}

// ===================== AUTO-SAVE =====================
async function autoSaveCurrentReadings() {
    if (!db) return;
    try {
        const sensors = (await db.ref('sensors').once('value')).val();
        if (sensors) {
            await db.ref('history').push({ temp:sensors.temp||0, hum:sensors.hum||0, soil:sensors.soil||0, water:sensors.water||12, time:Date.now() });
            historyData = await loadHistoryData();
            renderReportsTable();
        }
    } catch(e) { console.error('autoSave:', e); }
}

// ===================== SCROLL REVEAL =====================
const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('show'); revealObs.unobserve(e.target); } });
}, { threshold:0.10 });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

// ===================== REAL-TIME SENSOR LISTENER =====================
function startRealtimeSensorListener() {
    if (!db) return;
    
    // Listen for real-time sensor updates
    db.ref('sensors').on('value', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.temp !== undefined) {
            // Check if we should save this reading (every hour)
            const lastHour = Math.floor(Date.now() / 3600000);
            const lastSaveKey = `lastReportSave_${lastHour}`;
            
            if (!localStorage.getItem(lastSaveKey)) {
                // Save to history
                await db.ref('history').push({
                    temp: data.temp || 0,
                    hum: data.hum || 0,
                    soil: data.soil || 0,
                    water: data.water || 12,
                    time: Date.now()
                });
                localStorage.setItem(lastSaveKey, Date.now().toString());
                setTimeout(() => localStorage.removeItem(lastSaveKey), 3600000);
                
                // Refresh data
                historyData = await loadHistoryData();
                renderReportsTable();
                console.log("New sensor reading saved to history");
            }
        }
    });
}


// ===================== INIT =====================
renderReportsTable();
setInterval(autoSaveCurrentReadings, 300000);
setInterval(renderReportsTable, 60000);

startRealtimeSensorListener();