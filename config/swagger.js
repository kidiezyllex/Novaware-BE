import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Swagger configuration options
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Novaware BE API',
      version: '1.0.0',
      description: 'API documentation for Novaware Backend - Fashion E-commerce Platform',
      contact: {
        name: 'API Support',
        email: 'support@novaware.com',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            _id: {
              type: 'string',
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
            },
            password: {
              type: 'string',
              description: 'User password'
            },
            role: {
              type: 'string',
              enum: ['user', 'admin'],
              description: 'User role'
            },
            avatar: {
              type: 'string',
              description: 'User avatar URL'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Product: {
          type: 'object',
          required: ['name', 'price', 'description'],
          properties: {
            _id: {
              type: 'string',
              description: 'Product ID'
            },
            name: {
              type: 'string',
              description: 'Product name'
            },
            price: {
              type: 'number',
              description: 'Product price'
            },
            description: {
              type: 'string',
              description: 'Product description'
            },
            image: {
              type: 'string',
              description: 'Product image URL'
            },
            brand: {
              type: 'string',
              description: 'Product brand ID'
            },
            category: {
              type: 'string',
              description: 'Product category ID'
            },
            countInStock: {
              type: 'number',
              description: 'Product stock count'
            },
            rating: {
              type: 'number',
              description: 'Product rating'
            },
            numReviews: {
              type: 'number',
              description: 'Number of reviews'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Order: {
          type: 'object',
          required: ['orderItems', 'shippingAddress', 'paymentMethod'],
          properties: {
            _id: {
              type: 'string',
              description: 'Order ID'
            },
            orderItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  qty: { type: 'number' },
                  image: { type: 'string' },
                  price: { type: 'number' },
                  product: { type: 'string' }
                }
              }
            },
            shippingAddress: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                city: { type: 'string' },
                postalCode: { type: 'string' },
                country: { type: 'string' }
              }
            },
            paymentMethod: {
              type: 'string',
              description: 'Payment method'
            },
            paymentResult: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                update_time: { type: 'string' },
                email_address: { type: 'string' }
              }
            },
            taxPrice: {
              type: 'number',
              description: 'Tax price'
            },
            shippingPrice: {
              type: 'number',
              description: 'Shipping price'
            },
            totalPrice: {
              type: 'number',
              description: 'Total price'
            },
            isPaid: {
              type: 'boolean',
              description: 'Payment status'
            },
            paidAt: {
              type: 'string',
              format: 'date-time'
            },
            isDelivered: {
              type: 'boolean',
              description: 'Delivery status'
            },
            deliveredAt: {
              type: 'string',
              format: 'date-time'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Brand: {
          type: 'object',
          required: ['name'],
          properties: {
            _id: {
              type: 'string',
              description: 'Brand ID'
            },
            name: {
              type: 'string',
              description: 'Brand name'
            },
            description: {
              type: 'string',
              description: 'Brand description'
            },
            logo: {
              type: 'string',
              description: 'Brand logo URL'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Category: {
          type: 'object',
          required: ['name'],
          properties: {
            _id: {
              type: 'string',
              description: 'Category ID'
            },
            name: {
              type: 'string',
              description: 'Category name'
            },
            description: {
              type: 'string',
              description: 'Category description'
            },
            image: {
              type: 'string',
              description: 'Category image URL'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message'
            },
            stack: {
              type: 'string',
              description: 'Error stack trace'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    example: 'Unauthorized'
                  }
                }
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string'
                  },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    example: 'Resource not found'
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Paths to the API docs
  apis: [
    './routes/*.js',
    './models/*.js',
    './controllers/*.js',
  ],
};

// Initialize swagger-jsdoc
const specs = swaggerJsdoc(options);

/**
 * Set up Swagger UI
 * @param {Object} app Express application
 */
export const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #3b82f6; }
      .swagger-ui .scheme-container { background: #f8fafc; }
      .swagger-ui .btn.authorize { background-color: #3b82f6; }
    `,
    customSiteTitle: 'Novaware BE API Documentation',
    customfavIcon: '/favicon.ico',
  }));

  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  console.log('Swagger documentation initialized at /api-docs');
};

export default setupSwagger;
