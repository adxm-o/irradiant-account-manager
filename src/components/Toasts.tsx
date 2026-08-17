import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { useApp } from '../state/AppState';

const ICONS = {
  info: Info,
  ok: Check,
  bad: AlertTriangle
};

const COLORS = {
  info: 'var(--gold-300)',
  ok: 'var(--ok)',
  bad: 'var(--bad)'
};

export default function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <motion.div
              key={item.id}
              className="toast"
              style={{ pointerEvents: 'auto' }}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => dismissToast(item.id)}
            >
              <Icon size={15} color={COLORS[item.tone]} />
              <span>{item.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
