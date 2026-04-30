const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("screenVoiceApp", {
  platform: process.platform,
});
