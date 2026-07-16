interface DividerConfig {
  color?: string;
  thickness?: string;
  style?: string;
  margin?: string;
}

export default function DividerSection({ config }: { config: DividerConfig }) {
  const color     = config.color     || 'var(--border-mid)';
  const thickness = config.thickness || '1';
  const style     = config.style     || 'solid';
  const margin    = config.margin    || '8';
  return (
    <hr
      style={{
        border: 'none',
        borderTop: `${thickness}px ${style} ${color}`,
        margin: `${margin}px 0`,
      }}
    />
  );
}
