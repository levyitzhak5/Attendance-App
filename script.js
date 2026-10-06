// Target monthly standard hours constant in minutes (182 hours * 60)
const TARGET_HOURS = 182;
const TARGET_MINUTES = TARGET_HOURS * 60;

// Initialize application defaults on DOM load
document.addEventListener("DOMContentLoaded", () => {
    // Set default date and time for the manual input form
    const now = new Date();
    document.getElementById('manualDate').value = now.toISOString().split('T')[0];
    document.getElementById('manualTime').value = now.toTimeString().slice(0, 5);
    
    // Render existing logs from LocalStorage
    displayLogs();
});

// Quick entry log handler
function logAttendance(type) {
    const now = new Date();
    const rawDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const dateStr = formatDate(rawDate); // DD.MM.YYYY
    const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    saveLog({ 
        type, 
        date: dateStr, 
        time: timeStr, 
        rawDate: rawDate 
    });
}

// Manual entry log handler
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

// Robust helper: Parse any date format into YYYY-MM-DD
function normalizeDateString(log) {
    if (log.rawDate && log.rawDate.includes('-')) {
        return log.rawDate;
    }

    if (log.date) {
        const cleanDate = log.date.replace(/\//g, '.');
        const parts = cleanDate.split('.');
        if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1].padStart(2, '0');
            let year = parts[2];
            if (year.length === 2) year = `20${year}`;
            return `${year}-${month}-${day}`;
        }
    }

    return new Date().toISOString().split('T')[0];
}

// Helper: Convert log entry to a JS Date object for accurate time comparison
function getLogTimestamp(log) {
    const datePart = normalizeDateString(log);
    const timePart = log.time.length === 5 ? `${log.time}:00` : log.time;
    return new Date(`${datePart}T${timePart}`);
}

// Persist new log item to LocalStorage and trigger rebuild
function saveLog(newLog) {
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    logs.push(newLog);

    sortLogsArray(logs);

    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    displayLogs();
}

// Strict chronological sorting (Newest timestamp always on top)
function sortLogsArray(logs) {
    logs.sort((a, b) => {
        const timeA = getLogTimestamp(a);
        const timeB = getLogTimestamp(b);
        return timeB - timeA;
    });
}

// Format minutes into HH:MM string
function formatMinutesToHM(totalMin) {
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Calculate standard target hours (up to 182) vs overtime (beyond 182)
function calculateTotalHours(logs) {
    let totalMinutes = 0;
    
    // Group logs by raw date YYYY-MM-DD
    const groupedByDate = {};
    logs.forEach(log => {
        const dateKey = normalizeDateString(log);
        if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push(log);
    });

    // Process each date group
    Object.keys(groupedByDate).forEach(dateKey => {
        const dayLogs = groupedByDate[dateKey];
        
        // Sort day logs chronologically (earliest first)
        dayLogs.sort((a, b) => getLogTimestamp(a) - getLogTimestamp(b));

        let entryTime = null;

        dayLogs.forEach(log => {
            if (log.type === 'כניסה') {
                entryTime = getLogTimestamp(log);
            } else if (log.type === 'יציאה' && entryTime) {
                const exitTime = getLogTimestamp(log);
                const diffMs = exitTime - entryTime;
                if (diffMs > 0) {
                    totalMinutes += Math.floor(diffMs / (1000 * 60));
                }
                entryTime = null;
            }
        });
    });

    // Separate regular standard minutes from overtime minutes
    let regularMinutes = Math.min(totalMinutes, TARGET_MINUTES);
    let overtimeMinutes = Math.max(0, totalMinutes - TARGET_MINUTES);

    // Update UI elements
    document.getElementById('regularHours').innerText = formatMinutesToHM(regularMinutes);
    document.getElementById('overtimeHours').innerText = formatMinutesToHM(overtimeMinutes);

    // Update Progress Bar UI
    const progressPercent = Math.min(100, (regularMinutes / TARGET_MINUTES) * 100);
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${progressPercent}%`;

    // Change progress bar color if overtime is reached
    if (overtimeMinutes > 0) {
        progressBar.style.backgroundColor = '#ffc107'; // Yellow/Gold for overtime
    } else {
        progressBar.style.backgroundColor = '#28a745'; // Green for normal
    }
}

// Remove single log row by array index
function deleteLog(index) {
    if (confirm('האם למחוק שורה זו?')) {
        let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        logs.splice(index, 1);
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        displayLogs();
    }
}

// Render saved logs in HTML table with automatic data cleanup
function displayLogs() {
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    // Clean and fix logs format
    logs.forEach(log => {
        log.rawDate = normalizeDateString(log);
        log.date = formatDate(log.rawDate);
    });

    sortLogsArray(logs);

    // Save cleaned logs
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));

    // Calculate regular and overtime hours
    calculateTotalHours(logs);

    const tableBody = document.getElementById('logTable');
    tableBody.innerHTML = '';

    logs.forEach((log, index) => {
        const row = document.createElement('tr');
        const statusClass = log.type === 'כניסה' ? 'status-in' : 'status-out';
        
        row.innerHTML = `
            <td class="${statusClass}">${log.type}</td>
            <td>${log.date}</td>
            <td>${log.time}</td>
            <td>
                <button class="action-btn" onclick="deleteLog(${index})" title="מחק">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Format raw ISO YYYY-MM-DD date to DD.MM.YYYY
function formatDate(dateInput) {
    const [year, month, day] = dateInput.split('-');
    return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
}

// Export LocalStorage records into downloadable CSV file
function exportToCSV() {
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    if (logs.length === 0) {
        alert('אין נתונים לייצוא');
        return;
    }

    sortLogsArray(logs);

    // Add UTF-8 BOM byte order mark to ensure proper Hebrew encoding in Excel
    let csvContent = "\uFEFFסוג,תאריך,שעה\n"; 
    logs.forEach(log => {
        csvContent += `"${log.type}","${log.date}","${log.time}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `נוכחות_${new Date().toLocaleDateString('he-IL')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Clear all records from LocalStorage
function clearData() {
    if (confirm('האם אתה בטוח שברצונך למחוק את כל הדיווחים?')) {
        localStorage.removeItem('attendanceLogs');
        displayLogs();
    }
}