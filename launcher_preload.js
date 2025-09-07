const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
    send: (channel, data) => {
        const validChannels = ['start-server', 'start-client'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        const validChannels = ['server-status', 'server-error'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});
