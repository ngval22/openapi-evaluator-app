import { ResponseCodesRule } from '../../../src/scoring-engine/rules/response-code-rule';
import { OpenAPIV3 } from 'openapi-types';
import { CRITERIA_WEIGHTS, RULE_NAMES, RULE_DESCRIPTIONS } from '../../../src/scoring-engine/constants';
import * as helperFunctions from '../../../src/scoring-engine/helper-functions';

// Mock the helper functions
jest.mock('../../../src/scoring-engine/helper-functions', () => ({
  resolveResponse: jest.fn((response) => response),
  calculateScore: jest.fn().mockReturnValue(10) // Default mock return value
}));

describe('ResponseCodesRule', () => {
  let rule: ResponseCodesRule;
  
  beforeEach(() => {
    rule = new ResponseCodesRule();
    jest.clearAllMocks();
  });

  test('should have correct name, description and weight', () => {
    expect(rule.name).toBe(RULE_NAMES.response_codes);
    expect(rule.description).toBe(RULE_DESCRIPTIONS.response_codes);
    expect(rule.weight).toBe(CRITERIA_WEIGHTS.response_codes);
  });

  test('should detect missing paths', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {}
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toBe('No paths defined in the API specification');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect missing response definitions', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            // Missing responses
          } as OpenAPIV3.OperationObject
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toBe('GET operation is missing response definitions');
    expect(result.violations[0].severity).toBe('error');
  });

  test('should detect missing success response codes', () => {
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
              '400': {
                description: 'Bad Request'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation is missing success response codes',
        severity: 'error'
      })
    );
  });

  test('should detect unusual success response codes', () => {
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
              '202': { // Unusual for GET
                description: 'Accepted'
              },
              '400': {
                description: 'Bad Request'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation has unusual success response codes',
        severity: 'warning'
      })
    );
  });

  test('should detect missing client error response codes', () => {
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
                description: 'OK'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation is missing client error response codes',
        severity: 'warning'
      })
    );
  });

  test('should detect missing server error response codes', () => {
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
                description: 'OK'
              },
              '400': {
                description: 'Bad Request'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation is missing server error response codes',
        severity: 'warning'
      })
    );
  });

  test('should suggest adding a default response', () => {
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
                description: 'OK'
              },
              '400': {
                description: 'Bad Request'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation is missing a default response',
        severity: 'info'
      })
    );
  });

  test('should detect missing authentication error codes for secured endpoints', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users': {
          get: {
            security: [{ apiKey: [] }], // Endpoint is secured
            responses: {
              '200': {
                description: 'OK'
              },
              '400': {
                description: 'Bad Request'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation with security requirements is missing authentication/authorization error codes',
        severity: 'warning'
      })
    );
  });

  test('should detect missing 404 for resource-specific operations', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          get: {
            responses: {
              '200': {
                description: 'OK'
              },
              '400': {
                description: 'Bad Request'
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'GET operation on a resource should include a 404 Not Found response',
        severity: 'warning'
      })
    );
  });

  test('should detect missing validation error codes for operations with request bodies', () => {
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
              },
              '500': {
                description: 'Internal Server Error'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'POST operation with request body should include validation error responses',
        severity: 'warning'
      })
    );
  });

  test('should detect missing response description', () => {
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
                description: '' // Empty description
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Response 200 is missing a description',
        severity: 'warning'
      })
    );
  });

  test('should detect missing content definition for success responses', () => {
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
                description: 'OK'
                // Missing content
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Success response 200 is missing content definition',
        severity: 'warning'
      })
    );
  });

  test('should suggest content definition for error responses', () => {
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
              },
              '400': {
                description: 'Bad Request'
                // Missing content
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Error response 400 is missing content definition',
        severity: 'info'
      })
    );
  });

  test('should detect missing schema in response content', () => {
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
                    // Missing schema
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
        message: 'Response content is missing a schema definition',
        severity: 'warning'
      })
    );
  });

  test('should detect invalid HTTP status codes', () => {
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
                description: 'OK'
              },
              '600': { // Invalid status code
                description: 'Invalid Code'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Invalid HTTP status code: 600',
        severity: 'error'
      })
    );
  });

  test('should flag uncommon HTTP status codes', () => {
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
                description: 'OK'
              },
              '418': { // I'm a teapot
                description: 'I\'m a teapot'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Uncommon HTTP status code: 418',
        severity: 'info'
      })
    );
  });

  test('should flag 1xx informational status codes', () => {
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
                description: 'OK'
              },
              '102': { // Processing
                description: 'Processing'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Unusual use of 1xx informational status code: 102',
        severity: 'info'
      })
    );
  });

  test('should not flag 204 No Content for missing content definition', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/users/{userId}': {
          delete: {
            responses: {
              '204': {
                description: 'No Content'
                // No content is expected for 204
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({
        message: 'Success response 204 is missing content definition'
      })
    );
  });

  test('should handle unresolvable response references', () => {
    // Mock resolveResponse to return null for this test
    (helperFunctions.resolveResponse as jest.Mock).mockReturnValueOnce(null);

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
                $ref: '#/components/responses/NotFound'
              }
            }
          }
        }
      }
    };

    const result = rule.evaluate(spec);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        message: 'Could not resolve response reference',
        severity: 'error'
      })
    );
  });

  test('should validate a well-designed API with appropriate response codes', () => {
    // Mock the calculateScore to return the full weight
    (helperFunctions.calculateScore as jest.Mock).mockReturnValue(rule.weight);

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
                description: 'List of users',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        type: 'object'
                      }
                    }
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
                  }
                }
              },
              '401': {
                description: 'Unauthorized',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
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
                  }
                }
              },
              'default': {
                description: 'Unexpected error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          },
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
                description: 'User created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
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
                  }
                }
              },
              '422': {
                description: 'Validation Error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
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
                  }
                }
              },
              'default': {
                description: 'Unexpected error',
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
            responses: {
              '200': {
                description: 'User details',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              },
              '404': {
                description: 'User not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
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
                  }
                }
              },
              'default': {
                description: 'Unexpected error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          },
          delete: {
            responses: {
              '204': {
                description: 'User deleted'
              },
              '404': {
                description: 'User not found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object'
                    }
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
                  }
                }
              },
              'default': {
                description: 'Unexpected error',
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
    expect(result.score).toBe(rule.weight);
    expect(result.violations).toHaveLength(0);
    expect(helperFunctions.calculateScore).toHaveBeenCalled();
  });
});
