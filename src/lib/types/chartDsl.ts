import { z } from 'zod';

export const ChartDslSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'area']),
  data: z.array(z.record(z.union([z.string(), z.number()]))),
  xKey: z.string().optional(),
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string().optional(),
      color: z.string().optional(),
    }),
  ),
  title: z.string().optional(),
});

export type ChartDsl = z.infer<typeof ChartDslSchema>;
