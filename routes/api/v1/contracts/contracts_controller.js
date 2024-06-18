const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const fs = require('fs') // s3로 업로드 하기위해 동기처리
const fsPromises = require('fs').promises;
const { unlink } = require('fs/promises');

const { MongoWallet } = require("../../../../utils/mongo-wallet");
const { Wallet, Gateway } = require("fabric-network");
const { buildCAClient, enrollAdminMongo, buildCCP } = require("../../../../utils/ca-utils");
const FabricCAServices = require("fabric-ca-client");
const { default: mongoose } = require("mongoose");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../../../../utils/s3Utils");
const { X509, KJUR, KEYUTIL } = require("jsrsasign");

exports.createContracts = async (req, res) => {
  console.log(`
    --------------------------------------------------
      router.post('/contracts', contractsController.createContract);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { title, receiverA, receiverB } = req.body;
  const file = req.file;
  console.log(file)
  console.log(req.body)
  const session = await dbModels.Contract.startSession();

  try {
    if (!file) {
      return res.status(404).json({
        message: 'PDF was not uploaded!'
      })
    }

    const foundWriter = await dbModels.User.findOne({ _id: _id, email: email, org: org })
    if (!foundWriter) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    const foundReceiverA = await dbModels.User.findOne({ email: receiverA, org: { $in: ['NaverMSP', 'RestaurantMSP'] } })

    if (!foundReceiverA) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    const foundReceiverB = await dbModels.User.findOne({ email: receiverB, org: { $in: ['NaverMSP', 'RestaurantMSP'] } })

    if (!foundReceiverB) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    // 트랜잭션 시작
    await session.startTransaction();

    const s3Key = `contracts${file.filename}`

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fs.createReadStream(file.path),
      // ACL: 'public-read',
      ContentType: req.file.mimetype,
    };

    console.log(uploadParams)

    if (process.env.NODE_ENV.trim() === 'development') {
      uploadParams.ACL = 'public-read'
    }

    await s3Client.send(new PutObjectCommand(uploadParams));

    const fileLoaded = await fsPromises.readFile(file.path);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileLoaded);
    const hex = hashSum.digest('hex');

    // 로컬에 저장된 리사이즈 파일 제거
    await unlink(file.path);


    const s3Location = `${process.env.AWS_LOCATION}${s3Key}`

    const newContract = new dbModels.Contract(
      {
        title: title,
        writer: new mongoose.Types.ObjectId(_id),
        pdfHash: hex,
        originalname: file.originalname,
        key: s3Key,
        location: s3Location,
        receiverA: new mongoose.Types.ObjectId(foundReceiverA._id),
        receiverB: new mongoose.Types.ObjectId(foundReceiverB._id),
      }
    );

    // 새로운 주문 저장
    await newContract.save({ session });

    // /**
    // * blockchain 코드 시작 -------------------------------------------
    // */
    // const store = new MongoWallet();
    // const wallet = new Wallet(store);
    // const userIdentity = await wallet.get(user._id.toString());

    // let selectedCompany;
    // switch (user.org) {
    //   case 'NaverMSP':
    //     selectedCompany = 'naver';
    //     break;
    //   case 'DeliveryMSP':
    //     selectedCompany = 'delivery';
    //     break;
    //   case 'RestaurantMSP':
    //     selectedCompany = 'restaurant';
    //     break;
    //   default:
    //     break;
    // }


    // const ccp = buildCCP(selectedCompany);
    // console.log(wallet)
    // console.log(userIdentity)
    // console.log(ccp)
    // const gateway = new Gateway();

    // await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // // 네트워크 채널 가져오기
    // const network = await gateway.getNetwork('orderchannel');

    // // 스마트 컨트랙트 가져오기
    // const contract = network.getContract('order');

    // try {
    //   const result = await contract.submitTransaction(
    //     'CreateOrder', // 스마트 컨트랙트의 함수 이름
    //     newOrder._id,
    //     newOrder.writer,
    //     newOrder.orders,
    //     newOrder.to,
    //     newOrder.totalCount,
    //     newOrder.createdAt.toISOString(),
    //     newOrder.updatedAt.toISOString(),
    //   );
    // } catch (bcError) {
    //   console.error('Blockchain transaction failed:', bcError);
    //   throw bcError;
    // }

    // await gateway.disconnect();

    // 트랜잭션 커밋
    await session.commitTransaction();
    session.endSession();

    /**
    * blockchain 코드 끝 -------------------------------------------
    */
    return res.status(200).json({
      message: "계약서 생성 성공",
    });
  } catch (err) {
    console.log(err);
    // console.log(err?.responses[0]?.responses);

    // 트랜잭션 롤백
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};

exports.getPdf = async (req, res) => {
  console.log(`
    --------------------------------------------------
      router.get('/contracts/pdf/:id', contractsController.getPdf);
    --------------------------------------------------`);

  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params;
  console.log(id);

  try {
    const user = await dbModels.User.findOne({ _id, email, org }).lean();
    if (!user) {
      return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });
    }

    const foundContract = await dbModels.Contract
      .findById(id)
      .lean();

    console.log(foundContract)
    if (!foundContract) {
      return res.status(404).json({ error: true, message: "계약을 찾을 수 없습니다." });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: foundContract.key, // 업로드된 파일 경로
    });

    const response = await s3Client.send(command);
    res.attachment(foundContract.key);
    response.Body.pipe(res);


  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};


exports.getContractById = async (req, res) => {
  console.log(`
    --------------------------------------------------
      router.get('/contracts/:id', contractsController.getContractById);
    --------------------------------------------------`);

  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params;
  console.log(id);

  try {
    const user = await dbModels.User.findOne({ _id, email, org }).lean();
    if (!user) {
      return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });
    }

    const foundContract = await dbModels.Contract
      .findById(id, { location: 0 })
      .populate({
        path: 'writer',
        select: 'email' // 이메일 필드만 선택
      })
      .populate({
        path: 'receiverA',
        select: 'email'  // Select only the email field, exclude _id
      })
      .populate({
        path: 'receiverB',
        select: 'email'  // Select only the email field, exclude _id
      })
      .lean();

    console.log(foundContract)
    if (!foundContract) {
      return res.status(404).json({ error: true, message: "계약을 찾을 수 없습니다." });
    }


    res.status(200).json({ contract: foundContract });


  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};

exports.getContracts = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.get("/contracts", contractsController.getContracts);
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

    const foundContracts = await dbModels.Contract.find({}, { location: 0 })
      .populate({
        path: 'writer',
        select: 'email -_id' // 이메일 필드만 선택
      })
      .populate({
        path: 'receiverA',
        select: 'email -_id'  // Select only the email field, exclude _id
      })
      .populate({
        path: 'receiverB',
        select: 'email -_id'  // Select only the email field, exclude _id
      })
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean()

    if (!foundContracts) {
      return res.status(404).json({
        message: "주문 찾기 실패",
      });
    }

    // /**
    //   * blockchain 코드 시작-------------------------------------------
    //   */
    // const store = new MongoWallet();
    // const wallet = new Wallet(store);
    // const userIdentity = await wallet.get(user._id.toString());

    // let selectedCompany;
    // switch (user.org) {
    //   case 'NaverMSP':
    //     selectedCompany = 'naver';
    //     break;
    //   case 'DeliveryMSP':
    //     selectedCompany = 'delivery';
    //     break;
    //   case 'RestaurantMSP':
    //     selectedCompany = 'restaurant';
    //     break;
    //   default:
    //     break;
    // }

    // const ccp = buildCCP(selectedCompany);
    // const gateway = new Gateway();

    // await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // // 네트워크 채널 가져오기
    // const network = await gateway.getNetwork('orderchannel');

    // // 스마트 컨트랙트 가져오기
    // const contract = network.getContract('order');

    // // 블록체인에서 데이터를 쿼리할땐 크게 2가지 방식있다.
    // // evaluateTransaction
    // // submitTransaction
    // // evaluateTransaction 는 데이터를 빠르게 couchDB에서
    // // 가져오지만, 다른 피어들과 데이터를 비교하지 않는다.
    // // 그래서 오염이 있어도 걸러내지 못한다.
    // // submitTransaction로 하면 느리게 데이터를 불러오지만
    // // 다른 노드들과 데이터를 비교를 통해 오염 유무를 알 수 있다.
    // // 선택에 따라 어떻게 할지 정하면 됨.

    // // await contract.evaluateTransaction(
    // //   'GetAllOrders', // 스마트 컨트랙트의 함수 이름
    // // );


    // try {
    //   const resultBuffer = await contract.submitTransaction(
    //     'GetAllOrders', // 스마트 컨트랙트의 함수 이름
    //   );
    //   const resultString = resultBuffer.toString('utf8');
    //   const resultJson = JSON.parse(resultString);
    //   console.log(resultJson)
    // } catch (bcError) {
    //   console.error('Blockchain transaction failed:', bcError);
    //   return res.status(500).json({
    //     error: true,
    //     message: 'Blockchain transaction failed',
    //     details: bcError.message,
    //   });
    // }
    // await gateway.disconnect();

    /**
      * blockchain 코드 끝-------------------------------------------
      */

    return res.status(200).json({
      data: foundContracts,
      message: "주문 찾기 성공",
    });
  } catch (err) {

    return res.status(500).json({ error: true, message: "Server Error" });
  }
};



exports.signContracts = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.patch("/contract/sign/:id", contractsController.signContracts);
    --------------------------------------------------`);
  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded;
  const { id } = req.params
  const body = req.body
  console.log(body)
  console.log(id)

  const session = await dbModels.Contract.startSession();

  try {
    const user = await dbModels.User.findOne({ _id: _id, email: email, org: org }).lean();
    //만약 등록되지 않은 전화번호라면 401 에러
    if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    if (!(body.receiver === 'a' || body.receiver === 'b')) {
      return res.status(401).json({ error: true, message: "잘못된 등록 양식 입니다." });
    }

    const receiverField = body.receiver === 'a' ? 'receiverA' : 'receiverB';
    const statusField = body.receiver === 'a' ? 'statusA' : 'statusB';

    const foundContract = await dbModels.Contract.findOne({ _id: id, [receiverField]: _id }).lean();

    if (!foundContract) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

    body[statusField] = 'signed';



    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(_id.toString());

    if (!userIdentity) {
      console.log(`An identity for the user ${req.decoded._id} does not exist in the wallet`);
      return res.status(500).send({ message: `An identity for the user does not exist in the wallet` });
    }

    const userPrivateKey = userIdentity.credentials.privateKey;
    console.log(userPrivateKey)
    const sig = new KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });
    sig.init(userPrivateKey, "");
    sig.updateHex(foundContract.pdfHash);
    const sigValueHex = sig.sign();
    const sigValueBase64 = Buffer.from(sigValueHex, 'hex').toString('base64');
    console.log("Signature: " + sigValueBase64);


    body[body.receiver === 'a' ? 'signA' : 'signB'] = sigValueBase64;
    delete body.receiver;

    // 트랜잭션 시작
    await session.startTransaction();
    const updatedContract = await dbModels.Contract.findByIdAndUpdate(id, body, { new: true })
    console.log(updatedContract)

    if (!updatedContract) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        message: "계약서 서명 실패",
      });
    }

    /**
  * blockchain 코드 시작-------------------------------------------
  */
    // const store = new MongoWallet();
    // const wallet = new Wallet(store);
    // const userIdentity = await wallet.get(user._id.toString());

    // let selectedCompany;
    // switch (user.org) {
    //   case 'NaverMSP':
    //     selectedCompany = 'naver';
    //     break;
    //   case 'DeliveryMSP':
    //     selectedCompany = 'delivery';
    //     break;
    //   case 'RestaurantMSP':
    //     selectedCompany = 'restaurant';
    //     break;
    //   default:
    //     break;
    // }

    // const ccp = buildCCP(selectedCompany);
    // const gateway = new Gateway();

    // await gateway.connect(ccp, { wallet, identity: userIdentity, discovery: { enabled: true, asLocalhost: true } });

    // // 네트워크 채널 가져오기
    // const network = await gateway.getNetwork('orderchannel');

    // // 스마트 컨트랙트 가져오기
    // const contract = network.getContract('order');

    // try {
    //   const resultBuffer = await contract.submitTransaction(
    //     'UpdateOrder', // 스마트 컨트랙트의 함수 이름
    //     updatedOrder._id,
    //     updatedOrder.writer,
    //     updatedOrder.orders,
    //     updatedOrder.to,
    //     updatedOrder.totalCount,
    //     updatedOrder.createdAt.toISOString(),
    //     updatedOrder.updatedAt.toISOString(),
    //   );
    //   const resultString = resultBuffer.toString('utf8');
    //   const resultJson = JSON.parse(resultString);
    //   console.log(resultJson)
    // } catch (bcError) {
    //   console.error('Blockchain transaction failed:', bcError);
    //   return res.status(500).json({
    //     error: true,
    //     message: 'Blockchain transaction failed',
    //     details: bcError.message,
    //   });
    // }
    // await gateway.disconnect();

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
exports.verifyContracts = async (req, res) => {
  console.log(`
    --------------------------------------------------
    router.patch("/contract/verify/:id", contractsController.verifyContracts);
    --------------------------------------------------`);

  const dbModels = global.DB_MODELS;
  const { _id, email, org } = req.decoded; // JWT 토큰에서 사용자 정보 추출
  const { id } = req.params; // 요청 경로에서 계약 ID 추출
  const { receiver } = req.body; // 요청 본문에서 수신자 정보 추출
  const file = req.file; // 업로드된 파일

  // 파일이 업로드되지 않은 경우 400 에러 반환
  if (!file) {
    return res.status(400).json({ message: 'No file uploaded!' });
  }
  console.log(id);

  const session = await dbModels.Contract.startSession(); // MongoDB 세션 시작

  try {
    // 사용자가 존재하는지 확인
    const user = await dbModels.User.findOne({ _id, email, org }).lean();
    if (!user) {
      return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });
    }

    // 수신자 필드 결정 ('receiverA' 또는 'receiverB')
    const receiverField = receiver === 'a' ? 'receiverA' : 'receiverB';

    // 계약이 존재하는지 확인 및 수신자가 맞는지 확인
    const foundContract = await dbModels.Contract.findOne({ _id: id, [receiverField]: _id }).lean();
    if (!foundContract) {
      await unlink(file.path); // 파일 삭제
      return res.status(404).json({ message: 'Contract was not found!' });
    }

    // 업로드된 파일의 해시 생성
    const fileData = await fsPromises.readFile(file.path);
    const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
    console.log('File Hash:', fileHash);

    // 파일 해시가 계약서의 해시와 일치하는지 확인
    if (foundContract.pdfHash !== fileHash) {
      await unlink(file.path); // 파일 삭제
      return res.status(400).json({ message: 'Invalid Document: The uploaded file does not match the expected contract.' });
    }

    // 수신자의 서명 상태 필드 결정 ('statusA' 또는 'statusB')
    const statusField = receiver === 'a' ? 'statusA' : 'statusB';
    if (foundContract[statusField] !== "signed") {
      await unlink(file.path); // 파일 삭제
      return res.status(200).json({ message: 'Validation Complete: Contract unsigned and pending. Please sign to finalize.' });
    }

    // 몽고디비에 저장된 지갑에서 인증서 불러오기
    const store = new MongoWallet();
    const wallet = new Wallet(store);
    const userIdentity = await wallet.get(_id.toString());
    if (!userIdentity) {
      console.log(`An identity for the user ${req.decoded._id} does not exist in the wallet`);
      return res.status(500).send({ message: `An identity for the user does not exist in the wallet` });
    }

    // 사용자 공개 키 및 인증서 정보 읽기
    const userPublicKey = userIdentity.credentials.certificate;
    const certObj = new X509();
    certObj.readCertPEM(userPublicKey);
    console.log("Subject: " + certObj.getSubjectString());
    console.log("Issuer (CA) Subject: " + certObj.getIssuerString());
    console.log("Valid period: " + certObj.getNotBefore() + " to " + certObj.getNotAfter());

    // 조직에 따라 CA 인증서 경로 결정
    const caCertPath = getCaCertPath(org);
    const caCert = await fsPromises.readFile(caCertPath, 'utf-8');
    console.log("CA Signature validation: " + certObj.verifySignature(KEYUTIL.getKey(caCert)));

    // 서명 검증
    const publicKey = KEYUTIL.getKey(userPublicKey);
    const signature = new KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });
    signature.init(publicKey);
    signature.updateHex(fileHash);
    const verifyResult = signature.verify(foundContract[statusField]);
    if (!verifyResult) {
      await unlink(file.path); // 파일 삭제
      return res.status(400).json({ message: 'Verification Failed: The document you have uploaded does not match the expected contract or certificate.' });
    }

    console.log("Signature verified with certificate provided: " + verifyResult);

    await unlink(file.path); // 파일 삭제
    res.status(200).json({ message: 'Contract Verification Successful' });

    // 트랜잭션 커밋
    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    console.log(err);
    await unlink(file.path); // 파일 삭제
    await session.abortTransaction(); // 트랜잭션 롤백
    session.endSession();
    return res.status(500).json({ error: true, message: "Server Error" });
  }
};

// 조직에 따른 CA 인증서 경로 반환 함수
const getCaCertPath = (org) => {
  switch (org) {
    case 'NaverMSP':
      return process.env.NAVER_CA_CERT_PATH;
    case 'DeliveryMSP':
      return process.env.DELIVERY_CA_CERT_PATH;
    case 'RestaurantMSP':
      return process.env.RESTAURANT_CA_CERT_PATH;
    default:
      throw new Error('Invalid organization');
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

