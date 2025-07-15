import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import { appendFile } from "fs";
import { z } from "zod";

import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import { userRouter } from "@/api/user/userRouter";
import { openAPIRouter } from "@/api-docs/openAPIRouter";
import errorHandler from "@/common/middleware/errorHandler";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import { handleIncoming } from ".";

export const payload = z.object({
  event: z.enum([
    "application.startup",
    "call",
    "chats.delete",
    "chats.set",
    "chats.update",
    "chats.upsert",
    "connection.update",
    "contacts.set",
    "contacts.update",
    "contacts.upsert",
    "group-participants.update",
    "group.update",
    "groups.upsert",
    "labels.association",
    "labels.edit",
    "logout.instance",
    "messages.delete",
    "messages.set",
    "messages.update",
    "messages.upsert",
    "presence.update",
    "qrcode.updated",
    "remove.instance",
    "send.message",
  ]),
  instance: z.string(),
  data: z.unknown(),
  destination: z.string(),
  date_time: z.string(),
  sender: z.string(),
  server_url: z.string(),
  apikey: z.string(),
});

export type Payload = z.infer<typeof payload>;

const logger = pino({ name: "server start" });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

// Middlewares
app.use(express.json({ limit: '300mb' }));
app.use(express.urlencoded({ extended: true, limit: '300mb' }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());
// app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Routes
app.use("/health-check", healthCheckRouter);
app.use("/users", userRouter);
app.post("/", handleIncoming, function(req, res) {
  const logsPath = "logs.json";
  const newData = JSON.stringify(req.body) + "\n";
  appendFile(logsPath, newData, (err) => {
    if (err) {
      console.error(err);
    }
  });
  res.sendStatus(200)
});

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
