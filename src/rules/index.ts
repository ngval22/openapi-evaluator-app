import { Rule } from './types';
import { SchemaTypesRule } from './schema-rule';
import { DescriptionDocsRule } from './docs-rule';
import { PathsOperationsRule } from './path-rule';
import { ResponseCodesRule } from './response-code-rule';
import { ExamplesSamplesRule } from './examples-rule';
import { SecurityRule } from './security-rule';
import { MiscellaneousBestPracticesRule } from './misc-rule';

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
