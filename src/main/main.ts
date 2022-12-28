/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import {
    app,
    BrowserWindow,
    shell,
    ipcMain,
    Menu,
    nativeImage,
    Tray,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import axios from 'axios';

class AppUpdater {
    constructor() {
        log.transports.file.level = 'info';
        autoUpdater.logger = log;
        autoUpdater.checkForUpdatesAndNotify();
    }
}

let mainWindow: BrowserWindow | null = null;
let tray: any | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.log(msgTemplate(arg));
    event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

const isDebug =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
    require('electron-debug')();
}

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
        .default(
            extensions.map((name) => installer[name]),
            forceDownload
        )
        .catch(console.log);
};

const createWindow = async () => {
    if (isDebug) {
        await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
        show: !app.getLoginItemSettings().wasOpenedAsHidden,
        width: 1024,
        height: 728,
        icon: getAssetPath('alpine512.png'),
        webPreferences: {
            preload: app.isPackaged
                ? path.join(__dirname, 'preload.js')
                : path.join(__dirname, '../../.alpine/dll/preload.js'),
        },
    });

    mainWindow.loadURL(resolveHtmlPath('index.html'));

    mainWindow.on('ready-to-show', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
            mainWindow.minimize();
        } else {
            mainWindow.show();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
};

const createTray = () => {
    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    const icon = getAssetPath('alpine512C.png'); // required.
    const trayicon = nativeImage.createFromPath(icon);
    tray = new Tray(trayicon.resize({ width: 16 }));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                if (process.platform === 'darwin') {
                    app.dock.show();
                }
                if (mainWindow === null) {
                    createWindow();
                } else {
                    mainWindow.show();
                }
            },
        },
        // {
        //   label: 'Quit',
        //   click: () => {
        //     tray.destroy()
        //     app.quit() // actually quit the app.
        //   }
        // },
    ]);

    tray.setContextMenu(contextMenu);
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed

    if (process.platform === 'darwin') {
        app.dock.hide();
    }
});

const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
    app.quit();
} else {
    app.on('second-instance', (event, argv, cwd) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            else mainWindow.show();

            mainWindow.focus();
        } else {
            createWindow();
        }
    });
}

app.whenReady()
    .then(() => {
        app.on('activate', () => {
            // On macOS it's common to re-create a window in the app when the
            // dock icon is clicked and there are no other windows open.
            if (mainWindow === null) createWindow();
            else mainWindow.show();

            if (process.platform === 'darwin') {
                if (!app.dock.isVisible()) app.dock.show();
            }
        });
    })
    .catch(console.log);

app.on('ready', () => {
    setInterval(() => {
        const data = {
            name: 'Alpine',
            job: 'Software Engineer',
        };

        axios
            .post('http://192.168.0.102:3000/setdata', data)
            .then((res) => {
                console.log(`Status: ${res.status}`);
            })
            .catch((err) => {
                console.log(err);
            });
    }, 2000);

    const isLogin = process.argv.includes('--hidden');
    if (isLogin) {
        if (mainWindow) mainWindow.hide();
    } else {
        createWindow();
    }
    if (!tray) {
        createTray();
    }
});

app.on('before-quit', (event) => {
    console.log('before quit.........');
    if (process.platform === 'darwin') app.dock.hide();
    if (mainWindow) mainWindow.destroy();
    event.preventDefault();
});

app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--process-start-args', `"--hidden"`],
});
