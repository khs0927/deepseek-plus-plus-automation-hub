// Jev (TypeSafe) decision credential store.
//
// Why this is a separate storage slot from DEEPSEEK_API_KEY_STORAGE_KEY:
// the two credentials belong to different vendors and have independent
// lifetimes. Sharing one slot would make clearing either credential destroy
// the other, and syncing or exporting one would silently move the other. The
// DeepSeek official-API key authorizes chat; this key only authorizes the
// paid TypeSafe decision fallback.
//
// No key is a valid configuration: the free decision route needs no
// credential, so an absent key simply means the fallback is unavailable.
export const JEV_API_KEY_STORAGE_KEY = 'deepseek_pp_jev_api_key';

export async function getJevApiKey(): Promise<string | null> {
  const data = await chrome.storage.local.get(JEV_API_KEY_STORAGE_KEY) as Record<string, unknown>;
  return normalizeJevApiKey(data[JEV_API_KEY_STORAGE_KEY]);
}

export async function hasJevApiKey(): Promise<boolean> {
  return (await getJevApiKey()) !== null;
}

export async function saveJevApiKey(apiKey: string): Promise<void> {
  const normalized = normalizeJevApiKey(apiKey);
  if (!normalized) {
    throw new Error('Jev API Key cannot be empty');
  }
  await chrome.storage.local.set({ [JEV_API_KEY_STORAGE_KEY]: normalized });
}

export async function clearJevApiKey(): Promise<void> {
  await chrome.storage.local.remove(JEV_API_KEY_STORAGE_KEY);
}

function normalizeJevApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
