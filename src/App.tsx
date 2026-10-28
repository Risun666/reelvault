import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { libraryStore, vaultStore } from './store/zone'
import { shouldAutoLock, useVaultSession } from './store/vaultSession'
import { useCollections } from './store/collections'
import { initTheme } from './store/theme'
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
import { restoreAuthSession } from './store/auth'

const NAV_ROUTES = ['/', '/discover', '/collections', '/stats', '/settings']

initTheme()

export default function App() {
  useEffect(() => {
    void libraryStore.getState().refresh()
    void useVaultSession.getState().init()
    void useCollections.getState().refreshPublic()
    void restoreAuthSession()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = useVaultSession.getState()
      if (s.active && shouldAutoLock(s.lastTouch)) {
        s.lock()
        vaultStore.getState().clearMemory()
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
