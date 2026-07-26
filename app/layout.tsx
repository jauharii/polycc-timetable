import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PolyCC Timetable',
  description: 'Politeknik & Kolej Komuniti Timetables',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}