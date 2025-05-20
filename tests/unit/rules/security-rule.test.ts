import { OpenAPIV3 } from 'openapi-types';
import { SecurityRule } from '../../../src/scoring-engine/rules/security-rule'
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../../../src/scoring-engine/constants";

describe('SecurityRule', () => {
  let rule: SecurityRule;
  
  beforeEach(() => {
    rule = new SecurityRule();
  });

  it('should initialize with correct properties', () => {
    expect(rule.name).toBe(RULE_NAMES.security);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.security);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.security);
  });

  it('should give full score for API with no mutating operations and no security schemes', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });

  it('should flag error when mutating operations exist but no security schemes defined', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          post: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].severity).toBe('error');
    expect(result.violations[0].message).toContain('no security schemes are defined');
  });

  it('should give full score when all mutating operations are secured', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/test': {
          post: { responses: { '200': { description: 'OK' } } },
          put: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });

  it('should flag warning when mutating operation explicitly disables security', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/test': {
          post: { 
            security: [],
            responses: { '200': { description: 'OK' } } 
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].message).toContain('explicitly disables security');
  });

  it('should flag warning when mutating operation is not secured but schemes are defined', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      },
      paths: {
        '/test': {
          post: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].severity).toBe('warning');
    expect(result.violations[0].message).toContain('not secured, but security schemes are defined');
  });

  it('should flag error when referenced security scheme is not defined', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      security: [{ undefinedAuth: [] }],
      paths: {
        '/test': {
          post: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations.some(v => 
      v.severity === 'error' && 
      v.message.includes("'undefinedAuth' is referenced but not defined")
    )).toBe(true);
  });

  it('should flag info when security scheme is defined but never used', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-KEY'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/test': {
          get: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations.some(v => 
      v.severity === 'info' && 
      v.message.includes("'apiKey' is defined but never referenced")
    )).toBe(true);
  });

  it('should calculate partial score based on secured vs total mutating operations', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      },
      paths: {
        '/secured': {
          post: { 
            security: [{ bearerAuth: [] }],
            responses: { '200': { description: 'OK' } } 
          }
        },
        '/unsecured': {
          post: { responses: { '200': { description: 'OK' } } }
        }
      }
    };

    const result = rule.evaluate(spec);
    // 1 out of 2 mutating operations are secured
    expect(result.score).toBeLessThanOrEqual(Math.round(rule.weight * 0.5));
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle operation-level security overriding global security', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-KEY'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/test': {
          post: { 
            security: [{ apiKey: [] }],
            responses: { '200': { description: 'OK' } } 
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
    // Both security schemes should be referenced
  });

  it('should handle empty paths object', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });

  it('should handle null path item', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': null as any
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });
});
