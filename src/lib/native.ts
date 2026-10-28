import { Capacitor } from '@capacitor/core'

/** 是否运行在 Capacitor 原生壳（APK）里 */
export const isNative = () => Capacitor.isNativePlatform()

let inited = false

/**
 * 原生壳下的额外行为：
 * - 安卓返回键：优先回退路由，栈顶时直接退出应用
 * - 阻止 iOS 的橡皮筋回弹，避免误触返回
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
