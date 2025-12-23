import { ScorecardConfig, ScorecardSubmission } from "@/lib/models/Scorecard";

export interface AggregateScore {
  fieldId: string;
  fieldLabel: string;
  average: number;
  weightedAverage?: number;
  weight?: number;
  count: number;
  min: number;
  max: number;
}

export interface AggregateData {
  scores: AggregateScore[];
  totalSubmissions: number;
  overallWeightedAverage?: number;
}

/**
 * Calculate aggregate scores from scorecard submissions for a given config.
 * This is the shared calculation used by both the sidebar and the scorecard detail view.
 */
export function calculateAggregates(
  submissions: ScorecardSubmission[],
  config: ScorecardConfig | null
): AggregateData {
  if (!config) {
    return {
      scores: [],
      totalSubmissions: submissions.length,
    };
  }

  const ratingFields = config.fields.filter(f => f.type === "rating");
  
  if (submissions.length === 0 || ratingFields.length === 0) {
    return {
      scores: [],
      totalSubmissions: submissions.length,
    };
  }

  const scores: AggregateScore[] = ratingFields.map(field => {
    const values: number[] = [];
    
    for (const sub of submissions) {
      const value = sub.data[field.id];
      if (typeof value === "number") {
        values.push(value);
      }
    }

    if (values.length === 0) {
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        average: 0,
        count: 0,
        min: field.min || 1,
        max: field.max || 5,
        weight: field.weight,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      average: Math.round(average * 100) / 100, // Round to 2 decimal places
      weightedAverage: field.weight ? Math.round(average * field.weight * 100) / 100 : undefined,
      weight: field.weight,
      count: values.length,
      min: field.min || 1,
      max: field.max || 5,
    };
  });

  // Calculate overall weighted average if we have scores with values
  // Use default weight of 1 for fields without explicit weights
  const scoresWithValues = scores.filter(s => s.count > 0);
  let overallWeightedAverage: number | undefined;
  
  if (scoresWithValues.length > 0) {
    const weightsTotal = scoresWithValues.reduce((sum, s) => sum + (s.weight || 1), 0);
    const weightedSum = scoresWithValues.reduce((sum, s) => {
      return sum + (s.average * (s.weight || 1));
    }, 0);
    overallWeightedAverage = Math.round((weightedSum / weightsTotal) * 100) / 100;
  }

  return {
    scores,
    totalSubmissions: submissions.length,
    overallWeightedAverage,
  };
}

/**
 * Calculate just the overall weighted average rating.
 * Convenience function for the applications list sidebar.
 */
export function calculateOverallRating(
  submissions: ScorecardSubmission[],
  config: ScorecardConfig | null
): number | null {
  const aggregates = calculateAggregates(submissions, config);
  return aggregates.overallWeightedAverage ?? null;
}
