export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Response.json({
    build: process.env.NEXT_PUBLIC_ERP_BUILD_ID || 'unidentified-local-build',
    designStorageContract: 'document-design-v1',
    supabaseHost: endpoint ? new URL(endpoint).hostname : null,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
