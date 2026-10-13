'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: '100vh', background: '#1e2228', color: '#c9d1d9', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
        <div style={{ padding: 32, maxWidth: 720 }}>
          <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>SynBio Studio</h1>
          <p>La página se detuvo por un error en el navegador. Recarga para volver al inicio.</p>
          <p style={{ color: '#8b949e' }}>{error.message}</p>
          <button type="button" onClick={() => reset()} style={{ background: '#238636', color: '#fff', border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
