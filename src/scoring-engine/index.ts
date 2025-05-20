import { Rule } from './types';
import { SchemaTypesRule } from './rules/schema-rule';
import { DescriptionDocsRule } from './rules/docs-rule';
import { PathsOperationsRule } from './rules/path-rule';
import { ResponseCodesRule } from './rules/response-code-rule';
import { ExamplesSamplesRule } from './rules/examples-rule';
import { SecurityRule } from './rules/security-rule';
import { MiscellaneousBestPracticesRule } from './rules/misc-rule';

export function getRules(): Rule[] {
    return [
        new SchemaTypesRule(),
        new DescriptionDocsRule(),
        new PathsOperationsRule(),
        new ResponseCodesRule(),
        new ExamplesSamplesRule(),
        new SecurityRule(),
        new MiscellaneousBestPracticesRule(),
    ];
}
