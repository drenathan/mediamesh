import { Router } from "mediasoup/node/lib/types";

export interface RoomDetails {
  id: string;
  currentSpeakers: string[];
  producingPeers: {
    name: string;
    id: string;
    isProducingAudio: boolean;
    isProducingVideo: boolean;
    producers: {
      producerId: string;
      kind: string;
      routerId: string;
      serverIp: string;
    }[];
  }[];
}

export enum RedisRoomEvent {
  NewProducer = "newProducer",
  CreateRemotePipeTransport = "createRemotePipeTransport",
}

export type RouterInfo = {
  router: Router;
  peers: number;
  consumers: number;
  producers: number;
};
