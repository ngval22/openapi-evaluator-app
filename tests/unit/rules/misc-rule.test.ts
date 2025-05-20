import { OpenAPIV3 } from 'openapi-types';
import { MiscellaneousBestPracticesRule } from '../../../src/scoring-engine/rules/misc-rule'
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from "../../../src/scoring-engine/constants";

describe('MiscellaneousBestPracticesRule', () => {
  let rule: MiscellaneousBestPracticesRule;
  
  beforeEach(() => {
    rule = new MiscellaneousBestPracticesRule();
  });

  it('should initialize with correct properties', () => {
    expect(rule.name).toBe(RULE_NAMES.miscellaneous);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.miscellaneous);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.miscellaneous);
  });

  describe('Versioning checks', () => {
    it('should validate semantic versioning', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.2.3' },
        paths: { '/test': { get: { responses: { '200': { description: 'OK' } } } } }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location === 'info.version')).toHaveLength(0);
    });

    it('should flag non-semantic versioning', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: 'v1' },
        paths: { '/test': { get: { responses: { '200': { description: 'OK' } } } } }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'info.version' && 
        v.message.includes('not in a standard semantic version format')
      )).toBe(true);
    });
  });

  describe('Servers checks', () => {
    it('should validate proper servers array', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'https://api.example.com/v1', description: 'Production' },
          { url: 'https://staging-api.example.com/v1', description: 'Staging' }
        ],
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.startsWith('servers'))).toHaveLength(0);
    });

    it('should flag missing servers array', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'servers' && 
        v.message.includes('missing or empty')
      )).toBe(true);
    });

    it('should flag invalid server URLs', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'invalid-url', description: 'Production' }
        ],
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'servers[0].url' && 
        v.message.includes('invalid')
      )).toBe(true);
    });

    it('should flag missing server descriptions', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [
          { url: 'https://api.example.com/v1' }
        ],
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'servers[0]' && 
        v.message.includes('missing a description')
      )).toBe(true);
    });
  });

  describe('Tags checks', () => {
    it('should validate properly defined and used tags', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        tags: [
          { name: 'users', description: 'User operations' },
          { name: 'products', description: 'Product operations' }
        ],
        paths: {
          '/users': {
            get: { 
              tags: ['users'],
              responses: { '200': { description: 'OK' } } 
            }
          },
          '/products': {
            get: { 
              tags: ['products'],
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('tags'))).toHaveLength(0);
    });

    it('should flag tags used but not defined', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { 
              tags: ['users'],
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'operation.tags / spec.tags' && 
        v.message.includes("'users' is used in an operation but not defined")
      )).toBe(true);
    });

    it('should flag missing tag descriptions', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        tags: [
          { name: 'users' }
        ],
        paths: {
          '/users': {
            get: { 
              tags: ['users'],
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      // This is indirectly tested by checking the score
      const result = rule.evaluate(spec);
      // We expect a lower score because tags are defined but missing descriptions
      expect(result.score).toBeLessThan(rule.weight);
    });
  });

  describe('Components reuse checks', () => {
    it('should validate components defined and reused', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        },
        paths: {
          '/users': {
            get: { 
              responses: { 
                '200': { 
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' }
                    }
                  }
                } 
              } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('components'))).toHaveLength(0);
    });

    it('should flag components defined but not reused', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        },
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
          '/products': { get: { responses: { '200': { description: 'OK' } } } },
          '/orders': { get: { responses: { '200': { description: 'OK' } } } },
          '/categories': { get: { responses: { '200': { description: 'OK' } } } },
          '/tags': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'components / various' && 
        v.message.includes('Components are defined, but no `$ref` keywords were found')
      )).toBe(true);
    });

    it('should flag many paths without components', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
          '/products': { get: { responses: { '200': { description: 'OK' } } } },
          '/orders': { get: { responses: { '200': { description: 'OK' } } } },
          '/categories': { get: { responses: { '200': { description: 'OK' } } } },
          '/tags': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'components' && 
        v.message.includes('API has several paths but does not define or use reusable components')
      )).toBe(true);
    });
  });

  describe('Info completeness checks', () => {
    it('should validate complete info object', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { 
          title: 'Test API', 
          version: '1.0.0',
          contact: {
            name: 'API Support',
            email: 'support@example.com'
          },
          license: {
            name: 'MIT'
          }
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => 
        v.location === 'info.contact' || v.location === 'info.license'
      )).toHaveLength(0);
    });

    it('should flag missing contact info', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { 
          title: 'Test API', 
          version: '1.0.0',
          license: {
            name: 'MIT'
          }
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'info.contact' && 
        v.message.includes('missing or empty')
      )).toBe(true);
    });

    it('should flag missing license info', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { 
          title: 'Test API', 
          version: '1.0.0',
          contact: {
            name: 'API Support',
            email: 'support@example.com'
          }
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'info.license' && 
        v.message.includes('missing')
      )).toBe(true);
    });

    it('should flag empty contact object', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { 
          title: 'Test API', 
          version: '1.0.0',
          contact: {},
          license: {
            name: 'MIT'
          }
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'info.contact' && 
        v.message.includes('missing or empty')
      )).toBe(true);
    });
  });

  describe('Operation IDs checks', () => {
    it('should validate operations with unique IDs', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { 
              operationId: 'getUsers',
              responses: { '200': { description: 'OK' } } 
            },
            post: { 
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('operationId'))).toHaveLength(0);
    });

    it('should flag missing operation IDs', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { 
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === '/users.get' && 
        v.message.includes('missing an `operationId`')
      )).toBe(true);
    });

    it('should flag duplicate operation IDs', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { 
              operationId: 'getItems',
              responses: { '200': { description: 'OK' } } 
            }
          },
          '/items': {
            get: { 
              operationId: 'getItems',
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location.includes('operationId') && 
        v.message.includes('Duplicate operationId')
      )).toBe(true);
    });
  });

  describe('External docs checks', () => {
    it('should validate proper external docs', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        externalDocs: {
          url: 'https://example.com/docs',
          description: 'Find more info here'
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('externalDocs'))).toHaveLength(0);
    });

    it('should validate external docs at tag level', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        tags: [
          { 
            name: 'users', 
            description: 'User operations',
            externalDocs: {
              url: 'https://example.com/docs/users',
              description: 'User documentation'
            }
          }
        ],
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('externalDocs'))).toHaveLength(0);
    });

    it('should validate external docs at operation level', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { 
              externalDocs: {
                url: 'https://example.com/docs/users/get',
                description: 'Get users documentation'
              },
              responses: { '200': { description: 'OK' } } 
            }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.filter(v => v.location.includes('externalDocs'))).toHaveLength(0);
    });

    it('should flag invalid external docs URL', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        externalDocs: {
          url: 'invalid-url',
          description: 'Find more info here'
        },
        paths: {}
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'externalDocs' && 
        v.message.includes('missing a valid \'url\'')
      )).toBe(true);
    });

    it('should suggest using external docs when none exist', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { responses: { '200': { description: 'OK' } } }
          }
        }
      };

      const result = rule.evaluate(spec);
      expect(result.violations.some(v => 
        v.location === 'spec' && 
        v.message.includes('Consider using `externalDocs`')
      )).toBe(true);
    });
  });

  it('should calculate score proportionally based on all checks', () => {
    // A spec with some good practices but not all
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { 
        title: 'Test API', 
        version: '1.0.0', // Good version
        contact: {
          name: 'API Support' // Good contact
        }
        // Missing license
      },
      servers: [
        { url: 'https://api.example.com/v1' } // Missing description
      ],
      tags: [
        { name: 'users' } // Missing description
      ],
      paths: {
        '/users': {
          get: { 
            tags: ['users'],
            operationId: 'getUsers', // Good operationId
            responses: { '200': { description: 'OK' } } 
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    // Score should be partial - not 0 but not full weight either
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(rule.weight);
    
    // Should have multiple violations
    expect(result.violations.length).toBeGreaterThan(1);
  });

  it('should handle null path items gracefully', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': null as any
      }
    };

    // Should not throw an error
    expect(() => rule.evaluate(spec)).not.toThrow();
  });

  it('should handle missing components gracefully', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {}
    };

    // Should not throw an error
    expect(() => rule.evaluate(spec)).not.toThrow();
  });
});
