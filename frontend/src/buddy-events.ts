import type { BuddyReaction } from "./api";

const listeners = new Set<(event: BuddyReaction) => void>();
export function publishBuddyReaction(event: BuddyReaction) {
  listeners.forEach(listener => listener(event));
}
export function subscribeBuddyReactions(listener: (event: BuddyReaction) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}