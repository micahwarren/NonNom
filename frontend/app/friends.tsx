import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import { api, ReactionType, SocialPost, SocialUser } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BuddyAvatar } from "@/src/buddy";
import { Button, Card, EmptyState, ErrorState, Icon, IconName, ScreenHeader, Segmented, Skeleton, useToast } from "@/src/ui";
import { AnalyticsEvent, track } from "@/src/analytics";
import { dayName } from "@/src/units";

type Tab = "feed" | "friends" | "buddies" | "invite";
const KIND_ICON: Record<string, IconName> = { daily_goal: "checkmark-done-circle", protein_goal: "barbell", hydration_goal: "water", streak: "flame", achievement: "trophy", cosmetic: "color-palette" };
const REACT: { type: ReactionType; label: string; icon: IconName }[] = [{ type: "high_five", label: "High five", icon: "hand-left" }, { type: "nice", label: "Nice!", icon: "thumbs-up" }, { type: "fire", label: "🔥", icon: "flame" }];

export default function Friends() {
  const router = useRouter();
  const { tab: initial } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((initial as Tab) || "feed");
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Friends" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Segmented options={[{ value: "feed", label: "Feed" }, { value: "friends", label: "Friends" }, { value: "buddies", label: "Buddies" }, { value: "invite", label: "Invite" }]} value={tab} onChange={v => setTab(v as Tab)} />
      </View>
      {tab === "feed" && <Feed onInvite={() => setTab("invite")} />}
      {tab === "friends" && <FriendsList />}
      {tab === "buddies" && <Buddies onInvite={() => setTab("invite")} />}
      {tab === "invite" && <Invite />}
    </View>
  );
}

// ---------------- Feed ----------------
function Feed({ onInvite }: { onInvite: () => void }) {
  const [items, setItems] = useState<SocialPost[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { const r = await api.feed(); setItems(r.items); setCursor(r.next_cursor); setFriendsCount(r.friends_count); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    if (!cursor || more) return;
    setMore(true);
    try { const r = await api.feed(cursor); setItems(x => [...(x ?? []), ...r.items]); setCursor(r.next_cursor); } catch {} finally { setMore(false); }
  }
  async function react(p: SocialPost, type: ReactionType) {
    const prev = p.my_reaction;
    const next = prev === type ? null : type;
    // optimistic
    setItems(x => (x ?? []).map(i => i.id !== p.id ? i : { ...i, my_reaction: next, reactions: { ...i.reactions, ...(prev ? { [prev]: Math.max(0, i.reactions[prev] - 1) } : {}), ...(next ? { [next]: (i.reactions[next] ?? 0) + (prev === next ? 0 : 1) } : {}) } }));
    try { await api.react(p.id, type); track("reaction_sent", { type }); } catch { load(); }
  }

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (items === null) return <View style={{ padding: spacing.lg, gap: spacing.md }}>{[0, 1, 2].map(i => <Skeleton key={i} height={110} />)}</View>;
  if (items.length === 0) return <EmptyState icon="people-outline" title="Your Buddy could use some company" message={friendsCount ? "When friends hit goals or unlock things, it shows up here." : "Add friends to see their Buddies' wins and send high fives."} ctaTitle="Invite a Friend" onCta={onInvite} />;
  return (
    <FlatList data={items} keyExtractor={p => p.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
      onEndReached={loadMore} onEndReachedThreshold={0.4} ListFooterComponent={more ? <Skeleton height={80} /> : null}
      renderItem={({ item: p, index }) => (
        <Card style={{ gap: spacing.sm }} testID={`post-${index}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <BuddyAvatar equipped={p.author.buddy.equipped} size={52} animate={false} state="doing_well" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.is_mine ? "You" : p.author.name} <Text style={styles.handle}>@{p.author.username}</Text></Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {p.author.streak_days != null && <Text style={styles.meta}>🔥 {p.author.streak_days}</Text>}
                <Text style={styles.meta}>{dayName(p.created_at.slice(0, 10))}</Text>
              </View>
            </View>
            <Icon name={KIND_ICON[p.kind] ?? "sparkles"} size={20} color={colors.brandPrimary} />
          </View>
          <Text style={styles.postText}>{p.text}</Text>
          {!p.is_mine && (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {REACT.map(r => {
                const active = p.my_reaction === r.type;
                return (
                  <Pressable key={r.type} onPress={() => react(p, r.type)} style={[styles.reactBtn, active && styles.reactActive]} accessibilityRole="button" accessibilityLabel={r.label} testID={`react-${r.type}-${index}`}>
                    <Icon name={r.icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.reactText, active && { color: colors.onBrandPrimary }]}>{r.label}{p.reactions[r.type] ? ` ${p.reactions[r.type]}` : ""}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {p.is_mine && <Text style={styles.meta}>{Object.values(p.reactions).reduce((a, b) => a + b, 0)} reactions</Text>}
        </Card>
      )} />
  );
}

// ---------------- Friends list + search ----------------
function FriendsList() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SocialUser[] | null>(null);
  const [data, setData] = useState<{ friends: SocialUser[]; incoming: SocialUser[]; outgoing: SocialUser[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { setErr(null); try { setData(await api.friends()); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => { try { setResults((await api.searchUsers(q.trim())).results); } catch { setResults([]); } }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function act(fn: () => Promise<unknown>, msg: string, ev?: AnalyticsEvent) {
    try { await fn(); if (ev) track(ev); toast.show(msg, { icon: "checkmark-circle" }); load(); if (q) setResults((await api.searchUsers(q.trim())).results); }
    catch (e: any) { toast.show(e.message ?? "Something went wrong", { icon: "alert-circle" }); }
  }

  const Row = ({ u, right, index }: { u: SocialUser; right: React.ReactNode; index: number }) => (
    <View style={styles.friendRow} testID={`friend-row-${index}`}>
      <BuddyAvatar equipped={u.buddy.equipped} size={44} animate={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{u.name}</Text>
        <Text style={styles.handle}>@{u.username}{u.streak_days != null ? ` · 🔥 ${u.streak_days}` : ""}</Text>
      </View>
      {right}
    </View>
  );

  return (
    <FlatList data={[]} renderItem={null} keyExtractor={() => "x"} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }} ListHeaderComponent={
      <View style={{ gap: spacing.md }}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by @username" placeholderTextColor={colors.muted} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} testID="friend-search" />
        </View>
        {results !== null && (
          <Card style={{ gap: spacing.sm }}>
            {results.length === 0 ? <Text style={styles.meta}>No one found with that username.</Text> : results.map((u, i) => (
              <Row key={u.id} u={u} index={i} right={
                u.relationship === "friends" ? <Text style={styles.meta}>Friends</Text>
                : u.relationship === "outgoing" ? <Text style={styles.meta}>Requested</Text>
                : u.relationship === "incoming" ? <Button title="Accept" size="sm" onPress={() => act(() => api.acceptFriend(u.request_id!), `You and ${u.name} are friends`, "friend_added")} />
                : <Button title="Add" size="sm" icon="person-add" onPress={() => act(() => api.sendFriendRequest(u.username), "Request sent")} testID={`add-friend-${i}`} />
              } />
            ))}
          </Card>
        )}
        {err && <ErrorState message={err} onRetry={load} />}
        {data && data.incoming.length > 0 && (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.section}>Requests</Text>
            {data.incoming.map((u, i) => <Row key={u.id} u={u} index={i} right={
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Button title="Accept" size="sm" onPress={() => act(() => api.acceptFriend(u.request_id!), `You and ${u.name} are friends`, "friend_added")} testID={`accept-${i}`} />
                <Button title="" icon="close" size="sm" variant="ghost" onPress={() => act(() => api.removeFriend(u.request_id!), "Declined")} accessibilityLabel="Decline" />
              </View>} />)}
          </Card>
        )}
        {data && (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.section}>Your friends · {data.friends.length}</Text>
            {data.friends.length === 0 && <Text style={styles.meta}>No friends yet. Search a username above or share your invite link.</Text>}
            {data.friends.map((u, i) => <Row key={u.id} u={u} index={i} right={<FriendMenu u={u} onRemove={() => act(() => api.removeFriend(u.request_id!), "Friend removed")} onBlock={() => act(() => api.blockUser(u.id), "User blocked")} />} />)}
            {data.outgoing.length > 0 && <Text style={[styles.section, { marginTop: spacing.sm }]}>Pending</Text>}
            {data.outgoing.map((u, i) => <Row key={u.id} u={u} index={i} right={<Button title="Cancel" size="sm" variant="ghost" onPress={() => act(() => api.removeFriend(u.request_id!), "Request cancelled")} />} />)}
          </Card>
        )}
      </View>
    } />
  );
}

function FriendMenu({ u, onRemove, onBlock }: { u: SocialUser; onRemove: () => void; onBlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  if (!open) return <Pressable onPress={() => setOpen(true)} style={styles.menuBtn} accessibilityLabel={`Options for ${u.name}`} testID="friend-menu"><Icon name="ellipsis-horizontal" size={18} color={colors.textSecondary} /></Pressable>;
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <Button title={confirm === "remove" ? "Confirm" : "Remove"} size="sm" variant={confirm === "remove" ? "danger" : "ghost"} onPress={() => (confirm === "remove" ? onRemove() : setConfirm("remove"))} testID="friend-remove" />
      <Button title={confirm === "block" ? "Confirm" : "Block"} size="sm" variant={confirm === "block" ? "danger" : "ghost"} onPress={() => (confirm === "block" ? onBlock() : setConfirm("block"))} testID="friend-block" />
    </View>
  );
}

// ---------------- Side-by-side Buddies ----------------
function Buddies({ onInvite }: { onInvite: () => void }) {
  const [data, setData] = useState<{ me: SocialUser; friends: SocialUser[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setData(await api.buddies()); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!data) return <View style={{ padding: spacing.lg }}><Skeleton height={200} /></View>;
  const cards = [{ ...data.me, name: "You" }, ...data.friends];
  return (
    <FlatList data={cards} numColumns={2} keyExtractor={u => u.id} columnWrapperStyle={{ gap: spacing.md }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
      ListHeaderComponent={<Text style={styles.meta}>Streaks and badges only — never weight or calories.</Text>}
      ListEmptyComponent={null}
      ListFooterComponent={data.friends.length === 0 ? <EmptyState compact icon="people-outline" title="Just you so far" message="Invite a friend and your Buddies will stand side by side." ctaTitle="Invite a Friend" onCta={onInvite} /> : null}
      renderItem={({ item: u, index }) => (
        <Card style={styles.buddyCard} testID={`buddy-card-${index}`}>
          <BuddyAvatar equipped={u.buddy.equipped} size={96} animate={index === 0} state={index === 0 ? "doing_well" : "neutral"} />
          <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
          <Text style={styles.handle}>@{u.username}</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
            {u.streak_days != null && <View style={styles.pill}><Icon name="flame" size={12} color={colors.brandPrimary} /><Text style={styles.pillText}>{u.streak_days}</Text></View>}
            {u.achievements_count != null && <View style={styles.pill}><Icon name="trophy" size={12} color={colors.premium} /><Text style={styles.pillText}>{u.achievements_count}</Text></View>}
          </View>
        </Card>
      )} />
  );
}

// ---------------- Invite ----------------
function Invite() {
  const toast = useToast();
  const { user } = useAuth();
  const [inv, setInv] = useState<{ code: string; url: string | null; friends_joined: number } | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { api.invite().then(setInv).catch(() => {}); }, []);
  const message = inv ? `Join me on NomNom — my Buddy could use some company! Use invite code ${inv.code}${inv.url ? ` or open ${inv.url}` : ""}` : "";

  async function share() {
    if (!inv) return;
    track("friend_invited");
    try {
      if (Platform.OS === "web") { await Clipboard.setStringAsync(message); toast.show("Invite copied to clipboard", { icon: "copy" }); }
      else await Share.share({ message });
    } catch {}
  }
  async function redeem() {
    try { await api.redeemInvite(code.trim()); toast.show("Connected! You're now friends.", { icon: "checkmark-circle" }); setCode(""); }
    catch (e: any) { toast.show(e.message ?? "Invalid code", { icon: "alert-circle" }); }
  }

  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <Card style={{ alignItems: "center", gap: spacing.sm }}>
        <BuddyAvatar equipped={user?.buddy?.equipped} size={96} state="celebrating" level={user?.level} />
        <Text style={styles.inviteTitle}>Invite a Friend</Text>
        <Text style={[styles.meta, { textAlign: "center" }]}>Friends who join with your code are connected to you automatically. You'll see each other's Buddy wins — never calories or weight.</Text>
        <View style={styles.codeBox} testID="invite-code"><Text style={styles.code}>{inv?.code ?? "······"}</Text></View>
        <Button title={Platform.OS === "web" ? "Copy invite" : "Share invite"} icon="share-social" onPress={share} disabled={!inv} style={{ alignSelf: "stretch" }} testID="share-invite" />
        {!!inv?.friends_joined && <Text style={styles.meta}>{inv.friends_joined} friend{inv.friends_joined === 1 ? "" : "s"} joined with your code</Text>}
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.section}>Have a code?</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput value={code} onChangeText={setCode} placeholder="Enter invite code" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.searchInput, styles.codeInput]} testID="redeem-input" />
          <Button title="Connect" size="md" onPress={redeem} disabled={code.trim().length < 4} testID="redeem-btn" />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: fontSize.md, fontWeight: "800", color: colors.onSurface },
  handle: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  meta: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: "600" },
  postText: { fontSize: fontSize.md, color: colors.onSurface, fontWeight: "600" },
  reactBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  reactActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  reactText: { fontSize: fontSize.xs, fontWeight: "800", color: colors.onSurface },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.onSurface, height: 48 },
  codeInput: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  friendRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56 },
  section: { fontSize: fontSize.xs, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  menuBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  buddyCard: { flex: 1, alignItems: "center", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, height: 26, borderRadius: radius.pill },
  pillText: { fontSize: fontSize.xs, fontWeight: "800", color: colors.onSurface },
  inviteTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  codeBox: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border },
  code: { fontSize: fontSize.xxl, fontWeight: "800", letterSpacing: 4, color: colors.brandPrimary },
});
