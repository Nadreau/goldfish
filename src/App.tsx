import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import PrivacyControls from './pages/PrivacyControls';
import Settings from './pages/Settings';
import { CaptureProvider } from './lib/captureContext';

export type Page = 'dashboard' | 'privacy' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for meta/ctrl key combos
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setPage('dashboard');
            break;
          case '2':
            e.preventDefault();
            setPage('privacy');
            break;
          case '3':
            e.preventDefault();
            setPage('settings');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <CaptureProvider>
      <div className="flex h-screen bg-[#09090b] text-white overflow-hidden">
        {/* Sidebar with glass effect */}
        <Sidebar currentPage={page} onNavigate={setPage} />
        
        {/* Main content area with subtle page transitions */}
        <main className="flex-1 overflow-hidden relative">
          {/* Page content with fade animation */}
          <div key={page} className="h-full animate-fade-in">
            {page === 'dashboard' && <Dashboard />}
            {page === 'privacy' && <PrivacyControls />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </CaptureProvider>
  );
}

export default App;
