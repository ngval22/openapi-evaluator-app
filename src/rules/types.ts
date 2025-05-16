import { OpenAPIV3 } from 'openapi-types';

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

