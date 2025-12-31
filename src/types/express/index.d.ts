export {};
declare global {
  namespace Express {
    export interface Request {
      room: any;
    }
  }
}
declare module "socket.io" {
  interface Socket {
    roomId: string;
  }
}
