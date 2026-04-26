import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface LogtoConfig {
  endpoint: string;
  appId: string;
  scope: string;
  resource: string;
}

export interface LogtoSession {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  userInfo?: {
    sub?: string;
    username?: string;
    name?: string;
    email?: string;
    picture?: string;
  };
}

export type LogtoConfigStorage = BaseStorage<LogtoConfig> & {
  updateConfig: (config: Partial<LogtoConfig>) => Promise<void>;
  getConfig: () => Promise<LogtoConfig>;
  resetToDefaults: () => Promise<void>;
};

export type LogtoSessionStorage = BaseStorage<LogtoSession | null> & {
  setSession: (session: LogtoSession) => Promise<void>;
  getSession: () => Promise<LogtoSession | null>;
  clearSession: () => Promise<void>;
  isAuthenticated: () => Promise<boolean>;
};

export const DEFAULT_LOGTO_CONFIG: LogtoConfig = {
  endpoint: 'https://login.ibb8.store/',
  appId: 'sojcqj9q39c6g7xwdok8b',
  scope: 'openid profile email offline_access',
  resource: '',
};

const configStorage = createStorage<LogtoConfig>('logto-auth-config', DEFAULT_LOGTO_CONFIG, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

const sessionStorage = createStorage<LogtoSession | null>('logto-auth-session', null, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const logtoConfigStore: LogtoConfigStorage = {
  ...configStorage,
  async updateConfig(config: Partial<LogtoConfig>) {
    const currentConfig = (await configStorage.get()) || DEFAULT_LOGTO_CONFIG;
    await configStorage.set({
      ...currentConfig,
      ...config,
    });
  },
  async getConfig() {
    const config = await configStorage.get();
    return {
      ...DEFAULT_LOGTO_CONFIG,
      ...config,
    };
  },
  async resetToDefaults() {
    await configStorage.set(DEFAULT_LOGTO_CONFIG);
  },
};

export const logtoSessionStore: LogtoSessionStorage = {
  ...sessionStorage,
  async setSession(session: LogtoSession) {
    await sessionStorage.set(session);
  },
  async getSession() {
    return await sessionStorage.get();
  },
  async clearSession() {
    await sessionStorage.set(null);
  },
  async isAuthenticated() {
    const session = await sessionStorage.get();
    if (!session) {
      return false;
    }
    return session.expiresAt > Date.now();
  },
};
