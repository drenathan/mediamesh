import { createClient } from "redis";

const publisher = createClient({
  url: process.env.REDIS_URL,
});

const subscriber = publisher.duplicate();

export const bootstrapRedis = async () => {
  await publisher.connect();
  await subscriber.connect();
  console.log("Redis connected");
  return { publisher, subscriber };
};
