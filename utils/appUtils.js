const { Wallet, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const buildCCPGhrk = () => {
  // load the common connection configuration file
  const ccpPath = path.resolve(__dirname, 'connection_ghrk.json');
  const fileExists = fs.existsSync(ccpPath);
  if (!fileExists) {
    throw new Error(`no such file or directory: ${ccpPath}`);
  }
  const contents = fs.readFileSync(ccpPath, 'utf8');

  // build a JSON object from the file contents
  const ccp = JSON.parse(contents);

  console.log(`Loaded the network configuration located at ${ccpPath}`);
  return ccp;
};


const buildWallet = async () => {
  // Create a new  wallet : Note that wallet is for managing identities.
  let fsWallet;
  let wallet1;
  let wallet2;
  let wallet3;
  // let wallet4;
  // let wallet5;
  try {
    const walletPath = path.join(__dirname, 'wallet');

    fsWallet = await Wallets.newFileSystemWallet(walletPath);
    wallet1 = await Wallets.newCouchDBWallet({ url: process.env.GHRK1_COUCHDB_URL, name: 'wallet' });
    wallet2 = await Wallets.newCouchDBWallet({ url: process.env.GHRK2_COUCHDB_URL, name: 'wallet' });
    wallet3 = await Wallets.newCouchDBWallet({ url: process.env.GHRK3_COUCHDB_URL, name: 'wallet' });
    // wallet4 = await Wallets.newCouchDBWallet({ url: process.env.GHRK4_COUCHDB_URL, name: 'wallet' });
    // wallet5 = await Wallets.newCouchDBWallet({ url: process.env.GHRK5_COUCHDB_URL, name: 'wallet' });

    return { fsWallet, wallet1, wallet2, wallet3 };
  } catch (error) {
    console.log(error)
  }

};

const getWallet = async () => {

  try {
    const walletDetails = [
      { url: process.env.GHRK2_COUCHDB_URL, name: 'wallet' },
      { url: process.env.GHRK3_COUCHDB_URL, name: 'wallet' },
      { url: process.env.GHRK1_COUCHDB_URL, name: 'wallet' },
      // { url: process.env.GHRK4_COUCHDB_URL, name: 'wallet' },
      // { url: process.env.GHRK5_COUCHDB_URL, name: 'wallet' },
    ];

    for (let i = 0; i < walletDetails.length; i++) {
      try {
        let wallet
        const walletPath = path.join(__dirname, 'wallet');
        console.log()
        wallet = await Wallets.newFileSystemWallet(walletPath);
        if (wallet) return wallet
        // CouchDB 인스턴스에 연결을 시도합니다.
        wallet = await Wallets.newCouchDBWallet(walletDetails[i]);
        console.log(`Connected to CouchDB instance: ${walletDetails[i].name}`);
        return wallet; // 연결 성공 시 바로 해당 wallet을 반환합니다.
      } catch (error) {
        console.log(`Failed to connect to CouchDB instance: ${walletDetails[i].name}`, error);
        // 마지막 시도에서도 실패한 경우 에러를 반환합니다.
        if (i === walletDetails.length - 1) throw error;
      }
    }
  } catch (error) {
    console.log(error)
  }

};

const prettyJSONString = (inputString) => {
  if (inputString) {
    return JSON.stringify(JSON.parse(inputString), null, 2);
  } else {
    return inputString;
  }
};

module.exports = {
  buildCCPGhrk,
  getWallet,
  buildWallet,
  prettyJSONString,
};
