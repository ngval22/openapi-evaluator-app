import { OpenAPIV3 } from 'openapi-types';

// useful intefaces for rules and categories
export interface RuleViolation {
  path: string;
  operation?: string;
  location: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
}

export interface RuleResult {
  score: number;
  maxScore: number;
  violations: RuleViolation[];
}

export interface Rule {
  name: string;
  description: string;
  weight: number;
  evaluate(spec: OpenAPIV3.Document): RuleResult;
}

export interface CategoryScore {
    name: string;
    score: number;
    maxScore: number;
    percentage: number;
    ruleResult: { rule: Rule; result: RuleResult };
}

export interface ScoreCard {
    overallScore: number;
    grade: string;
    categoryScores: CategoryScore[];
    violations: RuleViolation[];
    ruleResults: { rule: Rule; result: RuleResult }[];
}
