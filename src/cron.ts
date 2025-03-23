// src/cron.ts
import cron from "node-cron";
import fetch from "node-fetch";

// Run every minute
cron.schedule("* * * * *", () => {
  fetch("https://localhost:3000/api/cron/update-football-scores")
    .then((response) => response.json())
    .then((data) => console.log("Cron job result:", data))
    .catch((error) => console.error("Error running cron job:", error));
});
