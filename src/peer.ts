import {
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from "mediasoup/node/lib/types";
import { type Transport } from "mediasoup/node/lib/types";
import {
  type DtlsParameters,
  Router,
  Producer,
  Consumer,
  SrtpParameters,
} from "mediasoup/node/lib/types";
import { config } from "./config";
import { Server } from "socket.io";
import Room from "./room";
import { createRedisRoomId } from "./utils";
import { RedisRoomEvent, RoomDetails, RouterInfo } from "./types";
import { isEmpty } from "lodash";
import { createRemotePipeTransport } from "./grpcServer";
import { randomUUID } from "crypto";

export default class Peer {
  transports: Map<string, Transport> = new Map();
  consumers: Map<string, Consumer> = new Map();
  producers: Map<string, Producer> = new Map();
  isProducingAudio = false;
  isProducingVideo = false;

  constructor(
    public id: string,
    public name: string,
    public router: Router,
    private io: Server,
    private room: Room,
    private routers: RouterInfo[]
  ) {}

  addTransport(transport: Transport) {
    this.transports.set(transport.id, transport);
  }

  getRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  get isProducer() {
    return this.isProducingAudio || this.isProducingVideo;
  }

  async connectTransport(transportId: string, dtlsParameters: DtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      console.error("Transport not found", { transportId });
      return;
    }

    await transport.connect({
      dtlsParameters: dtlsParameters,
    });
  }

  async createProducer(
    producerTransportId: string,
    rtpParameters: RtpParameters,
    kind: MediaKind
  ) {
    const producerTransport = this.transports.get(producerTransportId);

    if (!producerTransport) {
      console.error("Producer transport not found", { producerTransportId });
      return;
    }

    const producer = await producerTransport.produce({
      kind,
      rtpParameters,
      appData: {
        peerId: this.id,
        routerId: this.router.id,
        serverIp: config.mediasoup.webRtcTransport.listenIps[0].announcedIp,
      },
    });

    if (kind === "audio") {
      this.isProducingAudio = true;
    }

    if (kind === "video") {
      this.isProducingVideo = true;
    }

    this.producers.set(producer.id, producer);

    producer.on("transportclose", () => {
      console.log("Producer transport close", {
        name: `${this.name}`,
        consumer_id: `${producer.id}`,
      });
      producer.close();
      this.producers.delete(producer.id);
    });

    return producer;
  }

  async createConsumer({
    consumerTransportId,
    peerId,
    producerId,
    rtpCapabilities,
  }: {
    consumerTransportId: string;
    peerId: string;
    producerId: string;
    rtpCapabilities: RtpCapabilities;
  }) {
    // This is where we do the multi-server stuff
    // Check if the producer is on this server
    // if not
    // We need to find the server where the producer is located
    // Then pipe the producer to this server

    let consumerTransport = this.transports.get(consumerTransportId);
    if (!consumerTransport) {
      console.error("Consumer transport not found", { consumerTransportId });
      return;
    }

    let consumer = null;

    const roomDetails = JSON.parse(
      (await this.room.publisher.get(createRedisRoomId(this.room.id))) || "{}"
    ) as RoomDetails;

    if (isEmpty(roomDetails)) {
      console.error("Consume failed");
      throw "Room not found";
    }

    const peer = roomDetails.producingPeers.find((peer) => peer.id === peerId);

    if (!peer) {
      console.error("Consume failed");
      throw "Peer not found";
    }

    const producer = peer.producers.find(
      (producer) => producer.producerId === producerId
    );

    if (!producer) {
      console.error("Consume failed");
      throw "Producer not found";
    }
    console.log(producer.routerId, this.router.id);
    if (producer.routerId === this.router.id) {
      console.log("consuming from the same router");
      try {
        consumer = await consumerTransport.consume({
          producerId,
          rtpCapabilities,
          paused: false, //producer.kind === 'video',
        });
      } catch (error) {
        console.error("Consume failed", error);
        return;
      }
    }

    // Before piping to another server, we need to check if there is a router on the machine that is already piping to the remote one
    // if there is we can pipe to that router and consume locally

    if (
      producer.serverIp ===
      config.mediasoup.webRtcTransport.listenIps[0].announcedIp
    ) {
      console.log("piping to another router on the same machine");
      const producerRouter = this.routers.find(
        (router) => router.router.id === producer.routerId
      );
      if (!producerRouter) {
        console.error("Producer router not found", { producerId });
        return;
      }

      await producerRouter.router.pipeToRouter({
        producerId,
        router: this.router,
      });

      try {
        consumer = await consumerTransport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });
      } catch (error) {
        console.error("Consume failed during piping to local router", error);
        return;
      }
    } else {
      console.log("piping to another router on a different machine");
      const localPipeTransport = await this.router.createPipeTransport({
        enableSctp: true,
        numSctpStreams: { OS: 1024, MIS: 1024 },
        enableRtx: false,
        enableSrtp: false,
        listenInfo: {
          protocol: "udp",
          ip: config.mediasoup.webRtcTransport.listenIps[0].ip,
          announcedAddress:
            config.mediasoup.webRtcTransport.listenIps[0].announcedIp,
        },
      });

      try {
        const response = await this.createRemotePipeTransport({
          srtpParameters: localPipeTransport.srtpParameters!,
          localAddress: localPipeTransport.tuple.localAddress,
          localPort: localPipeTransport.tuple.localPort,
          routerId: producer.routerId,
          serverIp: producer.serverIp,
        });

        if (!response) {
          throw "Failed to create remote pipe transport";
        }

        await localPipeTransport.connect({
          ip: response.localAddress!,
          port: response.localPort!,
          srtpParameters: response.srtpParameters! as unknown as SrtpParameters,
        });

        try {
          consumer = await consumerTransport.consume({
            producerId,
            rtpCapabilities,
            paused: false,
          });
        } catch (error) {
          console.error("Consume failed during piping to local router", error);
          return;
        }

        // TODO: inform the remote when the local one closes

        // Pipe events from the pipe Consumer to the pipe Producer.
        // pipeConsumer.observer.on('close', () => pipeProducer!.close());
        // pipeConsumer.observer.on('pause', () => void pipeProducer!.pause());
        // pipeConsumer.observer.on('resume', () => void pipeProducer!.resume());

        // // Pipe events from the pipe Producer to the pipe Consumer.
        // pipeProducer.observer.on('close', () => pipeConsumer!.close());
      } catch (error) {
        console.error("Failed to create remote pipe transport", error);
        return;
      }
    }

    if (!consumer) {
      throw "Consumer not found";
    }

    if (consumer.type === "simulcast") {
      await consumer.setPreferredLayers({
        spatialLayer: 2,
        temporalLayer: 2,
      });
    }

    this.consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => {
      console.log("Consumer transport close", {
        name: `${this.name}`,
        consumer_id: `${consumer.id}`,
      });
      this.consumers.delete(consumer.id);
    });

    return {
      consumer,
      params: {
        producerId,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      },
    };
  }

  async closeProducer(producerId: string) {
    try {
      const producer = this.producers.get(producerId);
      if (!producer) {
        console.error("Producer not found", { producerId });
        return;
      }

      if (producer.kind === "audio") {
        this.isProducingAudio = false;
      }
      if (producer.kind === "video") {
        this.isProducingVideo = false;
      }

      this.producers.delete(producerId);

      const roomDetails = JSON.parse(
        (await this.room.publisher.get(createRedisRoomId(this.room.id))) || "{}"
      ) as RoomDetails;

      if (isEmpty(roomDetails)) {
        console.error("Close producer failed, cannot find room details");
        return;
      }

      const peer = roomDetails.producingPeers.find(
        (peer) => peer.id === this.id
      );

      if (!peer) {
        console.error("Close producer failed, cannot find peer");
        return;
      }

      const producers = peer.producers.filter(
        (producer) => producer.producerId !== producerId
      );

      const newRoomDetails = {
        ...roomDetails,
        producingPeers: roomDetails.producingPeers.map((p) => {
          if (p.id === this.id) {
            return {
              ...p,
              producers,
            };
          }
          return p;
        }),
      };

      await this.room.publisher.set(
        createRedisRoomId(this.room.id),
        JSON.stringify(newRoomDetails)
      );
    } catch (e) {
      console.warn(e);
    }
  }

  getProducer(producerId: string) {
    return this.producers.get(producerId);
  }

  close() {
    this.transports.forEach((transport) => transport.close());
  }

  removeConsumer(consumerId: string) {
    this.consumers.delete(consumerId);
  }

  getProducers() {
    const producers: { producerId: string; kind: MediaKind }[] = [];
    this.producers.forEach((producer) => {
      producers.push({
        producerId: producer.id,
        kind: producer.kind,
      });
    });

    return producers;
  }

  async createWebRtcTransport(socketId: string) {
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate } =
      config.mediasoup.webRtcTransport;

    const transport = await this.router.createWebRtcTransport({
      listenIps: config.mediasoup.webRtcTransport.listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
      appData: { peerId: socketId, roomId: this.id },
    });
    if (maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
      } catch (error) {}
    }

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        console.log("Transport close", { name: this.name });
        transport.close();
      }
    });

    transport.on("@close", () => {
      console.log("Transport close", { name: this.name });
    });

    console.log("Adding transport", { transportId: transport.id });
    this.addTransport(transport);

    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  async consume({
    consumerTransportId,
    producerId,
    rtpCapabilities,
    peerId,
  }: {
    consumerTransportId: string;
    producerId: string;
    rtpCapabilities: RtpCapabilities;
    peerId: string;
  }) {
    // if (
    //   !this.router.canConsume({
    //     producerId: producerId,
    //     rtpCapabilities,
    //   })
    // ) {
    //   console.error("can not consume");
    //   return;
    // }

    const result = await this.createConsumer({
      consumerTransportId,
      producerId,
      rtpCapabilities,
      peerId,
    });

    if (!result) {
      // TODO: handle error
      return "failed to consume";
    }

    const { consumer, params } = result;

    consumer.on("producerclose", () => {
      console.log("Consumer closed due to producerclose event", {
        name: `${this.name}`,
        consumer_id: `${consumer.id}`,
      });
      this.removeConsumer(consumer.id);

      // tell client consumer is dead
      this.io.to(this.id).emit("consumerClosed", {
        consumer_id: consumer.id,
      });
    });

    return params;
  }

  private async createRemotePipeTransport(data: {
    srtpParameters: SrtpParameters;
    localAddress: string;
    localPort: number;
    routerId: string;
    serverIp: string;
  }): Promise<{
    localAddress: string;
    localPort: number;
    srtpParameters: SrtpParameters;
  }> {
    const requestId = randomUUID();

    return await new Promise((resolve, reject) => {
      this.room.subscriber.subscribe(requestId, (data) => {
        const parsed = JSON.parse(data);
        resolve(
          parsed as {
            localAddress: string;
            localPort: number;
            srtpParameters: SrtpParameters;
          }
        );
        this.room.subscriber.unsubscribe(requestId);
      });

      setTimeout(() => {
        this.room.subscriber.unsubscribe(requestId);
        console.error("Error creating remote pipe transport", { requestId });
        reject(new Error("Error creating remote pipe transport"));
      }, 5000);

      this.room.publisher.publish(
        data.serverIp,
        JSON.stringify({
          event: RedisRoomEvent.CreateRemotePipeTransport,
          data: {
            ...data,
            requestId,
          },
        })
      );
    });
  }
}

export const getPeer = (
  roomList: Map<string, Room>,
  socketId: string,
  roomId: string
) => {
  if (!roomList.has(roomId)) return;
  return roomList.get(roomId)?.getPeers().get(socketId);
};
