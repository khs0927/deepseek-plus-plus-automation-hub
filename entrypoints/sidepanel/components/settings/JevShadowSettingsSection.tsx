import { useEffect, useState } from 'react';
import type {
  JevShadowSettings,
  JevShadowSettingsStatus,
} from '../../../../core/mcp/jev-shadow';
import { useI18n } from '../../i18n';
import { getRuntimeErrorMessage } from '../../runtime-response';
import { sidepanelRuntimeClient } from '../../runtime-client';
import { requestTypeSafeApiPermission } from '../../typesafe-permission';
import {
  SettingsSection,
  StatusBadge,
  StatusMessage,
  TextField,
  ToggleRow,
} from './primitives';

type BusyState = 'idle' | 'saving-key' | 'clearing-key' | 'saving-settings' | 'toggling';

const FALLBACK_SETTINGS: JevShadowSettings = {
  version: 1,
  enabled: false,
  model: 'jev-latest',
  timeoutMs: 2_000,
  maxCandidates: 32,
};

export default function JevShadowSettingsSection() {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<JevShadowSettings>(FALLBACK_SETTINGS);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [busy, setBusy] = useState<BusyState>('idle');
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    sidepanelRuntimeClient.request({ type: 'GET_JEV_SHADOW_SETTINGS_STATUS' })
      .then((status: JevShadowSettingsStatus) => {
        if (cancelled) return;
        setSettings(status.settings);
        setApiKeyConfigured(status.apiKeyConfigured);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            tone: 'error',
            text: t('sidepanel.settings.jevLoadFailed', { error: getRuntimeErrorMessage(error) }),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const saveApiKey = async () => {
    const apiKey = apiKeyInput.trim();
    if (!apiKey) {
      setMessage({ tone: 'error', text: t('sidepanel.settings.jevApiKeyRequired') });
      return;
    }
    setBusy('saving-key');
    setMessage(null);
    try {
      await sidepanelRuntimeClient.request({
        type: 'SAVE_JEV_SHADOW_API_KEY',
        payload: { apiKey },
      });
      setApiKeyConfigured(true);
      setApiKeyInput('');
      setMessage({ tone: 'success', text: t('sidepanel.settings.jevApiKeySaved') });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('sidepanel.settings.jevOperationFailed', { error: getRuntimeErrorMessage(error) }),
      });
    } finally {
      setBusy('idle');
    }
  };

  const clearApiKey = async () => {
    setBusy('clearing-key');
    setMessage(null);
    try {
      await sidepanelRuntimeClient.request({ type: 'CLEAR_JEV_SHADOW_API_KEY' });
      setApiKeyConfigured(false);
      setApiKeyInput('');
      setMessage({ tone: 'success', text: t('sidepanel.settings.jevApiKeyCleared') });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('sidepanel.settings.jevOperationFailed', { error: getRuntimeErrorMessage(error) }),
      });
    } finally {
      setBusy('idle');
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    setBusy('toggling');
    setMessage(null);
    try {
      if (enabled) {
        const granted = await requestTypeSafeApiPermission();
        if (!granted) {
          setMessage({ tone: 'warning', text: t('sidepanel.settings.jevPermissionDenied') });
          return;
        }
      }
      const next = await sidepanelRuntimeClient.request({
        type: 'UPDATE_JEV_SHADOW_SETTINGS',
        payload: { enabled },
      });
      setSettings(next);
      setMessage({
        tone: 'success',
        text: enabled
          ? t('sidepanel.settings.jevEnabled')
          : t('sidepanel.settings.jevDisabled'),
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('sidepanel.settings.jevOperationFailed', { error: getRuntimeErrorMessage(error) }),
      });
    } finally {
      setBusy('idle');
    }
  };

  const saveSettings = async () => {
    setBusy('saving-settings');
    setMessage(null);
    try {
      const model = settings.model.trim();
      const timeoutMs = Math.round(settings.timeoutMs);
      const maxCandidates = Math.round(settings.maxCandidates);
      if (!model || model.length > 128) {
        throw new Error(t('sidepanel.settings.jevModelInvalid'));
      }
      if (timeoutMs < 250 || timeoutMs > 15_000) {
        throw new Error(t('sidepanel.settings.jevTimeoutInvalid'));
      }
      if (maxCandidates < 1 || maxCandidates > 255) {
        throw new Error(t('sidepanel.settings.jevCandidatesInvalid'));
      }
      const next = await sidepanelRuntimeClient.request({
        type: 'UPDATE_JEV_SHADOW_SETTINGS',
        payload: { model, timeoutMs, maxCandidates },
      });
      setSettings(next);
      setMessage({ tone: 'success', text: t('sidepanel.settings.jevSettingsSaved') });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('sidepanel.settings.jevOperationFailed', { error: getRuntimeErrorMessage(error) }),
      });
    } finally {
      setBusy('idle');
    }
  };

  return (
    <SettingsSection
      title={t('sidepanel.settings.jevTitle')}
      description={t('sidepanel.settings.jevDescription')}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.settings.jevPrivacyNotice')}
        </div>
        <StatusBadge
          configured={apiKeyConfigured}
          configuredLabel={t('sidepanel.settings.configured')}
          notConfiguredLabel={t('sidepanel.settings.notConfigured')}
        />
      </div>

      <ToggleRow
        title={t('sidepanel.settings.jevEnableTitle')}
        description={t('sidepanel.settings.jevEnableDescription')}
        enabled={settings.enabled}
        disabled={!loaded || busy !== 'idle'}
        onToggle={(enabled) => void toggleEnabled(enabled)}
      />

      <TextField
        label="TypeSafe API Key"
        type="password"
        value={apiKeyInput}
        placeholder={apiKeyConfigured ? t('sidepanel.settings.apiKeyReplacePlaceholder') : 'ts-...'}
        onChange={setApiKeyInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void saveApiKey();
        }}
        trailing={
          <button
            type="button"
            onClick={() => void saveApiKey()}
            disabled={!apiKeyInput.trim() || busy !== 'idle'}
            className="ds-btn-secondary shrink-0 px-3 py-2 text-[11px] font-medium rounded-lg transition-all duration-150 disabled:opacity-40"
          >
            {busy === 'saving-key' ? t('sidepanel.settings.saving') : t('common.save')}
          </button>
        }
      />

      {apiKeyConfigured && (
        <button
          type="button"
          onClick={() => void clearApiKey()}
          disabled={busy !== 'idle'}
          className="ds-btn-secondary w-full py-2 text-[11px] font-medium rounded-lg transition-all duration-150 disabled:opacity-40"
        >
          {busy === 'clearing-key' ? t('sidepanel.settings.clearing') : t('sidepanel.settings.clearApiKey')}
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: 'var(--ds-border)' }}>
        <TextField
          label={t('sidepanel.settings.jevModel')}
          value={settings.model}
          placeholder="jev-latest"
          disabled={!loaded || busy !== 'idle'}
          onChange={(model) => setSettings((current) => ({ ...current, model }))}
        />
        <TextField
          label={t('sidepanel.settings.jevTimeout')}
          type="number"
          value={String(settings.timeoutMs)}
          disabled={!loaded || busy !== 'idle'}
          onChange={(value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              setSettings((current) => ({ ...current, timeoutMs: parsed }));
            }
          }}
        />
        <TextField
          label={t('sidepanel.settings.jevCandidates')}
          type="number"
          value={String(settings.maxCandidates)}
          disabled={!loaded || busy !== 'idle'}
          onChange={(value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              setSettings((current) => ({ ...current, maxCandidates: parsed }));
            }
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => void saveSettings()}
        disabled={!loaded || busy !== 'idle'}
        className="ds-btn-secondary w-full py-2 text-[11px] font-medium rounded-lg transition-all duration-150 disabled:opacity-40"
      >
        {busy === 'saving-settings' ? t('sidepanel.settings.saving') : t('sidepanel.settings.jevSaveSettings')}
      </button>

      {message && (
        <StatusMessage tone={message.tone}>
          {message.text}
        </StatusMessage>
      )}
    </SettingsSection>
  );
}
