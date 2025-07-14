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

const clientMap = new Map<string, Socket>();

io.on('connection', (socket: Socket) => {
  const ip = socket.handshake.address;
  const ua = socket.handshake.headers['user-agent'] || '';
  const key = `${ip}::${ua}`;

  if (clientMap.has(key)) {
    const existing = clientMap.get(key);
    if (existing && existing.id !== socket.id) {
      console.log(`Disconnecting previous socket for: ${key}`);
      existing.disconnect(true);
    }
  }

  clientMap.set(key, socket);

  console.log(`Client connected: ${socket.id} (${key})`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (clientMap.get(key)?.id === socket.id) {
      clientMap.delete(key);
    }
  });
});


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
