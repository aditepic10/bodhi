import { z } from "zod";

export const TransportSchema = z.enum(["unix", "tcp"]);
export const CaptureLevelSchema = z.enum(["metadata", "command", "full"]);
export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export const ModelProviderSchema = z.enum(["anthropic", "openai"]);

export const ModelConfigSchema = z.object({
  provider: ModelProviderSchema.default("anthropic"),
  model: z.string().min(1).default("claude-sonnet-4-6"),
});

export const CaptureConfigSchema = z.object({
  level: CaptureLevelSchema.default("command"),
});

export const IntelConfigSchema = z.object({
  auto_approve: z.boolean().default(true),
  max_daily_extractions: z.number().int().min(0).default(500),
  model: ModelConfigSchema.default({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  }),
});

export const ConversationConfigSchema = z.object({
  max_sessions: z.number().int().min(0).default(100),
});

export const RateLimitConfigSchema = z.object({
  agent_per_minute: z.number().int().positive().default(10),
  agent_per_hour: z.number().int().positive().default(100),
  events_per_minute: z.number().int().positive().default(1000),
  facts_per_minute: z.number().int().positive().default(100),
});

export const PipelineConfigSchema = z.object({
  fail_closed_redaction: z.boolean().default(true),
});

export const BodhiConfigSchema = z.object({
  transport: TransportSchema.default("unix"),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive().default(3773),
  socket_path: z.string().default("~/.local/share/bodhi/bodhi.sock"),
  config_dir: z.string().default("~/.config/bodhi"),
  data_dir: z.string().default("~/.local/share/bodhi"),
  log_level: LogLevelSchema.default("info"),
  capture: CaptureConfigSchema.default({
    level: "command",
  }),
  intel: IntelConfigSchema.default({
    auto_approve: true,
    max_daily_extractions: 500,
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
  }),
  conversations: ConversationConfigSchema.default({
    max_sessions: 100,
  }),
  rate_limits: RateLimitConfigSchema.default({
    agent_per_minute: 10,
    agent_per_hour: 100,
    events_per_minute: 1000,
    facts_per_minute: 100,
  }),
  pipeline: PipelineConfigSchema.default({
    fail_closed_redaction: true,
  }),
});

export type Transport = z.infer<typeof TransportSchema>;
export type CaptureLevel = z.infer<typeof CaptureLevelSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type CaptureConfig = z.infer<typeof CaptureConfigSchema>;
export type IntelConfig = z.infer<typeof IntelConfigSchema>;
export type ConversationConfig = z.infer<typeof ConversationConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type BodhiConfig = z.infer<typeof BodhiConfigSchema>;
