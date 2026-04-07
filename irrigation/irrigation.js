// ================= IRRIGATION.JS - COMPLETE FIXED VERSION =================
// Fixed: Edit schedule updates schedule history, zone soil target works per zone, emergency stop works

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

// ===================== DOWNLOAD ZONE REPORT =====================
window.downloadZoneReport = async function(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) {
        addAlert('error', 'Zone not found');
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 25;
        
        const primaryGreen = [16, 185, 129];
        const dark = [31, 41, 55];
        const lightGray = [249, 250, 251];
        
        // Header
        doc.setFillColor(...primaryGreen);
        doc.rect(0, 0, 210, 45, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("HydroGen", 20, 18);
        doc.setFontSize(12);
        doc.text("Zone Report", 20, 28);
        doc.setFontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 140, 12);
        doc.text(`${zone.name.toUpperCase()} ZONE`, 140, 22);
        
        y = 55;
        doc.setFontSize(24);
        doc.setTextColor(...primaryGreen);
        doc.text(zone.name, 20, y);
        y += 12;
        
        if (zone.description) {
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(zone.description, 20, y);
            y += 10;
        }
        
        y += 5;
        
        const stats = [
            { label: "Duration", value: `${zone.duration || 30} minutes` },
            { label: "Water per Cycle", value: `${zone.waterPerCycle || 10} liters` },
            { label: "Priority", value: zone.priority == 1 ? "High" : zone.priority == 2 ? "Medium" : "Low" },
            { label: "Soil Target", value: `${zone.soilTarget || 60}%` },
            { label: "Schedule Time", value: zone.time || 'Manual' },
            { label: "Total Cycles", value: `${zone.cycles || 0} cycles` },
            { label: "Total Water Used", value: `${(zone.totalWaterUsed || 0).toFixed(1)} Liters` },
            { label: "Current Soil Moisture", value: `${currentSensorData.soil}%` },
            { label: "Current Temperature", value: `${currentSensorData.temp}°C` },
            { label: "Current Humidity", value: `${currentSensorData.hum}%` }
        ];
        
        stats.forEach((stat, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...lightGray);
                doc.rect(20, y, 170, 7, "F");
            }
            doc.setTextColor(...dark);
            doc.text(stat.label, 22, y + 5);
            doc.setTextColor(...primaryGreen);
            doc.text(stat.value, 150, y + 5);
            y += 8;
        });
        
        doc.setFillColor(...primaryGreen);
        doc.rect(0, 285, 210, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text("HydroGen AI System 2026", 20, 292);
        doc.text("Smart Irrigation • Data Driven • Sustainable", 105, 292);
        
        doc.save(`HydroGen_Zone_${zone.name}_Report.pdf`);
        addAlert('success', `Zone report for "${zone.name}" downloaded`);
        await saveActivityLog(`Downloaded report for zone: ${zone.name}`, 'report');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        addAlert('error', `Failed to generate report: ${error.message}`);
    }
};

// ===================== CLEAR LOGS =====================
window.clearLogs = async function() {
    if (confirm('Clear all activity logs?')) {
        await database.ref(`users_w/${currentUserId}/activityLog`).remove();
        await loadActivityLog();
        addAlert('success', 'Activity logs cleared');
    }
};

// ===================== MODAL CONTROLS =====================
window.showAddZoneModal = () => document.getElementById('addZoneModal').classList.remove('hidden');
window.closeAddZoneModal = () => document.getElementById('addZoneModal').classList.add('hidden');
window.showAddScheduleModal = () => { updateScheduleSelect(); document.getElementById('addScheduleModal').classList.remove('hidden'); };
window.closeAddScheduleModal = () => document.getElementById('addScheduleModal').classList.add('hidden');
window.closeEditZoneModal = () => document.getElementById('editZoneModal').classList.add('hidden');
window.closeEditScheduleModal = () => document.getElementById('editScheduleModal').classList.add('hidden');

function updateScheduleSelect() {
    const select = document.getElementById('scheduleZone');
    if (select) {
        select.innerHTML = '<option value="">Choose a zone...</option>' + zones.map(zone => `<option value="${zone.id}">${zone.icon} ${escapeHtml(zone.name)}</option>`).join('');
    }
}

function updateEditScheduleSelect() {
    const select = document.getElementById('editScheduleZone');
    if (select) {
        select.innerHTML = '<option value="">Choose a zone...</option>' + zones.map(zone => `<option value="${zone.id}">${zone.icon} ${escapeHtml(zone.name)}</option>`).join('');
    }
}

// Day selector styling
document.querySelectorAll('.day-selector').forEach(selector => {
    const checkbox = selector.querySelector('input');
    if (checkbox) {
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selector.classList.add('active');
            else selector.classList.remove('active');
        });
    }
});

// Soil target slider
document.getElementById('zoneSoilTarget')?.addEventListener('input', (e) => document.getElementById('soilTargetValue').innerText = `${e.target.value}%`);
document.getElementById('editZoneSoilTarget')?.addEventListener('input', (e) => document.getElementById('editSoilTargetValue').innerText = `${e.target.value}%`);

// ===================== AI CHATBOT =====================
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
    return `You are HydroGen AI assistant. Current readings: Temp: ${currentSensorData.temp}°C, Humidity: ${currentSensorData.hum}%, Soil: ${currentSensorData.soil}%, Pump: ${currentPumpState ? 'ON' : 'OFF'}. Total zones: ${zones.length}. Provide short, helpful advice.`;
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

// ===================== INITIALIZE =====================
async function init() {
    console.log("Initializing irrigation page...");
    console.log("Using user ID:", currentUserId);
    await loadZones();
    await loadSchedules();
    await loadActivityLog();
    initAIChat();
    
    setTimeout(() => {
        if (document.getElementById('alertsList').children.length === 0) {
            document.getElementById('alertsList').innerHTML = '<div class="text-center py-4 text-gray-400">No active alerts</div>';
        }
    }, 1000);
}

init();