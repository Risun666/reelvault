import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.reelvault.app',
  appName: '影匣',
  webDir: 'dist',
  // Android 6.x 默认已是 https://localhost，这里显式声明，保证 WebCrypto（保险箱 PIN）可用
  android: {
    allowMixedContent: false,
    // 顶部状态栏/底部导航栏的安全区由 CSS env() 处理
    webContentsDebuggingEnabled: false
  },
  server: {
    // TMDb 图片与接口是可信来源，允许 WebView 正常加载
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f7f6f3',
      showSpinner: false
    }
  }
}

export default config
