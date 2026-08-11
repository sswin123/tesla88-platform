export function parseUserAgent(ua: string): { browser: string; device: string; os: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const device = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, device, os };
}
