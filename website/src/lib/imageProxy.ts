/**
 * Proxy any absolute ERP/external HTTPS image URL through the website's
 * image-proxy endpoint so the browser never makes a direct cross-origin
 * request to the ERP host.  Relative URLs (starting with "/") are already
 * website-local and are returned unchanged.
 */
export function getProxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('https://')) {
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
