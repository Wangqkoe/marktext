const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gestureProbe', {
  begin: () => ipcRenderer.send('gesture:begin'),
  cancel: () => ipcRenderer.send('gesture:cancel', 'escape'),
  rendererEvent: type => ipcRenderer.send('gesture:renderer-event', type),
  onEvent: callback => ipcRenderer.on('gesture:event', (_event, entry) => callback(entry))
})
