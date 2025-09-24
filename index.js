import express from "express";
import bodyParser from "body-parser";
import simpleGit from "simple-git";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Config from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN is not set in environment variables.");
  process.exit(1);
}
const REPO_URL = process.env.REPO_URL;
if (!REPO_URL) {
  console.error("❌ REPO_URL is not set in environment variables.");
  process.exit(1);
}
const REPO_URL_WITH_TOKEN = REPO_URL.replace('https://',`https://${GITHUB_TOKEN}@`);
const LOCAL_PATH = process.env.LOCAL_PATH ||  "./repo";
const BOT_NAME = process.env.BOT_NAME || "auto-deploy-bot";
const AUTHOR_EMAIL = process.env.AUTHOR_EMAIL || "satvikprsd@gmail.com";
const PORT = process.env.PORT || 3000 ;

// init git
const git = simpleGit();

app.post("/webhook", async (req, res) => {
  try {
    const { pusher, head_commit } = req.body;
    const authorName = head_commit?.author?.name;
    console.log("👤 Commit pushed by:", pusher, "Author:", authorName);
    const triggeredBy = authorName || (pusher && pusher.name) || "unknown";

    if (!pusher || !pusher.name) {
      return res.status(400).send("Invalid payload");
    }

    // Avoid infinite loops (ignore bot commits)
    if (pusher.name === BOT_NAME || authorName === BOT_NAME) {
      console.log("✅ Ignored bot commit");
      return res.status(200).send("Ignored bot commit");
    }

    // Clone or pull latest
    if (!fs.existsSync(LOCAL_PATH)) {
      await git.clone(REPO_URL_WITH_TOKEN, LOCAL_PATH);
    }
    const repo = simpleGit(LOCAL_PATH);
    await repo.pull("origin", "main", { "--rebase": "true" });

    // Append timestamp to auto_deploy_log.txt
    const logPath = `${LOCAL_PATH}/auto_deploy_log.txt`;
    const timestamp = new Date().toLocaleString();
    fs.appendFileSync(logPath, `\nDeploy triggered at ${timestamp} by ${triggeredBy}`);

    // Commit & push
    await repo.addConfig("user.name", BOT_NAME);
    await repo.addConfig("user.email", AUTHOR_EMAIL);
    await repo.add("auto_deploy_log.txt");
    await repo.commit(`chore: auto deploy trigger @ ${timestamp}`);
    await repo.push("origin", "main");

    console.log("✅ Auto-commit pushed. Vercel will deploy.");
    res.status(200).send("Auto commit done");
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    res.status(500).send("Error processing webhook");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT} for GitHub webhooks...`);
});
