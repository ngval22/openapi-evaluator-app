import { Rule } from './types';
import { SchemaTypesRule } from './schema-rule';
import { DescriptionDocsRule } from './docs-rule.ts';
import { PathsOperationsRule } from './path-rule.ts';
import { ResponseCodeRule } from './response-code-rule.ts';
import { ExamplesRule } from './examples-rule.ts';
import { SecurityRule } from './security-rule.ts';
import { MiscellaneousRule } from './misc-rule.ts';

export function getRules(): Rule[] {
  return [
    new SchemaTypesRule(),
    new DescriptionDocsRule(),
    new PathsOperationsRule(),
    new ResponseCodeRule(),
    new ExamplesRule(),
    new SecurityRule(),
    new MiscellaneousRule(),
  ];
}
