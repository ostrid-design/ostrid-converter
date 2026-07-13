import { del, list } from '@vercel/blob'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let cursor: string | undefined
  let deleted = 0
  do {
    const page = await list({ prefix: 'drafts/', limit: 1000, cursor })
    const expired = page.blobs.filter((blob) => blob.uploadedAt.getTime() < cutoff)
    if (expired.length) {
      await del(expired.map((blob) => blob.url))
      deleted += expired.length
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return Response.json({ deleted })
}
