import "dotenv/config";
import { app } from "./app.js";
import { startOutboxPoller } from "./worker/outboxWorker.js";

const port = Number(process.env.PORT ?? 4000);

if (process.env.NODE_ENV !== "test") {
  startOutboxPoller();
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

export { app };
