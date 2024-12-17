const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { MongoWallet } = require("../../../../utils/mongo-wallet");
const { Wallet, Gateway } = require("fabric-network");
const { buildCAClient, enrollAdminMongo, buildCCP } = require("../../../../utils/ca-utils");
const FabricCAServices = require("fabric-ca-client");

exports.signIn = async (req, res) => {
    console.log(`
    --------------------------------------------------
      router.post('/signIn', authController.signIn);
    --------------------------------------------------`);
    const dbModels = global.DB_MODELS;

    const { email, password, org } = req.body;

    try {
        const user = await dbModels.User.findOne({ email: email, org: org });

        //만약 등록되지 않은 전화번호라면 401 에러
        if (!user) return res.status(401).json({ error: true, message: "등록되지 않은 사용자 입니다." });

        const verifiedPassword = await bcrypt.compare(password, user.password);
        if (!verifiedPassword) return res.status(401).json({ error: true, message: "계정 정보가 잘못 되었습니다." });

        //토큰 정보
        const payload = {
            _id: user._id,
            email: user.email,
            org: user.org,
            auth: user.auth,
        };

        // jwtOption 지정 <- 한번 로그인 하면 얼마나 오래 유지할 것인지 지정 나는 3일
        const jwtOption = {
            expiresIn: "1d",
        };

        // 토근 생성
        const token = jwt.sign(payload, process.env.JWT_SECRET, jwtOption);

        return res.status(200).json({
            token,
            message: "로그인 성공",
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: true, message: "Server Error" });
    }
};

const MSP_IDS = {
    naver: "NaverMSP",
    delivery: "DeliveryMSP",
    restaurant: "RestaurantMSP",
};

exports.signUp = async (req, res) => {
    console.log(`
    --------------------------------------------------
      router.post('/signUp', authController.signUp);
    --------------------------------------------------`);
    const { email, selectedCompany, auth, password } = req.body;
    const mspId = MSP_IDS[selectedCompany];
    if (!mspId) return res.status(400).json({ message: "Invalid company selected." });

    const dbModels = global.DB_MODELS;

    try {
        let foundAdmin = {};
        // 만약 유저인데, 지갑에 admin이 없을 경우
        try {
            foundAdmin = await findAdminIfNotAdmin(auth, mspId, global.DB_MODELS);
        } catch (error) {
            return res.status(409).json({ message: "어드민이 없습니다." });
        }

        // 계정 생성 시작 이메일 중복 확인
        const foundUser = await dbModels.User.findOne({ email: email }).lean();
        if (foundUser) {
            return res.status(409).json({ message: "이미 가입된 이메일 주소 입니다." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashPassword = await bcrypt.hash(password, salt);

        // 계정 생성
        const newUser = await dbModels
            .User({
                email: email,
                password: hashPassword,
                org: mspId,
                auth: auth,
            })
            .save();

        const ccp = buildCCP(selectedCompany);
        const caClient = buildCAClient(FabricCAServices, ccp, `ca-${selectedCompany}`);

        // mongodb wallet 생성
        const store = new MongoWallet();
        const wallet = new Wallet(store);

        // 어드민 계정 wallet에 등록
        if (auth === "admin") {
            const enrollAdmin = await enrollAdminMongo(caClient, wallet, mspId, newUser._id);
            return res.status(200).json({ message: "어드민 등록 성공" });
        }
        // 어드민 회원가입일 경우 여기서 끝~~~~!!-------------------------------

        const adminIdentity = await wallet.get(foundAdmin.user);
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, process.env.ADMIN_USER_ID);

        const secret = await caClient.register(
            {
                affiliation: "",
                enrollmentID: newUser._id,
                role: "client",
            },
            adminUser
        );

        const enrollment = await caClient.enroll({
            enrollmentID: newUser._id,
            enrollmentSecret: secret,
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: "X.509",
        };

        const data = {
            role: "client",
            email: email,
            certificate: x509Identity,
            mspId: mspId,
            credentials: x509Identity.credentials,
            version: 1,
            type: "X.509",
        };
        const putData = await wallet.put(newUser._id, data);
        return res.status(200).json({ message: "회원 등록 성공" });
    } catch (err) {
        console.log(err);
        await global.DB_MODELS.User.findOneAndDelete({ email: email });

        return res.status(500).json({ error: true, message: "Server Error" });
    }
};

// Helper Functions
async function findAdminIfNotAdmin(auth, mspId, dbModels) {
    if (auth !== "admin") {
        const foundAdmin = await dbModels.Wallet.findOne({
            mspId,
            role: "admin",
        }).lean();
        if (!foundAdmin) {
            throw new Error(`No admin found for MSP ID: ${mspId}`);
        }
        return foundAdmin;
    }
    return null;
}
