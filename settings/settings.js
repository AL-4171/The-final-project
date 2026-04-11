/* settings.js */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI Elements & Toasts
    const saveToastEl = document.getElementById('saveToast');
    const saveToast = new bootstrap.Toast(saveToastEl);

    const lowWaterSlider = document.getElementById('lowWaterThreshold');
    const lowWaterValue = document.getElementById('lowWaterValue');
    const drySoilSlider = document.getElementById('drySoilThreshold');
    const drySoilValue = document.getElementById('drySoilValue');

    // 2. Load Existing Settings
    loadProfile();
    loadNotifications();
    loadFirebaseConfig();
    loadHardwareThresholds();

    // 3. Real-time Slider Updates
    lowWaterSlider.oninput = () => lowWaterValue.innerText = lowWaterSlider.value;
    drySoilSlider.oninput = () => drySoilValue.innerText = drySoilSlider.value;

    // 4. Form Submissions

    // Profile
    document.getElementById('profileForm').onsubmit = (e) => {
        e.preventDefault();
        const profile = {
            name: document.getElementById('inputName').value,
            email: document.getElementById('inputEmail').value,
            phone: document.getElementById('inputPhone').value
        };
        localStorage.setItem('hydroGenProfile', JSON.stringify(profile));

        // Update header name if exists
        const headerUsername = document.getElementById('headerUsername');
        if (headerUsername) headerUsername.innerText = profile.name;

        showFeedback('Profile updated successfully');
    };

    // Notifications
    document.getElementById('saveNotifBtn').onclick = () => {
        const notifs = {
            email: document.getElementById('notifEmail').checked,
            push: document.getElementById('notifPush').checked
        };
        localStorage.setItem('hydroGenNotifs', JSON.stringify(notifs));
        showFeedback('Notification preferences saved');
    };

    // Hardware Thresholds (Write to Firebase)
    document.getElementById('saveThresholdsBtn').onclick = () => {
        const thresholds = {
            lowWater: parseInt(lowWaterSlider.value),
            drySoil: parseInt(drySoilSlider.value)
        };

        if (window.hydroGenDB) {
            window.hydroGenDB.ref('settings/thresholds').set(thresholds)
                .then(() => {
                    localStorage.setItem('hydroGenThresholds', JSON.stringify(thresholds));
                    showFeedback('Hardware thresholds synced with Firebase');
                })
                .catch(err => {
                    console.error('Firebase save error:', err);
                    showFeedback('Sync failed, but saved locally', 'error');
                });
        } else {
            localStorage.setItem('hydroGenThresholds', JSON.stringify(thresholds));
            showFeedback('Saved locally (Firebase not connected)');
        }
    };

    // Firebase Configuration
    document.getElementById('firebaseConfigForm').onsubmit = (e) => {
        e.preventDefault();
        const config = {
            databaseURL: document.getElementById('fbDatabaseUrl').value,
            apiKey: document.getElementById('fbApiKey').value,
            projectId: document.getElementById('fbProjectId').value
        };
        localStorage.setItem('hydroGenFirebaseConfig', JSON.stringify(config));
        showFeedback('Firebase config saved. Reload page to reconnect.');
        setTimeout(() => location.reload(), 2000);
    };

    document.getElementById('resetFbConfigBtn').onclick = () => {
        localStorage.removeItem('hydroGenFirebaseConfig');
        showFeedback('Restored defaults. Reloading...');
        setTimeout(() => location.reload(), 1500);
    };

    // 5. Utility Functions
    function showFeedback(msg, type = 'success') {
        const toastBody = saveToastEl.querySelector('.toast-body');
        const toastHeader = saveToastEl.querySelector('.toast-header');

        toastBody.innerText = msg;
        if (type === 'error') {
            toastHeader.classList.replace('bg-success', 'bg-danger');
        } else {
            toastHeader.classList.replace('bg-danger', 'bg-success');
        }
        saveToast.show();
    }

    function loadProfile() {
        const saved = localStorage.getItem('hydroGenProfile');
        if (saved) {
            const profile = JSON.parse(saved);
            document.getElementById('inputName').value = profile.name;
            document.getElementById('inputEmail').value = profile.email;
            document.getElementById('inputPhone').value = profile.phone;
        }
    }

    function loadNotifications() {
        const saved = localStorage.getItem('hydroGenNotifs');
        if (saved) {
            const notifs = JSON.parse(saved);
            document.getElementById('notifEmail').checked = notifs.email;
            document.getElementById('notifPush').checked = notifs.push;
        }
    }

    function loadFirebaseConfig() {
        const saved = localStorage.getItem('hydroGenFirebaseConfig');
        if (saved) {
            const config = JSON.parse(saved);
            document.getElementById('fbDatabaseUrl').value = config.databaseURL;
            document.getElementById('fbApiKey').value = config.apiKey;
            document.getElementById('fbProjectId').value = config.projectId;
        } else {
            // Default from firebase-config.js (should be globally accessible if loaded before settings.js)
            // But for safety, we can pre-populate from what's currently active
            if (window.hydroGenDB) {
                const url = window.hydroGenDB.toString(); // Might not exactly match DB URL
                // Better to just leave empty or use a known default if firebase-config provides it
            }
        }
    }

    function loadHardwareThresholds() {
        // Try Firebase first if connected
        if (window.hydroGenDB) {
            window.hydroGenDB.ref('settings/thresholds').once('value').then(snap => {
                const data = snap.val();
                if (data) applyThresholds(data);
                else {
                    // Try Local
                    const local = localStorage.getItem('hydroGenThresholds');
                    if (local) applyThresholds(JSON.parse(local));
                }
            });
        }
    }

    function applyThresholds(data) {
        if (data.lowWater) {
            lowWaterSlider.value = data.lowWater;
            lowWaterValue.innerText = data.lowWater;
        }
        if (data.drySoil) {
            drySoilSlider.value = data.drySoil;
            drySoilValue.innerText = data.drySoil;
        }
    }
});
