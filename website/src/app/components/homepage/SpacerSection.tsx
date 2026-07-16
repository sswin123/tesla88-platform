interface SpacerConfig {
  height?: string;
  height_unit?: string;
}

export default function SpacerSection({ config }: { config: SpacerConfig }) {
  const h = config.height ?? '40';
  const u = config.height_unit ?? 'px';
  return <div style={{ height: `${h}${u}` }} aria-hidden="true" />;
}
