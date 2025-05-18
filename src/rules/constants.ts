import { MiscellaneousRule } from "./misc-rule";

export const SEVERITY_SCORE_WEIGHTS = {
    error: 1.0,
    warning: 0.2,
    info: 0.0
};

export const CRITERIA_WEIGHTS = {
    schema_types: 20,
    description_docs: 20,
    paths_operations: 15,
    response_codes: 15,
    examples: 10,
    security: 10,
    miscellaneous: 10, 
};

export const RULE_NAMES = {
    schema_types: 'Schema & Types',
    description_docs: 'Description & Documentation',
    paths_operations: 'Paths & Operations',
    response_codes: 'Response Codes',
    examples: 'Examples & Samples',
    security: 'Security',
    miscellaneous: 'Miscellaneous', 
};

export const RULE_DESCRIPTIONS = {
    schema_types: 'Evaluates proper use of data types, schema definitions, and type constraints',
    description_docs: 'All paths, operations, parameters, request bodies, and responses include meaningful description fields.',
    paths_operations: 'Consistent naming and CRUD conventions; no overlapping or redundant paths.',
    response_codes: 'Appropriate use of HTTP status codes; each operation defines expected success and error codes.',
    examples: 'Presence of request/response examples for major endpoints.',
    security: 'Defined and referenced security schemes where needed.',
    miscellaneous: 'Miscellaneous best practices: versioning, servers array, tags, components reuse and more.', 
};
