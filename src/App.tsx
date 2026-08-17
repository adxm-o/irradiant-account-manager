import { AnimatePresence, motion } from 'framer-motion';
import TitleBar from './components/TitleBar';
import Toasts from './components/Toasts';
import AccountsPage from './pages/Accounts';
import SettingsPage from './pages/Settings';
import { useApp } from './state/AppState';

export default function App() {
  const { ready, view } = useApp();

  if (!ready) return <Boot />;

  const Pane = view === 'settings' ? SettingsPage : AccountsPage;

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <main className="content-area">
          {/* no mode="wait", if an exit never resolves the next pane never mounts and you get an empty shell */}
          <AnimatePresence>
            <motion.div
              key={view}
              className="scroll-region"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              <Pane />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function Boot() {
  return (
    <div className="app-shell boot">
      <motion.div
        className="boot-inner"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="boot-halo"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Irradiant"
          width={120}
          height={120}
          draggable={false}
          className="boot-mark"
        />
        <span className="brand-word boot-word">Irradiant</span>
        <span className="boot-bar">
          <motion.span
            className="boot-bar-fill"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </motion.div>
    </div>
  );
}
