const { app, BrowserWindow, desktopCapturer } = require("electron");
const path = require("path");

app.commandLine.appendSwitch("auto-select-desktop-capture-source", "Entire screen");
app.commandLine.appendSwitch("allow-http-screen-capture");

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 780,
    minWidth: 860,
    minHeight: 640,
    title: "Screen Voice Capture and Summary",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });

  win.webContents.session.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"], fetchWindowIcons: false })
      .then((sources) => {
        const source = sources[0];
        if (!source) {
          callback({});
          return;
        }
        callback({ video: source, audio: "loopback" });
      })
      .catch((error) => {
        console.error("Failed to select screen capture source:", error);
        callback({});
      });
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
