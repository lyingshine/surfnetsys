// 强化日志配置
const log = require('electron-log');
log.transports.file.level = 'silly';
log.transports.console.level = 'silly';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB

// 控制台只输出英文和ASCII字符
console.log('\n[SYSTEM] Log system initialized');
console.log('[SYSTEM] Log file:', log.transports.file.getFile().path);
console.log('[STATUS] 100 - System ready');

// 文件日志保留中文信息
log.info('应用程序启动，初始化日志系统');
log.info(`日志文件路径: ${log.transports.file.getFile().path}`);

log.info('应用程序启动，初始化日志系统');
log.info(`日志文件路径: ${log.transports.file.getFile().path}`);

try {
  require('electron-reloader')(module);
} catch (_) {}

const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const localShortcut = require('electron-localshortcut');
const { exec } = require('child_process');
const regedit = require('regedit');
app.disableHardwareAcceleration();
const path = require('path');
const { startServer } = require('./server.js');
let keyboardHook;
try {
    keyboardHook = require('./keyboard_hook/build/Release/keyboard_hook');
    console.log('Keyboard hook module loaded successfully');
} catch (error) {
    console.warn('Keyboard hook module failed to load, will use electron-localshortcut only:', error.message);
}

let loginWindow;
let tray = null;
let clientWindow = null;

const shortcutsToBlock = [
    [18, 9],    // Alt+Tab
    [18, 115],  // Alt+F4
    [91, 9],    // Win+Tab
    [91, 68],   // Win+D
    [91, 82],   // Win+R
    [91, 76],   // Win+L
    [17, 16, 27], // Ctrl+Shift+Esc
    [17, 27]    // Ctrl+Esc
];

function startBlockingShortcuts() {
    // Start keyboard hook
    if (keyboardHook && keyboardHook.startHook) {
        keyboardHook.startHook();
        console.log('Keyboard hook started');
    }

    // Register local shortcuts
    const shortcuts = [
        'Alt+Tab',
        'Alt+F4',
        'CommandOrControl+Shift+Esc',
        'CommandOrControl+Esc',
        'Super+D',
        'Super+R',
        'Super+L',
    ];

    shortcuts.forEach(shortcut => {
        localShortcut.register(shortcut, () => {
            console.log(`Blocked shortcut: ${shortcut}`);
        });
    });
}

function stopBlockingShortcuts() {
    // Stop keyboard hook
    if (keyboardHook && keyboardHook.stopHook) {
        keyboardHook.stopHook();
        console.log('Keyboard hook stopped');
    }

    // Stop electron-localshortcut - requires a valid BrowserWindow instance
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
        localShortcut.unregisterAll(allWindows[0]);
    } else {
        console.log('No active windows, cannot unregister shortcuts');
    }
}

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 800, 
        height: 600,
        kiosk: true, // Enable kiosk mode
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        minimizable: false,
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    loginWindow.loadURL('http://localhost:3000/login.html');

    loginWindow.on('minimize', (event) => {
        event.preventDefault();
    });
    loginWindow.on('blur', () => {
        loginWindow.focus();
    });

    loginWindow.on('closed', () => { loginWindow = null; });

    // Start blocking shortcuts when login window is created
    startBlockingShortcuts();
}

function createClientWindow(username) {
    clientWindow = new BrowserWindow({
        width: 400, height: 600, frame: false, alwaysOnTop: false,
        backgroundColor: '#F7F7F7', 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    clientWindow.loadURL(`http://localhost:3000/client.html?username=${username}`);

    // Create Tray Icon if it doesn't exist
    if (!tray) {
        tray = new Tray(path.join(__dirname, 'icon.jpg'));
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show/Hide',
                click: () => {
                    clientWindow.isVisible() ? clientWindow.hide() : clientWindow.show();
                }
            }
        ]);
        tray.setToolTip('Phantom Online Client');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            clientWindow.isVisible() ? clientWindow.hide() : clientWindow.show();
        });
    }

    // Handle minimize to tray
    clientWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            clientWindow.hide();
        }
    });

    clientWindow.on('closed', () => {
        clientWindow = null;
    });
}

function createAdminWindow(username) {
    const win = new BrowserWindow({
        width: 1200, height: 800, frame: false, alwaysOnTop: false,
        backgroundColor: '#F7F7F7', 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.loadURL(`http://localhost:3000/admin.html?username=${username}`);

    win.on('maximize', () => {
        win.webContents.send('set-controls-visibility', false);
    });
    win.on('unmaximize', () => {
        win.webContents.send('set-controls-visibility', true);
    });
}

app.whenReady().then(() => {
    startBlockingShortcuts();

    // Only start server if not in client-only mode
    if (!process.env.CLIENT_ONLY) {
        app.setLoginItemSettings({
            openAtLogin: true,
            path: app.getPath('exe')
        });
        startServer();
    }
    createLoginWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createLoginWindow();
        }
    });
});

app.on('before-quit', () => {
    app.isQuiting = true;
});

app.on('will-quit', () => {
    stopBlockingShortcuts();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('login-success', (event, { page, username }) => {
    // The login window is in kiosk mode. Closing it will reveal the desktop.
    // We don't need to start explorer.exe again.

    if (page === 'admin.html') {
        stopBlockingShortcuts();
        createAdminWindow(username);
    } else {
        createClientWindow(username);
    }
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (currentWindow) {
        currentWindow.close();
    }
});

ipcMain.on('disable-auto-start', () => {
    app.setLoginItemSettings({
        openAtLogin: false
    });
});

// IPC handlers for window controls
ipcMain.on('minimize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.minimize(); });
ipcMain.on('maximize-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); } });
ipcMain.on('close-window', (event) => { const win = BrowserWindow.fromWebContents(event.sender); win.close(); });
ipcMain.on('logout-to-login', (event) => { 
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (currentWindow) {
        console.log('[STATUS] 200 - Shutdown procedure started');
        log.info('安全下机流程开始', '窗口ID:', currentWindow.id);
        log.info('当前活动窗口数量:', BrowserWindow.getAllWindows().length);
        log.info('当前托盘状态:', tray ? '存在' : '不存在');
        
        // 设置退出标志
        app.isQuiting = true;
        
        // 禁用开机自启动
        app.setLoginItemSettings({
            openAtLogin: false
        });
        
        // 清理托盘图标
        if (tray) {
            log.info('清理托盘图标...');
            tray.destroy();
            tray = null;
        }
        
        // 关闭所有窗口
        log.info('关闭所有窗口...');
        BrowserWindow.getAllWindows().forEach(win => {
            win.close();
        });

        // 注销 Windows 会话（同步执行，确保命令触发）
        log.info('注销 Windows 会话...');
        try {
            const { execSync } = require('child_process');
            execSync('shutdown /l /f'); // /l 注销当前用户，/f 强制关闭应用
            log.info('注销命令已执行');
        } catch (err) {
            log.error('注销 Windows 失败:', err.message);
        }
          
          // 确保应用完全退出
          log.info('退出应用程序...');
          setTimeout(() => {
              app.quit();
        }, 2000); // 延迟2秒确保注销命令生效
    }
});
ipcMain.handle('toggle-always-on-top', (event) => { const win = BrowserWindow.fromWebContents(event.sender); const isAlwaysOnTop = !win.isAlwaysOnTop(); win.setAlwaysOnTop(isAlwaysOnTop); return isAlwaysOnTop; });

// --- Kiosk Mode / Shell Settings ---
const shellKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';

ipcMain.on('set-kiosk-mode', (event) => {
    const appPath = app.getPath('exe');
    const values = {
        [shellKey]: {
            'Shell': {
                value: appPath,
                type: 'REG_SZ'
            }
        }
    };
    regedit.putValue(values, (err) => {
        const sender = event.sender;
        if (err) {
            console.error('Failed to set shell:', err);
            if (sender && !sender.isDestroyed()) sender.send('kiosk-mode-result', { success: false, error: err.message });
        } else {
            console.log('Shell set to application.');
            if (sender && !sender.isDestroyed()) sender.send('kiosk-mode-result', { success: true });
        }
    });
});

ipcMain.on('disable-kiosk-mode', (event) => {
    const values = {
        [shellKey]: {
            'Shell': {
                value: 'explorer.exe',
                type: 'REG_SZ'
            }
        }
    };
    regedit.putValue(values, (err) => {
        const sender = event.sender;
        if (err) {
            console.error('Failed to restore shell:', err);
            if (sender && !sender.isDestroyed()) sender.send('kiosk-mode-result', { success: false, error: err.message });
        } else {
            console.log('Shell restored to explorer.exe.');
            if (sender && !sender.isDestroyed()) sender.send('kiosk-mode-result', { success: true });
        }
    });
});