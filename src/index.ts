import { bootstrapRedis } from "./redis";
import { createRedisRoomId, getLocalIp } from "./utils";
import { createWorkers, getMediaSoupRouter, routers } from "./workers";
import { Server } from "socket.io";
import express from "express";
import http from "http";
import { config } from "./config";
import { RedisRoomEvent, RoomDetails } from "./types";
import Room, { roomList } from "./room";
import Peer, { getPeer } from "./peer";

const main = async () => {
  await createWorkers();
  const { publisher, subscriber } = await bootstrapRedis();

  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    serveClient: false,
    cors: {
      origin: "*",
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("createRoom", async ({ roomId }, callback) => {
      // TODO: Who can create room?
      await socket.join(createRedisRoomId(roomId));

      if (roomList.has(roomId)) {
        callback("already exists");
      } else {
        console.log("Created room", { roomId: roomId });
        const room = new Room(roomId, io, subscriber, publisher);
        roomList.set(roomId, room);

        subscriber.subscribe(createRedisRoomId(roomId), (data) => {
          const parsed = JSON.parse(data) as { event: RedisRoomEvent };
          if (parsed.event === RedisRoomEvent.NewProducer) {
            io.to(createRedisRoomId(roomId)).emit(RedisRoomEvent.NewProducer);
          }
        });
        // TODO: This is no longer distributed, fix it
        await publisher.set(
          createRedisRoomId(roomId),
          JSON.stringify({
            id: roomId,
            producingPeers: [],
            currentSpeakers: [],
          })
        );

        callback(roomId);
      }
    });

    socket.on("join", async ({ roomId, name }, cb) => {
      console.log("User joined", {
        roomId: roomId,
        name: name,
      });

      if (!roomList.has(roomId)) {
        return cb({
          error: "Room does not exist",
        });
      }

      const { router } = getMediaSoupRouter();

      roomList
        .get(roomId)
        ?.addPeer(
          new Peer(socket.id, name, router, io, roomList.get(roomId)!, routers)
        );
      socket.roomId = roomId;
      const roomDetails = JSON.parse(
        (await publisher.get(createRedisRoomId(socket.roomId))) || "{}"
      ) as RoomDetails;
      console.log("roomDetails", roomDetails);
      cb(roomDetails);
    });

    socket.on("getProducers", async (_, cb) => {
      if (!roomList.has(socket.roomId)) return;

      // send all the current producer to newly joined member
      const roomDetails = JSON.parse(
        (await publisher.get(createRedisRoomId(socket.roomId))) || "{}"
      ) as RoomDetails;

      cb?.(roomDetails);
    });

    socket.on("getRouterRtpCapabilities", (_, callback) => {
      try {
        console.log("user got router rtp capabilities");
        callback(
          roomList
            .get(socket.roomId)
            ?.getPeers()
            .get(socket.id)
            ?.getRtpCapabilities()
        );
      } catch (e: any) {
        callback({
          error: e.message,
        });
      }
    });

    socket.on("createWebRtcTransport", async (_, callback) => {
      try {
        const { params } = await roomList
          .get(socket.roomId)
          ?.getPeers()
          .get(socket.id)
          ?.createWebRtcTransport(socket.id)!;
        if (!params) {
          callback({
            error: "could not create transport",
          });
        }
        callback(params);
        console.log("user created webrtc transport");
      } catch (err: any) {
        console.error(err);
        callback({
          error: err.message,
        });
      }
    });

    socket.on(
      "connectTransport",
      async ({ transportId, dtlsParameters }, callback) => {
        if (!roomList.has(socket.roomId)) return;
        await roomList
          .get(socket.roomId)
          ?.connectPeerTransport(socket.id, transportId, dtlsParameters);
        console.log("user connected transport");
        callback("success");
      }
    );

    socket.on(
      "produce",
      async ({ kind, rtpParameters, producerTransportId }, callback) => {
        if (!roomList.has(socket.roomId)) {
          return callback({ error: "not is a room" });
        }

        let producerId = await roomList
          .get(socket.roomId)
          ?.produce(socket.id, producerTransportId, rtpParameters, kind);

        callback({ producerId });
        console.log("user produced");
      }
    );

    socket.on(
      "consume",
      async (
        { consumerTransportId, producerId, rtpCapabilities, peerId },
        callback
      ) => {
        // TODO null handling
        console.log("attempting to consume");
        const peer = roomList.get(socket.roomId)?.getPeers().get(socket.id);
        let params = await peer?.consume({
          consumerTransportId,
          producerId,
          rtpCapabilities,
          peerId,
        });

        callback(params);
      }
    );

    //   socket.on("resume", async (data, callback) => {
    //     await consumer.resume();
    //     callback();
    //   });

    socket.on("getMyRoomInfo", async (_, cb) => {
      const room = await publisher.get(createRedisRoomId(socket.roomId));
      if (!room) {
        return cb({ error: "Room not found" });
      }

      cb(JSON.parse(room));
    });

    socket.on("disconnect", () => {
      const peer = getPeer(roomList, socket.id, socket.roomId);
      console.log("Disconnect", {
        name: `${roomList.get(socket.roomId) && peer?.name}`,
      });

      if (!socket.roomId) return;
      console.log(`removing user ${socket.id} from room ${socket.roomId}`);
      roomList.get(socket.roomId)?.removePeer(socket.id);
    });

    socket.on("producerClosed", async ({ producerId }, cb) => {
      const peer = getPeer(roomList, socket.id, socket.roomId);
      console.log("Producer close", {
        name: `${roomList.get(socket.roomId) && peer?.name}`,
      });

      await roomList.get(socket.roomId)?.closeProducer(socket.id, producerId);
      console.log("producer closed");
      cb("success");
    });

    socket.on("exitRoom", async (_, callback) => {
      const peer = getPeer(roomList, socket.id, socket.roomId);
      console.log("Exit room", {
        name: `${roomList.get(socket.roomId) && peer?.name}`,
      });

      if (!roomList.has(socket.roomId)) {
        callback({ error: "not currently in a room" });
        return;
      }
      // close transports
      await roomList.get(socket.roomId)?.removePeer(socket.id);
      if (roomList.get(socket.roomId)?.getPeers().size === 0) {
        roomList.delete(socket.roomId);
      }

      socket.roomId = "";

      callback("successfully exited room");
    });
  });

  httpServer.listen(config.listenPort, () => {
    console.log("Listening on " + config.listenIp + ":" + config.listenPort);
  });
};

main().catch(console.error);
