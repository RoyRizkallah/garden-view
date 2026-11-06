import type { ReactNode } from 'react';

type PageHeaderProps = {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
};

/** The one page header used across the resident portal. */
export default function PageHeader({ kicker, title, lede, actions }: PageHeaderProps) {
  return (
    <header className="rs-page-head">
      <div>
        <p className="rs-kicker">{kicker}</p>
        <h1>{title}</h1>
        {lede && <p className="rs-lede">{lede}</p>}
      </div>
      {actions && <div className="rs-page-actions">{actions}</div>}
    </header>
  );
}
