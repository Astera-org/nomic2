import { createClient } from "redis";

let client = null;

async function getClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis error:", err));
    await client.connect();
  }
  return client;
}

function getKey(channelId) {
  return `nomic:${channelId}`;
}

export async function getState(channelId) {
  const redis = await getClient();
  const data = await redis.get(getKey(channelId));
  return data ? JSON.parse(data) : { proposal: null, votes: {} };
}

export async function setState(channelId, state) {
  const redis = await getClient();
  await redis.set(getKey(channelId), JSON.stringify(state));
}

export async function clearState(channelId) {
  const redis = await getClient();
  await redis.del(getKey(channelId));
}
