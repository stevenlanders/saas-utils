const AWS = require("aws-sdk")
const { v4: uuidv4 } = require('uuid');
const docClient = new AWS.DynamoDB.DocumentClient();

const TABLE_TENANTS = "tenants";

const getTenant = async (tenantId) => {
    var params = {
        TableName: TABLE_TENANTS,
        Key:{
            "tenantId": tenantId
        }
    };
    let data = await docClient.get(params).promise();
    return data.Item;
}

const createNewTenant = async (ownerEmail) => {
    let tenantId = uuidv4();
    var params = {
        TableName: TABLE_TENANTS,
        Item:{
            "tenantId": tenantId,
            "accountType": "beta",
            "maxApiKeys": 1,
            "owner": ownerEmail,
            "createdAt": new Date().getTime()
        }
    };
    await docClient.put(params).promise();
    return tenantId;
}

module.exports = {
    getTenant: getTenant,
    createNewTenant: createNewTenant
}