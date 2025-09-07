const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let launcherWindow;
let serverProcess;
let serverStatus = 'stopped'; // Initial status

// 检查服务器状态
function checkServerStatus() {
    const client = new net.Socket();
    client.setTimeout(2000); // 设置2秒超时
    
    client.connect(3000, '127.0.0.1', () => {
        if (serverStatus !== 'running') {
            serverStatus = 'running';
            if (launcherWindow && !launcherWindow.isDestroyed()) {
                launcherWindow.webContents.send('server-status', 'running');
            }
        }
        client.end();
    });

    client.on('error', (err) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
            if (serverStatus !== 'stopped') {
                serverStatus = 'stopped';
                if (launcherWindow && !launcherWindow.isDestroyed()) {
                    launcherWindow.webContents.send('server-status', 'stopped');
                }
            }
        }
    });

    client.on('timeout', () => {
        if (serverStatus !== 'stopped') {
            serverStatus = 'stopped';
            if (launcherWindow && !launcherWindow.isDestroyed()) {
                launcherWindow.webContents.send('server-status', 'stopped');
            }
        }
        client.destroy();
    });
}

function createLauncherWindow() {
    launcherWindow = new BrowserWindow({
        width: 500,
        height: 400,
        webPreferences: {
            preload: path.join(__dirname, 'launcher_preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    launcherWindow.loadFile('launcher.html');

    // Start polling when the window is ready
    setInterval(checkServerStatus, 2000); // Check every 2 seconds

    launcherWindow.on('closed', () => {
        if (serverProcess) {
            serverProcess.kill();
        }
    });
}

app.whenReady().then(createLauncherWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('start-server', () => {
    if (serverStatus === 'running') {
        console.log('Server is already running');
        return;
    }

    console.log('Starting server...');
    try {
        serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
            detached: true,
            stdio: 'ignore'
        });

        serverProcess.on('error', (err) => {
            console.error('Failed to start server:', err);
            serverStatus = 'stopped';
            if (launcherWindow && !launcherWindow.isDestroyed()) {
                launcherWindow.webContents.send('server-status', 'stopped');
            }
        });

        // 给服务器一些启动时间
        setTimeout(checkServerStatus, 1000);
    } catch (error) {
        console.error('Error occurred while starting server:', error);
        serverStatus = 'stopped';
        if (launcherWindow && !launcherWindow.isDestroyed()) {
            launcherWindow.webContents.send('server-status', 'stopped');
        }
    }
});

ipcMain.on('start-client', () => {
    if (serverStatus !== 'running') {
        console.log('Please start the server first');
        return;
    }

    console.log('Starting client...');
    try {
        const clientProcess = spawn(process.execPath, ['.'], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, CLIENT_ONLY: 'true' },
        });
        clientProcess.unref();
    } catch (error) {
        console.error('Failed to start client:', error);
    }
});
