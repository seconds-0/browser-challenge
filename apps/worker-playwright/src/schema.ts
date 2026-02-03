import type { Action, ActionPlan, EpisodeRequest } from '@swarm/schemas';
import { z } from 'zod';

export const ActionTypeSchema = z.enum(['click', 'type', 'press', 'wait_for', 'scroll', 'eval_js']);

const SelectorSchema = z.object({
  strategy: z.enum(['css', 'role', 'text', 'test_id']),
  value: z.string(),
});

const ActionSchema: z.ZodType<Action> = z.object({
  id: z.string(),
  type: ActionTypeSchema,
  target: z
    .object({
      selector: SelectorSchema.optional(),
      point: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .optional(),
      frame: z.string().optional(),
    })
    .optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  timeout_ms: z.number().optional(),
  wait_for: z
    .object({
      url_contains: z.string().optional(),
      selector: SelectorSchema.optional(),
      timeout_ms: z.number().optional(),
    })
    .optional(),
  scroll: z
    .object({
      delta_x: z.number(),
      delta_y: z.number(),
    })
    .optional(),
  script: z.string().optional(),
});

export const EpisodeRequestSchema: z.ZodType<EpisodeRequest> = z.object({
  run_id: z.string(),
  level_id: z.string(),
  checkpoint: z
    .object({
      url: z.string(),
      storage_state_path: z.string().optional(),
    })
    .optional(),
  plan: z.object({
    actions: z.array(ActionSchema),
  }) as z.ZodType<ActionPlan>,
  time_budget_ms: z.number(),
  artifact_profile: z.enum(['trainer', 'runner']),
  telemetry_endpoint: z.string().optional(),
});
