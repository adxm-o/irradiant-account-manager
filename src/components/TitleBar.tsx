import { motion } from 'framer-motion';
import { Minus, Settings as SettingsIcon, Square, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Logo from './Logo';
import { useApp } from '../state/AppState';

export default function TitleBar() {
  const { view, setView } = useApp();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.irradiant.window.isMaximized().then(setMaximized);
    return window.irradiant.window.onState((state) => setMaximized(state.maximized));
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <Logo size={24} />
        <span className="brand-word">Irradiant</span>
        <span className="badge neutral">account manager</span>
      </div>

      <div className="titlebar-right">
        <nav className="titlebar-actions">
          <button
            className={`nav-pill ${view === 'accounts' ? 'active' : ''}`}
            title="Accounts"
            onClick={() => setView('accounts')}
          >
            {view === 'accounts' ? (
              <motion.span layoutId="titlebar-pill" className="nav-pill-glow" transition={{ duration: 0.3 }} />
            ) : null}
            <Users size={15} />
          </button>
          <button
            className={`nav-pill ${view === 'settings' ? 'active' : ''}`}
            title="Settings"
            onClick={() => setView('settings')}
          >
            {view === 'settings' ? (
              <motion.span layoutId="titlebar-pill" className="nav-pill-glow" transition={{ duration: 0.3 }} />
            ) : null}
            <SettingsIcon size={15} />
          </button>
        </nav>

        <div className="win-controls">
          <button className="win-btn" onClick={() => window.irradiant.window.minimize()} title="Minimize">
            <Minus size={15} />
          </button>
          <button
            className="win-btn"
            onClick={async () => setMaximized(await window.irradiant.window.toggleMaximize())}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            <Square size={12} />
          </button>
          <button className="win-btn danger" onClick={() => window.irradiant.window.close()} title="Close">
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
