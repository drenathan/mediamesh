// Original file: src/proto/transport.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { Param as _transportPackage_Param, Param__Output as _transportPackage_Param__Output } from '../transportPackage/Param';
import type { Response as _transportPackage_Response, Response__Output as _transportPackage_Response__Output } from '../transportPackage/Response';

export interface TransportClient extends grpc.Client {
  CreatePipeTransport(argument: _transportPackage_Param, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  CreatePipeTransport(argument: _transportPackage_Param, metadata: grpc.Metadata, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  CreatePipeTransport(argument: _transportPackage_Param, options: grpc.CallOptions, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  CreatePipeTransport(argument: _transportPackage_Param, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  createPipeTransport(argument: _transportPackage_Param, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  createPipeTransport(argument: _transportPackage_Param, metadata: grpc.Metadata, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  createPipeTransport(argument: _transportPackage_Param, options: grpc.CallOptions, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  createPipeTransport(argument: _transportPackage_Param, callback: grpc.requestCallback<_transportPackage_Response__Output>): grpc.ClientUnaryCall;
  
}

export interface TransportHandlers extends grpc.UntypedServiceImplementation {
  CreatePipeTransport: grpc.handleUnaryCall<_transportPackage_Param__Output, _transportPackage_Response>;
  
}

export interface TransportDefinition extends grpc.ServiceDefinition {
  CreatePipeTransport: MethodDefinition<_transportPackage_Param, _transportPackage_Response, _transportPackage_Param__Output, _transportPackage_Response__Output>
}
