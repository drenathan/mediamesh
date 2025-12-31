// Original file: src/proto/transport.proto

import type { SrtpParameters as _transportPackage_SrtpParameters, SrtpParameters__Output as _transportPackage_SrtpParameters__Output } from '../transportPackage/SrtpParameters';

export interface Response {
  'localAddress'?: (string);
  'localPort'?: (number);
  'srtpParameters'?: (_transportPackage_SrtpParameters | null);
  '_srtpParameters'?: "srtpParameters";
}

export interface Response__Output {
  'localAddress'?: (string);
  'localPort'?: (number);
  'srtpParameters'?: (_transportPackage_SrtpParameters__Output);
}
