import { OpenAPIV3 } from "openapi-types";
import { Rule, RuleViolation } from "./rules/types.ts";
import { getRules } from "./rules";

export interface CategoryScore {
    name: string;
    score: number;
    maxScore: number;
    percentage: number;
}
export interface ScoreCard {
    overallScore: number;
    grade: string;
    categoryScores: CategoryScore[];
    violations: RuleViolation[];
}

export class Scorer {
    private rules: Rule[];
    constructor() {
        this.rules = getRules();
    }

    evaluate(spec: OpenAPIV3.Document): ScoreCard {
        return {
            overallScore: 100,
            grade: "A",
            categoryScores: [],
            violations: [],
        }
    }
}
