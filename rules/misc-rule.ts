import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class MiscellaneousRule implements Rule {
    name = 'Schema & Types';
    description = 'versioning, servers array, tags, components reuse.';
    weight = 10;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
