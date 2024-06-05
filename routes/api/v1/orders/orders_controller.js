const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { MongoWallet } = require("../../../../utils/mongo-wallet");
const { Wallet, Gateway } = require("fabric-network");
const { buildCAClient, enrollAdminMongo, buildCCP } = require("../../../../utils/ca-utils");
const FabricCAServices = require("fabric-ca-client");
const { default: mongoose } = require("mongoose");

exports.createOrder = async (req, res) => {
  console.log(`
    --------------------------------------------------
      router.post('/orders', ordersController.createOrder);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { orders, to, totalCount } = req.body;
  const session = await dbModels.Order.startSession();

  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org });
    // 만약 등록되지 않은 사용자라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    // 트랜잭션 시작
    await session.startTransaction();

    const newOrder = new dbModels.Order(
      {
        writer: new mongoose.Types.ObjectId(_id),
        orders: orders,
        to: to,
        totalCount: totalCount,
      }
    );

    // 새로운 주문 저장
    await newOrder.save({ session });

    /**
    * blockchain 코드 시작 -------------------------------------------
    */
    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(user._id.toString());

    let selectedCompany;
    switch (user.org) {
      case 'NaverMSP':
        selectedCompany = 'naver';
        break;
      case 'DeliveryMSP':
        selectedCompany = 'delivery';
        break;
      case 'RestaurantMSP':
        selectedCompany = 'restaurant';
        break;
      default:
        break;
    }


    const ccp = buildCCP(selectedCompany);
    console.log(wallet)
    console.log(userIdentity)
    console.log(ccp)
    const gateway = new Gateway();

    await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // 네트워크 채널 가져오기
    const network = await gateway.getNetwork('orderchannel');

    // 스마트 컨트랙트 가져오기
    const contract = network.getContract('order');

    try {
      const result = await contract.submitTransaction(
        'CreateOrder', // 스마트 컨트랙트의 함수 이름
        newOrder._id,
        newOrder.writer,
        newOrder.orders,
        newOrder.to,
        newOrder.totalCount,
        newOrder.createdAt.toISOString(),
        newOrder.updatedAt.toISOString(),
      );
    } catch (bcError) {
      console.error('Blockchain transaction failed:', bcError);
      throw bcError;
    }

    await gateway.disconnect();

    // 트랜잭션 커밋
    await session.commitTransaction();
    session.endSession();

    /**
    * blockchain 코드 끝 -------------------------------------------
    */
    return res.status(200).json({
      message: "주문 성공",
    });
  } catch (err) {
    console.log(err);
    console.log(err?.responses[0]?.responses);

    // 트랜잭션 롤백
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};


exports.getOrderById = async (req, res) => {
  console.log(`
    --------------------------------------------------
      router.get('/orders/:id', ordersController.getOrderById);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params
  console.log(id)
  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org }).lean();
    //만약 등록되지 않은 전화번호라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    const foundOrder = await dbModels.Order.findById(id)
      .lean()

    if (!foundOrder) {
      return res.status(404).json({
        message: "주문 찾기 실패",
      });
    }

    return res.status(200).json({
      data: foundOrder,
      message: "주문 찾기 성공",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};



exports.getOrders = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.get("/orders", ordersController.getOrders);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const {
    active = 'createdAt',
    direction = 'asc',
    pageIndex = '0',
    pageSize = '10'
  } = req.query;

  const limit = parseInt(pageSize, 10);
  const skip = parseInt(pageIndex, 10) * limit;
  const sortCriteria = {
    [active]: direction === 'desc' ? -1 : 1,
  };

  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org }).lean();
    //만약 등록되지 않은 전화번호라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    const foundOrders = await dbModels.Order.find()
      .populate({
        path: 'writer',
        select: 'email -_id' // 이메일 필드만 선택
      })
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean()

    if (!foundOrders) {
      return res.status(404).json({
        message: "주문 찾기 실패",
      });
    }

    /**
      * blockchain 코드 시작-------------------------------------------
      */
    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(user._id.toString());

    let selectedCompany;
    switch (user.org) {
      case 'NaverMSP':
        selectedCompany = 'naver';
        break;
      case 'DeliveryMSP':
        selectedCompany = 'delivery';
        break;
      case 'RestaurantMSP':
        selectedCompany = 'restaurant';
        break;
      default:
        break;
    }

    const ccp = buildCCP(selectedCompany);
    const gateway = new Gateway();

    await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // 네트워크 채널 가져오기
    const network = await gateway.getNetwork('orderchannel');

    // 스마트 컨트랙트 가져오기
    const contract = network.getContract('order');

    // 블록체인에서 데이터를 쿼리할땐 크게 2가지 방식있다.
    // evaluateTransaction
    // submitTransaction
    // evaluateTransaction 는 데이터를 빠르게 couchDB에서
    // 가져오지만, 다른 피어들과 데이터를 비교하지 않는다.
    // 그래서 오염이 있어도 걸러내지 못한다.
    // submitTransaction로 하면 느리게 데이터를 불러오지만
    // 다른 노드들과 데이터를 비교를 통해 오염 유무를 알 수 있다.
    // 선택에 따라 어떻게 할지 정하면 됨.

    // await contract.evaluateTransaction(
    //   'GetAllOrders', // 스마트 컨트랙트의 함수 이름
    // );


    try {
      const resultBuffer = await contract.submitTransaction(
        'GetAllOrders', // 스마트 컨트랙트의 함수 이름
      );
      const resultString = resultBuffer.toString('utf8');
      const resultJson = JSON.parse(resultString);
      console.log(resultJson)
    } catch (bcError) {
      console.error('Blockchain transaction failed:', bcError);
      return res.status(500).json({
        error: true,
        message: 'Blockchain transaction failed',
        details: bcError.message,
      });
    }
    await gateway.disconnect();

    /**
      * blockchain 코드 끝-------------------------------------------
      */

    return res.status(200).json({
      data: foundOrders,
      message: "주문 찾기 성공",
    });
  } catch (err) {

    return res.status(500).json({ error: true, message: "Server Error" });
  }
};


exports.updateOrder = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.patch("/orders/:id", ordersController.updateOrder);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params
  console.log(id)

  const session = await dbModels.Order.startSession();

  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org }).lean();
    //만약 등록되지 않은 전화번호라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });



    // 트랜잭션 시작
    await session.startTransaction();
    const updatedOrder = await dbModels.Order.findByIdAndUpdate(id, { ...req.body }, { new: true })

    if (!updatedOrder) {
      return res.status(404).json({
        message: "주문 수정 실패",
      });
    }

    /**
  * blockchain 코드 시작-------------------------------------------
  */
    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(user._id.toString());

    let selectedCompany;
    switch (user.org) {
      case 'NaverMSP':
        selectedCompany = 'naver';
        break;
      case 'DeliveryMSP':
        selectedCompany = 'delivery';
        break;
      case 'RestaurantMSP':
        selectedCompany = 'restaurant';
        break;
      default:
        break;
    }

    const ccp = buildCCP(selectedCompany);
    const gateway = new Gateway();

    await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // 네트워크 채널 가져오기
    const network = await gateway.getNetwork('orderchannel');

    // 스마트 컨트랙트 가져오기
    const contract = network.getContract('order');

    try {
      const resultBuffer = await contract.submitTransaction(
        'UpdateOrder', // 스마트 컨트랙트의 함수 이름
        updatedOrder._id,
        updatedOrder.writer,
        updatedOrder.orders,
        updatedOrder.to,
        updatedOrder.totalCount,
        updatedOrder.createdAt.toISOString(),
        updatedOrder.updatedAt.toISOString(),
      );
      const resultString = resultBuffer.toString('utf8');
      const resultJson = JSON.parse(resultString);
      console.log(resultJson)
    } catch (bcError) {
      console.error('Blockchain transaction failed:', bcError);
      return res.status(500).json({
        error: true,
        message: 'Blockchain transaction failed',
        details: bcError.message,
      });
    }
    await gateway.disconnect();

    /**
      * blockchain 코드 끝-------------------------------------------
      */


    // 트랜잭션 커밋
    await session.commitTransaction();
    session.endSession();


    return res.status(200).json({
      message: "주문 수정 성공",
    });
  } catch (err) {
    console.log(err);
    // 트랜잭션 롤백
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};



exports.deleteOrder = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.delete("/orders/:id", ordersController.deleteOrder);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params
  console.log(id)
  const session = await dbModels.Order.startSession();

  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org }).lean();
    //만약 등록되지 않은 전화번호라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });
    // 트랜잭션 시작
    await session.startTransaction();
    const deletedOrder = await dbModels.Order.findByIdAndDelete(id)


    if (!deletedOrder) {
      return res.status(404).json({
        message: "주문 삭제 실패",
      });
    }

    /**
* blockchain 코드 시작-------------------------------------------
*/
    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(user._id.toString());

    let selectedCompany;
    switch (user.org) {
      case 'NaverMSP':
        selectedCompany = 'naver';
        break;
      case 'DeliveryMSP':
        selectedCompany = 'delivery';
        break;
      case 'RestaurantMSP':
        selectedCompany = 'restaurant';
        break;
      default:
        break;
    }

    const ccp = buildCCP(selectedCompany);
    const gateway = new Gateway();

    await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // 네트워크 채널 가져오기
    const network = await gateway.getNetwork('orderchannel');

    // 스마트 컨트랙트 가져오기
    const contract = network.getContract('order');

    try {
      const resultBuffer = await contract.submitTransaction(
        'DeleteOrder', // 스마트 컨트랙트의 함수 이름
        id,
      );
      const resultString = resultBuffer.toString('utf8');
      const resultJson = JSON.parse(resultString);
      console.log(resultJson)
    } catch (bcError) {
      console.error('Blockchain transaction failed:', bcError);
      return res.status(500).json({
        error: true,
        message: 'Blockchain transaction failed',
        details: bcError.message,
      });
    }
    await gateway.disconnect();

    /**
      * blockchain 코드 끝-------------------------------------------
      */


    // 트랜잭션 커밋
    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      message: "주문 삭제 성공",
    });
  } catch (err) {
    console.log(err);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ error: true, message: "Server Error" });
  }

};

