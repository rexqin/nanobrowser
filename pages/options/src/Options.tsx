import { useState } from 'react';
import '@src/Options.css';
import { Button } from '@extension/ui';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { t } from '@extension/i18n';
import { FiSettings, FiCpu, FiShield, FiTrendingUp, FiHelpCircle } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { ModelSettings } from './components/ModelSettings';
import { FirewallSettings } from './components/FirewallSettings';
import { AnalyticsSettings } from './components/AnalyticsSettings';

type TabTypes = 'general' | 'models' | 'firewall' | 'analytics' | 'help';

const TABS: { id: TabTypes; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'general', icon: FiSettings, label: t('options_tabs_general') },
  { id: 'models', icon: FiCpu, label: t('options_tabs_models') },
  { id: 'firewall', icon: FiShield, label: t('options_tabs_firewall') },
  { id: 'analytics', icon: FiTrendingUp, label: 'Analytics' },
  { id: 'help', icon: FiHelpCircle, label: t('options_tabs_help') },
];

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabTypes>('models');

  const handleTabClick = (tabId: TabTypes) => {
    if (tabId === 'help') {
      window.open('https://ibb8.store/docs', '_blank');
    } else {
      setActiveTab(tabId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'models':
        return <ModelSettings />;
      case 'firewall':
        return <FirewallSettings />;
      case 'analytics':
        return <AnalyticsSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen min-w-[768px] bg-gradient-to-b from-[#fff4e8] via-[#ffedd9] to-[#ffe3c6] text-[#5f3207]">
      {/* Vertical Navigation Bar */}
      <nav className="w-48 border-r border-[#fdb56f]/25 bg-[#fdb56f]/12 backdrop-blur-sm">
        <div className="p-4">
          <h1 className="mb-6 text-xl font-bold text-[#7f420b]">{t('options_nav_header')}</h1>
          <ul className="space-y-2">
            {TABS.map(item => (
              <li key={item.id}>
                <Button
                  onClick={() => handleTabClick(item.id)}
                  className={`flex w-full items-center space-x-2 rounded-lg px-4 py-2 text-left text-base 
                    ${
                      activeTab !== item.id
                        ? 'bg-[#fdb56f]/16 font-medium text-[#7f420b] hover:text-[#5e2f06] backdrop-blur-sm'
                        : 'bg-[#fdb56f] text-white backdrop-blur-sm'
                    }`}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 bg-[#fff7ef]/70 p-8 backdrop-blur-sm">
        <div className="mx-auto min-w-[512px] max-w-screen-lg">{renderTabContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
