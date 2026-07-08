// =====================================================
// FUGU PROXY — Render.com (EUA)
// Proxy reverso para api.sakana.ai (bypass de bloqueio EU)
// Roda nos EUA, Sakana vê IP americano, não bloqueia
// =====================================================

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const SAKANA_KEY = process.env.SAKANA_API_KEY;

// CORS liberado
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

// === Health check ===
app.get("/", (req, res) => {
  res.send("Fugu Proxy ativo (Render EUA)! Use /v1/chat/completions");
});

// === Listar modelos ===
app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: "fugu-ultra",
        object: "model",
        created: 1783478210,
        owned_by: "sakana",
        context_window: 1000000,
      },
      {
        id: "fugu",
        object: "model",
        created: 1783478210,
        owned_by: "sakana",
        context_window: 1000000,
      },
    ],
  });
});

// === Chat Completions ===
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const body = req.body;
    const reasoningEffort = body.reasoning_effort || "xhigh";

    const sakanaBody = {
      model: body.model || "fugu-ultra",
      messages: body.messages || [],
      stream: body.stream || false,
      reasoning_effort: reasoningEffort,
    };

    if (body.max_tokens) {
      sakanaBody.max_completion_tokens = body.max_tokens;
    } else if (body.max_completion_tokens) {
      sakanaBody.max_completion_tokens = body.max_completion_tokens;
    } else {
      sakanaBody.max_completion_tokens = 131072;
    }

    if (body.response_format) sakanaBody.response_format = body.response_format;
    if (body.tools && body.tools.length > 0) {
      sakanaBody.tools = body.tools;
      sakanaBody.tool_choice = body.tool_choice || "auto";
    }
    if (body.stream) {
      sakanaBody.stream_options = { include_usage: true };
    }

    const sakanaResponse = await fetch("https://api.sakana.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SAKANA_KEY}`,
      },
      body: JSON.stringify(sakanaBody),
    });

    if (!sakanaResponse.ok) {
      const errorText = await sakanaResponse.text();
      return res.status(sakanaResponse.status).json({
        error: {
          message: `Sakana API error (${sakanaResponse.status}): ${errorText}`,
          type: "upstream_error",
          code: sakanaResponse.status,
        },
      });
    }

    // === Streaming: repassa SSE direto ===
    if (sakanaBody.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = sakanaResponse.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (err) {
        const errorMsg = JSON.stringify({
          error: { message: `Stream interrompido: ${err.message}`, type: "stream_error" },
        });
        res.write(`data: ${errorMsg}\n\n`);
      } finally {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    }

    // === Não-streaming: repassa direto ===
    const sakanaData = await sakanaResponse.json();
    res.json(sakanaData);
  } catch (err) {
    res.status(500).json({
      error: {
        message: `Proxy error: ${err.message}`,
        type: "proxy_error",
      },
    });
  }
});

app.listen(PORT, () => {
  console.log(`Fugu Proxy rodando na porta ${PORT}`);
});
