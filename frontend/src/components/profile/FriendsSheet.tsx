import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriends, useFollowers, useFollowing } from '../../hooks/useFollows';
import { Sheet, Spinner, EmptyState, Avatar } from '../ui';
import type { PublicUser } from '../../types/api';

type Tab = 'friends' | 'followers' | 'following';

/** Friends view (spec §11): a home for your people that keeps the sidebar
 * unloaded — mutuals, followers, and following in one sheet. */
export function FriendsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('friends');
  const navigate = useNavigate();
  const friends = useFriends();
  const followers = useFollowers(open);
  const following = useFollowing(open);

  const current =
    tab === 'friends' ? friends : tab === 'followers' ? followers : following;
  const rows: (PublicUser & { follows_me?: boolean; i_follow?: boolean })[] = current.data ?? [];

  const emptyHints: Record<Tab, string> = {
    friends: 'Friends are mutual follows — follow back to unlock each other’s plans.',
    followers: 'Share your profile link to get followers.',
    following: 'Search @handles to find people you know.',
  };

  return (
    <Sheet open={open} onClose={onClose} title="Your people">
      <div className="mb-3 flex gap-2">
        {(
          [
            ['friends', `Friends${friends.data ? ` · ${friends.data.length}` : ''}`],
            ['followers', 'Followers'],
            ['following', 'Following'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {current.isLoading && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-slate-400" />
        </div>
      )}

      {!current.isLoading && rows.length === 0 && (
        <EmptyState title={`No ${tab} yet`} hint={emptyHints[tab]} />
      )}

      <div className="space-y-1">
        {rows.map((u) => (
          <button
            key={u.id}
            onClick={() => {
              onClose();
              navigate(`/u/${u.handle}`);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <Avatar user={u} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-900 dark:text-zinc-100">@{u.handle}</span>
              <span className="block truncate text-xs text-slate-400">{u.display_name}</span>
            </span>
            {tab !== 'friends' && u.follows_me && u.i_follow && (
              <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">★ friends</span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
