const TYPESAFE_SYSTEM_ONE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_MODE = 'shadow';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;

export function createDecisionMethodHandlers(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logLine = typeof options.logLine === 'function' ? options.logLine : () => {};

  return [
    {
      method: 'decision/status',
      handle: async () => getDecisionStatus(env),
    },
    {
      method: 'decision/evaluate',
      handle: async (params) => evaluateDecisionRequest(params, {
        env,
        fetchImpl,
        logLine,
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      }),
    },
  ];
}

export function getDecisionStatus(env = process.env) {
  return {
    configured: typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.trim().length > 0,
    provider: 'typesafe',
    model: normalizeModel(env.TYPESAFE_JEV_MODEL),
    mode: normalizeMode(env.DEEPSEEK_PP_JEV_MODE),
  };
}

export async function evaluateDecisionRequest(params, options = {}) {
  const env = options.env || process.env;
  const apiKey = typeof env.TYPESAFE_API_KEY === 'string'
    ? env.TYPESAFE_API_KEY.trim()
    : '';
  if (!apiKey) {
    throw new Error('TypeSafe decision provider is not configured. Set TYPESAFE_API_KEY in the Native Host environment.');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Native Host fetch is unavailable.');
  }

  const request = requirePlainObject(params?.request, 'decision/evaluate request');
  const state = request.state;
  const questions = requirePlainObject(request.questions, 'decision/evaluate questions');
  if (Object.keys(questions).length === 0) {
    throw new Error('decision/evaluate requires at least one question.');
  }

  const bodyObject = {
    state,
    model: normalizeModel(request.model),
    questions,
  };
  const body = JSON.stringify(bodyObject);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > MAX_REQUEST_BYTES) {
    throw new Error(`decision/evaluate request is too large (${bodyBytes} bytes > ${MAX_REQUEST_BYTES} bytes).`);
  }

  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`TypeSafe decision request timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  let response;
  try {
    response = await fetchImpl(TYPESAFE_SYSTEM_ONE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`TypeSafe decision request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`TypeSafe decision request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('TypeSafe decision provider rejected TYPESAFE_API_KEY.');
  }
  if (!response.ok) {
    throw new Error(`TypeSafe decision provider returned HTTP ${response.status}.`);
  }

  const responseText = await response.text();
  const responseBytes = Buffer.byteLength(responseText, 'utf8');
  if (responseBytes > MAX_RESPONSE_BYTES) {
    throw new Error(`TypeSafe decision provider response is too large (${responseBytes} bytes > ${MAX_RESPONSE_BYTES} bytes).`);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error('TypeSafe decision provider returned invalid JSON.');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('TypeSafe decision provider returned an invalid JSON object.');
  }

  options.logLine?.(
    `decision/evaluate provider=typesafe model=${bodyObject.model} status=${response.status} requestBytes=${bodyBytes}`,
  );
  return result;
}

function normalizeModel(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_MODEL;
  const model = value.trim();
  if (model.length > 128 || !/^[A-Za-z0-9._~:/-]+$/.test(model)) {
    throw new Error('Unsupported TypeSafe model identifier.');
  }
  return model;
}

function normalizeMode(value) {
  return value === 'active' || value === 'disabled' || value === 'shadow'
    ? value
    : DEFAULT_MODE;
}

function normalizeTimeout(value) {
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(30_000, Math.floor(value)));
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value;
}
