const router = require('express').Router();

const { isAuthenticated } = require('../../../middlewares/auth');
const auth = require('./auth/auth_index');



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


module.exports = router;