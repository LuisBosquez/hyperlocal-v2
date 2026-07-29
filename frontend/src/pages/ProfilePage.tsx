import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useFollow, useUnfollow } from '../hooks/useFollows';
import { useCreateList } from '../hooks/useLists';
import { Spinner, EmptyState, Avatar } from '../components/ui';
import { ShareSheet } from '../components/ui/ShareSheet';
import { ListEditor } from '../components/lists/ListEditor';
import { ProfileMap } from '../components/profile/ProfileMap';
import { FriendsSheet } from '../components/profile/FriendsSheet';
import type { ProfileResponse, PlaceInfo, PlanDetail, ListSummary } from '../types/api';

function ListCards({ lists, self }: { lists: ListSummary[]; self: boolean }) {
  const navigate = useNavigate();
  if (lists.length === 0) return null;
  return (
    <div className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Lists</h2>
      <div className="space-y-1.5">
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => navigate(`/lists/${l.id}`)}
            className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800 dark:text-zinc-200">
                {l.name}
                {self && l.visibility === 'public' && <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">public</span>}
                {self && l.visibility === 'private' && <span className="ml-1.5 text-[10px] text-slate-400">private</span>}
              </span>
              {l.description && <span className="block truncate text-xs text-slate-400">{l.description}</span>}
            </span>
            <span className="ml-2 shrink-0 text-xs text-slate-400">{l.place_count} place{l.place_count === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const createList = useCreateList();

  const { data: profile, isLoading } = useQuery<ProfileResponse>({
    queryKey: queryKeys.userProfile(handle ?? ''),
    queryFn: () => unwrap(api.get(`/users/${handle}`)),
    enabled: !!handle,
  });

  const isMutual = profile?.tier === 'mutual';
  const { data: places } = useQuery<(PlaceInfo & { note?: string | null })[]>({
    queryKey: queryKeys.userPlaces(handle ?? ''),
    queryFn: () => unwrap(api.get(`/users/${handle}/places`)),
    enabled: isMutual,
  });
  const { data: plans } = useQuery<PlanDetail[]>({
    queryKey: queryKeys.userPlans(handle ?? ''),
    queryFn: () => unwrap(api.get(`/users/${handle}/plans`)),
    enabled: isMutual,
  });

  const [shareOpen, setShareOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  async function makeProfileShareUrl() {
    const link = await unwrap<{ token: string }>(api.post('/invite-links', {}));
    return `${window.location.origin}/invite/${link.token}`;
  }

  // Profile map = the places across the viewer-visible lists, deduped (Flow 20).
  // Mutual viewers also get the full saved-places set mixed in.
  const lists = profile?.lists ?? [];
  const mapPlaces: PlaceInfo[] = (() => {
    const byId = new Map<string, PlaceInfo>();
    for (const l of lists) for (const p of l.places ?? []) byId.set(p.place_id, p);
    for (const p of places ?? []) byId.set(p.place_id, p);
    return [...byId.values()];
  })();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <EmptyState title="User not found" action={<Link to="/map" className="text-sm text-indigo-500">Back to map</Link>} />
      </div>
    );
  }

  const rel = profile.relationship;
  const isSelf = profile.tier === 'self';

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-md mx-auto p-6">
        <button onClick={() => navigate('/map')} className="text-sm text-slate-400 hover:text-slate-600 mb-4">
          ← Map
        </button>

        <div className="flex items-center gap-4 mb-4">
          <Avatar user={profile} size={64} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 truncate">{profile.display_name}</h1>
            <p className="text-slate-500 dark:text-zinc-500">@{profile.handle}</p>
          </div>
        </div>

        {profile.tier === 'private' ? (
          <EmptyState title="This profile is private" hint="Only followers can see their places and plans." />
        ) : (
          <>
            {profile.bio && <p className="text-sm text-slate-700 dark:text-zinc-300 mb-4">{profile.bio}</p>}

            {(profile.instagram_handle || profile.twitter_handle || profile.facebook_url) && (
              <div className="flex gap-3 mb-4 text-sm">
                {profile.instagram_handle && (
                  <a href={`https://instagram.com/${profile.instagram_handle}`} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
                    Instagram
                  </a>
                )}
                {profile.twitter_handle && (
                  <a href={`https://x.com/${profile.twitter_handle}`} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
                    X
                  </a>
                )}
                {profile.facebook_url && (
                  <a href={profile.facebook_url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
                    Facebook
                  </a>
                )}
              </div>
            )}

            {/* Follow / friendship actions */}
            {!isSelf && (
              <div className="mb-6">
                {rel.is_mutual ? (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">★ Friends</span>
                ) : rel.i_follow ? (
                  <button
                    onClick={() => unfollow.mutate(profile.handle)}
                    className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                  >
                    Following {rel.follows_me ? '· follows you' : ''} — Unfollow
                  </button>
                ) : (
                  <button
                    onClick={() => follow.mutate(profile.handle)}
                    className="px-4 py-2 rounded-full text-sm bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  >
                    {rel.follows_me ? 'Follow back (add as friend)' : 'Follow'}
                  </button>
                )}
              </div>
            )}
            {isSelf && (
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/settings')}
                  className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => setFriendsOpen(true)}
                  className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  Friends
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  Share profile
                </button>
                <button
                  onClick={() => setNewListOpen(true)}
                  className="px-4 py-2 rounded-full text-sm bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                >
                  ＋ New list
                </button>
              </div>
            )}

            {/* Profile map (Flow 20) — the places across visible lists */}
            <div className="mb-5">
              <ProfileMap places={mapPlaces} />
            </div>

            {/* Lists (replaces the old Favorite/Want-to-go sections) */}
            <ListCards lists={lists} self={isSelf} />

            {isMutual && (
              <>
                {plans && plans.length > 0 && (
                  <div className="mb-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 mb-2">Upcoming plans</h2>
                    <div className="space-y-1.5">
                      {plans.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/plans/${p.id}`)}
                          className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          <span className="text-sm text-slate-800 dark:text-zinc-200">{p.place.name}</span>
                          <span className="text-xs text-slate-400">{p.state}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {profile.tier === 'none' && lists.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-zinc-500">No public lists yet. Follow @{profile.handle} to see more.</p>
            )}
          </>
        )}
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        getUrl={makeProfileShareUrl}
        title="Share your profile"
        subtitle="Send this to a friend — they’ll follow you when they sign up."
      />
      <FriendsSheet open={friendsOpen} onClose={() => setFriendsOpen(false)} />
      <ListEditor
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        title="New list"
        submitting={createList.isPending}
        onSubmit={(draft) =>
          createList.mutate(draft, {
            onSuccess: (created) => {
              setNewListOpen(false);
              navigate(`/lists/${created.id}`);
            },
          })
        }
      />
    </div>
  );
}
