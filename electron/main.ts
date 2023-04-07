/* eslint-disable no-useless-catch */
import { app, BrowserWindow, Menu, shell } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { Api } from './api';
import { AppMenu } from './menu';
const { autoUpdater } = require('electron-updater');
const {
    setupTitlebar,
    attachTitlebarToWindow,
} = require('custom-electron-titlebar/main');
const contextMenu = require('electron-context-menu');
const Store = require('electron-store');
const store = new Store();

const WINDOW_BOUNDS = 'WINDOW_BOUNDS';

setupTitlebar();
let win: BrowserWindow | null = null;
const args = process.argv.slice(1),
    serve = args.some((val) => val === '--serve');

const api = new Api();
contextMenu();
require('@electron/remote/main').initialize();

function createWindow(): BrowserWindow {
    // Create the browser window.
    win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            allowRunningInsecureContent: serve ? true : false,
            contextIsolation: false,
            webSecurity: false,
        },
        resizable: true,
        darkTheme: true,
        icon: path.join(__dirname, '../dist/assets/icons/icon.png'),
        titleBarStyle: 'hidden',
        frame: false,
        minWidth: 400,
        minHeight: 500,
        title: 'ESX-IPTV',
        ...store.get(WINDOW_BOUNDS),
    });
    attachTitlebarToWindow(win);

    require('@electron/remote/main').enable(win.webContents);

    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    if (serve) {
        win.webContents.openDevTools();
        win.loadURL('http://localhost:4200');
    } else {
        win.loadURL(
            url.format({
                pathname: path.join(__dirname, '../dist/index.html'),
                protocol: 'file:',
                slashes: true,
            })
        );
    }

    win.on('close', () => {
        store.set(WINDOW_BOUNDS, win?.getNormalBounds());
    });

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store window
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null;

        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    return win;
}

/**
 * Creates hidden window for EPG worker
 * Hidden window is used as an additional thread to avoid blocking of the UI by long operations
 */
function createEpgWorkerWindow() {
    const window = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    window.loadFile('./electron/epg-worker.html');
    if (serve) {
        window.webContents.openDevTools();
    }

    window.once('ready-to-show', () => {
        api.setEpgWorkerWindow(window);
    });

    return window;
}

try {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    // Added 400 ms to fix the black background issue while using transparent window. More details at https://github.com/electron/electron/issues/15947
    app.on('ready', () => {
        // create main window and set menu
        const win = createWindow();
        const menu = new AppMenu(win);
        Menu.setApplicationMenu(menu.getMenu());
        api.setMainWindow(win);

        // create hidden window for epg worker
        createEpgWorkerWindow();

        // check for updates
        autoUpdater.checkForUpdates();

        autoUpdater.on('update-available', () => {
            
        });

        autoUpdater.on('update-not-available', () => {
            win.webContents.executeJavaScript(`Swal.fire({
        title: 'Atualizações',
        html: 'Não há atualizações disponíveis.',
        icon: 'error'
    });`)
        });

        autoUpdater.on('update-downloaded', () => {
            
        });

        interface DownloadProgress {
            bytesPerSecond: number;
            percent: number;
            transferred: number;
            total: number;
        }

        autoUpdater.on('download-progress', (progressObj: DownloadProgress) => {
            win.webContents.executeJavaScript(`Swal.fire({
        title: 'Baixando atualização',
        html: 'Speed: ${progressObj.bytesPerSecond} - ${~~progressObj.percent}% [${progressObj.transferred}/${progressObj.total}',
        allowOutsideClick: false,
        onBeforeOpen: () => {
            Swal.showLoading();
        }
    });`)
        });

        autoUpdater.on('update-downloaded', () => {
            win.webContents.executeJavaScript(`Swal.fire({
        title: 'Reiniciando o aplicativo',
        html: 'Aguente firme, reiniciando o aplicativo para atualização!',
        allowOutsideClick: false,
        onBeforeOpen: () => {
            Swal.showLoading();
        }
    });`)
            autoUpdater.quitAndInstall();
        });
    });

    // Quit when all windows are closed.
    app.on('window-all-closed', () => {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (win === null) {
            win = createWindow();
            const menu = new AppMenu(win);
            Menu.setApplicationMenu(menu.getMenu());
            api.setMainWindow(win);
        }
    });

    app.on('before-quit', () => {
        store.set(WINDOW_BOUNDS, win?.getNormalBounds());
    });
} catch (e) {
    // Catch Error
    throw e;
}

