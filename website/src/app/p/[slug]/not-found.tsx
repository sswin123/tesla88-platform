export default function PartnerNotFound() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      `}</style>
      <div style={{
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent:'center',
        padding:       '40px 20px',
        textAlign:     'center',
        background:    '#09090b',
      }}>
        <div style={{
          fontSize:    '72px',
          fontWeight:  '800',
          color:       '#3f3f46',
          lineHeight:  '1',
          marginBottom:'16px',
        }}>
          404
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '700', color: '#e4e4e7' }}>
          Page Not Found
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: '14px', color: '#71717a' }}>
          This partner page does not exist or is not currently available.
        </p>
        <a
          href="/"
          style={{
            padding:        '10px 24px',
            borderRadius:   '8px',
            background:     '#7c3aed',
            color:          '#fff',
            textDecoration: 'none',
            fontSize:       '14px',
            fontWeight:     '600',
          }}
        >
          Go Home
        </a>
      </div>
    </>
  );
}
