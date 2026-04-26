import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LogtoStatusResponse = {
  ok: boolean;
  error?: string;
  isAuthenticated?: boolean;
  session?: {
    expiresAt: number;
    userInfo?: {
      name?: string;
      username?: string;
      email?: string;
      sub?: string;
    };
  } | null;
};

async function sendLogtoMessage<T extends object>(payload: T): Promise<LogtoStatusResponse> {
  return (await chrome.runtime.sendMessage(payload)) as LogtoStatusResponse;
}

export const LogtoAuthSettings = () => {
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LogtoStatusResponse | null>(null);
  const silentAttemptedRef = useRef(false);

  const displayName = useMemo(() => {
    return (
      status?.session?.userInfo?.name || status?.session?.userInfo?.username || status?.session?.userInfo?.email || ''
    );
  }, [status]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_get_status' });
      if (!nextStatus.ok) {
        throw new Error(nextStatus.error || '读取 Logto 状态失败');
      }
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const syncStatusWithIdp = useCallback(async () => {
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_sync_session' });
      if (nextStatus.ok) {
        setStatus(nextStatus);
      }
    } catch {
      // Ignore sync failures and keep current local state.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const trySilentSignIn = useCallback(async () => {
    if (silentAttemptedRef.current || status?.isAuthenticated) {
      return;
    }
    silentAttemptedRef.current = true;
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_sign_in_silent' });
      if (nextStatus.ok && nextStatus.isAuthenticated) {
        setStatus(nextStatus);
      }
    } catch {
      // silent 登录失败时保持未登录状态
    }
  }, [status?.isAuthenticated]);

  useEffect(() => {
    if (!loading) {
      void trySilentSignIn();
    }
  }, [loading, trySilentSignIn]);

  useEffect(() => {
    const handleStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes['logto-auth-session']) {
        void loadStatus();
      }
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        silentAttemptedRef.current = false;
        void loadStatus();
        void syncStatusWithIdp();
      }
    };
    const handleFocus = () => {
      silentAttemptedRef.current = false;
      void loadStatus();
      void syncStatusWithIdp();
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadStatus, syncStatusWithIdp]);

  const signIn = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_sign_in' });
      if (!nextStatus.ok) {
        throw new Error(nextStatus.error || '登录失败');
      }
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_sign_out' });
      if (!nextStatus.ok) {
        throw new Error(nextStatus.error || '登出失败');
      }
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[#fdb56f]/25 bg-[#fffaf5] p-6 text-left shadow-sm">
        <h2 className="mb-4 text-left text-xl font-semibold text-[#7f420b]">账号</h2>
        <p className="mb-6 text-sm text-[#a35b19]">此页面仅用于账号登录态管理。</p>

        {loading ? (
          <p className="text-sm text-[#a35b19]">正在加载状态...</p>
        ) : status?.isAuthenticated ? (
          <>
            <div className="mt-2 rounded-md border border-[#fdb56f]/20 bg-[#fff4e8] p-3 text-sm text-[#8a490d]">
              <p>
                登录状态：已登录
                {status.session?.expiresAt
                  ? `（到期时间：${new Date(status.session.expiresAt).toLocaleString()}）`
                  : ''}
              </p>
              {displayName ? <p className="mt-1">用户：{displayName}</p> : null}
              {status.session?.userInfo?.email ? <p className="mt-1">邮箱：{status.session.userInfo.email}</p> : null}
            </div>
            <div className="mt-6">
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void signOut()}
                className="rounded-md border border-[#fdb56f]/50 bg-white px-4 py-2 text-sm font-medium text-[#8a490d] hover:bg-[#fff4e8] disabled:opacity-60">
                {authLoading ? '处理中...' : '登出'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              disabled={authLoading || loading}
              onClick={() => void signIn()}
              className="rounded-md bg-[#8a490d] px-4 py-2 text-sm font-medium text-white hover:bg-[#6f3909] disabled:opacity-60">
              {authLoading ? '跳转登录中...' : '登录'}
            </button>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
    </section>
  );
};
