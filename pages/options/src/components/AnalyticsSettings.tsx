import { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';
import type { AnalyticsSettingsConfig } from '@extension/storage';
import { t } from '@extension/i18n';

export const AnalyticsSettings = () => {
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await analyticsSettingsStore.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('Failed to load analytics settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    const unsubscribe = analyticsSettingsStore.subscribe(loadSettings);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleAnalytics = async (enabled: boolean) => {
    if (!settings) return;

    try {
      await analyticsSettingsStore.updateSettings({ enabled });
      setSettings({ ...settings, enabled });
    } catch (error) {
      console.error('Failed to update analytics settings:', error);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="rounded-lg border border-[#fdb56f]/25 bg-[#fffaf5] p-6 text-left shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-[#7f420b]">{t('options_analytics_header')}</h2>
          <div className="animate-pulse">
            <div className="mb-2 h-4 w-3/4 rounded bg-[#ffe3c6]"></div>
            <div className="h-4 w-1/2 rounded bg-[#ffe3c6]"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-6">
        <div className="rounded-lg border border-[#fdb56f]/25 bg-[#fffaf5] p-6 text-left shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-[#7f420b]">{t('options_analytics_header')}</h2>
          <p className="text-red-600">{t('options_analytics_loadFailed')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[#fdb56f]/25 bg-[#fffaf5] p-6 text-left shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-[#7f420b]">{t('options_analytics_header')}</h2>

        <div className="space-y-6">
          <div className="my-6 rounded-lg border border-[#fdb56f]/20 bg-[#fff4e8] p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="analytics-enabled" className="text-base font-medium text-[#8a490d]">
                {t('options_analytics_helpImprove')}
              </label>
              <div className="relative inline-block w-12 select-none">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={e => handleToggleAnalytics(e.target.checked)}
                  className="sr-only"
                  id="analytics-enabled"
                />
                <label
                  htmlFor="analytics-enabled"
                  className={`block h-6 cursor-pointer overflow-hidden rounded-full ${settings.enabled ? 'bg-[#fdb56f]' : 'bg-gray-300'}`}>
                  <span className="sr-only">{t('options_analytics_toggle_a11y')}</span>
                  <span
                    className={`block size-6 rounded-full bg-white shadow transition-transform ${
                      settings.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
            <p className="mt-2 text-sm text-[#a35b19]">{t('options_analytics_shareDesc')}</p>
          </div>

          <div className="rounded-md border border-[#fdb56f]/20 bg-[#fff4e8] p-4">
            <h3 className="mb-4 text-base font-medium text-[#8a490d]">{t('options_analytics_collect_heading')}</h3>
            <ul className="list-disc space-y-2 pl-5 text-left text-sm text-[#8a490d]">
              <li>{t('options_analytics_collect_item1')}</li>
              <li>{t('options_analytics_collect_item2')}</li>
              <li>{t('options_analytics_collect_item3')}</li>
              <li>{t('options_analytics_collect_item4')}</li>
            </ul>

            <h3 className="mb-4 mt-6 text-base font-medium text-[#8a490d]">
              {t('options_analytics_nocollect_heading')}
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-left text-sm text-[#8a490d]">
              <li>{t('options_analytics_nocollect_item1')}</li>
              <li>{t('options_analytics_nocollect_item2')}</li>
              <li>{t('options_analytics_nocollect_item3')}</li>
              <li>{t('options_analytics_nocollect_item4')}</li>
              <li>{t('options_analytics_nocollect_item5')}</li>
            </ul>
          </div>

          {!settings.enabled && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-700">{t('options_analytics_disabled_notice')}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
