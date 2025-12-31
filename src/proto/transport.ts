import type * as grpc from "@grpc/grpc-js";
import type { MessageTypeDefinition } from "@grpc/proto-loader";

import type {
  TransportClient as _transportPackage_TransportClient,
  TransportDefinition as _transportPackage_TransportDefinition,
} from "./transportPackage/Transport";
import { Param } from "./transportPackage/Param";
import { Param__Output } from "./transportPackage/Param";
import { Response } from "./transportPackage/Response";
import { Response__Output } from "./transportPackage/Response";
import { SrtpParameters } from "./transportPackage/SrtpParameters";
import { SrtpParameters__Output } from "./transportPackage/SrtpParameters";

type SubtypeConstructor<
  Constructor extends new (...args: any) => any,
  Subtype
> = {
  new (...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  transportPackage: {
    Param: MessageTypeDefinition<Param, Param__Output>;
    Response: MessageTypeDefinition<Response, Response__Output>;
    SrtpParameters: MessageTypeDefinition<
      SrtpParameters,
      SrtpParameters__Output
    >;
    Transport: SubtypeConstructor<
      typeof grpc.Client,
      _transportPackage_TransportClient
    > & { service: _transportPackage_TransportDefinition };
  };
}
