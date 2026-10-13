'use client';

import dynamic from 'next/dynamic';

const StudioApp = dynamic(() => import('@/components/studio/StudioApp'), {
  ssr: false,
  loading: () => <div style={{ background: '#1e2228', color: '#8b949e', height: '100vh', padding: 24 }}>Cargando SynBio Studio…</div>,
});

export default function HomePage() {
  return <StudioApp />;
}
