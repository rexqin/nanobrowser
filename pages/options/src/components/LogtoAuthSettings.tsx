import { useEffect, useMemo, useState } from 'react';

type LogtoStatusResponse = {
  ok: boolean;
  error?: string;
  config?: {
    endpoint: string;
    appId: string;
    scope: string;
    resource: string;
  };
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
  const [saving, setSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LogtoStatusResponse | null>(null);
  const [form, setForm] = useState({
    endpoint: '',
    appId: '',
    scope: 'openid profile email offline_access',
    resource: '',
  });

  const displayName = useMemo(() => {
    return (
      status?.session?.userInfo?.name || status?.session?.userInfo?.username || status?.session?.userInfo?.email || ''
    );
  }, [status]);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_get_status' });
      if (!nextStatus.ok) {
        throw new Error(nextStatus.error || '读取 Logto 状态失败');
      }
      setStatus(nextStatus);
      if (nextStatus.config) {
        setForm(nextStatus.config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const nextStatus = await sendLogtoMessage({ type: 'logto_update_config', config: form });
      if (!nextStatus.ok) {
        throw new Error(nextStatus.error || '保存 Logto 配置失败');
      }
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
        <h2 className="mb-4 text-left text-xl font-semibold text-[#7f420b]">Logto 登录</h2>
        <p className="mb-6 text-sm text-[#a35b19]">使用 Hosted Sign-in + PKCE，配置后可在侧边栏和设置页共享登录态。</p>

        {loading ? (
          <p className="text-sm text-[#a35b19]">正在加载状态...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="logto-endpoint" className="mb-1 block text-sm font-medium text-[#8a490d]">
                Endpoint
              </label>
              <input
                id="logto-endpoint"
                value={form.endpoint}
                onChange={e => setForm(prev => ({ ...prev, endpoint: e.target.value }))}
                placeholder="https://your-tenant.logto.app"
                className="w-full rounded-md border border-[#fdb56f]/30 bg-white px-3 py-2 text-[#6f3909]"
              />
            </div>
            <div>
              <label htmlFor="logto-appId" className="mb-1 block text-sm font-medium text-[#8a490d]">
                App ID
              </label>
              <input
                id="logto-appId"
                value={form.appId}
                onChange={e => setForm(prev => ({ ...prev, appId: e.target.value }))}
                className="w-full rounded-md border border-[#fdb56f]/30 bg-white px-3 py-2 text-[#6f3909]"
              />
            </div>
            <div>
              <label htmlFor="logto-scope" className="mb-1 block text-sm font-medium text-[#8a490d]">
                Scope
              </label>
              <input
                id="logto-scope"
                value={form.scope}
                onChange={e => setForm(prev => ({ ...prev, scope: e.target.value }))}
                className="w-full rounded-md border border-[#fdb56f]/30 bg-white px-3 py-2 text-[#6f3909]"
              />
            </div>
            <div>
              <label htmlFor="logto-resource" className="mb-1 block text-sm font-medium text-[#8a490d]">
                Resource（可选）
              </label>
              <input
                id="logto-resource"
                value={form.resource}
                onChange={e => setForm(prev => ({ ...prev, resource: e.target.value }))}
                className="w-full rounded-md border border-[#fdb56f]/30 bg-white px-3 py-2 text-[#6f3909]"
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => void saveConfig()}
            className="rounded-md bg-[#fdb56f] px-4 py-2 text-sm font-medium text-white hover:bg-[#ee9b47] disabled:opacity-60">
            {saving ? '保存中...' : '保存配置'}
          </button>
          {status?.isAuthenticated ? (
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void signOut()}
              className="rounded-md border border-[#fdb56f]/50 bg-white px-4 py-2 text-sm font-medium text-[#8a490d] hover:bg-[#fff4e8] disabled:opacity-60">
              {authLoading ? '处理中...' : '登出'}
            </button>
          ) : (
            <button
              type="button"
              disabled={authLoading || loading}
              onClick={() => void signIn()}
              className="rounded-md bg-[#8a490d] px-4 py-2 text-sm font-medium text-white hover:bg-[#6f3909] disabled:opacity-60">
              {authLoading ? '跳转登录中...' : '使用 Logto 登录'}
            </button>
          )}
        </div>

        <div className="mt-4 rounded-md border border-[#fdb56f]/20 bg-[#fff4e8] p-3 text-sm text-[#8a490d]">
          <p>
            当前状态：{status?.isAuthenticated ? '已登录' : '未登录'}
            {status?.isAuthenticated && status?.session?.expiresAt
              ? `（到期时间：${new Date(status.session.expiresAt).toLocaleString()}）`
              : ''}
          </p>
          {displayName ? <p className="mt-1">当前用户：{displayName}</p> : null}
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
    </section>
  );
};
