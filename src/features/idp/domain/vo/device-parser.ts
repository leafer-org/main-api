import Bowser from 'bowser';

export function parseDeviceName(userAgent: string): string | null {
  if (!userAgent) return null;
  const parsed = Bowser.parse(userAgent);
  const browserName = parsed.browser.name;
  const osName = parsed.os.name;
  if (!browserName && !osName) return null;
  return [browserName, osName].filter(Boolean).join(' on ');
}
