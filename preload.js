const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        const validSendChannels = [
            'minimize-window', 
            'maximize-window', 
            'close-window', 
            'login-success', 
            'disable-auto-start',
            'set-kiosk-mode',
            'disable-kiosk-mode',
            'logout-to-login'
        ];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    invoke: (channel, data) => {
        const validInvokeChannels = ['toggle-always-on-top'];
        if (validInvokeChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    },
    on: (channel, func) => {
        const validReceiveChannels = ['server-status', 'server-log', 'kiosk-mode-result'];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` 
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});
