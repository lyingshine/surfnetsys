// 单独启动客户端的脚本
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let loginWindow;

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    loginWindow.loadURL('http://localhost:3000/login.html');
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createClientWindow(username) {
    const win = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    win.loadURL(`http://localhost:3000/client.html?username=${username}`);
    return win;
}

function createAdminWindow(username) {
    const win = new BrowserWindow({
        width: 900, height: 675, frame: false, alwaysOnTop: true,
        backgroundColor: '#F7F7F7', webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    win.loadURL(`http://localhost:3000/admin.html?username=${username}`);
    return win;
}

app.whenReady().then(() => {
    createLoginWindow();
    
    ipcMain.on('login-success', (event, { page, username }) => {
        if (page === 'admin.html') {
            createAdminWindow(username);
        } else {
            createClientWindow(username);
        }
        if (loginWindow) {
            loginWindow.close();
        }
    });

    // IPC handlers for window controls
    ipcMain.on('minimize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.minimize(); });
    ipcMain.on('maximize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); } });
    ipcMain.on('close-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.close(); });
    ipcMain.handle('toggle-always-on-top', (event) => { const win = BrowserWindow.fromWebContents(event.sender); const isAlwaysOnTop = !win.isAlwaysOnTop(); win.setAlwaysOnTop(isAlwaysOnTop); return isAlwaysOnTop; });
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createLoginWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});