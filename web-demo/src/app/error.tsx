'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#1e2228', color: '#c9d1d9', padding: 32, fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>SynBio Studio</h1>
      <p>El navegador detuvo esta vista. El mensaje queda a la vista para que la página no se quede en blanco.</p>
      <p style={{ color: '#8b949e' }}>{error.message}</p>
      <button type="button" onClick={() => reset()} style={{ background: '#238636', color: '#fff', border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  );
}
