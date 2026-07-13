import { type HandleUploadBody, handleUpload } from '@vercel/blob/client'

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: 'Private Blob storage is not configured.' }, { status: 503 })
  }
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('sources/') || !/\.(dwg|dxf)$/i.test(pathname)) {
          throw new Error('Only DWG and DXF source files are accepted.')
        }
        return {
          allowedContentTypes: [
            'application/octet-stream',
            'application/acad',
            'application/dwg',
            'application/dxf',
            'image/vnd.dwg',
            'text/plain',
          ],
          maximumSizeInBytes: 250 * 1024 * 1024,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: true,
          tokenPayload: 'ostrid-cad-source',
        }
      },
      onUploadCompleted: async () => {},
    })
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload authorization failed.'
    return Response.json({ error: message }, { status: 400 })
  }
}
