import { Rule } from './types';
import { SchemaTypesRule } from './schema-rule';
import { DescriptionDocsRule } from './docs-rule';
import { PathsOperationsRule } from './path-rule';
import { ResponseCodeRule } from './response-code-rule';
import { ExamplesRule } from './examples-rule';
import { SecurityRule } from './security-rule';
import { MiscellaneousRule } from './misc-rule';

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
