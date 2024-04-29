const router = require("express").Router();
const authController = require("./auth_controller");

router.post("/signIn", authController.signIn);
router.post("/signUp", authController.signUp);

module.exports = router;
