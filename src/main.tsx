import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initNative } from './lib/native'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')
createRoot(el).render(<App />)

void initNative()

// APK 内的资源本身就打在包里，Service Worker 只会带来"升级后仍读旧缓存"的麻烦，
// 因此仅在浏览器环境注册。
if (import.meta.env.PROD) {
  void import('@capacitor/core').then(({ Capacitor }) => {
    if (Capacitor.isNativePlatform()) return
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
  })
}
