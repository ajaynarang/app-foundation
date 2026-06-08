module.exports = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://sally_user:sally_password@localhost:5432/sally',
    },
  },
};
