import { kv } from "@vercel/kv";

function getKey(channelId) {
  return `nomic:${channelId}`;
}

export async function getState(channelId) {
  const state = await kv.get(getKey(channelId));
  return state || { proposal: null, votes: {} };
}

export async function setState(channelId, state) {
  await kv.set(getKey(channelId), state);
}

export async function clearState(channelId) {
  await kv.del(getKey(channelId));
}
