// Original file: src/proto/transport.proto

import type { SrtpParameters as _transportPackage_SrtpParameters, SrtpParameters__Output as _transportPackage_SrtpParameters__Output } from '../transportPackage/SrtpParameters';

export interface Param {
  'routerId'?: (string);
  'localAddress'?: (string);
  'localPort'?: (number);
  'srtpParameters'?: (_transportPackage_SrtpParameters | null);
  '_srtpParameters'?: "srtpParameters";
}

export interface Param__Output {
  'routerId'?: (string);
  'localAddress'?: (string);
  'localPort'?: (number);
  'srtpParameters'?: (_transportPackage_SrtpParameters__Output);
}
