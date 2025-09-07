const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let launcherWindow;
let serverProcess;
let serverStatus = 'stopped'; // Initial status

// Function to check the server status by polling the port
function checkServerStatus() {
    const client = new net.Socket();
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
        if (err.code === 'ECONNREFUSED') {
            if (serverStatus !== 'stopped') {
                serverStatus = 'stopped';
                if (launcherWindow && !launcherWindow.isDestroyed()) {
                    launcherWindow.webContents.send('server-status', 'stopped');
                }
            }
        }
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
        console.log('Server is already running.');
        return;
    }

    console.log('Starting server from launcher...');
    serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
        detached: true,
    });

    // Give the server a moment to start before the first check
    setTimeout(checkServerStatus, 500);
});

ipcMain.on('start-client', () => {
    console.log('Starting a new client...');
    const clientProcess = spawn(process.execPath, ['.'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CLIENT_ONLY: 'true' },
    });
    clientProcess.unref();
});
