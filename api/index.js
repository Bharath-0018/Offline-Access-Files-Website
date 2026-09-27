// api/index.js - Vercel Serverless Function Entry Point for OfflineAccess
const { requestHandler } = require('../server');

module.exports = (req, res) => {
  return requestHandler(req, res);
};
