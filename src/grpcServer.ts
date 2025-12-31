import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ProtoGrpcType } from "./proto/transport";
import { TransportHandlers } from "./proto/transportPackage/Transport";
import { RouterInfo } from "./types/";
import path from "path";
import { Param } from "./proto/transportPackage/Param";
import { Response, Response__Output } from "./proto/transportPackage/Response";

const options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, "./proto/transport.proto"),
  options
);

const transportProto = grpc.loadPackageDefinition(
  packageDefinition
) as unknown as ProtoGrpcType;

const server = new grpc.Server();

export const bootstrapGrpcServer = (mediasoupRouters: RouterInfo[]) => {
  server.addService(transportProto.transportPackage.Transport.service, {
    CreatePipeTransport: (call, callback) => {},
  } as TransportHandlers);

  server.bindAsync(
    "0.0.0.0:50051",
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error(err);
        return;
      }

      console.log(`Grpc server is listening on 50051`);
    }
  );
};

export const createRemotePipeTransport = (
  remoteServerIp: string,
  params: Param
): Promise<Response__Output | undefined> => {
  const client = new transportProto.transportPackage.Transport(
    `${remoteServerIp}:50051`,
    grpc.credentials.createInsecure()
  );

  return new Promise((resolve, reject) => {
    client.waitForReady(Infinity, (err) => {
      if (err) {
        reject(err);
        return;
      }

      client.createPipeTransport(params, (err, response) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(response);
      });
    });
  });
};
