import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TEKSCAN — Deteksi Cacat Kain Tekstil',
  description:
    'Deteksi cacat kain tekstil berbasis AI (ResNet50 terkalibrasi) langsung di browser: noda, lubang, garis, cacat horizontal dan vertikal, dengan zona verifikasi manual untuk mencegah false positive.',
  keywords: [
    'deteksi cacat kain',
    'fabric defect detection',
    'AI tekstil',
    'ResNet50',
    'TensorFlow.js',
    'TEKSCAN',
  ],
  openGraph: {
    title: 'TEKSCAN — Deteksi Cacat Kain Tekstil',
    description: 'Deteksi cacat kain tekstil berbasis AI terkalibrasi, berjalan 100% di browser.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
        {children}
      </body>
    </html>
  )
}
