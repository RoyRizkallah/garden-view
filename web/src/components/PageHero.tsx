import type { ReactNode } from 'react';

type PageHeroProps = {
  image: string;
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  height?: 'tall' | 'short';
};

export default function PageHero({
  image,
  eyebrow,
  title,
  subtitle,
  children,
  height = 'short',
}: PageHeroProps) {
  return (
    <section className={`page-hero page-hero-${height}`}>
      <div className="page-hero-media">
        <img src={image} alt="" />
        <div className="page-hero-scrim" />
      </div>
      <div className="container page-hero-inner">
        <p className="eyebrow" style={{ color: '#e9e1cc' }}>
          {eyebrow}
        </p>
        <h1>{title}</h1>
        {subtitle && <p className="page-hero-sub">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
