import { OpenAPIV3 } from "openapi-types";
import { Rule, RuleResult, RuleViolation } from "./rules/types";
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

export class Judge {
    private rules: Rule[];
    constructor() {
        this.rules = getRules();
    }

    evaluate(spec: OpenAPIV3.Document): ScoreCard {
        const ruleResults: { rule: Rule; result: RuleResult }[] = this.rules.map(rule => ({
            rule,
            result: rule.evaluate(spec)
        }));

        const totalScore = ruleResults.reduce((sum, { result }) => sum + result.score, 0);
        const maxPossibleScore = ruleResults.reduce((sum, { result }) => sum + result.maxScore, 0);
        const overallScore = Math.round((totalScore / maxPossibleScore) * 100);
        return {
            overallScore,
            grade: this.calculateGrade(overallScore),
            categoryScores: ruleResults.map(({ rule, result }) => ({
                name: rule.name,
                score: result.score,
                maxScore: result.maxScore,
                percentage: Math.round((result.score / result.maxScore) * 100)
            })),
            violations: ruleResults.flatMap(({ result }) => result.violations)
        };
    }

    private calculateGrade(score: number): string {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }
}
