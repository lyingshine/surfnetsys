const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// --- Final Debugging Attempt ---
let startServer;
try {
    startServer = require('./server.js').startServer;
} catch (e) {
    console.error("!!!!!!!!!! FAILED TO REQUIRE SERVER.JS !!!!!!!!!!", e);
    startServer = null; // Ensure it's null if require fails
}

// Enable hot reloading in development
try { require('electron-reloader')(module); } catch (_) {}

function createClientWindow() {
    const win = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    win.loadFile('client.html');
    return win;
}

function createAdminWindow() {
    const win = new BrowserWindow({
        width: 800, height: 600, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    win.loadFile('admin.html');
    return win;
}

app.whenReady().then(() => {
    if (startServer) {
        try {
            startServer();
        } catch (e) {
            console.error("!!!!!!!!!! FAILED TO EXECUTE startServer() !!!!!!!!!!", e);
        }
    } else {
        console.error("!!!!!!!!!! Server could not be started because require failed. !!!!!!!!!!");
    }

    createClientWindow();
    createAdminWindow();

    // IPC handlers for window controls
    ipcMain.on('minimize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.minimize(); });
    ipcMain.on('maximize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); } });
    ipcMain.on('close-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.close(); });
    ipcMain.handle('toggle-always-on-top', (event) => { const win = BrowserWindow.fromWebContents(event.sender); const isAlwaysOnTop = !win.isAlwaysOnTop(); win.setAlwaysOnTop(isAlwaysOnTop); return isAlwaysOnTop; });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createClientWindow();
            createAdminWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});