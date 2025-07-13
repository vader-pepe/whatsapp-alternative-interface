import { Server, type Socket } from "socket.io";
import { type proto } from "baileys";

import { env } from "@/common/utils/envConfig";
import { app, logger, payload } from "@/server";
import { Request, Response } from "express";


export async function handleIncoming(req: Request, res: Response) {
  const parsedBody = payload.safeParse(req.body);
  if (!parsedBody.success) {
    res.sendStatus(404)
  } else {
    const body = parsedBody.data;
    if (body.event === 'messages.upsert') {
      const msg = body.data as proto.IWebMessageInfo;
      io.emit('new_message', msg)
    }
  }
}

const server = app.listen(env.PORT, () => {
  const { NODE_ENV, HOST, PORT } = env;
  logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
});

export const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const clients = new Map<string, Socket>()

// Track connections
io.on('connection', (socket) => {
  logger.info(`[SOCKET.IO] Connected: ${socket.id}`)
  clients.set(socket.id, socket)

  socket.on('disconnect', (reason) => {
    logger.info(`[SOCKET.IO] Disconnected: ${socket.id} | Reason: ${reason}`)
    clients.delete(socket.id)
  })

  socket.on('error', (err) => {
    logger.error(`[SOCKET.IO] Error on ${socket.id}:`, err)
  })
})


const onCloseSignal = () => {
  logger.info("sigint received, shutting down");
  server.close(() => {
    logger.info("server closed");
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
