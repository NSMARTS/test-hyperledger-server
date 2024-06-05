const router = require('express').Router();

const { isAuthenticated } = require('../../../middlewares/auth');
const auth = require('./auth/auth_index');
const orders = require('./orders/orders_index');



/*-----------------------------------
  not needed to verify
-----------------------------------*/
router.use('/auth', auth);

/*-----------------------------------
  Token verify
-----------------------------------*/
router.use(isAuthenticated);

/*-----------------------------------
  API
-----------------------------------*/
router.use('/orders', orders);

module.exports = router;