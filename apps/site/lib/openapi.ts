import { absolute } from "@/lib/site";

// The HTTP API of a Parlour server, the one `parlour start` runs on your own
// Mac. It is not hosted anywhere of ours, so the server URL is a template.
// The routes and shapes follow packages/parlour/src/server/index.ts; the
// admin routes are left out because they are for the household's own apps.
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Parlour server",
    version: "1",
    summary: "Talk to a Parlour voice assistant running on your own Mac.",
    description:
      "Every Parlour server answers on port 8765 of the Mac it runs on. Without PARLOUR_TOKEN set it answers that Mac only; with it set, every route but /health needs the token as a bearer token. See the docs for clients and the phone page.",
    license: { name: "MIT", identifier: "MIT" },
  },
  externalDocs: { description: "HTTP API", url: absolute("/docs/api") },
  servers: [
    {
      url: "http://{host}:{port}",
      description: "Your own Parlour server",
      variables: {
        host: { default: "localhost", description: "The Mac running `parlour start`" },
        port: { default: "8765" },
      },
    },
  ],
  security: [{ token: [] }, { queryToken: [] }],
  paths: {
    "/health": {
      get: {
        operationId: "health",
        summary: "Whether the server is up, what it is configured with, and what is in flight",
        security: [],
        responses: {
          "200": {
            description: "The server is up",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { const: true } }, additionalProperties: true },
              },
            },
          },
        },
      },
    },
    "/ask": {
      post: {
        operationId: "ask",
        summary: "Ask a question in text and get the answer in text",
        description:
          "What automations and scripts use. Without a client, every caller shares one conversation named `api`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string", minLength: 1, examples: ["is the washing machine finished"] },
                  client: { type: "string", description: "Names the conversation, so it carries on" },
                  room: { type: "string", description: "The room the question is about or from" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The answer",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reply: { type: "string" },
                    via: { type: "string", description: "Which model answered, such as `local`" },
                  },
                },
              },
            },
          },
          "401": { description: "A bearer token is required" },
        },
      },
    },
    "/voice": {
      post: {
        operationId: "voice",
        summary: "Send one recording and get back what was heard, the answer, and the answer spoken",
        parameters: [
          { name: "client", in: "query", schema: { type: "string" } },
          { name: "room", in: "query", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          description: "Audio in any format ffmpeg can decode",
          content: {
            "application/octet-stream": { schema: { type: "string", contentMediaType: "audio/*" } },
          },
        },
        responses: {
          "200": {
            description: "What was heard and the answer",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    heard: { type: "string" },
                    reply: { type: "string" },
                    via: { type: "string" },
                    audio: { type: ["string", "null"], contentEncoding: "base64" },
                  },
                },
              },
            },
          },
          "400": { description: "No audio" },
          "401": { description: "A bearer token is required" },
        },
      },
    },
    "/v1/models": {
      get: {
        operationId: "listModels",
        summary: "The one model this server offers, `parlour`, in the OpenAI shape",
        responses: {
          "200": { description: "The model list" },
          "401": { description: "A bearer token is required" },
        },
      },
    },
    "/v1/chat/completions": {
      post: {
        operationId: "chatCompletions",
        summary: "OpenAI-compatible chat completions, which is how Home Assistant reaches Parlour",
        description:
          "Only the last user message is used. The caller's system prompt and tools are ignored on purpose: Parlour brings its own.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["role"],
                      properties: { role: { type: "string" }, content: {} },
                    },
                  },
                  stream: { type: "boolean" },
                  user: { type: "string", description: "Names the conversation" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "A chat completion, or a server-sent event stream when `stream` is true",
            content: { "application/json": {}, "text/event-stream": {} },
          },
          "400": { description: "No user message" },
          "401": { description: "A bearer token is required" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      token: {
        type: "http",
        scheme: "bearer",
        description: "PARLOUR_TOKEN from the server's secrets.env",
      },
      queryToken: {
        type: "apiKey",
        in: "query",
        name: "token",
        description: "The same token, for clients that cannot set a header",
      },
    },
  },
} as const;
