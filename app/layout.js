import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  manifest: '/manifest.json',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  title: 'Mini-WhatsApp — numéros courts',
  description: 'Messagerie gratuite avec des numéros à 5 chiffres',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#008069',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}",
          }}
        />

        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
