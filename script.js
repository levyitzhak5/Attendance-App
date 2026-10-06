// ============================================================
// Firebase Configuration
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyAkXyQEUHMBmV9N3_IckXfN7pTVF9539qY",
    authDomain: "attendance-app-22d69.firebaseapp.com",
    projectId: "attendance-app-22d69",
    storageBucket: "attendance-app-22d69.firebasestorage.app",
    messagingSenderId: "607072479205",
    appId: "1:607072479205:web:54da2512528e27f860310c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const attendanceCollection = db.collection('attendance');

// ============================================================
// Constants
// ============================================================
const TARGET_HOURS = 182;
const TARGET_MINUTES = TARGET_HOURS * 60;

let showAllHistory = false;
let cachedLogs = [];

// ============================================================
// Initialize
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const now = new Date();
    document.getElementById('manualDate').value = now.toISOString().split('T')[0];
    document.getElementById('manualTime').value = now.toTimeString().slice(0, 5);

    updateCurrentMonthLabel();

    // Sign in anonymously, then start listening to Firestore
    auth.signInAnonymously()
        .then(() => {
            console.log("Signed in anonymously");
            listenToLogs();
        })
        .catch((error) => {
            console.error("Anonymous sign-in error:", error.code, error.message);
            alert("שגיאה בהתחברות לשרת. נסה לרענן את הדף.");
        });
});

// ============================================================
// Firestore Real-Time Listener
// ============================================================
function listenToLogs() {
    attendanceCollection
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            cachedLogs = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: data.type,
                    date: formatDate(data.rawDate),
                    time: data.time,
                    rawDate: data.rawDate,
                    timestamp: data.timestamp
                };
            });

            displayLogs(cachedLogs);
        }, (error) => {
            console.error("Firestore error:", error);
            alert("שגיאה בחיבור לשרת Firebase. בדוק את החיבור לאינטרנט.");
        });
}

// ============================================================
// Save Log to Firestore
// ============================================================
async function saveLog(newLog) {
    try {
        const [y, m, d] = newLog.rawDate.split('-').map(Number);
        const [hh, mm, ss] = (newLog.time.length === 5 ? `${newLog.time}:00` : newLog.time).split(':').map(Number);
        const localDate = new Date(y, m - 1, d, hh, mm, ss);

        await attendanceCollection.add({
            type: newLog.type,
            date: newLog.date,
            time: newLog.time,
            rawDate: newLog.rawDate,
            timestamp: firebase.firestore.Timestamp.fromDate(localDate)
        });
    } catch (error) {
        console.error("Error adding log:", error);
        alert("שגיאה בשמירת הדיווח. נסה שוב.");
    }
}

// ============================================================
// Delete Log from Firestore by Document ID
// ============================================================
async function deleteLog(docId) {
    if (!confirm('האם למחוק שורה זו?')) return;

    try {
        await attendanceCollection.doc(docId).delete();
    } catch (error) {
        console.error("Error deleting log:", error);
        alert("שגיאה במחיקת הדיווח.");
    }
}

// ============================================================
// Quick Entry
// ============================================================
function logAttendance(type) {
    const now = new Date();
    const rawDate = now.toISOString().split('T')[0];
    const dateStr = formatDate(rawDate);
    const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    saveLog({ type, date: dateStr, time: timeStr, rawDate });
}

// ============================================================
// Manual Entry
// ============================================================
function addManualLog() {
    const type = document.getElementById('manualType').value;
    const rawDate = document.getElementById('manualDate').value;
    const time = document.getElementById('manualTime').value;

    if (!rawDate || !time) {
        alert('אנא בחר תאריך ושעה תקינים');
        return;
    }

    const dateStr = formatDate(rawDate);
    saveLog({ type, date: dateStr, time, rawDate });
}

// ============================================================
// Helpers
// ============================================================
function getMonthKey(dateInput) {
    if (dateInput instanceof Date) {
        const y = dateInput.getFullYear();
        const m = String(dateInput.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }
    return dateInput.slice(0, 7);
}

function getCurrentMonthKey() {
    return getMonthKey(new Date());
}

function updateCurrentMonthLabel() {
    const now = new Date();
    const monthName = now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    document.getElementById('currentMonth').innerText = monthName;
}

function normalizeDateString(log) {
    if (log.rawDate && log.rawDate.includes('-')) return log.rawDate;
    return new Date().toISOString().split('T')[0];
}

function getLogTimestamp(log) {
    const datePart = normalizeDateString(log);
    const timePart = log.time.length === 5 ? `${log.time}:00` : log.time;
    return new Date(`${datePart}T${timePart}`);
}

function formatMinutesToHM(totalMin) {
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDate(dateInput) {
    const [year, month, day] = dateInput.split('-');
    return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
}

function filterLogsForCurrentMonth(logs) {
    const currentMonth = getCurrentMonthKey();
    return logs.filter(log => getMonthKey(normalizeDateString(log)) === currentMonth);
}

// ============================================================
// Calculate Hours (per current month)
// ============================================================
function calculateTotalHours(allLogs) {
    const logs = filterLogsForCurrentMonth(allLogs);
    let totalMinutes = 0;

    const groupedByDate = {};
    logs.forEach(log => {
        const dateKey = normalizeDateString(log);
        if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
        groupedByDate[dateKey].push(log);
    });

    Object.keys(groupedByDate).forEach(dateKey => {
        const dayLogs = groupedByDate[dateKey];
        dayLogs.sort((a, b) => getLogTimestamp(a) - getLogTimestamp(b));

        let entryTime = null;
        dayLogs.forEach(log => {
            if (log.type === 'כניסה') {
                entryTime = getLogTimestamp(log);
            } else if (log.type === 'יציאה' && entryTime) {
                const diffMs = getLogTimestamp(log) - entryTime;
                if (diffMs > 0) totalMinutes += Math.floor(diffMs / (1000 * 60));
                entryTime = null;
            }
        });
    });

    const regularMinutes = Math.min(totalMinutes, TARGET_MINUTES);
    const overtimeMinutes = Math.max(0, totalMinutes - TARGET_MINUTES);

    document.getElementById('regularHours').innerText = formatMinutesToHM(regularMinutes);
    document.getElementById('overtimeHours').innerText = formatMinutesToHM(overtimeMinutes);

    const progressPercent = Math.min(100, (regularMinutes / TARGET_MINUTES) * 100);
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progressPercent}%`;
    progressBar.style.backgroundColor = overtimeMinutes > 0 ? '#ffc107' : '#28a745';
}

// ============================================================
// Display Logs (with daily hours shown on every row of that date)
// ============================================================
function displayLogs(logs) {
    updateCurrentMonthLabel();
    calculateTotalHours(logs);

    const visibleLogs = showAllHistory ? logs : filterLogsForCurrentMonth(logs);
    const tableBody = document.getElementById('logTable');
    tableBody.innerHTML = '';

    if (visibleLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="color:#888;">אין דיווחים להצגה</td></tr>`;
        return;
    }

    // Build a per-date duration map
    const dailyHours = computeDailyHoursMap(visibleLogs);

    visibleLogs.forEach((log) => {
        const row = document.createElement('tr');
        const statusClass = log.type === 'כניסה' ? 'status-in' : 'status-out';
        const dateKey = normalizeDateString(log);
        const totalMin = dailyHours[dateKey] || 0;
        const hoursText = totalMin > 0 ? formatMinutesToHM(totalMin) : '—';

        row.innerHTML = `
            <td class="${statusClass}">${log.type}</td>
            <td>${log.date}</td>
            <td>${log.time}</td>
            <td class="hours-cell">${hoursText}</td>
            <td><button class="action-btn" onclick="deleteLog('${log.id}')" title="מחק">🗑️</button></td>
        `;
        tableBody.appendChild(row);
    });
}

// ============================================================
// Compute total worked minutes per date
// ============================================================
function computeDailyHoursMap(logs) {
    const map = {};

    const grouped = {};
    logs.forEach(log => {
        const key = normalizeDateString(log);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(log);
    });

    Object.keys(grouped).forEach(key => {
        const dayLogs = grouped[key].sort((a, b) => getLogTimestamp(a) - getLogTimestamp(b));
        let totalMin = 0;
        let entryTime = null;

        dayLogs.forEach(log => {
            if (log.type === 'כניסה') {
                entryTime = getLogTimestamp(log);
            } else if (log.type === 'יציאה' && entryTime) {
                const diffMs = getLogTimestamp(log) - entryTime;
                if (diffMs > 0) totalMin += Math.floor(diffMs / (1000 * 60));
                entryTime = null;
            }
        });

        map[key] = totalMin;
    });

    return map;
}

// ============================================================
// Toggle View
// ============================================================
function toggleView() {
    showAllHistory = !showAllHistory;
    const btn = document.getElementById('toggleViewBtn');
    const title = document.getElementById('tableTitle');

    if (showAllHistory) {
        btn.innerText = 'הצג רק את החודש הנוכחי';
        title.innerText = 'היסטוריית דיווחים - כל ההיסטוריה';
    } else {
        btn.innerText = 'הצג את כל ההיסטוריה';
        title.innerText = 'היסטוריית דיווחים - החודש הנוכחי';
    }

    displayLogs(cachedLogs);
}

// ============================================================
// CSV Export
// ============================================================
function exportToCSV(exportAll = false) {
    const logsToExport = exportAll ? cachedLogs : filterLogsForCurrentMonth(cachedLogs);

    if (logsToExport.length === 0) {
        alert('אין נתונים לייצוא');
        return;
    }

    const sorted = [...logsToExport].sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a));

    let csvContent = "\uFEFFסוג,תאריך,שעה\n";
    sorted.forEach(log => {
        csvContent += `"${log.type}","${log.date}","${log.time}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `נוכחות_${exportAll ? 'כל_ההיסטוריה' : new Date().toISOString().slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ============================================================
// Clear All Data
// ============================================================
async function clearData() {
    if (!confirm('האם אתה בטוח שברצונך למחוק את כל הדיווחים? פעולה זו אינה ניתנת לשחזור!')) return;

    try {
        const snapshot = await attendanceCollection.get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (error) {
        console.error("Error clearing data:", error);
        alert("שגיאה במחיקת הנתונים.");
    }
}