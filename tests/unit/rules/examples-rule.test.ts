import { ExamplesSamplesRule } from '../../../src/scoring-engine/rules/examples-rule';
import { OpenAPIV3 } from 'openapi-types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from '../../../src/scoring-engine/constants';
import * as helperFunctions from '../../../src/scoring-engine/helper-functions';

// Mock the helper functions
jest.mock('../../../src/scoring-engine/helper-functions', () => ({
  resolveParameter: jest.fn(),
  resolveRequestBody: jest.fn(),
  resolveResponse: jest.fn()
}));

describe('ExamplesSamplesRule', () => {
  let rule: ExamplesSamplesRule;
  
  beforeEach(() => {
    rule = new ExamplesSamplesRule();
    jest.clearAllMocks();
  });

  test('should have correct name, description and weight', () => {
    expect(rule.name).toBe(RULE_NAMES.examples);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.examples);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.examples);
  });

  test('should return full score when no paths are defined', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect missing request body examples', () => {
    // Mock resolveRequestBody to return a request body without examples
    (helperFunctions.resolveRequestBody as jest.Mock).mockReturnValue({
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
          // No example or examples field
        }
      }
    });

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
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Request body for application/json is missing an example.',
        severity: 'warning'
      })
    );
    expect(helperFunctions.resolveRequestBody).toHaveBeenCalled();
  });

  test('should detect missing response examples', () => {
    // Mock resolveResponse to return a response without examples
    (helperFunctions.resolveResponse as jest.Mock).mockReturnValue({
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
          // No example or examples field
        }
      }
    });

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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
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
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Response body for status 200 (application/json) is missing an example.',
        severity: 'warning'
      })
    );
    expect(helperFunctions.resolveResponse).toHaveBeenCalled();
  });

  test('should detect missing parameter examples', () => {
    // Mock resolveParameter to return a parameter without examples
    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue({
      name: 'userId',
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      }
      // No example or examples field
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: "Parameter 'userId' is missing an example.",
        severity: 'info'
      })
    );
    expect(helperFunctions.resolveParameter).toHaveBeenCalled();
  });

  test('should not flag request body with example field', () => {
    // Mock resolveRequestBody to return a request body with an example
    (helperFunctions.resolveRequestBody as jest.Mock).mockReturnValue({
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          example: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      }
    });

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
                    type: 'object'
                  },
                  example: {
                    name: 'John Doe',
                    email: 'john@example.com'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Request body for application/json is missing an example')
      })
    );
  });

  test('should not flag request body with examples field', () => {
    // Mock resolveRequestBody to return a request body with examples
    (helperFunctions.resolveRequestBody as jest.Mock).mockReturnValue({
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          examples: {
            user1: {
              value: {
                name: 'John Doe',
                email: 'john@example.com'
              }
            },
            user2: {
              value: {
                name: 'Jane Doe',
                email: 'jane@example.com'
              }
            }
          }
        }
      }
    });

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
                    type: 'object'
                  },
                  examples: {
                    user1: {
                      value: {
                        name: 'John Doe',
                        email: 'john@example.com'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Request body for application/json is missing an example')
      })
    );
  });

  test('should not flag response with example field', () => {
    // Mock resolveResponse to return a response with an example
    (helperFunctions.resolveResponse as jest.Mock).mockReturnValue({
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          example: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      }
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    },
                    example: {
                      id: 1,
                      name: 'John Doe',
                      email: 'john@example.com'
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
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Response body for status 200 (application/json) is missing an example')
      })
    );
  });

  test('should not flag parameter with example field', () => {
    // Mock resolveParameter to return a parameter with an example
    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue({
      name: 'userId',
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      },
      example: '123e4567-e89b-12d3-a456-426614174000'
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                },
                example: '123e4567-e89b-12d3-a456-426614174000'
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Parameter 'userId' is missing an example")
      })
    );
  });

  test('should not flag parameter with examples field', () => {
    // Mock resolveParameter to return a parameter with examples
    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue({
      name: 'userId',
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      },
      examples: {
        uuid: {
          value: '123e4567-e89b-12d3-a456-426614174000'
        },
        numeric: {
          value: '12345'
        }
      }
    });

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                },
                examples: {
                  uuid: {
                    value: '123e4567-e89b-12d3-a456-426614174000'
                  }
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Parameter 'userId' is missing an example")
      })
    );
  });

  test('should only check 2xx responses for examples', () => {
    // Mock resolveResponse to return responses with and without examples
    (helperFunctions.resolveResponse as jest.Mock)
      .mockImplementation((response) => {
        // This is a simplified mock that returns the response as is
        // In a real scenario, it would resolve references
        return response;
      });

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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                    // No example
                  }
                }
              },
              '400': {
                description: 'Bad Request',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                    // No example, but this is a 4xx so it shouldn't be flagged
                  }
                }
              },
              '500': {
                description: 'Internal Server Error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                    // No example, but this is a 5xx so it shouldn't be flagged
                  }
                }
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    // Should only have one violation for the 200 response
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('Response body for status 200');
  });

  test('should calculate score based on percentage of elements with examples', () => {
    // Mock helper functions to simulate some elements with examples and some without
    (helperFunctions.resolveRequestBody as jest.Mock).mockReturnValue({
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          example: {
            name: 'John Doe'
          }
        }
      }
    });

    (helperFunctions.resolveResponse as jest.Mock).mockReturnValue({
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
          // No example
        }
      }
    });

    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue({
      name: 'userId',
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      }
      // No example
    });

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
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          }
        },
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    // In this test case:
    // - 1 request body with example (1 point)
    // - 2 responses without examples (0 points)
    // - 1 parameter without example (0 points)
    // Total: 1 out of 4 elements have examples (25%)
    // Expected score: 25% of the weight

    const result = rule.evaluate(spec);
    const expectedScore = Math.round(0.25 * rule.weight);
    expect(result.score).toBe(expectedScore);
  });

  test('should handle null path items', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': null as any // Null path item
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(0);
  });

  test('should handle operations without parameters', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            // No parameters
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeLessThan(5);
  });

  test('should handle operations without request body', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            // No request body (which is correct for GET)
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeLessThan(5);
  });

  test('should handle operations without responses', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            // No responses (invalid but should not crash)
          } as OpenAPIV3.OperationObject
        }
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(0);
  });

  test('should handle unresolvable parameter references', () => {
    // Mock resolveParameter to return null for unresolvable references
    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue(null);

    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                $ref: '#/components/parameters/nonExistent'
              }
            ],
            responses: {
              '200': {
                description: 'OK'
              }
            }
          }
        }
      }
    };

    // This should not throw an error
    const result = rule.evaluate(spec);
    expect(result.violations.length).toBeLessThan(5);

  });

  test('should validate a well-documented API with examples everywhere', () => {
    // Mock helper functions to return objects with examples
    (helperFunctions.resolveRequestBody as jest.Mock).mockReturnValue({
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          example: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      }
    });

    (helperFunctions.resolveResponse as jest.Mock).mockReturnValue({
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object'
          },
          example: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      }
    });

    (helperFunctions.resolveParameter as jest.Mock).mockReturnValue({
      name: 'userId',
      in: 'path',
      required: true,
      schema: {
        type: 'string'
      },
      example: '123e4567-e89b-12d3-a456-426614174000'
    });

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
                    type: 'object'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          }
        },
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: {
                  type: 'string'
                }
              }
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
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
    expect(result.score).toBe(rule.weight); // Full score
    expect(result.violations).toHaveLength(0);
  });
});
