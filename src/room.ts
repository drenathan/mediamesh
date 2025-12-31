import { Server } from "socket.io";

import Peer from "./peer";

import {
  MediaKind,
  DtlsParameters,
  RtpParameters,
  Router,
  Worker,
} from "mediasoup/node/lib/types";
import { createClient } from "redis";
import { createRedisRoomId } from "./utils";
import { isEmpty } from "lodash";
import { RedisRoomEvent, RoomDetails } from "./types";

export const roomList = new Map<string, Room>();

export default class Room {
  peers: Map<string, Peer> = new Map();

  constructor(
    public id: string,
    private io: Server,
    public subscriber: ReturnType<typeof createClient>,
    public publisher: ReturnType<typeof createClient>
  ) {}

  addPeer(peer: Peer) {
    this.peers.set(peer.id, peer);
  }

  getProducerListForPeer(socketId: string) {
    let producerList: {
      name: string;
      isProducingAudio: boolean;
      isProducingVideo: boolean;
      producers: { producerId: string; kind: MediaKind }[];
    }[] = [];
    this.peers.forEach((peer) => {
      if (peer.isProducer && peer.id !== socketId) {
        producerList.push({
          name: peer.name,
          isProducingAudio: peer.isProducingAudio,
          isProducingVideo: peer.isProducingVideo,
          producers: peer.getProducers(),
        });
      }
    });
    return producerList;
  }

  async connectPeerTransport(
    socketId: string,
    transportId: string,
    dtlsParameters: DtlsParameters
  ) {
    if (!this.peers.has(socketId)) return;

    await this.peers
      .get(socketId)
      ?.connectTransport(transportId, dtlsParameters);
  }

  async produce(
    socketId: string,
    producerTransportId: string,
    rtpParameters: RtpParameters,
    kind: MediaKind
  ) {
    // handle undefined errors

    const roomDetails = JSON.parse(
      (await this.publisher.get(createRedisRoomId(this.id))) || "{}"
    ) as RoomDetails;
    if (isEmpty(roomDetails)) {
      throw "Room not found";
    }

    const producer = await this.peers
      .get(socketId)
      ?.createProducer(producerTransportId, rtpParameters, kind);
    if (!producer) {
      throw "could not create producer";
    }

    const existingPeer = roomDetails.producingPeers.find(
      (peer) => peer.id === producer.appData.peerId
    );

    if (existingPeer) {
      existingPeer.producers.push({
        producerId: producer.id,
        kind,
        routerId: producer.appData.routerId,
        serverIp: producer.appData.serverIp,
      });

      if (kind === "audio") {
        existingPeer.isProducingAudio = true;
      } else {
        existingPeer.isProducingVideo = true;
      }

      roomDetails.producingPeers = roomDetails.producingPeers.map((peer) => {
        if (peer.id === producer.appData.peerId) {
          return existingPeer;
        }
        return peer;
      });
    } else {
      roomDetails.producingPeers.push({
        name: this.peers.get(socketId)?.name!,
        id: producer.appData.peerId,
        isProducingAudio: kind === "audio",
        isProducingVideo: kind === "video",
        producers: [
          {
            producerId: producer.id,
            kind,
            routerId: producer.appData.routerId,
            serverIp: producer.appData.serverIp,
          },
        ],
      });
    }

    await this.publisher.set(
      createRedisRoomId(this.id),
      JSON.stringify(roomDetails)
    );

    await this.publisher.publish(
      createRedisRoomId(this.id),
      JSON.stringify({ event: RedisRoomEvent.NewProducer })
    );

    return producer.id;
  }

  async removePeer(socketId: string) {
    this.peers.get(socketId)?.close();
    this.peers.delete(socketId);
  }

  async closeProducer(socketId: string, producerId: string) {
    return this.peers.get(socketId)?.closeProducer(producerId);
  }

  broadCast(socketId: string, name: string, data: any) {
    for (let otherID of Array.from(this.peers.keys()).filter(
      (id) => id !== socketId
    )) {
      this.send(otherID, name, data);
    }
  }

  send(socketId: string, name: string, data: any) {
    this.io.to(socketId).emit(name, data);
  }

  getPeers() {
    return this.peers;
  }

  toJson() {
    return {
      id: this.id,
      peers: [...this.peers],
    };
  }
}
