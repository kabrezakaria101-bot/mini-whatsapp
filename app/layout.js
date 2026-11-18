import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
