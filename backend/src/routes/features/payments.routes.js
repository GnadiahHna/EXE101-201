const { Router } = require('express');
const { router: paymentRouter } = require('./payment.routes');

const router = Router();

// Middleware gắn Deprecation header và forward sang canonical /payment
router.use((req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/payment>; rel="canonical"');
  next();
});

router.use('/', paymentRouter);

module.exports = {
  basePath: '/payments',
  router,
};
