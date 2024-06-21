const router = require("express").Router();
const contractsController = require("./contracts_controller");
const { uploadContract } = require('../../../../utils/s3Utils');

router.get("/:id", contractsController.getContractById);
router.get("/pdf/:id", contractsController.getPdf);

router.get("/", contractsController.getContracts);

router.post("/", uploadContract.single('file'), contractsController.createContracts);
router.patch("/sign/:id", contractsController.signContracts);
router.post("/verify/:id", uploadContract.single('file'), contractsController.verifyContracts);
// router.patch("/:id", contractsController.updateContracts);
// router.delete("/:id", contractsController.deleteContracts);

module.exports = router;
