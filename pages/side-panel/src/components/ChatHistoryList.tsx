/* eslint-disable react/prop-types */
import { FaTrash } from 'react-icons/fa';
import { BsBookmark } from 'react-icons/bs';
import { t } from '@extension/i18n';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionBookmark: (sessionId: string) => void;
  visible: boolean;
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionBookmark,
  visible,
}) => {
  if (!visible) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className={`mb-4 text-lg font-semibold ${''}`}>{t('chat_history_title')}</h2>
      {sessions.length === 0 ? (
        <div className={`rounded-lg ${''} p-4 text-center backdrop-blur-sm`}>{t('chat_history_empty')}</div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div key={session.id} className={`group relative rounded-lg ${''} p-3 backdrop-blur-sm transition-all`}>
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left" type="button">
                <h3 className={`text-sm font-medium ${''}`}>{session.title}</h3>
                <p className={`mt-1 text-xs ${''}`}>{formatDate(session.createdAt)}</p>
              </button>

              {/* Bookmark button - top right */}
              {onSessionBookmark && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionBookmark(session.id);
                  }}
                  className={`absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    false
                      ? 'bg-slate-700 text-[#fdb56f] hover:bg-slate-600'
                      : 'bg-white text-[#fdb56f] hover:bg-[#fff4e8]'
                  }`}
                  aria-label={t('chat_history_bookmark')}
                  type="button">
                  <BsBookmark size={14} />
                </button>
              )}

              {/* Delete button - bottom right */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onSessionDelete(session.id);
                }}
                className={`absolute bottom-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                  false ? 'bg-slate-700 text-gray-400 hover:bg-slate-600' : 'bg-white text-gray-500 hover:bg-gray-100'
                }`}
                aria-label={t('chat_history_delete')}
                type="button">
                <FaTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistoryList;
