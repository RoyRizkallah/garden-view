type LogoProps = {
  variant?: 'light' | 'dark';
};

export default function Logo({ variant = 'light' }: LogoProps) {
  const color = variant === 'light' ? '#fffdf9' : '#1c1a16';
  return (
    <span className="logo">
      {/* the mark renders at 38 px tall: ship it at 1x/2x, not the 795 px master */}
      <picture>
        <source type="image/webp" srcSet="/images/logo-full-96.webp 1x, /images/logo-full-192.webp 2x" />
        <img
          src="/images/logo-full-96.png"
          srcSet="/images/logo-full-96.png 1x, /images/logo-full-192.png 2x"
          width={44}
          height={38}
          alt="Garden View"
          className="logo-mark"
          decoding="async"
        />
      </picture>
      <span className="logo-text" style={{ color }}>
        <em>Beirut Central District</em>
      </span>
    </span>
  );
}
