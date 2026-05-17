import { NextRequest, NextResponse } from 'next/server'

/**
 * Image proxy — fetches images from the backend and pipes them back to the
 * browser with a 1-hour cache header, avoiding repeated Drive reads.
 * Also adds ngrok-skip-browser-warning so ngrok doesn't return an HTML
 * interstitial instead of the actual image.
 * Usage: /api/image?url=<encoded-full-url>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url param', { status: 400 })

  try {
    const upstream = await fetch(url, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      })
    }

    const contentType = upstream.headers.get('content-type') || 'image/png'

    // Guard: ngrok returned its HTML warning page instead of the image
    if (contentType.includes('text/html')) {
      return new NextResponse('Upstream returned HTML, not an image', { status: 502 })
    }

    const buffer = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err: any) {
    return new NextResponse(`Proxy error: ${err.message}`, { status: 502 })
  }
}

