import crypto from "crypto";
import { getState, setState, clearState } from "../lib/store.js";

function verifySlackRequest(body, timestamp, signature) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

async function postToResponseUrl(responseUrl, message) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}

export default async function handler(req, res) {
  // Health check - visit /api/slack in browser to test deployment
  if (req.method === "GET") {
    return res.json({ status: "ok", message: "Nomic Slack bot is running" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await getRawBody(req);
  const timestamp = req.headers["x-slack-request-timestamp"];
  const signature = req.headers["x-slack-signature"];

  if (!verifySlackRequest(rawBody, timestamp, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const params = new URLSearchParams(rawBody);
  const channelId = params.get("channel_id");
  const userId = params.get("user_id");
  const userName = params.get("user_name");
  const text = params.get("text") || "";
  const responseUrl = params.get("response_url");

  const [command, ...rest] = text.trim().split(/\s+/);
  const argument = rest.join(" ");

  switch (command?.toLowerCase()) {
    case "new": {
      if (!argument) {
        return res.json({
          response_type: "ephemeral",
          text: "Usage: /nomic new <proposal text>",
        });
      }
      await clearState(channelId);
      await setState(channelId, { proposal: argument, votes: {} });

      // Post public announcement first (before res.json ends the serverless function)
      await postToResponseUrl(responseUrl, {
        response_type: "in_channel",
        text: `*New Proposal from ${userName}:*\n${argument}`,
      });

      // Send ephemeral confirmation to the proposer
      return res.json({
        response_type: "ephemeral",
        text: `Your proposal has been submitted:\n${argument}`,
      });
    }

    case "yes":
    case "no": {
      const state = await getState(channelId);
      if (!state.proposal) {
        return res.json({
          response_type: "ephemeral",
          text: "No active proposal. Use `/nomic new <text>` to start one.",
        });
      }

      state.votes[userId] = { vote: command.toLowerCase(), name: userName };
      await setState(channelId, state);

      const voteCount = Object.keys(state.votes).length;
      const voteWord = command.toUpperCase();

      // Send public notification first (before res.json ends the serverless function)
      await postToResponseUrl(responseUrl, {
        response_type: "in_channel",
        text: "a vote has been cast",
      });

      // Send ephemeral response to voter
      return res.json({
        response_type: "ephemeral",
        text: `You voted *${voteWord}* on:\n${state.proposal}\n\n${voteCount} vote${voteCount === 1 ? "" : "s"} so far`,
      });
    }

    case "status": {
      const state = await getState(channelId);
      if (!state.proposal) {
        return res.json({
          response_type: "ephemeral",
          text: "No active proposal.",
        });
      }

      const voteCount = Object.keys(state.votes).length;

      await postToResponseUrl(responseUrl, {
        response_type: "in_channel",
        text: `*Current Proposal:* ${state.proposal}\n\n${voteCount} vote${voteCount === 1 ? "" : "s"} cast so far.`,
      });

      return res.json({ response_type: "ephemeral", text: "" });
    }

    case "reveal": {
      const state = await getState(channelId);
      if (!state.proposal) {
        return res.json({
          response_type: "ephemeral",
          text: "No active proposal to reveal.",
        });
      }

      const votes = state.votes;
      const voters = Object.entries(votes);

      if (voters.length === 0) {
        return res.json({
          response_type: "in_channel",
          text: `*Proposal:* ${state.proposal}\n\nNo votes cast yet.`,
        });
      }

      const yesVotes = voters.filter(([, v]) => v.vote === "yes").length;
      const noVotes = voters.filter(([, v]) => v.vote === "no").length;

      const voteList = voters
        .map(([, v]) => `${v.name}: ${v.vote.toUpperCase()}`)
        .join("\n");

      return res.json({
        response_type: "in_channel",
        text: `*Proposal:* ${state.proposal}\n\n*Votes:*\n${voteList}\n\n*Result:* ${yesVotes} YES / ${noVotes} NO`,
      });
    }

    default: {
      return res.json({
        response_type: "ephemeral",
        text: "Commands:\n• `/nomic new <proposal>` - Start a new vote\n• `/nomic yes` - Vote yes\n• `/nomic no` - Vote no\n• `/nomic status` - Show current proposal and vote count\n• `/nomic reveal` - Show all votes",
      });
    }
  }
}

async function getRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
