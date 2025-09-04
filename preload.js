const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        const validSendChannels = ['minimize-window', 'maximize-window', 'close-window', 'login-success'];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    invoke: (channel, data) => {
        const validInvokeChannels = ['toggle-always-on-top'];
        if (validInvokeChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});
