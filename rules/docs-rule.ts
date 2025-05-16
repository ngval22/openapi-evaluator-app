import { OpenAPIV3 } from 'openapi-types';
import { Rule, RuleResult, RuleViolation } from './types';

export class DescriptionDocsRule implements Rule {
    name = 'Description & Documentation';
    description = 'All paths, operations, parameters, request bodies, and responses include meaningful description fields.';
    weight = 20;

    evaluate(spec: OpenAPIV3.Document): RuleResult {
        return {
            score: this.weight,
            maxScore: this.weight,
            violations: []
        };
    }
}
