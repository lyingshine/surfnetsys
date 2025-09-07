try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startServer } = require('./server.js');

let loginWindow;

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: true,
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    loginWindow.loadURL('http://localhost:3000/login.html');
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createClientWindow(username) {
    const win = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.loadURL(`http://localhost:3000/client.html?username=${username}`);
}

function createAdminWindow(username) {
    const win = new BrowserWindow({
        width: 1200, height: 800, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.loadURL(`http://localhost:3000/admin.html?username=${username}`);
}

app.whenReady().then(() => {
    // Only start the server if not in client-only mode (launched from launcher)
    if (!process.env.CLIENT_ONLY) {
        startServer();
    }
    createLoginWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createLoginWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('login-success', (event, { page, username }) => {
    if (page === 'admin.html') {
        createAdminWindow(username);
    } else {
        createClientWindow(username);
    }
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (currentWindow) {
        currentWindow.close();
    }
});

// IPC handlers for window controls
ipcMain.on('minimize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.minimize(); });
ipcMain.on('maximize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); } });
ipcMain.on('close-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.close(); });
ipcMain.handle('toggle-always-on-top', (event) => { const win = BrowserWindow.fromWebContents(event.sender); const isAlwaysOnTop = !win.isAlwaysOnTop(); win.setAlwaysOnTop(isAlwaysOnTop); return isAlwaysOnTop; });