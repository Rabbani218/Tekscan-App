import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TEKSCAN — Deteksi Cacat Kain Tekstil',
  description:
    'Sistem deteksi cacat kain tekstil berbasis AI (MobileNetV2, Transfer Learning). Upload gambar kain untuk mendapatkan analisis cacat secara otomatis: noda, lubang, garis, cacat horizontal, dan cacat vertikal. Akurasi model 90.75%.',
  keywords: [
    'deteksi cacat kain',
    'fabric defect detection',
    'AI tekstil',
    'MobileNetV2',
    'TensorFlow.js',
    'TEKSCAN',
  ],
  openGraph: {
    title: 'TEKSCAN — Deteksi Cacat Kain Tekstil',
    description:
      'Demo AI untuk deteksi cacat kain tekstil menggunakan MobileNetV2. Akurasi test 90.75%.',
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
      <body>{children}</body>
    </html>
  )
}
