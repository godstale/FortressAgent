/**
 * Returns instructions for the model on when and how to output inline visualizations:
 * Mermaid code fences for diagrams and Recharts JSON DSL code fences for data charts.
 */
export function getVisualizationPromptSection(): string {
  return `When visual explanations, flowcharts, architectures, or data charts help clarify an answer, provide them using the following code fence formats:

1. Diagrams and Architecture:
Use \`\`\`mermaid code fences (e.g. flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram).
Example:
\`\`\`mermaid
flowchart TD
  Client[Client] --> Server[API Server]
  Server --> DB[(Database)]
\`\`\`

2. Data Charts:
When presenting quantitative comparisons, metrics, trends, or distributions, use \`\`\`recharts code fences containing a valid JSON object adhering to this schema:
{
  "type": "bar" | "line" | "area" | "pie",
  "title": "Optional Title",
  "data": [
    { "category": "Jan", "val1": 100, "val2": 80 },
    { "category": "Feb", "val1": 120, "val2": 95 }
  ],
  "xKey": "category",
  "series": [
    { "key": "val1", "label": "Metric 1", "color": "#3b82f6" },
    { "key": "val2", "label": "Metric 2", "color": "#10b981" }
  ]
}
Only output standard JSON inside the \`\`\`recharts block without comments.`;
}
