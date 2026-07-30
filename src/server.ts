import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { serve as serveInngest } from "inngest/express";
import { inngest } from "./inngest/client";
import { dailyIncrementalSync, fullChannelIngestion } from "./inngest/functions";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { videoRouter } from "./routes/video";
import { videosRouter } from "./routes/videos";
import { errorHandler } from "./middleware/error-handler";
import { jsonReplacer } from "./helpers/json";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true, credentials: true }));
app.set("json replacer", jsonReplacer);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (_request, response) => response.json({ ok: true }));
app.use("/api/auth/google", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/video", videoRouter);
app.use("/api/videos", videosRouter);
app.use("/api/inngest", serveInngest({ client: inngest, functions: [fullChannelIngestion, dailyIncrementalSync] }));
app.use(errorHandler);

app.listen(port, () => {
  console.info(`YouTube Studio clone API listening on port ${port}`);
});

export { app };
