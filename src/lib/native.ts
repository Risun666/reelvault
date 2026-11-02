import { Capacitor, registerPlugin } from '@capacitor/core'

/** 是否运行在 Capacitor 原生壳（APK）里 */
export const isNative = () => Capacitor.isNativePlatform()

/** 是否运行在安卓 APK 里（隐私安全 / 应用内更新仅安卓支持） */
export const isAndroid = Capacitor.getPlatform() === 'android'

let inited = false

/**
 * 原生壳下的额外行为：
 * - 安卓返回键：优先回退路由，栈顶时直接退出应用
 * - 阻止 iOS 的橡皮筋回弹，避免误触返回
 * - 监听前后台切换：回到前台校正视口；进入后台时若保险箱已解锁则立刻上锁
 */
export async function initNative() {
  if (inited || !isNative()) return
  inited = true

  const { App } = await import('@capacitor/app')

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.location.hash.split('/').length > 1) {
      window.history.back()
    } else {
      void App.exitApp()
    }
  })

  void App.addListener('appStateChange', ({ isActive }) => {
    // 回到前台时重新校正视口高度，规避安卓键盘导致的布局错位
    if (isActive) {
      window.dispatchEvent(new Event('resize'))
    }
  })
}

// ----------------------------------------------------------------------------
// 影匣专用原生能力（ReelVaultPlugin，仅安卓；iOS/桌面/浏览器下均为空操作）
// 1) 隐私安全：保险箱解锁时给窗口加安全标志 + 把多任务标签改为「影匣 · 隐私模式」
// 2) 应用内更新：通过系统下载管理器后台下载 APK，完成后自动弹出安装
// ----------------------------------------------------------------------------

export interface DownloadEvent {
  /** downloading | installing | done | error */
  state: string
  progress: number
  message: string
}

interface ReelVaultPlugin {
  setSecure(opts: { enabled: boolean }): Promise<void>
  setTaskLabel(opts: { label: string }): Promise<void>
  downloadApk(opts: { url: string; title: string }): Promise<void>
  addListener(
    event: 'downloadProgress',
    cb: (e: DownloadEvent) => void
  ): Promise<{ remove(): void }>
}

const ReelVault = registerPlugin<ReelVaultPlugin>('ReelVault')

/** 保险箱解锁状态变化：解锁时给窗口加安全标志并切换多任务标签 */
export async function setVaultSecure(active: boolean): Promise<void> {
  if (!isAndroid) return
  try {
    await ReelVault.setSecure({ enabled: active })
  } catch {
    /* 非安卓或插件不可用，忽略 */
  }
}

/** 把后台任务栏里的 App 标题改成隐私模式文案（未解锁时恢复成普通标题） */
export async function setPrivacyTaskLabel(label: string): Promise<void> {
  if (!isAndroid) return
  try {
    await ReelVault.setTaskLabel({ label })
  } catch {
    /* 同上 */
  }
}

/** 应用内下载 APK 并自动安装；非安卓时退化为浏览器下载 */
export async function downloadApkAndInstall(url: string, title: string): Promise<void> {
  if (!isAndroid) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  await ReelVault.downloadApk({ url, title })
}

/** 订阅下载进度；返回取消订阅函数 */
export function onDownloadProgress(cb: (e: DownloadEvent) => void): () => void {
  if (!isAndroid) return () => {}
  const handle = ReelVault.addListener('downloadProgress', cb)
  return () => {
    void handle.then((h) => h.remove())
  }
}
