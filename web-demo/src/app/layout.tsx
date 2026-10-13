import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'SynBio-LLVM — Genetic Circuit IDE',
  description: 'Design, compile and simulate genetic circuits in the browser. BioScript compiler with real-time diagnostics, SBOL visualization, and Gillespie stochastic simulation.',
  keywords: ['synthetic biology', 'genetic circuits', 'BioScript', 'compiler', 'SBOL', 'iGEM', 'bioinformatics'],
  authors: [{ name: 'SynBio-LLVM Team' }],
  openGraph: {
    title: 'SynBio-LLVM — Genetic Circuit IDE',
    description: 'Design, compile and simulate genetic circuits in the browser.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-dna-pattern min-h-screen">
        {children}
      </body>
    </html>
  );
}
