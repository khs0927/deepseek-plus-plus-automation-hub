export function sanitizeDecisionText(value: string, maxChars: number): string {
  return redactDecisionSecrets(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

export function redactDecisionSecrets(value: string): string {
  return value
    .replace(
      /\b(authorization|api[_ -]?key|access[_ -]?token|token|password|passwd|secret)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]{4,}/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bbearer\s+[A-Za-z0-9._~+\/=:-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      '[REDACTED_JWT]',
    );
}
