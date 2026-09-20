export const TYPESAFE_API_ORIGIN_PATTERN = 'https://api.typesafe.ai/*';

export async function requestTypeSafeApiPermission(): Promise<boolean> {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) return true;
  const origins = [TYPESAFE_API_ORIGIN_PATTERN];
  const granted = await chrome.permissions.contains({ origins }).catch(() => false);
  if (granted) return true;
  return chrome.permissions.request({ origins }).catch(() => false);
}
