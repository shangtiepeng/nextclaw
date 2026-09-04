import { Menu, app, dialog, ipcMain, type MessageBoxOptions, type MenuItemConstructorOptions } from "electron";
import { AUTOMATIC_UPDATE_CHECK_INTERVAL_MS } from "@nextclaw/kernel/automatic-update-check";
import type { DesktopBundleManager } from "./desktop-bundle.manager";
import type { DesktopWindowManager } from "./desktop-window.manager";
import {
  DesktopUpdateCoordinatorService,
  type DesktopUpdateCapability,
  type DesktopUpdateSnapshot
} from "../launcher/services/update-coordinator.service";
import type { DesktopReleaseChannel } from "../launcher/stores/launcher-state.store";
import type { DesktopPresenceService } from "../services/desktop-presence.service";
import {
  DESKTOP_UPDATES_APPLY_CHANNEL,
  DESKTOP_UPDATES_CHECK_CHANNEL,
  DESKTOP_UPDATES_DOWNLOAD_CHANNEL,
  DESKTOP_UPDATES_GET_STATE_CHANNEL,
  DESKTOP_UPDATES_STATE_CHANGED_CHANNEL,
  DESKTOP_UPDATES_UPDATE_CHANNEL_CHANNEL
} from "../utils/desktop-ipc.utils";
import {
  drainDesktopCleanups,
  removeDesktopIpcHandlers,
  type DesktopCleanup
} from "../utils/desktop-lifecycle.utils";

type DesktopUpdateManagerLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type DesktopUpdateManagerOptions = {
  logger: DesktopUpdateManagerLogger;
  launcherVersion: string;
  updateCapability?: DesktopUpdateCapability;
  bundleManager: DesktopBundleManager;
  presenceService: DesktopPresenceService;
  restartApplication: () => Promise<void>;
  windowManager: DesktopWindowManager;
  automaticCheckIntervalMs?: number;
};

export class DesktopUpdateManager {
  private readonly cleanups: DesktopCleanup[] = [];
  private coordinator: DesktopUpdateCoordinatorService | null = null;
  private automaticCheckSchedulerStarted = false;
  private automaticCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: DesktopUpdateManagerOptions) {}

  start = (): void => {
    this.dispose();
    this.registerIpcHandlers();
    this.installApplicationMenu();
    this.cleanups.push(() => {
      Menu.setApplicationMenu(null);
    });
  };

  dispose = (): void => {
    drainDesktopCleanups(this.cleanups);
  };

  private registerIpcHandlers = (): void => {
    const cleanupIpcHandlers = removeDesktopIpcHandlers(
      DESKTOP_UPDATES_GET_STATE_CHANNEL,
      DESKTOP_UPDATES_CHECK_CHANNEL,
      DESKTOP_UPDATES_DOWNLOAD_CHANNEL,
      DESKTOP_UPDATES_APPLY_CHANNEL,
      DESKTOP_UPDATES_UPDATE_CHANNEL_CHANNEL
    );
    cleanupIpcHandlers();

    ipcMain.handle(DESKTOP_UPDATES_GET_STATE_CHANNEL, async () => this.ensureCoordinator().getSnapshot());
    ipcMain.handle(DESKTOP_UPDATES_CHECK_CHANNEL, async () => await this.checkForUpdates());
    ipcMain.handle(DESKTOP_UPDATES_DOWNLOAD_CHANNEL, async () => await this.ensureCoordinator().downloadUpdate());
    ipcMain.handle(DESKTOP_UPDATES_APPLY_CHANNEL, async () => {
      const snapshot = await this.ensureCoordinator().applyDownloadedUpdate();
      await this.options.restartApplication();
      return snapshot;
    });
    ipcMain.handle(DESKTOP_UPDATES_UPDATE_CHANNEL_CHANNEL, async (_event, channel: DesktopReleaseChannel | undefined) => {
      return await this.updateChannel(channel === "beta" ? "beta" : "stable");
    });
    this.cleanups.push(cleanupIpcHandlers);
  };

  private installApplicationMenu = (): void => {
    if (process.platform !== "darwin") {
      Menu.setApplicationMenu(null);
      return;
    }

    const snapshot = this.coordinator?.getSnapshot();
    const template: MenuItemConstructorOptions[] = [
      this.createDarwinAppMenu(snapshot),
      this.createDarwinEditMenu(),
      this.createDarwinViewMenu(),
      this.createDarwinWindowMenu(),
      this.createHelpMenu(snapshot)
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  startAutomaticChecks = async (): Promise<void> => {
    if (this.automaticCheckSchedulerStarted || this.ensureCoordinator().getSnapshot().blockReason) {
      return;
    }
    this.automaticCheckSchedulerStarted = true;
    this.cleanups.push(() => {
      this.clearAutomaticCheckTimer();
      this.automaticCheckSchedulerStarted = false;
    });
    await this.runAutomaticCheck();
  };

  private runAutomaticCheck = async (): Promise<void> => {
    try {
      await this.ensureCoordinator().runAutomaticCheck();
    } catch (error) {
      this.options.logger.warn(
        `Desktop automatic update check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.scheduleNextAutomaticCheck();
    }
  };

  private get automaticCheckIntervalMs(): number {
    return this.options.automaticCheckIntervalMs ?? AUTOMATIC_UPDATE_CHECK_INTERVAL_MS;
  }

  private scheduleNextAutomaticCheck = (): void => {
    if (!this.automaticCheckSchedulerStarted) {
      return;
    }
    this.clearAutomaticCheckTimer();
    this.automaticCheckTimer = setTimeout(this.runAutomaticCheck, this.automaticCheckIntervalMs);
  };

  private clearAutomaticCheckTimer = (): void => {
    if (this.automaticCheckTimer) {
      clearTimeout(this.automaticCheckTimer);
      this.automaticCheckTimer = null;
    }
  };

  private checkForUpdates = async (): Promise<DesktopUpdateSnapshot> => {
    try {
      return await this.ensureCoordinator().checkForUpdates({ manual: true });
    } finally {
      this.scheduleNextAutomaticCheck();
    }
  };

  private updateChannel = async (channel: DesktopReleaseChannel): Promise<DesktopUpdateSnapshot> => {
    try {
      return await this.ensureCoordinator().updateChannel(channel);
    } finally {
      this.scheduleNextAutomaticCheck();
    }
  };

  private ensureCoordinator = (): DesktopUpdateCoordinatorService => {
    if (this.coordinator) {
      return this.coordinator;
    }

    this.coordinator = new DesktopUpdateCoordinatorService({
      launcherVersion: this.options.launcherVersion,
      updateCapability: this.options.updateCapability,
      bundleManager: this.options.bundleManager,
      updateSourceService: this.options.bundleManager.updateSourceService,
      publishSnapshot: (snapshot) => {
        this.publishSnapshot(snapshot);
        this.installApplicationMenu();
      }
    });

    return this.coordinator;
  };

  private createDarwinAppMenu = (snapshot: DesktopUpdateSnapshot | undefined): MenuItemConstructorOptions => {
    return {
      label: app.name,
      submenu: [
        { label: "关于元流", role: "about" },
        { type: "separator" },
        ...this.createUpdateMenuItems(snapshot),
        { type: "separator" },
        { label: "服务", role: "services" },
        { type: "separator" },
        { label: "隐藏元流", role: "hide" },
        { label: "隐藏其他", role: "hideOthers" },
        { label: "显示全部", role: "unhide" },
        { type: "separator" },
        {
          label: "退出元流",
          accelerator: "CommandOrControl+Q",
          click: () => {
            this.options.presenceService.requestExplicitQuit();
          }
        }
      ]
    };
  };

  private createDarwinEditMenu = (): MenuItemConstructorOptions => ({
    label: "编辑",
    submenu: [
      { label: "撤销", role: "undo" },
      { label: "重做", role: "redo" },
      { type: "separator" },
      { label: "剪切", role: "cut" },
      { label: "复制", role: "copy" },
      { label: "粘贴", role: "paste" },
      { label: "全选", role: "selectAll" }
    ]
  });

  private createDarwinViewMenu = (): MenuItemConstructorOptions => ({
    label: "视图",
    submenu: [
      { label: "重新加载", role: "reload" },
      { label: "强制重新加载", role: "forceReload" },
      { label: "切换开发者工具", role: "toggleDevTools" },
      { type: "separator" },
      { label: "实际大小", role: "resetZoom" },
      { label: "放大", role: "zoomIn" },
      { label: "缩小", role: "zoomOut" },
      { type: "separator" },
      { label: "切换全屏", role: "togglefullscreen" }
    ]
  });

  private createDarwinWindowMenu = (): MenuItemConstructorOptions => ({
    label: "窗口",
    submenu: [
      { label: "最小化", role: "minimize" },
      { label: "缩放", role: "zoom" },
      { type: "separator" },
      { label: "置于前台", role: "front" }
    ]
  });

  private createHelpMenu = (snapshot: DesktopUpdateSnapshot | undefined): MenuItemConstructorOptions => {
    return {
      label: "帮助",
      submenu: this.createUpdateMenuItems(snapshot)
    };
  };

  private createUpdateMenuItems = (snapshot: DesktopUpdateSnapshot | undefined): MenuItemConstructorOptions[] => {
    return [
      {
        label: "检查更新",
        click: () => void this.handleManualUpdateCheck()
      },
      {
        label: "下载更新",
        enabled: snapshot?.status === "update-available",
        click: () => void this.handleManualUpdateDownload()
      },
      {
        label: "重启并应用更新",
        enabled: snapshot?.status === "downloaded",
        click: () => void this.handleApplyDownloadedUpdate()
      }
    ];
  };

  private handleManualUpdateCheck = async (): Promise<void> => {
    try {
      const snapshot = await this.checkForUpdates();
      if (snapshot.status === "up-to-date") {
        await this.showMessage("info", "元流已是最新版本", "当前已安装最新的桌面端版本。");
        return;
      }
      if (snapshot.status === "update-available") {
        const response = await dialog.showMessageBox({
          type: "info",
          title: "发现元流更新",
          message: `版本 ${snapshot.availableVersion ?? "新版"} 已可用。`,
          detail: "现在下载，准备好重启元流时再安装。",
          buttons: ["立即下载", "稍后"],
          defaultId: 0,
          cancelId: 1
        });
        if (response.response === 0) {
          await this.handleManualUpdateDownload();
        }
        return;
      }
      if (snapshot.status === "downloaded") {
        await this.showDownloadedUpdateDialog(snapshot);
        return;
      }
      if ((snapshot.status === "blocked" || snapshot.status === "failed") && snapshot.errorMessage) {
        const title = snapshot.status === "blocked" ? "桌面端更新已阻止" : "桌面端更新检查失败";
        await this.showMessage("warning", title, snapshot.errorMessage);
      }
    } catch (error) {
      await this.showMessage("error", "桌面端更新检查失败", error);
    }
  };

  private handleManualUpdateDownload = async (): Promise<void> => {
    try {
      const snapshot = await this.ensureCoordinator().downloadUpdate();
      if (snapshot.status === "downloaded") {
        await this.showDownloadedUpdateDialog(snapshot);
      }
    } catch (error) {
      await this.showMessage("error", "桌面端更新下载失败", error);
    }
  };

  private handleApplyDownloadedUpdate = async (): Promise<void> => {
    try {
      await this.ensureCoordinator().applyDownloadedUpdate();
      await this.options.restartApplication();
    } catch (error) {
      await this.showMessage("error", "无法应用桌面端更新", error);
    }
  };

  private showMessage = async (
    type: "info" | "warning" | "error",
    title: string,
    message: unknown
  ): Promise<void> => {
    await dialog.showMessageBox({
      type,
      title,
      message: message instanceof Error ? message.message : String(message),
      buttons: ["确定"]
    });
  };

  private showDownloadedUpdateDialog = async (snapshot: DesktopUpdateSnapshot): Promise<void> => {
    if (snapshot.status !== "downloaded") {
      return;
    }

    const dialogOptions: MessageBoxOptions = {
      type: "info",
      title: "元流更新已就绪",
      message: `版本 ${snapshot.downloadedVersion ?? "新版"} 已下载，随时可以安装。`,
      detail: "立即重启元流即可应用新版本。若启动失败，启动器会自动回滚。",
      buttons: ["立即重启", "稍后"],
      defaultId: 0,
      cancelId: 1
    };
    const window = this.options.windowManager.getWindow();
    const response =
      window && !window.isDestroyed()
        ? await dialog.showMessageBox(window, dialogOptions)
        : await dialog.showMessageBox(dialogOptions);
    if (response.response === 0) {
      await this.handleApplyDownloadedUpdate();
    }
  };

  private publishSnapshot = (snapshot: DesktopUpdateSnapshot): void => {
    this.options.logger.info(
      [
        "Desktop update snapshot changed.",
        `status=${snapshot.status}`,
        `channel=${snapshot.channel}`,
        `current=${snapshot.currentVersion ?? ""}`,
        `available=${snapshot.availableVersion ?? ""}`,
        `downloaded=${snapshot.downloadedVersion ?? ""}`
      ].join(" ")
    );

    const window = this.options.windowManager.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    window.webContents.send(DESKTOP_UPDATES_STATE_CHANGED_CHANNEL, snapshot);
  };

}
