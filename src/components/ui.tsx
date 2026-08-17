import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function Card({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      className={`card ${className ?? ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

export function SectionLabel({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="section-label">
      <span>{title}</span>
      {action ? (
        <button className="section-link" onClick={action.onClick}>
          {action.label}
          <ArrowUpRight size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function Badge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'ok' | 'bad' | 'neutral' }) {
  return <span className={`badge ${tone === 'gold' ? '' : tone}`}>{children}</span>;
}

export function CardRow({ label, value, mono }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="card-row">
      <span className="label">{label}</span>
      <span className={`value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export function SettingRow({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="card-row">
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 550 }}>{title}</div>
        {description ? (
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-muted)', maxWidth: 460 }}>{description}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <motion.span
        className="toggle-knob"
        animate={{ x: checked ? 18 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      />
    </button>
  );
}
