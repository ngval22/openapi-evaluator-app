import { SchemaTypesRule } from '../../../src/scoring-engine/rules/schema-rule';
import { OpenAPIV3 } from 'openapi-types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from '../../../src/scoring-engine/constants';

describe('SchemaTypesRule', () => {
  let rule: SchemaTypesRule;
  
  beforeEach(() => {
    rule = new SchemaTypesRule();
  });

  test('should have correct name, description and weight', () => {
    expect(rule.name).toBe(RULE_NAMES.schema_types);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.schema_types);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.schema_types);
  });

  test('should return perfect score for well-defined schemas', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: {
                type: 'integer',
                format: 'int64',
                description: 'User ID'
              },
              name: {
                type: 'string',
                description: 'User name'
              },
              email: {
                type: 'string',
                format: 'email',
                description: 'User email'
              }
            }
          },
          Error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'integer',
                description: 'Error code'
              },
              message: {
                type: 'string',
                description: 'Error message'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect missing type definitions', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            // Missing type
            properties: {
              id: {
                type: 'integer'
              },
              name: {
                type: 'string'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('lacks a type definition');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect invalid type values', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'invalid-type', // Invalid type
            properties: {
              id: {
                type: 'integer'
              }
            }
          }
        }
      }
    } as unknown as OpenAPIV3.Document; // Type assertion to bypass TypeScript checking

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('invalid type');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect object schemas without properties', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          EmptyObject: {
            type: 'object'
            // No properties or additionalProperties
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('no properties or additionalProperties');
    expect(result.violations[0].severity).toBe('warning');
  });

  test('should detect array schemas without type definition', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          EmptyArray: {
            type: 'array',
            // No items defined
            items: {},
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('lacks a type definition');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect non-standard string formats', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'custom-format' // Non-standard format
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].message).toContain('non-standard format');
    expect(result.violations[0].severity).toBe('info');
  });

  test('should detect empty enum arrays', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            enum: [] // Empty enum
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('empty enum array');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect null in enum without nullable flag', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            enum: ['active', 'inactive', null] // Includes null without nullable
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('not marked as nullable');
    expect(result.violations[0].severity).toBe('warning');
  });

  test('should allow null in enum with nullable flag', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            nullable: true,
            enum: ['active', 'inactive', null] // Includes null with nullable
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('not marked as nullable')
      })
    );
  });

  test('should detect missing property descriptions', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                // Missing description
              },
              name: {
                type: 'string',
                description: 'User name'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].severity).toBe('info');
  });

  test('should detect unresolved schema references', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              address: {
                $ref: '#/components/schemas/NonExistentSchema' // Reference to non-existent schema
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].message).toContain('Unresolved schema reference');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should validate schemas in path operations', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    // Missing type
                    properties: {
                      name: {
                        type: 'string'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                          // Missing items
                      },
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].message).toContain('lacks a type definition');
  });

  test('should validate schemas in parameters', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{id}': {
          get: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: {
                  // Invalid type
                  type: 'invalid-type'
                }
              },
              {
                name: 'filter',
                in: 'query',
                schema: {
                  type: 'array',
                  // Missing items
                }
              }
            ],
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    } as unknown as OpenAPIV3.Document; // Type assertion to bypass TypeScript checking

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0].message).toContain('invalid type');
    expect(result.violations[1].message).toContain('missing items definition');
  });

  test('should validate composition schemas (allOf, oneOf, anyOf)', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          Pet: {
            oneOf: [
              {
                // Missing type in first oneOf
              },
              {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  }
                }
              }
            ]
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].message).toContain('lacks a type definition');
  });

  test('should validate free-form objects', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          FreeForm: {
            type: 'object',
            additionalProperties: true
            // No properties defined
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('completely free-form object');
    expect(result.violations[0].severity).toBe('warning');
  });

  test('should not flag objects with additionalProperties schema', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          Dictionary: {
            type: 'object',
            additionalProperties: {
              type: 'string'
            }
            // This is a valid dictionary pattern
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('free-form object')
      })
    );
  });

  test('should not flag objects with no required properties as errors', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                description: 'User ID'
              },
              name: {
                type: 'string',
                description: 'User name'
              }
            }
            // No required properties
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('none are marked as required');
    expect(result.violations[0].severity).toBe('info'); // Should be info, not error or warning
  });

  test('should validate response header schemas', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'Success',
                headers: {
                  'X-Rate-Limit': {
                    schema: {
                      // Missing type
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBeLessThan(rule.weight);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('lacks a type definition');
  });
});
