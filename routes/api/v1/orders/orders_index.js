const router = require("express").Router();
const ordersController = require("./orders_controller");

router.get("/:id", ordersController.getOrderById);
router.get("/", ordersController.getOrders);

router.post("/", ordersController.createOrder);
router.patch("/:id", ordersController.updateOrder);
router.delete("/:id", ordersController.deleteOrder);

module.exports = router;
