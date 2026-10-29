import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { libraryStore, vaultStore } from './store/zone'
import { libraryPeople, vaultPeople } from './store/people'
import { shouldAutoLock, useVaultSession } from './store/vaultSession'
import { useCollections } from './store/collections'
import { useSettings } from './store/settings'
import { initTheme } from './store/theme'
import { autoTune } from './lib/tmdb'
import ToastHost from './components/Toast'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Discover from './pages/Discover'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Detail from './pages/Detail'
import AddItem from './pages/AddItem'
import VaultGate from './pages/VaultGate'
import Collections from './pages/Collections'
import CollectionDetail from './pages/CollectionDetail'
import ActorDetail from './pages/ActorDetail'

const NAV_ROUTES = ['/', '/discover', '/collections', '/stats', '/settings']
const TUNE_KEY = 'rv.tmdbTunedAt'

initTheme()

export default function App() {
  useEffect(() => {
    void libraryStore.getState().refresh()
    void useVaultSession.getState().init()
    void useCollections.getState().refreshPublic()
    void libraryPeople.getState().refresh()
  }, [])

  // 启动时挑一次最快的接口节点与可用的图片域名（最多每天一次）
  useEffect(() => {
    void (async () => {
      const s = useSettings.getState()
      if (s.autoEndpoint === false) return
      const stamp = Number(localStorage.getItem(TUNE_KEY) ?? 0)
      if (Date.now() - stamp < 24 * 3600 * 1000) return
      try {
        const best = await autoTune(s)
        localStorage.setItem(TUNE_KEY, String(Date.now()))
        const patch: Partial<Record<'apiBase' | 'imageBase', string>> = {}
        if (best.api && best.api !== s.apiBase) patch.apiBase = best.api
        if (best.image && best.image !== s.imageBase) patch.imageBase = best.image
        if (Object.keys(patch).length) useSettings.getState().set(patch)
      } catch {
        /* 网络不通就算了，不打扰用户 */
      }
    })()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = useVaultSession.getState()
      if (s.active && shouldAutoLock(s.lastTouch)) {
        s.lock()
        vaultStore.getState().clearMemory()
        vaultPeople.getState().clearMemory()
      }
    }, 15000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collection/:id" element={<CollectionDetail />} />
          <Route path="/person/:zone/:id" element={<ActorDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/title/:zone/:id" element={<Detail />} />
          <Route path="/add/:zone" element={<AddItem />} />
          <Route path="/edit/:zone/:id" element={<AddItem />} />
          <Route path="/vault" element={<VaultGate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const showNav = NAV_ROUTES.includes(location.pathname)

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <main className="flex-1">{children}</main>
      {showNav && <BottomNav />}
      <ToastHost />
    </div>
  )
}
