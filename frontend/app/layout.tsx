import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Comic Studio — AI Comic Creation Platform',
  description: 'Create characters, generate panels, assemble comic pages, and add speech bubbles with AI assistance.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bangers&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} font-sans bg-[#09090b] text-[#fafafa] h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  )
}
