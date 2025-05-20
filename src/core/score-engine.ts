import { OpenAPIV3 } from "openapi-types";
import { Rule, RuleResult, ScoreCard } from "../scoring-engine/types";
import { getRules } from "../scoring-engine/";

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
        let vviolations = ruleResults.flatMap(({ result }) => result.violations);
        vviolations = vviolations.filter((violation) => { return violation.severity !== 'info' });
        return {
            overallScore,
            grade: this.calculateGrade(overallScore),
            categoryScores: ruleResults.map(({ rule, result }) => ({
                name: rule.name,
                score: result.score,
                maxScore: result.maxScore,
                percentage: Math.round((result.score / result.maxScore) * 100),

                ruleResult: { rule, result },
            })),
            violations: vviolations,
            ruleResults: ruleResults,
        };
    }

    private calculateGrade(score: number): string {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        if (score >= 50) return 'D';
        return 'F';
    }
}
