module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false, isolatedModules: true }],
  },
  // Prisma's generated runtime is finished JavaScript. Re-compiling it breaks its
  // error classes: a database error then reads "Must call super constructor".
  transformIgnorePatterns: ['/node_modules/', '/packages/appshore/db/generated/'],
  testEnvironment: 'node',
};
