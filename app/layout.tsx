import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/context/AuthContext"
import './globals.css'

const beVietnamPro = Be_Vietnam_Pro({ 
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: 'Monaco Karaoke',
  description: 'Trải nghiệm đẳng cấp khác biệt - Hệ thống giải trí hàng đầu với Karaoke, Massage, Nhà hàng sang trọng bậc nhất',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/images/logo.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/images/logo.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/images/logo.png',
        type: 'image/png',
      },
    ],
    apple: '/images/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi" className="bg-background" suppressHydrationWarning>
      <body className={`${beVietnamPro.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <div className="app-screen">
              {children}
            </div>
            {process.env.NODE_ENV === 'production' && <Analytics />}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}