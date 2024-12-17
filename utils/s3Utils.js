const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

/**
 * contract 계약서 관련
 * 바로 S3에 업로드를 하면 안되고
 * 해시값을 추출해야기 때문에
 * 웹 서버 경로에다 임시 저장 후 삭제
 */
const uploadContract = multer({
    storage: multer.diskStorage({
        destination(req, file, cb) {
            cb(null, "uploads/contract/temp");
        },
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        filename: function (req, file, cb) {
            file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
            cb(null, `/${Date.now().toString()}-${file.originalname}`);
        },
    }),
});

module.exports = {
    s3Client,
    uploadContract,
};
