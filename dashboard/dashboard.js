// ================= COMPLETE FIXED DASHBOARD.JS =================
// Working PDF reports with CHARTS in all report types

const db = window.hydroGenDB;

const envTemp = document.getElementById("envTemp");
const envHum = document.getElementById("envHum");
const envSoil = document.getElementById("envSoil");

const cardTemp = document.getElementById("cardTemp");
const cardHum = document.getElementById("cardHum");
const cardSoil = document.getElementById("cardSoil");
const cardPump = document.getElementById("cardPump");

const tankFill = document.getElementById("tankLevelFill");
const tankPercent = document.getElementById("tankLevelPercent");
const tankLiters = document.getElementById("tankLevelCm");
const tankCmValue = document.getElementById("tankLevelCmValue");

const pumpToggle = document.getElementById("pumpToggle");
const pumpText = document.getElementById("pumpStatusText");

const alertsBox = document.getElementById("alertsContainer");
const sound = document.getElementById("alertSound");

const liveBadge = document.querySelector(".live-badge");

const maxTankLevelCm = 30;
const maxCapacityLiters = 2;
let lastWaterLevel = null;
let consumptionHistory = [];
let isAIActive = false;
let historyData = [];
let activeAlertConditions = {
    soil_critical: false, soil_warning: false,
    temp_critical: false, temp_warning: false,
    water_critical: false, water_warning: false,
    hum_critical: false, hum_warning: false
};
let mode = "hour";
let weatherRainExpected = false;
let currentSensorData = null;
let lastPumpState = false;
let chatInitialized = false;
let chart = null;

// ===================== CONVERT WATER CM TO PERCENTAGE =====================
function waterCmToPercent(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return 100;
    return (waterLevelCm / maxTankLevelCm) * 100;
}

function waterCmToLiters(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return maxCapacityLiters;
    return (waterLevelCm / maxTankLevelCm) * maxCapacityLiters;
}

function getWaterHeightCm(waterCm) {
    const waterLevelCm = maxTankLevelCm - waterCm;
    if (waterLevelCm < 0) return 0;
    if (waterLevelCm > maxTankLevelCm) return maxTankLevelCm;
    return waterLevelCm;
}

// ================= LIVE BADGE =================
function updateBadge(pumpOn) {
    if (pumpOn) {
        liveBadge.className = "badge bg-danger live-badge p-2";
        liveBadge.innerText = "● LIVE - Pump ON";
    } else {
        liveBadge.className = "badge bg-success live-badge p-2";
        liveBadge.innerText = "● Unconnected - Pump OFF";
    }
}

// ================= PLAY ALERT SOUND =================
function playAlertSound() {
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Audio play failed:", e));
    }
}

// ================= ADD ALERT TO UI =================
function addAlertToUI(alertId, message, type) {
    if (!alertsBox) return;
    if (document.getElementById(`alert-${alertId}`)) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const alertClass = type === 'critical' ? 'alert-critical' : (type === 'warning' ? 'alert-warning' : 'alert-success');
    const icon = type === 'critical' ? '🚨' : (type === 'warning' ? '⚠️' : '✅');
    
    if (alertsBox.querySelector('.no-alerts-message')) {
        alertsBox.innerHTML = '';
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.id = `alert-${alertId}`;
    alertDiv.className = `alert-item ${alertClass}`;
    alertDiv.innerHTML = `
        <div>${icon}</div>
        <div class="flex-grow-1"><strong>${message}</strong><div class="small opacity-75">${timeStr}</div></div>
        <button class="btn-close btn-sm" onclick="dismissAlert('${alertId}')" style="background: none; border: none; cursor: pointer; font-size: 12px;">✕</button>
    `;
    alertsBox.insertBefore(alertDiv, alertsBox.firstChild);
    
    if (type === 'critical') playAlertSound();
    
    while (alertsBox.children.length > 8) alertsBox.removeChild(alertsBox.lastChild);
}

window.dismissAlert = function(alertId) {
    const alert = document.getElementById(`alert-${alertId}`);
    if (alert) alert.remove();
    setTimeout(showNoAlertsMessage, 100);
};

function removeResolvedAlert(alertId) {
    const alert = document.getElementById(`alert-${alertId}`);
    if (alert) alert.remove();
}

function showNoAlertsMessage() {
    if (alertsBox && alertsBox.children.length === 0) {
        const noAlertsDiv = document.createElement('div');
        noAlertsDiv.className = 'no-alerts-message text-center py-4 text-gray-500';
        noAlertsDiv.innerText = '✅ No active alerts - All systems normal';
        alertsBox.appendChild(noAlertsDiv);
    }
}

// ================= INTELLIGENT AI CONTROL =================
function calculateWaterNeed(d) {
    let needScore = 0;
    if (d.soil < 20) needScore += 60;
    else if (d.soil < 30) needScore += 50;
    else if (d.soil < 40) needScore += 35;
    else if (d.soil < 50) needScore += 20;
    else if (d.soil > 70) needScore -= 15;
    
    if (d.temp > 38) needScore += 25;
    else if (d.temp > 33) needScore += 18;
    else if (d.temp > 28) needScore += 10;
    else if (d.temp < 15) needScore -= 10;
    
    if (d.hum < 25) needScore += 15;
    else if (d.hum < 35) needScore += 10;
    else if (d.hum > 75) needScore -= 10;
    
    const waterPercent = waterCmToPercent(d.water);
    if (waterPercent < 15) needScore = 0;
    else if (waterPercent < 30) needScore *= 0.5;
    if (weatherRainExpected) needScore *= 0.6;
    
    return Math.min(100, Math.max(0, Math.round(needScore)));
}

function runAI(d) {
    if (!isAIActive) return;
    const waterNeed = calculateWaterNeed(d);
    const waterPercent = waterCmToPercent(d.water);
    const tankHasWater = waterPercent > 15;
    let shouldRun = false, reason = "";
    
    if (waterNeed > 50 && tankHasWater && !weatherRainExpected) {
        shouldRun = true;
        reason = `Soil dry (${d.soil}%) + Heat (${d.temp}°C)`;
    } else if (waterNeed > 70 && tankHasWater) {
        shouldRun = true;
        reason = `Critical dryness (${waterNeed}% need)`;
    } else if (waterNeed < 25) {
        shouldRun = false;
        reason = "Soil moisture sufficient";
    } else if (!tankHasWater) {
        shouldRun = false;
        reason = "Low water tank";
    } else if (weatherRainExpected && waterNeed < 55) {
        shouldRun = false;
        reason = "Rain expected";
    }
    
    if (shouldRun !== lastPumpState) {
        pumpRef.set(shouldRun ? 1 : 0);
        lastPumpState = shouldRun;
        addAlertToUI(`ai_action_${Date.now()}`, `🤖 AI: ${shouldRun ? "Started irrigation" : "Stopped irrigation"} (${reason})`, 'success');
        setTimeout(() => removeResolvedAlert(`ai_action_${Date.now()}`), 5000);
    }
    
    const insightText = document.getElementById("smartInsight");
    if (insightText) insightText.innerHTML = shouldRun ? `🤖 AI: Watering (Need: ${waterNeed}%)` : `🤖 AI: Idle - ${reason}`;
}

// ================= AI TOGGLE =================
const aiToggleBtn = document.getElementById("aiToggle");
if (aiToggleBtn) {
    aiToggleBtn.onclick = () => {
        isAIActive = !isAIActive;
        aiToggleBtn.innerHTML = isAIActive ? "🤖 AI: ON" : "🤖 AI: OFF";
        aiToggleBtn.classList.toggle("ai-active", isAIActive);
        
        if (isAIActive) {
            addAlertToUI(`ai_mode_${Date.now()}`, "🤖 AI mode activated - Automatic irrigation control", "success");
            setTimeout(() => removeResolvedAlert(`ai_mode_${Date.now()}`), 5000);
            pumpToggle.disabled = true;
            pumpToggle.style.opacity = "0.5";
            if (currentSensorData) runAI(currentSensorData);
        } else {
            addAlertToUI(`manual_mode_${Date.now()}`, "👤 Manual mode - You control the pump", "success");
            setTimeout(() => removeResolvedAlert(`manual_mode_${Date.now()}`), 5000);
            pumpToggle.disabled = false;
            pumpToggle.style.opacity = "1";
        }
    };
}

// ================= CREATE CHART =================
function createChart() {
    const ctx = document.getElementById("analyticsChart");
    if (!ctx) return;
    
    chart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [
            { label: "Temperature (°C)", data: [], borderColor: "#ff6384", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Humidity (%)", data: [], borderColor: "#36a2eb", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Soil Moisture (%)", data: [], borderColor: "#4bc0c0", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 },
            { label: "Water Level (%)", data: [], borderColor: "#ffcd56", backgroundColor: "transparent", tension: 0.3, fill: false, pointRadius: 3 }
        ]},
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: "index", intersect: false },
            plugins: { tooltip: { enabled: true }, legend: { position: "top" } },
            scales: { y: { min: 0, max: 100, title: { display: true, text: "Value" } }, x: { title: { display: true, text: "Time Period" }, ticks: { autoSkip: true, maxRotation: 45 } } }
        }
    });
}

// ================= HISTORY LISTENER =================
db.ref("history").on("value", snap => {
    historyData = [];
    const hourMap = new Map();
    
    snap.forEach(child => {
        const v = child.val();
        if (!v) return;
        const waterPercent = waterCmToPercent(v.water);
        const date = new Date(v.time);
        const hourKey = `${date.toDateString()}_${date.getHours()}`;
        
        if (!hourMap.has(hourKey) || v.time > hourMap.get(hourKey).time) {
            hourMap.set(hourKey, {
                temp: +v.temp || 0, hum: +v.hum || 0, soil: +v.soil || 0,
                water: waterPercent, waterRaw: v.water,
                time: +v.time || Date.now(), hour: date.getHours(), date: date
            });
        }
    });
    
    historyData = Array.from(hourMap.values());
    historyData.sort((a, b) => a.time - b.time);
    buildChart();
});

// ================= UPDATE CARD COLORS =================
function updateCardColors(temp, hum, soil, pumpOn) {
    cardTemp.classList.remove('temp-critical', 'temp-hot', 'temp-normal', 'temp-cold');
    if (temp > 40) { cardTemp.classList.add('temp-critical'); document.getElementById('tempStatus').innerHTML = 'Critical 🔥'; }
    else if (temp > 35) { cardTemp.classList.add('temp-hot'); document.getElementById('tempStatus').innerHTML = 'Hot 🔥'; }
    else if (temp < 15) { cardTemp.classList.add('temp-cold'); document.getElementById('tempStatus').innerHTML = 'Cold ❄️'; }
    else { cardTemp.classList.add('temp-normal'); document.getElementById('tempStatus').innerHTML = 'Normal ✅'; }
    
    cardHum.classList.remove('hum-critical', 'hum-wet', 'hum-normal', 'hum-dry');
    if (hum < 20) { cardHum.classList.add('hum-critical'); document.getElementById('humStatus').innerHTML = 'Critical 🚨'; }
    else if (hum > 75) { cardHum.classList.add('hum-wet'); document.getElementById('humStatus').innerHTML = 'Wet 💧'; }
    else if (hum < 35) { cardHum.classList.add('hum-dry'); document.getElementById('humStatus').innerHTML = 'Dry 💨'; }
    else { cardHum.classList.add('hum-normal'); document.getElementById('humStatus').innerHTML = 'Comfortable ✅'; }
    
    cardSoil.classList.remove('soil-critical', 'soil-wet', 'soil-optimal', 'soil-dry');
    if (soil < 20) { cardSoil.classList.add('soil-critical'); document.getElementById('soilStatus').innerHTML = 'Critical 🚨'; }
    else if (soil > 80) { cardSoil.classList.add('soil-wet'); document.getElementById('soilStatus').innerHTML = 'Overwatered 🌊'; }
    else if (soil < 35) { cardSoil.classList.add('soil-dry'); document.getElementById('soilStatus').innerHTML = 'Dry 🏜️'; }
    else { cardSoil.classList.add('soil-optimal'); document.getElementById('soilStatus').innerHTML = 'Optimal 🌿'; }
    
    if (pumpOn) { cardPump.classList.add('pump-on'); cardPump.classList.remove('pump-off'); }
    else { cardPump.classList.add('pump-off'); cardPump.classList.remove('pump-on'); }
}

// ================= FEATURE CARDS UPDATE =================
function updateWaterPrediction(d) {
    let msg = "Stable ✅";
    if (d.soil < 25) msg = "Water needed soon 🚨";
    else if (d.hum > 80) msg = "Rain expected 🌧";
    const el = document.getElementById("waterPrediction");
    if (el) el.innerText = msg;
}

function updateSystemHealth(d) {
    let score = 100;
    if (d.temp > 40) score -= 25;
    if (d.soil < 25) score -= 35;
    if (d.hum < 25) score -= 20;
    const waterPercent = waterCmToPercent(d.water);
    if (waterPercent < 20) score -= 20;
    let status = score > 70 ? "Excellent ✅" : (score > 40 ? "Warning ⚠️" : "Critical 🚨");
    const el = document.getElementById("systemHealth");
    if (el) el.innerText = status + " (" + Math.max(0, score) + "%)";
}

function updateSmartInsight(d) {
    let msg = "✅ System Optimal";
    if (d.soil < 25 && d.temp > 32) msg = "🚿 ACTION: Start watering now";
    else if (d.soil < 20) msg = "🚨 ACTION: Immediate irrigation required";
    else if (d.hum > 85) msg = "⏸ ACTION: Stop watering (Rain expected)";
    else if (waterCmToPercent(d.water) < 20) msg = "⚠️ ACTION: Refill water tank";
    else if (d.temp > 38) msg = "🔥 ACTION: Provide shade, extreme heat";
    else if (d.hum < 25) msg = "💨 ACTION: Increase humidity";
    const el = document.getElementById("smartInsight");
    if (el && !isAIActive) el.innerText = msg;
}

function updatePlantStress(d) {
    let stress = 0;
    if (d.temp > 35) stress += 30;
    if (d.soil < 30) stress += 45;
    if (d.hum < 30) stress += 25;
    let level = stress > 70 ? "High 🚨" : (stress > 40 ? "Medium ⚠️" : "Low 🌿");
    const el = document.getElementById("plantStress");
    if (el) el.innerText = level + " (" + stress + "%)";
}

// ================= LIVE SENSOR LISTENER =================
db.ref("sensors").on("value", async (snap) => {
    const d = snap.val();
    if (!d) return;
    
    currentSensorData = d;
    envTemp.innerText = d.temp + " °C";
    envHum.innerText = d.hum + " %";
    envSoil.innerText = d.soil + " %";
    
    const waterPercent = waterCmToPercent(d.water);
    const volume = waterCmToLiters(d.water);
    const waterHeightCm = getWaterHeightCm(d.water);
    
    tankFill.style.height = waterPercent + "%";
    tankPercent.innerText = Math.round(waterPercent) + "%";
    tankLiters.innerText = volume.toFixed(2) + " L";
    if (tankCmValue) tankCmValue.innerText = waterHeightCm.toFixed(1) + " cm";
    
    const pumpSnapshot = await pumpRef.once('value');
    updateCardColors(d.temp, d.hum, d.soil, pumpSnapshot.val() === 1);
    updateWaterPrediction(d);
    updateSystemHealth(d);
    updateSmartInsight(d);
    updatePlantStress(d);
    handleSensorAlerts(d);
    
    const now = new Date();
    const existingIndex = historyData.findIndex(item => {
        const itemDate = new Date(item.time);
        return itemDate.toDateString() === now.toDateString() && itemDate.getHours() === now.getHours();
    });
    
    const newEntry = { temp: d.temp, hum: d.hum, soil: d.soil, water: waterPercent, waterRaw: d.water, time: Date.now(), hour: now.getHours(), date: now };
    
    if (existingIndex >= 0) {
        historyData[existingIndex] = newEntry;
    } else {
        historyData.push(newEntry);
        await db.ref('history').push({ temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: Date.now() });
    }
    
    historyData.sort((a, b) => a.time - b.time);
    if (historyData.length > 48) historyData = historyData.slice(-48);
    
    buildChart();
    if (isAIActive) runAI(d);
    trackConsumption(waterPercent);
});

function buildChart() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => ds.data = []);
    if (historyData.length === 0) { chart.update(); return; }
    
    if (mode === "hour") {
        const displayData = historyData.slice(-12);
        displayData.forEach(d => {
            const date = new Date(d.time);
            let hour = date.getHours();
            let ampm = hour >= 12 ? 'PM' : 'AM';
            let hour12 = hour % 12 || 12;
            chart.data.labels.push(`${hour12}:00 ${ampm}`);
            chart.data.datasets[0].data.push(d.temp);
            chart.data.datasets[1].data.push(d.hum);
            chart.data.datasets[2].data.push(d.soil);
            chart.data.datasets[3].data.push(d.water);
        });
    } else if (mode === "day") {
        const dailyMap = new Map();
        historyData.forEach(d => {
            const dayKey = new Date(d.time).toLocaleDateString("en-GB");
            if (!dailyMap.has(dayKey) || d.time > dailyMap.get(dayKey).time) {
                dailyMap.set(dayKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: dayKey });
            }
        });
        Array.from(dailyMap.values()).slice(-7).forEach(day => {
            chart.data.labels.push(day.label);
            chart.data.datasets[0].data.push(day.temp);
            chart.data.datasets[1].data.push(day.hum);
            chart.data.datasets[2].data.push(day.soil);
            chart.data.datasets[3].data.push(day.water);
        });
    } else if (mode === "month") {
        const monthlyMap = new Map();
        historyData.forEach(d => {
            const monthKey = new Date(d.time).toLocaleDateString("en-GB", { month: 'short', year: 'numeric' });
            if (!monthlyMap.has(monthKey) || d.time > monthlyMap.get(monthKey).time) {
                monthlyMap.set(monthKey, { temp: d.temp, hum: d.hum, soil: d.soil, water: d.water, time: d.time, label: monthKey });
            }
        });
        Array.from(monthlyMap.values()).slice(-6).forEach(month => {
            chart.data.labels.push(month.label);
            chart.data.datasets[0].data.push(month.temp);
            chart.data.datasets[1].data.push(month.hum);
            chart.data.datasets[2].data.push(month.soil);
            chart.data.datasets[3].data.push(month.water);
        });
    }
    chart.update();
}

// ================= PUMP CONTROL =================
const pumpRef = db.ref("controls/pump");
pumpRef.on("value", snap => {
    const val = !!snap.val();
    lastPumpState = val;
    pumpText.innerText = val ? "ON" : "OFF";
    if (!isAIActive) {
        pumpToggle.checked = val;
        pumpToggle.disabled = false;
        pumpToggle.style.opacity = "1";
    } else {
        pumpToggle.disabled = true;
        pumpToggle.checked = val;
        pumpToggle.style.opacity = "0.5";
    }
    updateBadge(val);
    if (currentSensorData) updateCardColors(currentSensorData.temp, currentSensorData.hum, currentSensorData.soil, val);
});

pumpToggle.onchange = e => {
    if (isAIActive) {
        addAlertToUI(`pump_warning_${Date.now()}`, "AI is controlling the pump. Turn off AI mode for manual control.", "warning");
        setTimeout(() => removeResolvedAlert(`pump_warning_${Date.now()}`), 5000);
        setTimeout(() => pumpRef.once("value", snap => { pumpToggle.checked = snap.val() === 1; }), 10);
        return;
    }
    pumpRef.set(e.target.checked ? 1 : 0);
    addAlertToUI(`pump_action_${Date.now()}`, `Pump manually turned ${e.target.checked ? "ON" : "OFF"}`, "success");
    setTimeout(() => removeResolvedAlert(`pump_action_${Date.now()}`), 5000);
};

function trackConsumption(percent) {
    if (lastWaterLevel !== null && percent < lastWaterLevel) {
        let diff = lastWaterLevel - percent;
        if (diff > 0 && diff < 50) {
            consumptionHistory.push(diff);
            let total = consumptionHistory.reduce((a, b) => a + b, 0);
            const el = document.getElementById("waterUsage");
            if (el) el.innerText = total.toFixed(2) + "% used";
            if (consumptionHistory.length > 20) consumptionHistory.shift();
        }
    }
    lastWaterLevel = percent;
}

// ================= PERSISTENT SENSOR ALERTS =================
function handleSensorAlerts(d) {
    const waterPercent = waterCmToPercent(d.water);
    
    if (d.soil < 20 && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = true;
        addAlertToUI("soil_critical", "🚨 CRITICAL: Soil is extremely dry (" + d.soil + "%) - Immediate watering required!", "critical");
    } else if (d.soil >= 25 && activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_critical = false;
        removeResolvedAlert("soil_critical");
        addAlertToUI(`soil_recovered_${Date.now()}`, "✅ Soil moisture recovered to " + d.soil + "%", "success");
        setTimeout(() => removeResolvedAlert(`soil_recovered_${Date.now()}`), 5000);
    } else if (d.soil >= 20 && d.soil < 30 && !activeAlertConditions.soil_warning && !activeAlertConditions.soil_critical) {
        activeAlertConditions.soil_warning = true;
        addAlertToUI("soil_warning", "⚠️ WARNING: Low soil moisture (" + d.soil + "%) - Consider watering soon", "warning");
    } else if (d.soil >= 30 && activeAlertConditions.soil_warning) {
        activeAlertConditions.soil_warning = false;
        removeResolvedAlert("soil_warning");
    }
    
    if (d.temp > 42 && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = true;
        addAlertToUI("temp_critical", "🚨 CRITICAL: Extreme temperature detected (" + d.temp + "°C) - Plants at risk!", "critical");
    } else if (d.temp <= 40 && activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_critical = false;
        removeResolvedAlert("temp_critical");
        addAlertToUI(`temp_recovered_${Date.now()}`, "✅ Temperature normalized to " + d.temp + "°C", "success");
        setTimeout(() => removeResolvedAlert(`temp_recovered_${Date.now()}`), 5000);
    } else if (d.temp > 38 && d.temp <= 42 && !activeAlertConditions.temp_warning && !activeAlertConditions.temp_critical) {
        activeAlertConditions.temp_warning = true;
        addAlertToUI("temp_warning", "⚠️ WARNING: High temperature (" + d.temp + "°C) - Monitor plants closely", "warning");
    } else if (d.temp <= 38 && activeAlertConditions.temp_warning) {
        activeAlertConditions.temp_warning = false;
        removeResolvedAlert("temp_warning");
    }
    
    if (waterPercent < 15 && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = true;
        addAlertToUI("water_critical", "🚨 CRITICAL: Water tank critically low (" + Math.round(waterPercent) + "%) - Refill immediately!", "critical");
    } else if (waterPercent >= 20 && activeAlertConditions.water_critical) {
        activeAlertConditions.water_critical = false;
        removeResolvedAlert("water_critical");
        addAlertToUI(`water_recovered_${Date.now()}`, "✅ Water tank level recovered to " + Math.round(waterPercent) + "%", "success");
        setTimeout(() => removeResolvedAlert(`water_recovered_${Date.now()}`), 5000);
    } else if (waterPercent >= 15 && waterPercent < 30 && !activeAlertConditions.water_warning && !activeAlertConditions.water_critical) {
        activeAlertConditions.water_warning = true;
        addAlertToUI("water_warning", "⚠️ WARNING: Water tank low (" + Math.round(waterPercent) + "%) - Consider refilling", "warning");
    } else if (waterPercent >= 30 && activeAlertConditions.water_warning) {
        activeAlertConditions.water_warning = false;
        removeResolvedAlert("water_warning");
    }
    
    if (d.hum < 20 && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = true;
        addAlertToUI("hum_critical", "🚨 CRITICAL: Extremely low humidity (" + d.hum + "%) - Plants drying out fast!", "critical");
    } else if (d.hum >= 25 && activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_critical = false;
        removeResolvedAlert("hum_critical");
        addAlertToUI(`hum_recovered_${Date.now()}`, "✅ Humidity recovered to " + d.hum + "%", "success");
        setTimeout(() => removeResolvedAlert(`hum_recovered_${Date.now()}`), 5000);
    } else if (d.hum >= 20 && d.hum < 30 && !activeAlertConditions.hum_warning && !activeAlertConditions.hum_critical) {
        activeAlertConditions.hum_warning = true;
        addAlertToUI("hum_warning", "⚠️ WARNING: Low humidity (" + d.hum + "%) - Monitor plant health", "warning");
    } else if (d.hum >= 30 && activeAlertConditions.hum_warning) {
        activeAlertConditions.hum_warning = false;
        removeResolvedAlert("hum_warning");
    }
    
    setTimeout(showNoAlertsMessage, 100);
}

// ================= CHART MODE SETTER =================
window.setMode = function(m) {
    mode = m;
    buildChart();
};

// ================= WEATHER =================
const WEATHER_API_KEY = "5dd74768dc40a34a27ac51503c655bec";
const CITY = "Port Said";

window.loadWeather = async function() {
    const weatherMain = document.getElementById("weatherMain");
    const weatherForecast = document.getElementById("weatherForecast");
    const refreshBtn = document.getElementById("weatherRefreshBtn");
    
    if (!weatherMain || !weatherForecast) return;
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refresh';
    }
    
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`);
        const data = await res.json();
        if (data.cod !== "200") throw new Error();
        
        const now = new Date();
        weatherMain.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div><h5 class="mb-0">📍 ${CITY}</h5><small>${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</small></div>
                <div class="text-end"><div class="display-6">${Math.round(data.list[0].main.temp)}°C</div><small>${data.list[0].weather[0].description}</small></div>
            </div>
        `;
        
        weatherRainExpected = data.list.some(i => i.weather[0].main.toLowerCase().includes("rain"));
        
        let forecastHtml = '';
        data.list.slice(0, 6).forEach(item => {
            const time = new Date(item.dt_txt);
            forecastHtml += `<div class="forecast-item"><div class="small">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" width="35"><div class="fw-bold">${Math.round(item.main.temp)}°C</div><small class="d-block">${item.weather[0].description}</small></div>`;
        });
        weatherForecast.innerHTML = forecastHtml;
        
        if (weatherRainExpected && !activeAlertConditions.rain_alert) {
            activeAlertConditions.rain_alert = true;
            addAlertToUI("rain_alert", "🌧 Rain forecast detected - AI may adjust irrigation schedule", "warning");
        } else if (!weatherRainExpected && activeAlertConditions.rain_alert) {
            activeAlertConditions.rain_alert = false;
            removeResolvedAlert("rain_alert");
        }
    } catch (err) {
        console.error(err);
        weatherMain.innerHTML = "❌ Weather connection error";
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    }
};

// ================= PDF REPORT - WITH WORKING CHARTS =================
async function captureChartAsImage() {
    return new Promise((resolve) => {
        setTimeout(() => {
            const canvas = document.getElementById("analyticsChart");
            if (canvas) {
                try {
                    const imgData = canvas.toDataURL("image/png", 1.0);
                    resolve(imgData);
                } catch(e) {
                    console.warn("Chart capture failed", e);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        }, 800);
    });
}

window.downloadPDF = async function(reportType) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        let y = 25;
        
        const originalMode = mode;
        mode = reportType;
        buildChart();
        
        // Wait for chart to render and capture
        await new Promise(r => setTimeout(r, 800));
        const chartImage = await captureChartAsImage();
        
        const primary = [41, 128, 185];
        const dark = [44, 62, 80];
        const lightGray = [245, 245, 245];
        
        // Header
        doc.setFillColor(...primary);
        doc.rect(0, 0, 297, 35, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("HydroGen Smart Report", 20, 22);
        doc.setFontSize(12);
        doc.text(`${reportType.toUpperCase()} REPORT`, 20, 32);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 20);
        
        // Current Readings
        doc.setTextColor(0, 0, 0);
        y = 50;
        doc.setFontSize(14);
        doc.setTextColor(...dark);
        doc.text("Current Sensor Readings", 20, y);
        y += 10;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text(`Temperature: ${envTemp.innerText}`, 20, y); y += 8;
        doc.text(`Humidity: ${envHum.innerText}`, 20, y); y += 8;
        doc.text(`Soil Moisture: ${envSoil.innerText}`, 20, y); y += 8;
        
        const sensors = await db.ref('sensors').once('value');
        const waterCm = sensors.val()?.water || 30;
        doc.text(`Water Level: ${Math.round(waterCmToPercent(waterCm))}%`, 20, y); y += 15;
        
        // CHART - Now properly captured
        if (chartImage) {
            doc.addImage(chartImage, "PNG", 20, y, 250, 90);
            y += 100;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(150, 150, 150);
            doc.text("Chart temporarily unavailable", 20, y);
            y += 15;
        }
        
        // Data Table
        doc.setFontSize(14);
        doc.setTextColor(...dark);
        doc.text("Historical Data Summary", 20, y); y += 10;
        
        doc.setFillColor(...primary);
        doc.rect(20, y, 257, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("Time Period", 22, y + 5);
        doc.text("Temp (°C)", 90, y + 5);
        doc.text("Humidity (%)", 140, y + 5);
        doc.text("Soil (%)", 190, y + 5);
        doc.text("Water (%)", 240, y + 5);
        y += 8;
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        
        let displayData = [];
        if (reportType === "hour") {
            displayData = historyData.slice(-12).map(d => {
                const date = new Date(d.time);
                let hour = date.getHours();
                let ampm = hour >= 12 ? 'PM' : 'AM';
                let hour12 = hour % 12 || 12;
                return { label: `${hour12.toString().padStart(2, ' ')}:00 ${ampm}`, temp: d.temp, hum: d.hum, soil: d.soil, water: d.water };
            });
        } else if (reportType === "day") {
            const dailyMap = new Map();
            historyData.forEach(d => {
                const dayKey = new Date(d.time).toLocaleDateString("en-GB");
                if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { temp: [], hum: [], soil: [], water: [] });
                const g = dailyMap.get(dayKey);
                g.temp.push(d.temp); g.hum.push(d.hum); g.soil.push(d.soil); g.water.push(d.water);
            });
            displayData = Array.from(dailyMap.entries()).map(([label, vals]) => ({
                label: label,
                temp: vals.temp.reduce((a,b)=>a+b,0)/vals.temp.length,
                hum: vals.hum.reduce((a,b)=>a+b,0)/vals.hum.length,
                soil: vals.soil.reduce((a,b)=>a+b,0)/vals.soil.length,
                water: vals.water.reduce((a,b)=>a+b,0)/vals.water.length
            })).slice(-7);
        } else {
            const monthlyMap = new Map();
            historyData.forEach(d => {
                const monthKey = new Date(d.time).toLocaleDateString("en-GB", { month: 'short', year: 'numeric' });
                if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, { temp: [], hum: [], soil: [], water: [] });
                const g = monthlyMap.get(monthKey);
                g.temp.push(d.temp); g.hum.push(d.hum); g.soil.push(d.soil); g.water.push(d.water);
            });
            displayData = Array.from(monthlyMap.entries()).map(([label, vals]) => ({
                label: label,
                temp: vals.temp.reduce((a,b)=>a+b,0)/vals.temp.length,
                hum: vals.hum.reduce((a,b)=>a+b,0)/vals.hum.length,
                soil: vals.soil.reduce((a,b)=>a+b,0)/vals.soil.length,
                water: vals.water.reduce((a,b)=>a+b,0)/vals.water.length
            })).slice(-6);
        }
        
        for (let i = 0; i < displayData.length; i++) {
            const item = displayData[i];
            if (y > 190) { 
                doc.addPage(); 
                y = 25;
                doc.setFillColor(...primary);
                doc.rect(20, y, 257, 8, "F");
                doc.setTextColor(255, 255, 255);
                doc.text("Time Period", 22, y + 5);
                doc.text("Temp (°C)", 90, y + 5);
                doc.text("Humidity (%)", 140, y + 5);
                doc.text("Soil (%)", 190, y + 5);
                doc.text("Water (%)", 240, y + 5);
                y += 8;
                doc.setTextColor(0, 0, 0);
            }
            if (i % 2 === 0) { doc.setFillColor(...lightGray); doc.rect(20, y, 257, 7, "F"); }
            doc.setDrawColor(200);
            doc.rect(20, y, 257, 7);
            doc.text(item.label, 22, y + 5);
            doc.text(item.temp.toFixed(1), 95, y + 5);
            doc.text(item.hum.toFixed(1), 145, y + 5);
            doc.text(item.soil.toFixed(1), 195, y + 5);
            doc.text(item.water.toFixed(1), 245, y + 5);
            y += 7;
        }
        
        // Footer
        doc.setFillColor(...primary);
        doc.rect(0, 200, 297, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("HydroGen AI System © 2026 - Smart Irrigation • Data Driven • Sustainable", 20, 207);
        
        mode = originalMode;
        buildChart();
        doc.save(`HydroGen_${reportType}_Report.pdf`);
        addAlertToUI(`pdf_${Date.now()}`, `📄 ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report downloaded`, "success");
        setTimeout(() => removeResolvedAlert(`pdf_${Date.now()}`), 5000);
        
    } catch (error) {
        console.error("PDF Error:", error);
        addAlertToUI(`pdf_error_${Date.now()}`, "❌ Failed to generate PDF report", "warning");
        setTimeout(() => removeResolvedAlert(`pdf_error_${Date.now()}`), 5000);
    }
};

// ================= AI CHAT ASSISTANT =================
function initAIChat() {
    if (chatInitialized) return;
    chatInitialized = true;
    setTimeout(() => {
        addChatMessage("AI", "👋 Hello! I'm HydroGen AI Assistant. I can see your current sensor readings and help you optimize your irrigation. Ask me anything!", "ai");
    }, 1000);
}

const AI_API = "https://openrouter.ai/api/v1/chat/completions";
const AI_KEY = "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";

async function sendMessage() {
    const userInput = document.getElementById("userInput");
    const msg = userInput.value.trim();
    if (!msg) return;
    addChatMessage("You", msg);
    userInput.value = "";
    addChatMessage("AI", "Typing...", "typing");
    try {
        const res = await fetch(AI_API, {
            method: "POST",
            headers: { "Authorization": `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-3.5-turbo",
                messages: [{ role: "system", content: getSystemContext() }, { role: "user", content: msg }]
            })
        });
        const data = await res.json();
        removeTyping();
        addChatMessage("AI", data.choices?.[0]?.message?.content || "AI error");
    } catch(e) {
        removeTyping();
        addChatMessage("AI", "❌ AI connection failed");
    }
}

function getSystemContext() {
    return `You are HydroGen AI assistant. Current readings: Temp: ${envTemp.innerText}, Humidity: ${envHum.innerText}, Soil: ${envSoil.innerText}, Pump: ${pumpText.innerText}, AI Mode: ${isAIActive ? "ON" : "OFF"}, Rain Expected: ${weatherRainExpected ? "Yes" : "No"}. Provide short, helpful advice.`;
}

function addChatMessage(sender, text, type = "normal") {
    const chatBox = document.getElementById("chatBox");
    if (!chatBox) return;
    if (type !== "typing") removeTyping();
    const div = document.createElement("div");
    div.className = `msg ${sender.toLowerCase()} ${type}`;
    div.innerHTML = `<span><b>${sender === 'AI' ? '🤖 HydroGen AI' : '👤 You'}:</b><br>${text.replace(/\n/g, '<br>')}</span>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTyping() { document.querySelectorAll(".typing").forEach(e => e.remove()); }

window.quickAsk = function(q) { document.getElementById("userInput").value = q; sendMessage(); };
window.toggleChat = function() {
    const w = document.getElementById("chatWindow");
    if (w) w.style.display = w.style.display === "flex" ? "none" : "flex";
};

// ================= INITIALIZE =================
createChart();
loadWeather();
setInterval(loadWeather, 300000);
setTimeout(() => initAIChat(), 2000);
showNoAlertsMessage();