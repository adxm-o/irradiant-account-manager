import { createRoot } from 'react-dom/client';
import App from './App';
import QuickSwitch from './pages/QuickSwitch';
import { AppProvider } from './state/AppState';
import './styles/globals.css';
import './styles/app.css';

const isQuick = window.location.hash.replace('#', '') === 'quick';

createRoot(document.getElementById('root')!).render(
  isQuick ? (
    <QuickSwitch />
  ) : (
    <AppProvider>
      <App />
    </AppProvider>
  )
);
