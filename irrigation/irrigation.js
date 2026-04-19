// ================= IRRIGATION.JS - COMPLETE FIXED VERSION =================
// Fixed: Edit schedule updates schedule history, zone soil target works per zone, emergency stop works

// ── Auth Guard ──
(function () {
  if (!localStorage.getItem("hydroUser")) {
    window.location.replace("../landing/landing.html");
  }
})();

const database = window.hydroGenDB;
const currentUserId = "fcyeSoWkmqcfqgafPCQAN6vtV5M2";

// DOM Elements
let zones = [];
let schedules = [];
let currentPumpState = false;
let activityLog = [];

// Sensor data cache for AI
let currentSensorData = {
    temp: 0,
    hum: 0,
    soil: 0,
    water: 30
};

// Tank constants
const maxTankLevelCm = 30;
const maxCapacityLiters = 2;

// Chat state
let chatInitialized = false;

// ===================== HELPER FUNCTIONS =====================
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

function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : 'info'} position-fixed bottom-0 end-0 m-3`;
    toast.setAttribute("role", "alert");
    toast.style.zIndex = "9999";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.background = type === 'success' ? '#10b981' : '#3b82f6';
    toast.style.color = "white";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.zIndex = "9999";
    toast.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; margin-left: 10px;">✕</button></div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function addAlert(type, message) {
    const container = document.getElementById('alertsList');
    if (!container) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const alertClass = type === 'critical' ? 'alert-critical' : (type === 'warning' ? 'alert-warning' : 'alert-success');
    const icon = type === 'critical' ? '🚨' : (type === 'warning' ? '⚠️' : '✅');
    
    if (container.querySelector('.text-gray-400')) container.innerHTML = '';
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert-item ${alertClass}`;
    alertDiv.innerHTML = `<div>${icon}</div><div class="flex-grow-1"><strong>${message}</strong><div class="small opacity-75">${timeStr}</div></div><button class="btn-close btn-sm" onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer;">✕</button>`;
    container.insertBefore(alertDiv, container.firstChild);
    while (container.children.length > 5) container.removeChild(container.lastChild);
    if (type === 'success') setTimeout(() => alertDiv.remove(), 5000);
}

async function saveActivityLog(message, type) {
    const logEntry = {
        id: Date.now(),
        message: message,
        type: type,
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    await database.ref(`users_w/${currentUserId}/activityLog/${logEntry.id}`).set(logEntry);
    await loadActivityLog();
}

// ===================== LOAD DATA FROM FIREBASE =====================
async function loadZones() {
    console.log("Loading zones for user:", currentUserId);
    const snapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
    const data = snapshot.val();
    zones = data ? Object.values(data) : [];
    console.log("Zones loaded:", zones.length);
    renderZones();
    updateScheduleSelect();
    updateEditScheduleSelect();
}

async function loadSchedules() {
    const snapshot = await database.ref(`users_w/${currentUserId}/schedules`).once('value');
    const data = snapshot.val();
    schedules = data ? Object.values(data) : [];
    renderSchedules();
}

async function loadActivityLog() {
    const snapshot = await database.ref(`users_w/${currentUserId}/activityLog`).limitToLast(10).once('value');
    const data = snapshot.val();
    activityLog = data ? Object.values(data).reverse() : [];
    renderActivityLog();
}

// ===================== RENDER ZONES =====================
function renderZones() {
    const container = document.getElementById('zonesGrid');
    if (!container) return;

    if (zones.length === 0) {
        container.innerHTML = `
            <div class="col-span-3 text-center py-12">
                <i class="fas fa-seedling text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-400">No zones configured. Click + Add Zone to get started!</p>
                <button onclick="showAddZoneModal()" class="mt-4 px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition shadow-md">
                    + Add Your First Zone
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = zones.map(zone => {
        // Each zone gets its own soil moisture value (from sensor, but stored per zone)
        const zoneSoilKey = `zoneSoil_${zone.id}`;
        let zoneSoil = currentSensorData.soil;
        
        // Try to get zone-specific soil from localStorage or use global
        const savedZoneSoil = localStorage.getItem(zoneSoilKey);
        if (savedZoneSoil) {
            zoneSoil = parseInt(savedZoneSoil);
        }
        
        const waterNeed = calculateWaterNeed(zone, zoneSoil);
        const needColor = waterNeed > 70 ? '#ef4444' : (waterNeed > 40 ? '#f59e0b' : '#10b981');
        
        return `
            <div class="zone-card ${zone.isRunning ? 'running' : ''}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">${zone.icon || '🌱'}</span>
                            <h5 class="font-bold mb-0 text-gray-800 dark:text-white">${escapeHtml(zone.name)}</h5>
                        </div>
                        <small class="text-muted text-gray-500 dark:text-gray-400">${zone.lastWatered ? `Last: ${new Date(zone.lastWatered).toLocaleTimeString()}` : 'Not watered yet'}</small>
                    </div>
                    <span class="status-badge ${zone.isRunning ? 'status-running' : 'status-active'}">
                        ${zone.isRunning ? '⏺ RUNNING' : '● ACTIVE'}
                    </span>
                </div>
                
                <div class="flex justify-around items-center my-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-gray-800 dark:text-white" id="soil-${zone.id}">${zoneSoil}%</div>
                        <small class="text-muted text-gray-500 dark:text-gray-400">Soil</small>
                        <div class="soil-meter mt-2" style="width: 70px;">
                            <div class="soil-fill" style="width: ${zoneSoil}%; background: ${needColor};"></div>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-lg font-bold text-white-800 dark:text-white">${zone.waterPerCycle || 10} L</div>
                        <small class="text-muted text-white-500 dark:text-gray-400">Per cycle</small>
                    </div>
                    <div class="text-center">
                        <div class="text-lg font-bold text-white-800 dark:text-white">${zone.duration || 30} min</div>
                        <small class="text-muted text-gray-500 dark:text-gray-400">Duration</small>
                    </div>
                </div>

                <div class=" rounded-3 p-2 mb-3 text-center  dark:bg-gray-700">
                    <i class="fas fa-clock text-success me-1"></i>
                    <span class="small text-gray-700 dark:text-gray-300">Soil Target: ${zone.soilTarget || 60}% | Schedule: ${zone.time || 'Manual'}</span>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="toggleZone('${zone.id}')" class="zone-${zone.isRunning ? 'stop' : 'start'}-btn" style="flex: 1; padding: 8px 16px; border-radius: 40px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; ${zone.isRunning ? 'background: #dc2626; color: white; border: none;' : 'background: #10b981; color: white; border: none;'}">
                        ${zone.isRunning ? '⏹️ STOP' : '▶️ START'}
                    </button>
                    <button onclick="downloadZoneReport('${zone.id}')" class="zone-btn-icon" style="padding: 8px 12px; border-radius: 40px; background: transparent; border: 1.5px solid #d1d5db; cursor: pointer; transition: all 0.2s ease;">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="editZone('${zone.id}')" class="zone-btn-icon" style="padding: 8px 12px; border-radius: 40px; background: transparent; border: 1.5px solid #d1d5db; cursor: pointer; transition: all 0.2s ease;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteZone('${zone.id}')" class="zone-btn-icon" style="padding: 8px 12px; border-radius: 40px; background: transparent; border: 1.5px solid #d1d5db; cursor: pointer; transition: all 0.2s ease;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function calculateWaterNeed(zone, currentSoil) {
    const target = zone.soilTarget || 60;
    let need = 0;
    if (currentSoil < target) {
        need = ((target - currentSoil) / target) * 100;
    }
    return Math.min(100, Math.max(0, Math.round(need)));
}

// ===================== RENDER SCHEDULES =====================
function renderSchedules() {
    const container = document.getElementById('scheduleList');
    if (!container) return;

    if (schedules.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-400">No schedules configured</div>';
        return;
    }

    container.innerHTML = schedules.map(schedule => {
        const zone = zones.find(z => z.id === schedule.zoneId);
        return `
            <div class="schedule-item d-flex justify-content-between align-items-center">
                <div>
                    <div class="fw-semibold text-white-800 dark:text-white">${escapeHtml(schedule.name)}</div>
                    <small class="text-muted text-gray-500 dark:text-gray-400">${zone?.name || 'Unknown'} • ${schedule.time} • ${schedule.duration} min</small>
                    <div class="mt-1">
                        ${schedule.days?.map(day => `<span class="badge bg-secondary me-1" style="background: #6b7280; padding: 2px 8px; border-radius: 12px; font-size: 10px; display: inline-block; margin-right: 4px;color:white;">${day.substring(0,3)}</span>`).join('')}
                    </div>
                </div>
                <div class="flex gap-3">
                   
                    <button onclick="deleteSchedule('${schedule.id}')" class="schedule-delete-btn" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer;padding-top:10px;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ===================== RENDER ACTIVITY LOG =====================
function renderActivityLog() {
    const container = document.getElementById('activityLog');
    if (!container) return;

    if (activityLog.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted text-gray-400">No recent activity</div>';
        return;
    }

    container.innerHTML = activityLog.map(log => `
        <div class="log-item d-flex justify-content-between align-items-center">
            <div>
                <i class="fas ${log.type === 'zone_start' ? 'fa-play text-success' : log.type === 'zone_stop' ? 'fa-stop text-danger' : log.type === 'report' ? 'fa-download text-purple-500' : 'fa-info-circle text-info'} me-2"></i>
                <span class="small text-gray-700 dark:text-gray-300">${escapeHtml(log.message)}</span>
            </div>
            <small class="text-muted text-gray-500">${log.timeStr}</small>
        </div>
    `).join('');
}

// ===================== ZONE ACTIONS =====================
window.toggleZone = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;

    const newState = !zone.isRunning;
    
    if (newState) {
        await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ isRunning: true, lastStartedAt: Date.now() });
        await database.ref('controls/pump').set(1);
        addAlert('success', `Started zone: ${zone.name}`);
        await saveActivityLog(`Started zone: ${zone.name}`, 'zone_start');
        
        const durationMs = (zone.duration || 30) * 60 * 1000;
        setTimeout(async () => {
            const currentZone = await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).once('value');
            if (currentZone.val()?.isRunning) {
                await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({
                    isRunning: false,
                    lastWatered: Date.now(),
                    totalWaterUsed: (zone.totalWaterUsed || 0) + (zone.waterPerCycle || 10),
                    cycles: (zone.cycles || 0) + 1
                });
                const zonesSnapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
                const anyRunning = Object.values(zonesSnapshot.val() || {}).some(z => z.isRunning);
                if (!anyRunning) await database.ref('controls/pump').set(0);
                addAlert('info', `Zone ${zone.name} completed`);
                await saveActivityLog(`Completed: ${zone.name}`, 'zone_complete');
                await loadZones();
            }
        }, durationMs);
        
    } else {
        await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ isRunning: false, manuallyStopped: Date.now() });
        const zonesSnapshot = await database.ref(`users_w/${currentUserId}/zones`).once('value');
        const anyRunning = Object.values(zonesSnapshot.val() || {}).some(z => z.isRunning);
        if (!anyRunning) await database.ref('controls/pump').set(0);
        addAlert('warning', `Stopped zone: ${zone.name}`);
        await saveActivityLog(`Stopped zone: ${zone.name}`, 'zone_stop');
    }
    
    await loadZones();
};

window.addNewZone = async function() {
    const name = document.getElementById('zoneName').value;
    const icon = document.getElementById('zoneIcon').value;
    const duration = parseInt(document.getElementById('zoneDuration').value);
    const waterAmount = parseInt(document.getElementById('zoneWaterAmount').value);
    const priority = parseInt(document.getElementById('zonePriority').value);
    const soilTarget = parseInt(document.getElementById('zoneSoilTarget').value);
    const time = document.getElementById('zoneTime').value;
    const description = document.getElementById('zoneDescription').value;
    
    if (!name) { alert('Please enter a zone name'); return; }
    
    const newZone = {
        id: `zone_${Date.now()}`,
        name: name,
        icon: icon,
        duration: duration || 30,
        waterPerCycle: waterAmount || 10,
        priority: priority || 2,
        soilTarget: soilTarget || 60,
        time: time || "06:00",
        description: description || "",
        isActive: true,
        isRunning: false,
        totalWaterUsed: 0,
        cycles: 0,
        lastWatered: null,
        createdAt: Date.now()
    };
    
    await database.ref(`users_w/${currentUserId}/zones/${newZone.id}`).set(newZone);
    await loadZones();
    closeAddZoneModal();
    addAlert('success', `Zone "${name}" created!`);
    await saveActivityLog(`Created zone: ${name}`, 'zone_create');
    document.getElementById('zoneName').value = '';
};

window.editZone = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    document.getElementById('editZoneId').value = zone.id;
    document.getElementById('editZoneName').value = zone.name;
    document.getElementById('editZoneIcon').value = zone.icon || '🌱';
    document.getElementById('editZoneDuration').value = zone.duration || 30;
    document.getElementById('editZoneWaterAmount').value = zone.waterPerCycle || 10;
    document.getElementById('editZonePriority').value = zone.priority || 2;
    document.getElementById('editZoneSoilTarget').value = zone.soilTarget || 60;
    document.getElementById('editSoilTargetValue').innerText = `${zone.soilTarget || 60}%`;
    document.getElementById('editZoneTime').value = zone.time || "06:00";
    document.getElementById('editZoneDescription').value = zone.description || "";
    document.getElementById('editZoneModal').classList.remove('hidden');
};

window.saveZoneEdit = async function() {
    const zoneId = document.getElementById('editZoneId').value;
    const newSoilTarget = parseInt(document.getElementById('editZoneSoilTarget').value);
    const updates = {
        name: document.getElementById('editZoneName').value,
        icon: document.getElementById('editZoneIcon').value,
        duration: parseInt(document.getElementById('editZoneDuration').value),
        waterPerCycle: parseInt(document.getElementById('editZoneWaterAmount').value),
        priority: parseInt(document.getElementById('editZonePriority').value),
        soilTarget: newSoilTarget,
        time: document.getElementById('editZoneTime').value,
        description: document.getElementById('editZoneDescription').value
    };
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update(updates);
    await loadZones();
    closeEditZoneModal();
    addAlert('success', `Zone "${updates.name}" updated - Soil target: ${newSoilTarget}%`);
    await saveActivityLog(`Updated zone: ${updates.name} (Soil target: ${newSoilTarget}%)`, 'zone_edit');
};

window.deleteZone = async function(zoneId) {
    if (!confirm('Delete this zone?')) return;
    const zone = zones.find(z => z.id === zoneId);
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).remove();
    await loadZones();
    addAlert('success', `Zone "${zone.name}" deleted`);
    await saveActivityLog(`Deleted zone: ${zone.name}`, 'zone_delete');
};

// ===================== SCHEDULE ACTIONS WITH HISTORY UPDATE =====================
window.addNewSchedule = async function() {
    const name = document.getElementById('scheduleName').value;
    const zoneId = document.getElementById('scheduleZone').value;
    const time = document.getElementById('scheduleTime').value;
    const duration = parseInt(document.getElementById('scheduleDuration').value);
    const selectedDays = Array.from(document.querySelectorAll('#addScheduleModal .day-checkbox:checked')).map(cb => cb.value);
    
    if (!name || !zoneId || !time || selectedDays.length === 0) {
        alert('Please fill all fields and select at least one day');
        return;
    }
    
    const zone = zones.find(z => z.id === zoneId);
    const newSchedule = {
        id: `schedule_${Date.now()}`,
        name: name,
        zoneId: zoneId,
        zoneName: zone?.name,
        time: time,
        days: selectedDays,
        duration: duration,
        isActive: true,
        createdAt: Date.now()
    };
    
    await database.ref(`users_w/${currentUserId}/schedules/${newSchedule.id}`).set(newSchedule);
    
    // Update zone's schedule time
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ time: time });
    
    await loadSchedules();
    await loadZones();
    closeAddScheduleModal();
    addAlert('success', `Schedule "${name}" created and zone updated!`);
    await saveActivityLog(`Created schedule: ${name} for zone ${zone?.name}`, 'schedule_create');
    document.getElementById('scheduleName').value = '';
    document.querySelectorAll('#addScheduleModal .day-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#addScheduleModal .day-selector').forEach(sel => sel.classList.remove('active'));
};

window.editSchedule = async function(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;
    
    document.getElementById('editScheduleId').value = schedule.id;
    document.getElementById('editScheduleName').value = schedule.name;
    document.getElementById('editScheduleTime').value = schedule.time;
    document.getElementById('editScheduleDuration').value = schedule.duration;
    
    // Update zone select
    const zoneSelect = document.getElementById('editScheduleZone');
    zoneSelect.innerHTML = '<option value="">Choose a zone...</option>' + zones.map(z => `<option value="${z.id}" ${z.id === schedule.zoneId ? 'selected' : ''}>${z.icon} ${z.name}</option>`).join('');
    
    // Check days
    document.querySelectorAll('#editScheduleModal .day-checkbox').forEach(cb => {
        cb.checked = schedule.days?.includes(cb.value) || false;
        const selector = cb.closest('.day-selector');
        if (selector) {
            if (cb.checked) selector.classList.add('active');
            else selector.classList.remove('active');
        }
    });
    
    document.getElementById('editScheduleModal').classList.remove('hidden');
};

window.saveScheduleEdit = async function() {
    const scheduleId = document.getElementById('editScheduleId').value;
    const zoneId = document.getElementById('editScheduleZone').value;
    const zone = zones.find(z => z.id === zoneId);
    const updates = {
        name: document.getElementById('editScheduleName').value,
        zoneId: zoneId,
        zoneName: zone?.name,
        time: document.getElementById('editScheduleTime').value,
        duration: parseInt(document.getElementById('editScheduleDuration').value),
        days: Array.from(document.querySelectorAll('#editScheduleModal .day-checkbox:checked')).map(cb => cb.value)
    };
    
    if (!updates.name || !updates.zoneId || !updates.time || updates.days.length === 0) {
        alert('Please fill all fields and select at least one day');
        return;
    }
    
    await database.ref(`users_w/${currentUserId}/schedules/${scheduleId}`).update(updates);
    
    // Update the zone's schedule time when schedule is edited
    await database.ref(`users_w/${currentUserId}/zones/${zoneId}`).update({ time: updates.time });
    
    await loadSchedules();
    await loadZones();
    closeEditScheduleModal();
    addAlert('success', `Schedule "${updates.name}" updated - Zone schedule time synced!`);
    await saveActivityLog(`Updated schedule: ${updates.name} for zone ${zone?.name}`, 'schedule_edit');
};

window.deleteSchedule = async function(scheduleId) {
    if (!confirm('Delete this schedule?')) return;
    const schedule = schedules.find(s => s.id === scheduleId);
    await database.ref(`users_w/${currentUserId}/schedules/${scheduleId}`).remove();
    await loadSchedules();
    addAlert('success', 'Schedule deleted');
    await saveActivityLog(`Deleted schedule: ${schedule?.name}`, 'schedule_delete');
};

// ===================== PUMP CONTROL =====================
const pumpToggle = document.getElementById('pumpToggle');
const pumpToggleLabel = document.getElementById('pumpToggleLabel');
const pumpStatus = document.getElementById('pumpStatus');
const tankLevelFill = document.getElementById('tankLevelFill');
const tankLevelPercent = document.getElementById('tankLevelPercent');
const tankLevelCm = document.getElementById('tankLevelCm');
const totalWaterUsage = document.getElementById('totalWaterUsage');
const waterPercentage = document.getElementById('waterPercentage');
const pumpRef = database.ref('controls/pump');

database.ref('controls/pump').on('value', (snapshot) => {
    currentPumpState = snapshot.val() === 1;
    if (pumpToggle) pumpToggle.checked = currentPumpState;
    if (pumpToggleLabel) pumpToggleLabel.innerText = currentPumpState ? 'ON' : 'OFF';
    if (pumpStatus) pumpStatus.innerText = currentPumpState ? 'ON' : 'OFF';
    
    const pumpCard = document.getElementById('pumpCard');
    if (pumpCard) {
        if (currentPumpState) {
            pumpCard.style.animation = 'pulse 2s infinite';
        } else {
            pumpCard.style.animation = 'none';
        }
    }
});

if (pumpToggle) {
    pumpToggle.addEventListener('change', async (e) => {
        const newState = e.target.checked ? 1 : 0;
        await database.ref('controls/pump').set(newState);
        await saveActivityLog(`Main pump ${newState ? 'ON' : 'OFF'}`, 'pump');
    });
}

// ===================== EMERGENCY STOP - FIXED =====================
const emergencyStopBtn = document.getElementById('emergencyStopBtn');
if (emergencyStopBtn) {
    emergencyStopBtn.addEventListener('click', async () => {
        console.log("EMERGENCY STOP triggered");
        
        // Stop all running zones
        for (const zone of zones) {
            if (zone.isRunning) {
                await database.ref(`users_w/${currentUserId}/zones/${zone.id}/isRunning`).set(false);
                console.log(`Stopped zone: ${zone.name}`);
            }
        }
        
        // Turn off pump
        await database.ref('controls/pump').set(0);
        
        // Show alert
        addAlert('critical', '🚨 EMERGENCY STOP - All irrigation halted');
        
        // Save to activity log
        await saveActivityLog('EMERGENCY STOP ACTIVATED - All zones and pump stopped', 'emergency');
        
        // Show toast notification
        showToast('🚨 EMERGENCY STOP ACTIVATED - All irrigation stopped', 'warning');
        
        // Refresh zones display
        await loadZones();
    });
}

// ===================== SENSOR LISTENERS =====================
database.ref('sensors').on('value', (snapshot) => {
    const d = snapshot.val();
    if (!d) return;
    
    currentSensorData = {
        temp: d.temp || 0,
        hum: d.hum || 0,
        soil: d.soil || 0,
        water: d.water || 30
    };
    
    const waterHeight = Math.max(0, maxTankLevelCm - d.water);
    let percent = (waterHeight / maxTankLevelCm) * 100;
    percent = Math.min(100, Math.max(0, percent));
    const volume = (waterHeight / maxTankLevelCm) * maxCapacityLiters;
    
    if (tankLevelFill) tankLevelFill.style.height = percent + "%";
    if (tankLevelPercent) tankLevelPercent.innerText = Math.round(percent) + "%";
    if (tankLevelCm) tankLevelCm.innerText = volume.toFixed(2) + " L";
    if (totalWaterUsage) totalWaterUsage.innerHTML = `${volume.toFixed(1)}L <span class="text-sm font-normal bg-white/20 px-2 py-0.5 rounded ml-2">${Math.round(percent)}%</span>`;
    if (waterPercentage) waterPercentage.innerText = `${Math.round(percent)}%`;
    
    if (percent < 20) addAlert('warning', `Water level low: ${Math.round(percent)}%`);
    
    // Update zone soil displays - each zone shows the global soil moisture
    zones.forEach(zone => {
        const soilElement = document.getElementById(`soil-${zone.id}`);
        if (soilElement) {
            soilElement.innerText = d.soil;
            const waterNeed = calculateWaterNeed(zone, d.soil);
            const needColor = waterNeed > 70 ? '#ef4444' : (waterNeed > 40 ? '#f59e0b' : '#10b981');
            const fillElement = soilElement.parentElement?.querySelector('.soil-fill');
            if (fillElement) {
                fillElement.style.width = `${d.soil}%`;
                fillElement.style.background = needColor;
            }
        }
    });
    
    if (d.soil < 25) addAlert('critical', `Low soil moisture: ${d.soil}% - Watering needed!`);
});

// ===================== ULTIMATE CHATBOT (ORIGINAL - UNCHANGED) =====================
async function loadAPIs() {
    if (API_LOADED) return true;
    try {
        const snapshot = await database.ref('config').once('value');
        const config = snapshot.val();
        OPENROUTER_API_KEY = config?.openrouterKey || null;
        GROQ_API_KEY = config?.groqKey || null;
        if (OPENROUTER_API_KEY) console.log("✅ OpenRouter API loaded");
        if (GROQ_API_KEY) console.log("✅ Groq API loaded");
        API_LOADED = true;
        return !!(OPENROUTER_API_KEY || GROQ_API_KEY);
    } catch(e) { return false; }
}

function getCurrentTemp() { return currentSensorData.temp || 25; }
function getCurrentHumidity() { return currentSensorData.hum || 60; }
function getCurrentSoil() { return currentSensorData.soil || 50; }
function getCurrentTankPercent() { return Math.round(waterCmToPercent(currentSensorData.water)); }
function getCurrentTankLiters() { return waterCmToLiters(currentSensorData.water).toFixed(1); }
function getPumpStatusText() { return currentPumpState ? 'ON' : 'OFF'; }
function getAIMode() { return "MANUAL 👤"; }
function isRainExpected() { return weatherRainExpected || false; }
function isTankOverflowing() { return isTankOverflow(currentSensorData.water); }

async function getRealZones() {
    const now = Date.now();
    if (cachedZones.length > 0 && (now - lastZoneFetch) < 5000) return cachedZones;
    if (zones.length > 0) {
        cachedZones = zones;
        lastZoneFetch = now;
        return cachedZones;
    }
    return [];
}

async function getRealWeatherData() {
    const rainExpected = isRainExpected();
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    let weatherDescription = "";
    let weatherIcon = "☀️";
    if (rainExpected) { weatherDescription = "Rain expected"; weatherIcon = "🌧️"; }
    else if (humidity > 70) { weatherDescription = "Humid and cloudy"; weatherIcon = "☁️"; }
    else if (temp > 30) { weatherDescription = "Hot and sunny"; weatherIcon = "☀️"; }
    else { weatherDescription = "Mild and clear"; weatherIcon = "🌤️"; }
    return { rainExpected, temperature: temp, humidity, description: weatherDescription, icon: weatherIcon };
}

async function tryOpenRouterAPI(question) {
    if (!OPENROUTER_API_KEY) return null;
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    const soil = getCurrentSoil();
    const tank = getCurrentTankPercent();
    const tankLiters = getCurrentTankLiters();
    const pumpOn = getPumpStatusText();
    const isOverflow = isTankOverflowing();
    const rainExpected = isRainExpected();
    const zonesList = await getRealZones();
    
    let zonesInfo = "";
    if (zonesList.length > 0) {
        zonesInfo = `\n🏞️ IRRIGATION ZONES (${zonesList.length} total):\n`;
        zonesList.forEach((zone, i) => {
            zonesInfo += `   ${i+1}. ${zone.name}: ${zone.isRunning ? '🟢 RUNNING' : '⚪ IDLE'} | ⏱️ ${zone.duration || 30}min | 💧 ${zone.waterPerCycle || 10}L\n`;
        });
    }
    
    const systemPrompt = `You are HydroGen AI 🌱, a professional agricultural expert and smart irrigation assistant.

📊 CURRENT SYSTEM STATUS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌡️ Temperature: ${temp}°C
💧 Humidity: ${humidity}%
🌱 Soil Moisture: ${soil}%
💦 Water Tank: ${tank}% (${tankLiters}L / 2L)
🚰 Pump: ${pumpOn === 'ON' ? "🟢 ON" : "⚫ OFF"}
🤖 AI Mode: ${getAIMode()}
🌧️ Rain Expected: ${rainExpected ? "✅ Yes" : "❌ No"}
⚠️ Overflow: ${isOverflow ? "🚨 YES - Use water!" : "✅ Normal"}${zonesInfo}

🌐 WEBSITE PAGES (5 total):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DASHBOARD - Real-time sensors, 3D tank, AI pump, charts, alerts
💧 IRRIGATION - Zone management, schedules, emergency stop
📈 ANALYTICS - Historical data, trends, PDF reports
⚙️ SETTINGS - Theme, profile, notifications
🏠 HOME - System overview, introduction

🎯 RESPONSE GUIDELINES:
- Use beautiful emojis and formatting
- Be helpful, accurate, and professional
- If soil < 35% → 🚨 recommend watering
- If soil > 70% → ✅ advise holding off
- If tank < 20% → ⚠️ warn about refilling
- If overflowing → 🚨 urge to use water immediately

Answer the user's question based on the data above. Be friendly and use plenty of emojis!`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-lite-001",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: question }],
                max_tokens: 600,
                temperature: 0.7
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply && reply.length > 10) return reply;
        }
        return null;
    } catch(e) { return null; }
}

async function getLocalResponse(question) {
    const q = question.toLowerCase();
    const temp = getCurrentTemp();
    const humidity = getCurrentHumidity();
    const soil = getCurrentSoil();
    const tank = getCurrentTankPercent();
    const tankLiters = getCurrentTankLiters();
    const pumpOn = getPumpStatusText();
    const isOverflow = isTankOverflowing();
    const rainExpected = isRainExpected();
    const zonesList = await getRealZones();
    const weatherData = await getRealWeatherData();
    
    if (q.includes('weather') || q.includes('forecast') || q.includes('rain')) {
        const w = weatherData;
        let rainAdvice = w.rainExpected ? "🌧️ **Rain expected!** Excellent for natural irrigation." : "☀️ **No rain expected.** Rely on irrigation system.";
        return `## 🌤️ **Weather Forecast & Analysis**

${w.icon} **Current Conditions:** ${w.description}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| 📊 Parameter | 📈 Value |
|--------------|----------|
| 🌡️ Temperature | ${w.temperature}°C |
| 💧 Humidity | ${w.humidity}% |
| 🌧️ Rain Expected | ${w.rainExpected ? '✅ YES' : '❌ NO'} |

### 📋 **Smart Recommendations**
${rainAdvice}
💡 **Tip:** ${w.humidity > 60 ? 'High humidity - good for water collection!' : 'Monitor soil moisture closely.'}`;
    }
    
    if (q.includes('zone') || q.includes('zones') || q.includes('how many zones')) {
        if (zonesList.length === 0) return `## 🏞️ **Irrigation Zones**\n\n📭 **You have 0 zones configured.**\n\nClick **"Add New Zone"** to get started!`;
        let zoneDetails = "";
        zonesList.forEach((zone, idx) => {
            zoneDetails += `\n**${idx + 1}. ${zone.icon || '🌱'} ${zone.name}** — ${zone.isRunning ? '🟢 RUNNING' : '⚪ IDLE'}\n`;
            zoneDetails += `   ⏱️ Duration: ${zone.duration || 30} min | 💧 ${zone.waterPerCycle || 10}L | 🎯 Target: ${zone.soilTarget || 60}%\n`;
            if (zone.description) zoneDetails += `   📝 Description: ${zone.description}\n`;
        });
        return `## 🏞️ **Your Irrigation Zones**\n\n**Total Zones:** ${zonesList.length}\n\n${zoneDetails}\n\n💡 **Tip:** Hover over any zone card to see its description! Click START to water manually or create schedules for automation.`;
    }
    
    if (q.includes('how many pages') || q.includes('what pages') || q.includes('website pages')) {
        return `## 🌐 **HydroGen Website Pages**\n\n**5 main pages:**\n\n| 🖥️ Page | 📋 Purpose |\n|----------|------------|\n| 📊 **Dashboard** | Real-time sensors, charts, alerts |\n| 💧 **Irrigation** | Zone management, schedules |\n| 📈 **Analytics** | Historical data, PDF reports |\n| ⚙️ **Settings** | Theme, profile, notifications |\n| 🏠 **Home** | System overview |\n\n💡 Use the sidebar menu (☰) to navigate!`;
    }
    
    if (q.includes('should i water') || q.includes('water now') || q.includes('watering needed')) {
        if (isOverflow) return `## 🚨 **URGENT: Tank Overflow!**\n\nStart irrigation IMMEDIATELY to use excess water!`;
        if (tank < 10) return `## 🚫 **Cannot Water - Tank Empty**\n\nTank: ${tank}%. Activate water collection.`;
        if (soil < 30) return `## 💧 **YES - Water NOW!**\n\nSoil: ${soil}% (CRITICAL) | Tank: ${tank}%\nDuration: 20-25 minutes`;
        if (soil < 45) return `## 💧 **YES - Water Soon**\n\nSoil: ${soil}% (Low) | Duration: 15 minutes`;
        if (soil > 75) return `## ✅ **NO - Hold Off**\n\nSoil: ${soil}% (Too wet)`;
        return `## ✅ **NO - Soil Optimal**\n\nSoil: ${soil}% | Tank: ${tank}%`;
    }
    
    if (q.includes('soil')) return `## 🌱 **Soil: ${soil}%**\n\n${soil < 35 ? '⚠️ DRY - Water needed' : (soil > 70 ? '⚠️ WET - Hold off' : '✅ OPTIMAL')}\nOptimal range: 50-70%`;
    if (q.includes('tank')) return `## 💧 **Tank: ${tank}%**\n\n${tank < 20 ? '🔴 CRITICAL - Refill!' : (tank < 40 ? '🟠 LOW' : (tank > 95 ? '⚠️ Near full' : '🟡 OK'))}\nAvailable: ${tankLiters}L / 2L`;
    if (q.includes('system status')) return `## 📊 **System Status**\n\n🌡️ ${temp}°C | 🌱 ${soil}% | 💦 ${tank}% | 📍 ${zonesList.length} zones | 🚰 Pump ${pumpOn}`;
    if (q.includes('tomato')) return `## 🍅 **Tomato Guide**\n\nOptimal: 18-28°C, Soil 60-70%\nYour: ${temp}°C, ${soil}%\n${soil < 55 ? '⚠️ Water soon!' : '✅ Good'}\nTips: Prune suckers, stake support, water consistently.`;
    if (q.includes('basil')) return `## 🌿 **Basil Guide**\n\nOptimal: 18-28°C, Soil 55-65%\nYour: ${temp}°C, ${soil}%\n${soil < 50 ? '⚠️ Water soon!' : '✅ Good'}\nTips: Pinch flowers, harvest from top.`;
    
    return `## 🤖 **HydroGen AI** 🌱\n\n👋 Hello! I'm your agricultural assistant!\n\n### 📊 **Current Status**\n🌡️ ${temp}°C | 🌱 ${soil}% | 💦 ${tank}% | 📍 ${zonesList.length} zones\n\n### 💡 **Try:**\n• "Should I water?" 💧\n• "How many zones?" 🏞️\n• "Weather forecast?" 🌤️\n• "Tomato guide" 🍅\n• "Website pages" 🌐\n\n**Ask me anything!** 🔥`;
}

async function sendChatMessage() {
    const input = document.getElementById('userInput');
    const msg = input.value.trim();
    if (!msg) return;
    addChatMessage('You', msg);
    input.value = '';
    addChatMessage('AI', '💭 Thinking...', 'typing');
    await loadAPIs();
    let response = null;
    if (OPENROUTER_API_KEY) response = await tryOpenRouterAPI(msg);
    if (!response && GROQ_API_KEY) response = await tryOpenRouterAPI(msg);
    if (!response) response = await getLocalResponse(msg);
    document.querySelectorAll(".typing").forEach(e => e.remove());
    addChatMessage('AI', response);
}

function addChatMessage(sender, text, type = '') {
    const box = document.getElementById('chatBox');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `msg ${sender.toLowerCase()} ${type}`;
    let formatted = text.replace(/## (.*?)\n/g, '<strong style="color:#10b981;display:block;margin:10px 0 5px 0;">$1</strong>').replace(/\n/g, '<br>');
    div.innerHTML = `<span><b>${sender === 'AI' ? '🤖 HydroGen AI' : '👤 You'}:</b><br>${formatted}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

window.sendChatMessage = sendChatMessage;
window.quickAsk = (q) => { document.getElementById('userInput').value = q; sendChatMessage(); };
window.toggleChat = () => { const w = document.getElementById('chatWindow'); if (w) w.style.display = w.style.display === 'flex' ? 'none' : 'flex'; };

// ===================== PROFESSIONAL ZONE REPORT (CLEAN ENCODING - NO SPECIAL CHARACTER ERRORS) =====================
window.downloadZoneReport = async function(zoneId) {
    const zone = typeof zones !== "undefined" ? zones.find(z => z.id === zoneId) : null;
    if (!zone) { 
        if (typeof addAlert === 'function') addAlert('error', 'Zone not found'); 
        return; 
    }
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFont('helvetica', 'normal');
        
        const now = new Date();
        const reportDateTime = now.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const cleanZoneName = String(zone.name || 'Zone').replace(/[^\w\s]/g, '');
        const zoneTypeName = (zone.icon || "Zone").replace(/[^\w\s]/g, '');
        const cleanDescription = (zone.description || "No description provided").replace(/[^\w\s.,!?-]/g, '');
        
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 0, 210, 45, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("HydroGen", 20, 25);
        doc.setFontSize(12);
        doc.text("Professional Zone Report", 20, 38);
        
        doc.setFontSize(9);
        doc.text(`Exported: ${reportDateTime}`, 140, 20);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(18);
        doc.text(`${cleanZoneName}`, 20, 70);
        
        doc.setFontSize(11);
        let y = 90;
        
        const details = [
            { label: "Zone Type", value: zoneTypeName },
            { label: "Duration", value: `${zone.duration || 30} minutes` },
            { label: "Water per Cycle", value: `${zone.waterPerCycle || 10} liters` },
            { label: "Priority", value: zone.priority == 1 ? "High" : (zone.priority == 2 ? "Medium" : "Low") },
            { label: "Soil Target", value: `${zone.soilTarget || 60}%` },
            { label: "Current Soil", value: `${typeof currentSensorData !== "undefined" ? currentSensorData.soil : 0}%` },
            { label: "Temperature", value: `${typeof currentSensorData !== "undefined" ? currentSensorData.temp : 0}°C` },
            { label: "Humidity", value: `${typeof currentSensorData !== "undefined" ? currentSensorData.hum : 0}%` },
            { label: "Watered Status", value: zone.lastWatered ? new Date(zone.lastWatered).toLocaleString() : "Not watered yet" },
            { label: "Start Date", value: zone.startDate || "Not set" },
            { label: "End Date", value: zone.endDate || "Not set" },
            { label: "Schedule Time", value: zone.time || "Manual" },
            { label: "Description", value: cleanDescription }
        ];
        
        details.forEach(detail => {
            const labelText = detail.label;
            const valueText = String(detail.value).substring(0, 60);
            doc.text(`${labelText}: ${valueText}`, 20, y);
            y += 9;
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
        });
        
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 285, 210, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("HydroGen AI System 2026", 20, 292);
        doc.text("Smart Water-from-Air Irrigation", 105, 292);
        
        const safeFileName = `HydroGen_Zone_${cleanZoneName.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`;
        doc.save(safeFileName);
        
        if (typeof addAlert === 'function') addAlert('success', `Professional report for "${zone.name}" downloaded!`);
        if (typeof saveActivityLog === 'function') await saveActivityLog(`Downloaded report for zone: ${zone.name}`, 'report');
    } catch(e) { 
        console.error("PDF Error:", e);
        if (typeof addAlert === 'function') addAlert('error', 'Failed to generate report'); 
    }
};

// ===================== CLEAR LOGS =====================
window.clearLogs = async function() {
    if (confirm('Clear all logs?')) { 
        if (typeof database !== 'undefined') await database.ref(`shared_data/activityLog`).remove(); 
        if (typeof loadActivityLog === 'function') await loadActivityLog(); 
        if (typeof addAlert === 'function') addAlert('success', 'Logs cleared'); 
    }
};

// ===================== MODAL CONTROLS =====================
window.showAddZoneModal = () => {
    document.getElementById('zoneStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('zoneEndDate').value = '';
    document.getElementById('addZoneModal').classList.remove('hidden');
};
window.closeAddZoneModal = () => document.getElementById('addZoneModal').classList.add('hidden');
window.showAddScheduleModal = () => {
    if (typeof updateScheduleSelects === 'function') updateScheduleSelects();
    document.getElementById('scheduleStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addScheduleModal').classList.remove('hidden');
};
window.closeAddScheduleModal = () => document.getElementById('addScheduleModal').classList.add('hidden');
window.closeEditZoneModal = () => document.getElementById('editZoneModal').classList.add('hidden');
window.closeEditScheduleModal = () => document.getElementById('editScheduleModal').classList.add('hidden');

function updateScheduleSelects() {
    if (typeof zones === 'undefined') return;
    const select = document.getElementById('scheduleZone');
    if (select) select.innerHTML = '<option value="">Choose zone...</option>' + zones.map(z => `<option value="${z.id}">${z.icon} ${escapeHtml(z.name)}</option>`).join('');
    const editSelect = document.getElementById('editScheduleZone');
    if (editSelect) editSelect.innerHTML = '<option value="">Choose zone...</option>' + zones.map(z => `<option value="${z.id}">${z.icon} ${escapeHtml(z.name)}</option>`).join('');
}

document.querySelectorAll('.day-selector').forEach(sel => {
    const cb = sel.querySelector('input');
    if (cb) cb.addEventListener('change', () => { if (cb.checked) sel.classList.add('active'); else sel.classList.remove('active'); });
});

document.getElementById('zoneSoilTarget')?.addEventListener('input', (e) => { const el = document.getElementById('soilTargetValue'); if (el) el.innerText = `${e.target.value}%`; });
document.getElementById('editZoneSoilTarget')?.addEventListener('input', (e) => { const el = document.getElementById('editSoilTargetValue'); if (el) el.innerText = `${e.target.value}%`; });

document.getElementById('darkModeToggle')?.addEventListener('click', () => document.body.classList.toggle('dark'));

document.getElementById('menuBtn')?.addEventListener('click', () => { 
    const sm = document.getElementById('sideMenu'); if (sm) sm.classList.add('open'); 
    const mo = document.getElementById('menuOverlay'); if (mo) mo.classList.add('active'); 
});
document.getElementById('closeBtn')?.addEventListener('click', () => { 
    const sm = document.getElementById('sideMenu'); if (sm) sm.classList.remove('open'); 
    const mo = document.getElementById('menuOverlay'); if (mo) mo.classList.remove('active'); 
});
document.getElementById('menuOverlay')?.addEventListener('click', () => { 
    const sm = document.getElementById('sideMenu'); if (sm) sm.classList.remove('open'); 
    const mo = document.getElementById('menuOverlay'); if (mo) mo.classList.remove('active'); 
});

function populateZoneTypeOptions() {
    const selectElements = document.querySelectorAll('#zoneIcon, #editZoneIcon');
    selectElements.forEach(select => {
        if (select && select.options.length <= 1 && typeof getZoneTypeOptions === 'function') {
            select.innerHTML = getZoneTypeOptions();
        }
    });
}

async function init() {
    console.log("Initializing page...");
    if (typeof populateZoneTypeOptions === 'function') populateZoneTypeOptions();
    if (typeof loadZones === 'function') await loadZones();
    if (typeof loadSchedules === 'function') await loadSchedules();
    if (typeof loadActivityLog === 'function') await loadActivityLog();
    if (typeof loadWeather === 'function') loadWeather();
    if (typeof loadWeather === 'function') setInterval(loadWeather, 300000);
    setTimeout(() => {
        if (typeof addChatMessage === 'function') {
            addChatMessage('AI', `## 🤖 **HydroGen AI Assistant** 🌱\n\n👋 Hello! I'm your intelligent agricultural assistant!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n### 📊 **Current System Status**\n\n| 📊 Parameter | 📈 Value |\n|--------------|----------|\n| 🌡️ Temperature | ${getCurrentTemp()}°C |\n| 💧 Humidity | ${getCurrentHumidity()}% |\n| 🌱 Soil | ${getCurrentSoil()}% |\n| 💦 Tank | ${getCurrentTankPercent()}% (${getCurrentTankLiters()}L) |\n| 🚰 Pump | ${getPumpStatusText()} |\n| 🤖 AI Mode | ${getAIMode()} |\n| 📍 Zones | ${typeof zones !== 'undefined' ? zones.length : 0} |\n| 🌤️ Weather | ${isRainExpected() ? 'Rain Expected' : 'Clear'} |\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n### 💡 **Try These Questions**\n\n• 🌤️ *"Weather forecast?"* - Get detailed weather analysis\n• 🏞️ *"How many zones?"* - Check your irrigation zones\n• 💧 *"Should I water?"* - Get watering advice\n• 🌐 *"How many pages?"* - Learn about all website pages\n• 📊 *"System status"* - Complete system overview\n• 🍅 *"How to grow tomatoes?"* - Plant care guide\n\n💡 **Tip:** Hover over any zone card to see its description!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n💡 **Ask me anything about your HydroGen system!** 🔥`);
        }
    }, 1500);
}
init();
