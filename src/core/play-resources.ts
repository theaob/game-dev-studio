/**
 * Reads Play Games IDs from the build's PLAY_GAMES_RESOURCES: either the Android resources XML
 * the Play Console exports (Achievements or Leaderboards → Get resources), whose string names
 * come from the achievement and leaderboard names, or a JSON object of in-game id → Play Games ID.
 */
export function playResourceIds(
  config: string | undefined,
  kind: 'achievement' | 'leaderboard',
  items: readonly { id: string; name: string }[],
): Record<string, string> {
  const text = config?.trim() ?? '';
  if (!text) return {};
  const known = new Set(items.map((a) => a.id));
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => known.has(e[0]) && typeof e[1] === 'string' && !!e[1]));
    } catch {
      return {};
    }
  }
  // "Know-It-All" is exported as achievement_knowitall, "Hello, World" as achievement_hello_world.
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map(items.map((a) => [key(a.name), a.id]));
  const ids: Record<string, string> = {};
  const re = new RegExp(`<string\\s+name="${kind}_([^"]+)"[^>]*>\\s*([^<\\s]+)\\s*</string>`, 'g');
  for (const [, name, value] of text.matchAll(re)) {
    const id = byName.get(key(name));
    if (id) ids[id] = value;
  }
  return ids;
}
