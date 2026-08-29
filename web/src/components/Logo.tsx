type LogoProps = {
  variant?: 'light' | 'dark';
};

export default function Logo({ variant = 'light' }: LogoProps) {
  const color = variant === 'light' ? '#fffdf9' : '#1c1a16';
  return (
    <span className="logo">
      <img src="/images/logo-full.png" alt="Garden View" className="logo-mark" />
      <span className="logo-text" style={{ color }}>
        <em>Beirut Central District</em>
      </span>
    </span>
  );
}
