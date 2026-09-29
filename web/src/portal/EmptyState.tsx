import type { ReactNode } from 'react';

/** A calm "nothing here yet" panel: what will appear here, and (optionally) what to do meanwhile. */
export default function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="portal-empty">
      <span className="portal-empty-icon">{icon}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="portal-empty-action">{action}</div>}
    </div>
  );
}
