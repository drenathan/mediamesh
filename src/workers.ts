import { Worker } from "mediasoup/node/lib/types";
import * as mediasoup from "mediasoup";
import { config } from "./config";
import { RouterInfo } from "./types";

export const workers: Worker[] = [];
export const routers: RouterInfo[] = [];
let nextRouterIdx = 0;

export async function createWorkers() {
  let { numWorkers } = config.mediasoup;

  for (let i = 0; i < numWorkers; i++) {
    let worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on("died", () => {
      console.error(
        "mediasoup worker died, exiting in 2 seconds... [pid:%d]",
        worker.pid
      );
      setTimeout(() => process.exit(1), 2000);
    });

    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs,
    });

    workers.push(worker);
    routers.push({
      router: router,
      peers: 0,
      consumers: 0,
      producers: 0,
    });
    // log worker resource usage
    // setInterval(async () => {
    //   const usage = await worker.getResourceUsage();

    //   console.info(
    //     "mediasoup Worker resource usage [pid:%d]: %o",
    //     worker.pid,
    //     usage
    //   );
    // }, 1000);
  }

  console.log(`started ${workers.length}/${numWorkers} mediasoup Workers`);
  console.log(`started ${routers.length}/${numWorkers} mediasoup Routers`);
}

export function getMediaSoupRouter() {
  const router = routers[nextRouterIdx];

  if (++nextRouterIdx === routers.length) nextRouterIdx = 0;

  return router;
}
