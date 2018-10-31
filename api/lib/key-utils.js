const AWS = require("aws-sdk")
let crypto = require("crypto")
let uuid = require("uuid/v4")

const TABLE_API_KEYS = process.env.apiKeyTable;
const CLIENT_ID = process.env.clientId;
const ENCRYPT_KEY_ARN = process.env.keyArn;
const USER_POOL_ID = process.env.userPoolId;
const USAGE_PLAN_ID = process.env.usagePlanId;
const REGION = process.env.region;

const sp = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
const docClient = new AWS.DynamoDB.DocumentClient();
const kmsClient = new AWS.KMS();
var apigateway = new AWS.APIGateway({ region: REGION });

const attr = (name, value) => {
    return {
        Name: name,
        Value: value
    }
}

const generatePassword = async () => {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(48, function (err, buffer) {
            resolve(buffer.toString('hex'));
        });
    })
}

const kmsDecrypt = async (encryptedString) => {
    const cipherText = Buffer.from(encryptedString, "base64");
    const params = { CiphertextBlob: cipherText };
    const result = await kmsClient.decrypt(params).promise();
    return result.Plaintext.toString();
}

const kmsEncrypt = async (plaintext) => {
    const params = { KeyId: ENCRYPT_KEY_ARN, Plaintext: plaintext };
    const result = await kmsClient.encrypt(params).promise()
    return result.CiphertextBlob.toString("base64");
}

const loginWithUser = async (username, password) => {
    var authParams = {
        USERNAME: username,
        PASSWORD: password,
    };

    let params = {
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: "ADMIN_NO_SRP_AUTH",
        AuthParameters: authParams
    }

    return await sp.adminInitiateAuth(params).promise();
}

const updatePassword = async (username, tempPass) => {
    let newPassword = await generatePassword();
    let challenge = await loginWithUser(username, tempPass);

    await sp.adminRespondToAuthChallenge({
        Session: challenge.Session,
        ChallengeName: challenge.ChallengeName,
        ClientId: CLIENT_ID,
        UserPoolId: USER_POOL_ID,
        ChallengeResponses: {
            USERNAME: username,
            NEW_PASSWORD: newPassword
        }
    }).promise()
    return newPassword;
}

const countKeys = async (user) => {
    let list = await getKeyList(user);
    return list.length;
}


const createApiKey = async (name) => {
    let res = await apigateway.createApiKey({ enabled: true, name: name }).promise();

    let params = {
        keyId: res.id,
        keyType: "API_KEY",
        usagePlanId: USAGE_PLAN_ID
    }

    apigateway.createUsagePlanKey()
    await apigateway.createUsagePlanKey(params).promise();
    return res;
}

const mask = (str) => {
    return str.substring(0,5)+"***************";
}

const createKey = async (user) => {
    if(!USER_POOL_ID){
        throw new Error("configuration error, missing pool id")
    }

    let tempPass = await generatePassword();

    let apiKey = await createApiKey(user.email);
    let mainnet = user.mainnet ? 1 : 0;

    let apiId = uuid();

    let attrs = [
        attr("name", user.id),
        attr("email", user.email),
        attr("custom:company", user.company),
        attr("custom:mainnet", `${mainnet}`),
        attr("custom:apikey", apiKey.id)
    ]

    await sp.adminCreateUser({
        UserPoolId: USER_POOL_ID,
        Username: apiId,
        TemporaryPassword: tempPass,
        MessageAction: "SUPPRESS",
        UserAttributes: attrs
    }).promise();

    await sp.adminAddUserToGroup({
        GroupName: "admin",
        Username: apiId,
        UserPoolId: USER_POOL_ID
    }).promise();

    let apiSecret = await updatePassword(apiId, tempPass);

    let keyId = uuid();
    let encryptedSecret = await kmsEncrypt(apiSecret);
    
    let dbObj = {
        company: user.company,
        keyId: keyId,
        apiKey: apiKey.value,
        apiId: apiId,
        awsKeyId: apiKey.id,
        encryptedApiSecret: encryptedSecret,
        createdAt: new Date().getTime(),
        createdBy: user.email
    }

    await insertKey(dbObj)

    return {
        id: keyId,
        apiKey: apiKey.value,
        apiId: apiId,
        apiSecret: apiSecret,
        createdAt: dbObj.createdAt,
        createdBy: dbObj.createdBy
    }
}

//for display in UI
const getKeyList = async (user) => {
    var params = {
        TableName : TABLE_API_KEYS,
        KeyConditionExpression: "company = :company",
        ExpressionAttributeValues: {
            ":company":  user.company
        }
    };
    let res = await docClient.query(params).promise();
    let result = []
    for(let i=0; i<res.Items.length; i++){
        let key = res.Items[i];
        result.push({
            id: key.keyId,
            apiKey: key.apiKey,
            apiId: mask(key.apiId),
            apiSecret: "***********************",
            createdAt: key.createdAt,
            createdBy: key.createdBy,
        })
    } 
    return result;
}

const getKey = async (user, keyId) => {
    let params = {
        TableName: TABLE_API_KEYS,
        Key: {
            "company": user.company,
            "keyId": keyId
        }
    }
    let data = await docClient.get(params).promise();
    let item = data.Item;
    let apiSecret = await kmsDecrypt(item.encryptedApiSecret)

    return {
        id: item.keyId,
        apiKey: item.apiKey,
        apiId: item.apiId,
        apiSecret: apiSecret,
        createdAt: item.createdAt,
        createdBy: item.createdBy
    }
}

const deleteKey = async (user, keyId) => {
    let key = await getKey(user, keyId)
    let tasks = []
    if(key.awsKeyId){
        tasks.push(
            apigateway.deleteApiKey({
                apiKey: key.awsKeyId
            }
        ).promise());
    }
    tasks.push(
        sp.adminDeleteUser({
            Username: key.apiId, 
            UserPoolId: USER_POOL_ID
        }).promise()
    )

    let params = {
        TableName: TABLE_API_KEYS,
        Key: {
            "company": user.company,
            "keyId": keyId
        }
    }
    tasks.push(docClient.delete(params).promise());

    await Promise.all(tasks);
}

const insertKey = async (obj) => {
    let params = {
        TableName: TABLE_API_KEYS,
        Item: obj
    };
    await docClient.put(params).promise();
}

module.exports = {
    createKey: createKey,
    getKeyList: getKeyList,
    countKeys: countKeys,
    getKey: getKey,
    deleteKey: deleteKey,
    kmsEncrypt: kmsEncrypt,
    insertKey: insertKey,
    uuid: uuid
}