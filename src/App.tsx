import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Onboarding from './components/Onboarding';
import Home from './pages/DashboardSimple';
import Today from './pages/Today';
import Settings from './pages/Settings';
import { CaptureProvider } from './lib/captureContext';

export type Page = 'home' | 'today' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('home');
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('gf_onboarding_complete');
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showOnboarding) return;
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case '1': e.preventDefault(); setPage('home'); break;
          case '2': e.preventDefault(); setPage('today'); break;
          case '3': e.preventDefault(); setPage('settings'); break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOnboarding]);

  if (showOnboarding) {
    return (
      <CaptureProvider>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </CaptureProvider>
    );
  }

  return (
    <CaptureProvider>
      <div className="app-bg flex h-screen overflow-hidden">
        <Sidebar currentPage={page} onNavigate={setPage} />
        <main className="flex-1 overflow-hidden relative z-10">
          <div key={page} className="h-full animate-fade-in">
            {page === 'home' && <Home />}
            {page === 'today' && <Today />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </CaptureProvider>
  );
}

export default App;
