import { createClient } from "redis";

const publisher = createClient({
  pingInterval: 5000,
});

const subscriber = publisher.duplicate();

export const bootstrapRedis = async () => {
  await publisher.connect();
  await subscriber.connect();
  console.log("Redis connected");
  return { publisher, subscriber };
};
